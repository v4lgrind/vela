/*
 * FFmpeg video decoder JNI bridge.
 *
 * Decodes video frames (HEVC, H264, …) via libavcodec and converts the
 * decoded YUV frame to I420 (YUV420P 8-bit) using libswscale so the Java
 * side can render it without needing GLES 10-bit support.
 *
 * JNI class: androidx.media3.decoder.ffmpeg.FfmpegVideoDecoder
 */

#include <jni.h>
#include <android/log.h>
#include <stdlib.h>
#include <string.h>

#include "libavcodec/avcodec.h"
#include "libavutil/avutil.h"
#include "libavutil/opt.h"
#include "libswscale/swscale.h"

#define LOG_TAG "FfmpegVideo"
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)
#define LOGD(...) __android_log_print(ANDROID_LOG_DEBUG, LOG_TAG, __VA_ARGS__)

#define VIDEO_DECODER_SUCCESS         0
#define VIDEO_DECODER_ERROR_INVALID  -1
#define VIDEO_DECODER_ERROR_NO_FRAME -2
#define VIDEO_DECODER_ERROR_OTHER    -3

typedef struct {
    AVCodecContext  *codec_ctx;
    AVPacket        *packet;
    AVFrame         *decoded_frame;   /* raw decoder output (may be 10-bit)  */
    AVFrame         *i420_frame;      /* always RGBA 8-bit after swscale     */
    struct SwsContext *sws_ctx;
    int              last_width;
    int              last_height;
    enum AVPixelFormat last_src_fmt;
    int64_t          last_frame_pts;  /* PTS of most recently decoded frame  */
} VideoState;

/* ── helpers ────────────────────────────────────────────────────────────── */

static void release_state(VideoState *state) {
    if (!state) return;
    if (state->sws_ctx)      { sws_freeContext(state->sws_ctx); state->sws_ctx = NULL; }
    if (state->i420_frame)   { av_frame_free(&state->i420_frame); }
    if (state->decoded_frame){ av_frame_free(&state->decoded_frame); }
    if (state->packet)       { av_packet_free(&state->packet); }
    if (state->codec_ctx)    { avcodec_free_context(&state->codec_ctx); }
    free(state);
}

/* Ensure the swscale context is valid for the current frame geometry. */
static int ensure_sws(VideoState *state, int w, int h, enum AVPixelFormat src_fmt) {
    if (state->sws_ctx &&
        state->last_width  == w &&
        state->last_height == h &&
        state->last_src_fmt == src_fmt) {
        return 0; /* already good */
    }
    if (state->sws_ctx) sws_freeContext(state->sws_ctx);

    state->sws_ctx = sws_getContext(
        w, h, src_fmt,
        w, h, AV_PIX_FMT_RGBA,
        SWS_BILINEAR, NULL, NULL, NULL);
    if (!state->sws_ctx) {
        LOGE("sws_getContext failed for fmt=%d %dx%d", src_fmt, w, h);
        return -1;
    }
    /* Preserve full color range during 10-bit → 8-bit conversion.
     * Without this, limited-range 10-bit (64-940) maps to limited-range 8-bit
     * (16-235) which can crush blacks and clip highlights. */
    {
        const int *inv_table, *table;
        int srcRange, dstRange, brightness, contrast, saturation;
        sws_getColorspaceDetails(state->sws_ctx, (int**)&inv_table, &srcRange,
                                 (int**)&table, &dstRange, &brightness, &contrast, &saturation);
        const int *bt709 = sws_getCoefficients(SWS_CS_ITU709);
        sws_setColorspaceDetails(state->sws_ctx, bt709, srcRange,
                                 bt709, 1 /* full output range */,
                                 brightness, contrast, saturation);
    }
    /* (Re-)allocate the RGBA output frame */
    if (state->i420_frame) av_frame_free(&state->i420_frame);
    state->i420_frame = av_frame_alloc();
    if (!state->i420_frame) return -1;
    state->i420_frame->format = AV_PIX_FMT_RGBA;
    state->i420_frame->width  = w;
    state->i420_frame->height = h;
    if (av_frame_get_buffer(state->i420_frame, 32) < 0) {
        LOGE("av_frame_get_buffer failed");
        return -1;
    }
    state->last_width   = w;
    state->last_height  = h;
    state->last_src_fmt = src_fmt;
    return 0;
}

/* ── JNI ────────────────────────────────────────────────────────────────── */

/*
 * long ffmpegInitialize(String codecName, byte[] extraData, int threads)
 */
JNIEXPORT jlong JNICALL
Java_androidx_media3_decoder_ffmpeg_FfmpegVideoDecoder_ffmpegInitialize(
        JNIEnv *env, jobject obj,
        jstring jCodecName, jbyteArray jExtraData, jint threads) {

    const char *codec_name = (*env)->GetStringUTFChars(env, jCodecName, NULL);
    LOGD("ffmpegInitialize: codec=%s threads=%d", codec_name, threads);

    const AVCodec *codec = avcodec_find_decoder_by_name(codec_name);
    if (!codec) {
        LOGE("Codec not found: %s", codec_name);
        (*env)->ReleaseStringUTFChars(env, jCodecName, codec_name);
        return 0;
    }

    AVCodecContext *ctx = avcodec_alloc_context3(codec);
    if (!ctx) {
        LOGE("avcodec_alloc_context3 failed");
        (*env)->ReleaseStringUTFChars(env, jCodecName, codec_name);
        return 0;
    }

    ctx->thread_count = threads > 0 ? threads : 1;
    ctx->thread_type  = FF_THREAD_FRAME | FF_THREAD_SLICE;

    /* Copy extradata (codec private data / SPS+PPS for H264/HEVC) */
    if (jExtraData != NULL) {
        jsize extra_len = (*env)->GetArrayLength(env, jExtraData);
        ctx->extradata = av_mallocz(extra_len + AV_INPUT_BUFFER_PADDING_SIZE);
        if (!ctx->extradata) {
            avcodec_free_context(&ctx);
            (*env)->ReleaseStringUTFChars(env, jCodecName, codec_name);
            return 0;
        }
        (*env)->GetByteArrayRegion(env, jExtraData, 0, extra_len,
                                   (jbyte *)ctx->extradata);
        ctx->extradata_size = (int)extra_len;
    }

    if (avcodec_open2(ctx, codec, NULL) < 0) {
        LOGE("avcodec_open2 failed for %s", codec_name);
        avcodec_free_context(&ctx);
        (*env)->ReleaseStringUTFChars(env, jCodecName, codec_name);
        return 0;
    }
    (*env)->ReleaseStringUTFChars(env, jCodecName, codec_name);

    VideoState *state = calloc(1, sizeof(VideoState));
    if (!state) { avcodec_free_context(&ctx); return 0; }
    state->codec_ctx      = ctx;
    state->packet         = av_packet_alloc();
    state->decoded_frame  = av_frame_alloc();
    if (!state->packet || !state->decoded_frame) {
        release_state(state);
        return 0;
    }
    return (jlong)(uintptr_t)state;
}

/*
 * int ffmpegDecode(long context, ByteBuffer inputData, int inputSize,
 *                  long inputPts, ByteBuffer outputBuffer)
 *
 * Decodes one compressed packet and writes I420 frame data into outputBuffer.
 * Returns total byte count written on success, or a negative error code.
 * Returns 0 when the decoder needs more input (no frame yet).
 */
JNIEXPORT jint JNICALL
Java_androidx_media3_decoder_ffmpeg_FfmpegVideoDecoder_ffmpegDecode(
        JNIEnv *env, jobject obj,
        jlong jContext, jobject jInputData, jint inputSize,
        jlong inputPts, jobject jOutputBuffer) {

    VideoState *state = (VideoState *)(uintptr_t)jContext;
    if (!state) return VIDEO_DECODER_ERROR_OTHER;

    /* ── send packet ──────────────────────────────────────────────────── */
    uint8_t *input_ptr = (uint8_t *)(*env)->GetDirectBufferAddress(env, jInputData);
    if (!input_ptr || inputSize <= 0) return VIDEO_DECODER_ERROR_INVALID;

    state->packet->data = input_ptr;
    state->packet->size = inputSize;
    state->packet->pts  = inputPts;

    int ret = avcodec_send_packet(state->codec_ctx, state->packet);
    if (ret < 0 && ret != AVERROR(EAGAIN)) {
        LOGE("avcodec_send_packet: %d", ret);
        return VIDEO_DECODER_ERROR_INVALID;
    }

    /* ── receive frame ────────────────────────────────────────────────── */
    ret = avcodec_receive_frame(state->codec_ctx, state->decoded_frame);
    if (ret == AVERROR(EAGAIN) || ret == AVERROR_EOF) {
        return 0; /* no frame yet */
    }
    if (ret < 0) {
        LOGE("avcodec_receive_frame: %d", ret);
        return VIDEO_DECODER_ERROR_NO_FRAME;
    }

    int w = state->decoded_frame->width;
    int h = state->decoded_frame->height;
    state->last_frame_pts = state->decoded_frame->pts;

    /* ── convert to RGBA 8-bit ─────────────────────────────────────────── */
    if (ensure_sws(state, w, h, state->decoded_frame->format) < 0) {
        av_frame_unref(state->decoded_frame);
        return VIDEO_DECODER_ERROR_OTHER;
    }

    if (av_frame_make_writable(state->i420_frame) < 0) {
        av_frame_unref(state->decoded_frame);
        return VIDEO_DECODER_ERROR_OTHER;
    }

    sws_scale(state->sws_ctx,
              (const uint8_t * const *)state->decoded_frame->data,
              state->decoded_frame->linesize, 0, h,
              state->i420_frame->data, state->i420_frame->linesize);

    av_frame_unref(state->decoded_frame);

    /* ── copy RGBA to Java ByteBuffer ──────────────────────────────────── */
    uint8_t *out = (uint8_t *)(*env)->GetDirectBufferAddress(env, jOutputBuffer);
    if (!out) return VIDEO_DECODER_ERROR_OTHER;
    jlong out_cap = (*env)->GetDirectBufferCapacity(env, jOutputBuffer);

    int stride = state->i420_frame->linesize[0]; /* RGBA stride (may include padding) */
    int row_bytes = w * 4;
    int total = row_bytes * h;
    if (out_cap < total) {
        LOGE("output buffer too small: cap=%lld need=%d", (long long)out_cap, total);
        return VIDEO_DECODER_ERROR_OTHER;
    }

    /* Copy RGBA rows (handle stride != w*4 due to alignment padding) */
    if (stride == row_bytes) {
        memcpy(out, state->i420_frame->data[0], total);
    } else {
        for (int row = 0; row < h; row++) {
            memcpy(out + row * row_bytes,
                   state->i420_frame->data[0] + row * stride,
                   row_bytes);
        }
    }
    return total;
}

/*
 * int ffmpegGetWidth(long context)
 */
JNIEXPORT jint JNICALL
Java_androidx_media3_decoder_ffmpeg_FfmpegVideoDecoder_ffmpegGetWidth(
        JNIEnv *env, jobject obj, jlong jContext) {
    VideoState *state = (VideoState *)(uintptr_t)jContext;
    return state ? state->codec_ctx->width : 0;
}

/*
 * int ffmpegGetHeight(long context)
 */
JNIEXPORT jint JNICALL
Java_androidx_media3_decoder_ffmpeg_FfmpegVideoDecoder_ffmpegGetHeight(
        JNIEnv *env, jobject obj, jlong jContext) {
    VideoState *state = (VideoState *)(uintptr_t)jContext;
    return state ? state->codec_ctx->height : 0;
}

/*
 * long ffmpegGetLastFramePts(long context)
 * Returns the PTS of the most recently decoded frame (in stream timebase units).
 */
JNIEXPORT jlong JNICALL
Java_androidx_media3_decoder_ffmpeg_FfmpegVideoDecoder_ffmpegGetLastFramePts(
        JNIEnv *env, jobject obj, jlong jContext) {
    VideoState *state = (VideoState *)(uintptr_t)jContext;
    return state ? (jlong)state->last_frame_pts : 0;
}

/*
 * void ffmpegFlush(long context)
 */
JNIEXPORT void JNICALL
Java_androidx_media3_decoder_ffmpeg_FfmpegVideoDecoder_ffmpegFlush(
        JNIEnv *env, jobject obj, jlong jContext) {
    VideoState *state = (VideoState *)(uintptr_t)jContext;
    if (state && state->codec_ctx) {
        avcodec_flush_buffers(state->codec_ctx);
    }
}

/*
 * void ffmpegRelease(long context)
 */
JNIEXPORT void JNICALL
Java_androidx_media3_decoder_ffmpeg_FfmpegVideoDecoder_ffmpegRelease(
        JNIEnv *env, jobject obj, jlong jContext) {
    release_state((VideoState *)(uintptr_t)jContext);
}
