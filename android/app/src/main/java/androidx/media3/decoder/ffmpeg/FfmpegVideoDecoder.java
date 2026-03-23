/*
 * Copyright (C) 2024 The Android Open Source Project
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 */
package androidx.media3.decoder.ffmpeg;

import androidx.annotation.Nullable;
import androidx.media3.common.Format;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.decoder.DecoderInputBuffer;
import androidx.media3.decoder.SimpleDecoder;
import androidx.media3.decoder.SimpleDecoderOutputBuffer;

import java.nio.ByteBuffer;
import java.util.List;

/**
 * FFmpeg video decoder. Output format: I420 (YUV420P) packed into
 * {@link SimpleDecoderOutputBuffer#data}.
 *
 * <p>Width and height of the most recently decoded frame are exposed via
 * {@link #getWidth()} / {@link #getHeight()}.
 */
@UnstableApi
public final class FfmpegVideoDecoder
    extends SimpleDecoder<DecoderInputBuffer, SimpleDecoderOutputBuffer, FfmpegDecoderException> {

  private static final int NUM_INPUT_BUFFERS  = 4;
  private static final int NUM_OUTPUT_BUFFERS = 4;
  private static final int INITIAL_INPUT_BUFFER_SIZE = 768 * 1024;

  private static final int VIDEO_DECODER_ERROR_INVALID  = -1;
  private static final int VIDEO_DECODER_ERROR_NO_FRAME = -2;
  private static final int VIDEO_DECODER_ERROR_OTHER    = -3;

  private final String codecName;
  @Nullable private final byte[] extraData;
  private long nativeContext;

  private volatile int frameWidth;
  private volatile int frameHeight;

  public FfmpegVideoDecoder(Format format) throws FfmpegDecoderException {
    super(new DecoderInputBuffer[NUM_INPUT_BUFFERS],
          new SimpleDecoderOutputBuffer[NUM_OUTPUT_BUFFERS]);

    if (!FfmpegLibrary.isAvailable()) {
      throw new FfmpegDecoderException("Failed to load FFmpeg native libraries.");
    }

    String mimeType = format.sampleMimeType;
    codecName = FfmpegLibrary.getCodecName(mimeType);
    if (codecName == null) {
      throw new FfmpegDecoderException("Unsupported MIME type: " + mimeType);
    }

    extraData = getExtraData(format);
    int threads = Math.min(Runtime.getRuntime().availableProcessors(), 4);
    nativeContext = ffmpegInitialize(codecName, extraData, threads);
    if (nativeContext == 0) {
      throw new FfmpegDecoderException(
          "FFmpeg video decoder initialization failed for codec: " + codecName);
    }
    setInitialInputBufferSize(INITIAL_INPUT_BUFFER_SIZE);
  }

  @Override
  public String getName() {
    return "ffmpegVideo-" + FfmpegLibrary.getVersion() + "-" + codecName;
  }

  @Override
  protected DecoderInputBuffer createInputBuffer() {
    return new DecoderInputBuffer(
        DecoderInputBuffer.BUFFER_REPLACEMENT_MODE_DIRECT,
        FfmpegLibrary.getInputBufferPaddingSize());
  }

  @Override
  protected SimpleDecoderOutputBuffer createOutputBuffer() {
    return new SimpleDecoderOutputBuffer(this::releaseOutputBuffer);
  }

  @Override
  protected FfmpegDecoderException createUnexpectedDecodeException(Throwable error) {
    return new FfmpegDecoderException("Unexpected video decode error", error);
  }

  @Override
  @Nullable
  protected FfmpegDecoderException decode(
      DecoderInputBuffer inputBuffer,
      SimpleDecoderOutputBuffer outputBuffer,
      boolean reset) {

    if (reset) {
      ffmpegFlush(nativeContext);
    }

    ByteBuffer inputData = inputBuffer.data;
    if (inputData == null || inputData.limit() == 0) {
      outputBuffer.shouldBeSkipped = true;
      return null;
    }

    // Allocate output large enough for 1080p RGBA (worst case before first frame)
    int w = frameWidth  > 0 ? frameWidth  : 1920;
    int h = frameHeight > 0 ? frameHeight : 1080;
    int rgbaSize = w * h * 4;
    ByteBuffer outData = outputBuffer.init(inputBuffer.timeUs, rgbaSize);
    if (outData == null || outData.capacity() < rgbaSize) {
      outData = outputBuffer.grow(rgbaSize);
    }

    int result = ffmpegDecode(
        nativeContext,
        inputData,
        inputData.limit(),
        inputBuffer.timeUs,
        outData);

    if (result == VIDEO_DECODER_ERROR_INVALID) {
      outputBuffer.shouldBeSkipped = true;
      return null;
    }
    if (result < 0) {
      return new FfmpegDecoderException("Video decode error: " + result);
    }
    if (result == 0) {
      // Decoder buffering — no output yet
      outputBuffer.shouldBeSkipped = true;
      return null;
    }

    // Update geometry from decoder state after first successful frame
    int newW = ffmpegGetWidth(nativeContext);
    int newH = ffmpegGetHeight(nativeContext);
    if (newW > 0) frameWidth  = newW;
    if (newH > 0) frameHeight = newH;

    // Use the decoded frame's actual PTS (handles B-frame reordering correctly).
    // The decoder returns frames in display order, so decoded_frame->pts is the
    // correct presentation timestamp, not the input packet's DTS/PTS.
    long decodedPts = ffmpegGetLastFramePts(nativeContext);
    if (decodedPts >= 0) {
      outputBuffer.timeUs = decodedPts;
    }

    outData.position(0);
    outData.limit(result);
    return null;
  }

  @Override
  public void release() {
    super.release();
    ffmpegRelease(nativeContext);
    nativeContext = 0;
  }

  /** Width of the most recently decoded frame (0 until first frame). */
  public int getWidth()  { return frameWidth; }

  /** Height of the most recently decoded frame (0 until first frame). */
  public int getHeight() { return frameHeight; }

  @Nullable
  private static byte[] getExtraData(Format format) {
    List<byte[]> init = format.initializationData;
    return (init != null && !init.isEmpty()) ? init.get(0) : null;
  }

  // ── native methods ──────────────────────────────────────────────────────

  private native long ffmpegInitialize(String codecName, @Nullable byte[] extraData, int threads);

  private native int ffmpegDecode(
      long context, ByteBuffer inputData, int inputSize, long inputPts, ByteBuffer outputBuffer);

  private native int  ffmpegGetWidth(long context);
  private native int  ffmpegGetHeight(long context);
  private native long ffmpegGetLastFramePts(long context);
  private native void ffmpegFlush(long context);
  private native void ffmpegRelease(long context);
}
