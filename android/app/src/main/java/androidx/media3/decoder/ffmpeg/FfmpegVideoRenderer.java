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

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Rect;
import android.os.Handler;
import android.view.Surface;

import androidx.annotation.Nullable;
import androidx.media3.common.C;
import androidx.media3.common.Format;
import androidx.media3.common.MimeTypes;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.decoder.DecoderInputBuffer;
import androidx.media3.decoder.SimpleDecoderOutputBuffer;
import androidx.media3.exoplayer.BaseRenderer;
import androidx.media3.exoplayer.ExoPlaybackException;
import androidx.media3.exoplayer.FormatHolder;
import androidx.media3.exoplayer.Renderer;
import androidx.media3.exoplayer.RendererCapabilities;
import androidx.media3.exoplayer.video.VideoRendererEventListener;

import java.nio.ByteBuffer;

/**
 * FFmpeg-backed software video renderer for H.264 and HEVC (including 10-bit Main 10).
 *
 * <p>Acts as a fallback when hardware MediaCodec decoders cannot handle the stream.
 * Frames are rendered by converting I420 → NV21 → JPEG and drawing to the Surface Canvas.
 */
@UnstableApi
public final class FfmpegVideoRenderer extends BaseRenderer {

  private final long allowedJoiningTimeMs;

  @Nullable private FfmpegVideoDecoder decoder;
  @Nullable private DecoderInputBuffer flagsOnlyBuffer;
  @Nullable private Surface surface;

  @Nullable private Format inputFormat;
  @Nullable private SimpleDecoderOutputBuffer pendingOutputBuffer;
  private boolean inputStreamEnded;
  private boolean outputStreamEnded;
  private boolean decoderReceivedBuffers;

  public FfmpegVideoRenderer(long allowedJoiningTimeMs,
      @Nullable Handler eventHandler,
      @Nullable VideoRendererEventListener eventListener,
      int maxDroppedFramesToNotify) {
    super(C.TRACK_TYPE_VIDEO);
    this.allowedJoiningTimeMs = allowedJoiningTimeMs;
    flagsOnlyBuffer = DecoderInputBuffer.newNoDataInstance();
  }

  @Override
  public String getName() {
    return "FfmpegVideoRenderer";
  }

  @Override
  public @RendererCapabilities.Capabilities int supportsFormat(Format format) {
    if (!FfmpegLibrary.isAvailable()) {
      return RendererCapabilities.create(C.FORMAT_UNSUPPORTED_TYPE);
    }
    String mimeType = format.sampleMimeType;
    if (!MimeTypes.VIDEO_H264.equals(mimeType) && !MimeTypes.VIDEO_H265.equals(mimeType)) {
      return RendererCapabilities.create(C.FORMAT_UNSUPPORTED_TYPE);
    }
    if (!FfmpegLibrary.supportsFormat(mimeType)) {
      return RendererCapabilities.create(C.FORMAT_UNSUPPORTED_SUBTYPE);
    }
    return RendererCapabilities.create(
        C.FORMAT_HANDLED,
        RendererCapabilities.ADAPTIVE_NOT_SEAMLESS,
        RendererCapabilities.TUNNELING_NOT_SUPPORTED);
  }

  @Override
  protected void onEnabled(boolean joining, boolean mayRenderStartOfStream) {}

  @Override
  protected void onStarted() {}

  @Override
  protected void onStopped() {}

  @Override
  protected void onDisabled() {
    inputFormat = null;
    releaseDecoder();
  }

  @Override
  protected void onReset() {
    releaseDecoder();
  }

  @Override
  public void handleMessage(@MessageType int messageType, @Nullable Object message)
      throws ExoPlaybackException {
    if (messageType == MSG_SET_VIDEO_OUTPUT) {
      if (message instanceof Surface) {
        surface = (Surface) message;
        android.util.Log.d("FfmpegVideo", "handleMessage: got Surface directly");
      } else if (message instanceof android.view.SurfaceHolder) {
        surface = ((android.view.SurfaceHolder) message).getSurface();
        android.util.Log.d("FfmpegVideo", "handleMessage: got SurfaceHolder → Surface=" + surface);
      } else {
        surface = null;
        android.util.Log.d("FfmpegVideo", "handleMessage: unknown type=" + (message != null ? message.getClass().getName() : "null"));
      }
    } else {
      super.handleMessage(messageType, message);
    }
  }

  @Override
  public void render(long positionUs, long elapsedRealtimeUs) throws ExoPlaybackException {
    if (outputStreamEnded) return;

    // Initialise decoder from the first available format
    if (decoder == null) {
      FormatHolder formatHolder = getFormatHolder();
      flagsOnlyBuffer.clear();
      // SampleStream.FLAG_REQUIRE_FORMAT = 1
      int result = readSource(formatHolder, flagsOnlyBuffer, /* FLAG_REQUIRE_FORMAT= */ 1);
      if (result == C.RESULT_FORMAT_READ) {
        inputFormat = formatHolder.format;
        initDecoder();
      } else {
        return;
      }
    }
    if (decoder == null) return;

    // Maximum lateness before we drop a frame instead of rendering it.
    // Frames more than 40ms behind audio are stale (one frame period at 25fps).
    final long MAX_LATE_US = 40_000;

    // ── 1. Check pending frame ───────────────────────────────────────────────
    if (pendingOutputBuffer != null) {
      long late = positionUs - pendingOutputBuffer.timeUs;
      if (late >= 0 && late <= MAX_LATE_US) {
        // Frame is due and recent — render it
        if (surface != null) {
          renderFrame(pendingOutputBuffer.data, decoder.getWidth(), decoder.getHeight(), surface);
        }
        pendingOutputBuffer.release();
        pendingOutputBuffer = null;
      } else if (late > MAX_LATE_US) {
        // Frame is too old — drop it, try to catch up
        pendingOutputBuffer.release();
        pendingOutputBuffer = null;
      } else {
        // Frame is in the future — wait
        feedOneInputPacket();
        return;
      }
    }

    // ── 2. Drain decoded frames, dropping stale ones, render/hold the current one
    while (true) {
      SimpleDecoderOutputBuffer out;
      try {
        out = decoder.dequeueOutputBuffer();
      } catch (FfmpegDecoderException e) {
        throw new RuntimeException("FfmpegVideoRenderer dequeueOutputBuffer failed", e);
      }
      if (out == null) break;

      if (out.isEndOfStream()) {
        outputStreamEnded = true;
        out.release();
        return;
      }
      if (out.shouldBeSkipped || out.data == null) {
        out.release();
        continue;
      }

      long late = positionUs - out.timeUs;
      if (late > MAX_LATE_US) {
        // Frame is too old — drop it and keep draining
        out.release();
        continue;
      } else if (late >= 0) {
        // Frame is due and recent — render it
        if (surface != null) {
          renderFrame(out.data, decoder.getWidth(), decoder.getHeight(), surface);
        }
        out.release();
        feedOneInputPacket();
        return;
      } else {
        // Frame is in the future — hold it
        pendingOutputBuffer = out;
        feedOneInputPacket();
        return;
      }
    }

    // ── 3. No output ready — feed input ──────────────────────────────────────
    feedOneInputPacket();
  }

  @Override
  public boolean isReady() {
    return surface != null && (outputStreamEnded || decoder != null);
  }

  @Override
  public boolean isEnded() {
    return outputStreamEnded;
  }

  @Override
  protected void onPositionReset(long positionUs, boolean joining) throws ExoPlaybackException {
    inputStreamEnded  = false;
    outputStreamEnded = false;
    if (pendingOutputBuffer != null) {
      pendingOutputBuffer.release();
      pendingOutputBuffer = null;
    }
    if (decoder != null && decoderReceivedBuffers) {
      decoder.flush();
      decoderReceivedBuffers = false;
    }
  }

  /** Feed one input packet to keep the decoder pipeline full. */
  private void feedOneInputPacket() throws ExoPlaybackException {
    if (inputStreamEnded || decoder == null) return;
    DecoderInputBuffer inputBuffer;
    try {
      inputBuffer = decoder.dequeueInputBuffer();
    } catch (FfmpegDecoderException e) {
      throw new RuntimeException("FfmpegVideoRenderer dequeueInputBuffer failed", e);
    }
    if (inputBuffer == null) return;

    FormatHolder formatHolder = getFormatHolder();
    int result = readSource(formatHolder, inputBuffer, /* readFlags= */ 0);
    if (result == C.RESULT_FORMAT_READ) {
      inputBuffer.clear();
      inputFormat = formatHolder.format;
    } else if (result == C.RESULT_NOTHING_READ) {
      // Nothing available — return buffer to pool without queuing
      inputBuffer.clear();
    } else if (inputBuffer.isEndOfStream()) {
      inputStreamEnded = true;
      try { decoder.queueInputBuffer(inputBuffer); } catch (FfmpegDecoderException e) { /* ok */ }
    } else {
      try {
        decoder.queueInputBuffer(inputBuffer);
        decoderReceivedBuffers = true;
      } catch (FfmpegDecoderException e) {
        throw new RuntimeException("FfmpegVideoRenderer queueInputBuffer failed", e);
      }
    }
  }

  // ── decoder lifecycle ────────────────────────────────────────────────────

  private void initDecoder() throws ExoPlaybackException {
    if (inputFormat == null) return;
    try {
      decoder = new FfmpegVideoDecoder(inputFormat);
    } catch (FfmpegDecoderException e) {
      throw new RuntimeException("FfmpegVideoDecoder init failed: " + e.getMessage(), e);
    }
  }

  private void releaseDecoder() {
    if (pendingOutputBuffer != null) {
      pendingOutputBuffer.release();
      pendingOutputBuffer = null;
    }
    if (decoder != null) {
      decoder.release();
      decoder = null;
      decoderReceivedBuffers = false;
    }
  }

  // ── frame rendering (RGBA → Bitmap → Canvas) ──────────────────────────────

  @Nullable private static Bitmap reusableBitmap;
  private static int renderCount = 0;

  private static void renderFrame(ByteBuffer data, int w, int h, Surface surface) {
    if (w <= 0 || h <= 0) return;

    // Reuse bitmap to avoid per-frame allocation
    if (reusableBitmap == null || reusableBitmap.getWidth() != w || reusableBitmap.getHeight() != h) {
      if (reusableBitmap != null) reusableBitmap.recycle();
      reusableBitmap = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
    }

    data.rewind();
    reusableBitmap.copyPixelsFromBuffer(data);

    try {
      Canvas canvas = null;
      try {
        canvas = surface.lockHardwareCanvas();
      } catch (Exception e) {
        // Fall through to lockCanvas
      }
      if (canvas == null) {
        try {
          canvas = surface.lockCanvas(null);
        } catch (Exception e) {
          // Both failed
        }
      }
      if (canvas != null) {
        int cw = canvas.getWidth(), ch = canvas.getHeight();
        float videoAspect = (float) w / h;
        float canvasAspect = (float) cw / ch;
        int dstW, dstH;
        if (videoAspect > canvasAspect) {
          dstW = cw;
          dstH = (int) (cw / videoAspect);
        } else {
          dstH = ch;
          dstW = (int) (ch * videoAspect);
        }
        int left = (cw - dstW) / 2;
        int top = (ch - dstH) / 2;
        canvas.drawColor(android.graphics.Color.BLACK);
        canvas.drawBitmap(reusableBitmap, null, new Rect(left, top, left + dstW, top + dstH), null);
        surface.unlockCanvasAndPost(canvas);
        if (++renderCount <= 3) {
          android.util.Log.d("FfmpegVideo", "renderFrame OK: " + w + "x" + h + " canvas=" + cw + "x" + ch);
        }
      }
    } catch (Exception e) {
      android.util.Log.e("FfmpegVideo", "renderFrame error: " + e.getMessage());
    }
  }
}
