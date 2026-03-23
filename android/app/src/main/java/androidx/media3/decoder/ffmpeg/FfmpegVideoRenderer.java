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

import android.opengl.EGL14;
import android.opengl.EGLConfig;
import android.opengl.EGLContext;
import android.opengl.EGLDisplay;
import android.opengl.EGLSurface;
import android.opengl.GLES20;
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
import java.nio.ByteOrder;
import java.nio.FloatBuffer;

/**
 * FFmpeg-backed software video renderer for H.264 and HEVC (including 10-bit Main 10).
 *
 * <p>Acts as a fallback when hardware MediaCodec decoders cannot handle the stream.
 * Frames are rendered via OpenGL ES 2.0: RGBA texture upload → textured quad → eglSwapBuffers.
 */
@UnstableApi
public final class FfmpegVideoRenderer extends BaseRenderer {

  private static final String VERTEX_SHADER =
      "attribute vec4 aPosition;\n" +
      "attribute vec2 aTexCoord;\n" +
      "varying vec2 vTexCoord;\n" +
      "void main() {\n" +
      "  gl_Position = aPosition;\n" +
      "  vTexCoord = aTexCoord;\n" +
      "}\n";

  private static final String FRAGMENT_SHADER =
      "precision mediump float;\n" +
      "varying vec2 vTexCoord;\n" +
      "uniform sampler2D uTexture;\n" +
      "void main() {\n" +
      "  gl_FragColor = texture2D(uTexture, vTexCoord);\n" +
      "}\n";

  private final long allowedJoiningTimeMs;

  @Nullable private FfmpegVideoDecoder decoder;
  @Nullable private DecoderInputBuffer flagsOnlyBuffer;
  @Nullable private Surface surface;

  @Nullable private Format inputFormat;
  @Nullable private SimpleDecoderOutputBuffer pendingOutputBuffer;
  private boolean inputStreamEnded;
  private boolean outputStreamEnded;
  private boolean decoderReceivedBuffers;

  // EGL state
  private EGLDisplay eglDisplay = EGL14.EGL_NO_DISPLAY;
  private EGLContext eglContext = EGL14.EGL_NO_CONTEXT;
  private EGLSurface eglSurface = EGL14.EGL_NO_SURFACE;

  // GL state
  private int glProgram;
  private int glTextureId;
  private int texWidth;
  private int texHeight;
  private int surfaceWidth;
  private int surfaceHeight;

  // Cached attribute/uniform locations
  private int aPosLoc;
  private int aTexLoc;
  private int uTexLoc;

  // Pre-allocated vertex buffers (updated when video or surface dimensions change)
  private FloatBuffer vertexBuffer;
  private FloatBuffer texCoordBuffer;
  private int lastQuadVideoW;
  private int lastQuadVideoH;
  private int lastQuadSurfaceW;
  private int lastQuadSurfaceH;

  public FfmpegVideoRenderer(long allowedJoiningTimeMs,
      @Nullable Handler eventHandler,
      @Nullable VideoRendererEventListener eventListener,
      int maxDroppedFramesToNotify) {
    super(C.TRACK_TYPE_VIDEO);
    this.allowedJoiningTimeMs = allowedJoiningTimeMs;
    flagsOnlyBuffer = DecoderInputBuffer.newNoDataInstance();

    // Pre-allocate texture coordinate buffer (never changes)
    float[] texCoords = {
        0.0f, 1.0f,  // bottom-left  → top of image
        1.0f, 1.0f,  // bottom-right → top of image
        0.0f, 0.0f,  // top-left     → bottom of image
        1.0f, 0.0f,  // top-right    → bottom of image
    };
    texCoordBuffer = ByteBuffer.allocateDirect(texCoords.length * 4)
        .order(ByteOrder.nativeOrder()).asFloatBuffer();
    texCoordBuffer.put(texCoords).flip();
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
    releaseEgl();
  }

  @Override
  protected void onReset() {
    releaseDecoder();
    releaseEgl();
  }

  @Override
  public void handleMessage(@MessageType int messageType, @Nullable Object message)
      throws ExoPlaybackException {
    if (messageType == MSG_SET_VIDEO_OUTPUT) {
      Surface newSurface = null;
      if (message instanceof Surface) {
        newSurface = (Surface) message;
      } else if (message instanceof android.view.SurfaceHolder) {
        newSurface = ((android.view.SurfaceHolder) message).getSurface();
      }
      if (newSurface != surface) {
        releaseEgl();
        surface = newSurface;
        if (surface != null) {
          initEgl(surface);
        }
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
      int result = readSource(formatHolder, flagsOnlyBuffer, /* FLAG_REQUIRE_FORMAT= */ 1);
      if (result == C.RESULT_FORMAT_READ) {
        inputFormat = formatHolder.format;
        initDecoder();
      } else {
        return;
      }
    }
    if (decoder == null) return;

    // Maximum lateness before dropping a frame (one frame period at 25fps)
    final long MAX_LATE_US = 40_000;

    // ── 1. Check pending frame ───────────────────────────────────────────────
    if (pendingOutputBuffer != null) {
      long late = positionUs - pendingOutputBuffer.timeUs;
      if (late >= 0 && late <= MAX_LATE_US) {
        renderFrame(pendingOutputBuffer.data, decoder.getWidth(), decoder.getHeight());
        pendingOutputBuffer.release();
        pendingOutputBuffer = null;
      } else if (late > MAX_LATE_US) {
        pendingOutputBuffer.release();
        pendingOutputBuffer = null;
      } else {
        feedOneInputPacket();
        return;
      }
    }

    // ── 2. Drain decoded frames, dropping stale ones ─────────────────────────
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
        out.release();
        continue;
      } else if (late >= 0) {
        renderFrame(out.data, decoder.getWidth(), decoder.getHeight());
        out.release();
        feedOneInputPacket();
        return;
      } else {
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

  // ── EGL / OpenGL lifecycle ───────────────────────────────────────────────

  private void initEgl(Surface surface) {
    try {
      eglDisplay = EGL14.eglGetDisplay(EGL14.EGL_DEFAULT_DISPLAY);
      if (eglDisplay == EGL14.EGL_NO_DISPLAY) return;

      int[] version = new int[2];
      EGL14.eglInitialize(eglDisplay, version, 0, version, 1);

      int[] configAttribs = {
          EGL14.EGL_RENDERABLE_TYPE, EGL14.EGL_OPENGL_ES2_BIT,
          EGL14.EGL_RED_SIZE, 8, EGL14.EGL_GREEN_SIZE, 8,
          EGL14.EGL_BLUE_SIZE, 8, EGL14.EGL_ALPHA_SIZE, 8,
          EGL14.EGL_SURFACE_TYPE, EGL14.EGL_WINDOW_BIT,
          EGL14.EGL_NONE
      };
      EGLConfig[] configs = new EGLConfig[1];
      int[] numConfigs = new int[1];
      EGL14.eglChooseConfig(eglDisplay, configAttribs, 0, configs, 0, 1, numConfigs, 0);
      if (numConfigs[0] == 0) { releaseEgl(); return; }

      int[] contextAttribs = { EGL14.EGL_CONTEXT_CLIENT_VERSION, 2, EGL14.EGL_NONE };
      eglContext = EGL14.eglCreateContext(eglDisplay, configs[0],
          EGL14.EGL_NO_CONTEXT, contextAttribs, 0);

      int[] surfaceAttribs = { EGL14.EGL_NONE };
      eglSurface = EGL14.eglCreateWindowSurface(eglDisplay, configs[0],
          surface, surfaceAttribs, 0);

      EGL14.eglMakeCurrent(eglDisplay, eglSurface, eglSurface, eglContext);

      // Query surface dimensions
      int[] w = new int[1], h = new int[1];
      EGL14.eglQuerySurface(eglDisplay, eglSurface, EGL14.EGL_WIDTH, w, 0);
      EGL14.eglQuerySurface(eglDisplay, eglSurface, EGL14.EGL_HEIGHT, h, 0);
      surfaceWidth = w[0];
      surfaceHeight = h[0];

      // Create shader program
      glProgram = createProgram(VERTEX_SHADER, FRAGMENT_SHADER);
      aPosLoc = GLES20.glGetAttribLocation(glProgram, "aPosition");
      aTexLoc = GLES20.glGetAttribLocation(glProgram, "aTexCoord");
      uTexLoc = GLES20.glGetUniformLocation(glProgram, "uTexture");

      // Create texture
      int[] texIds = new int[1];
      GLES20.glGenTextures(1, texIds, 0);
      glTextureId = texIds[0];
      GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, glTextureId);
      GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MIN_FILTER, GLES20.GL_LINEAR);
      GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MAG_FILTER, GLES20.GL_LINEAR);
      GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_WRAP_S, GLES20.GL_CLAMP_TO_EDGE);
      GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_WRAP_T, GLES20.GL_CLAMP_TO_EDGE);

      GLES20.glViewport(0, 0, surfaceWidth, surfaceHeight);
      GLES20.glClearColor(0.0f, 0.0f, 0.0f, 1.0f);
    } catch (Exception e) {
      android.util.Log.e("FfmpegVideo", "initEgl failed: " + e.getMessage());
      releaseEgl();
    }
  }

  private void releaseEgl() {
    if (eglDisplay != EGL14.EGL_NO_DISPLAY) {
      EGL14.eglMakeCurrent(eglDisplay, EGL14.EGL_NO_SURFACE,
          EGL14.EGL_NO_SURFACE, EGL14.EGL_NO_CONTEXT);
      if (glTextureId != 0) {
        GLES20.glDeleteTextures(1, new int[]{glTextureId}, 0);
        glTextureId = 0;
      }
      if (glProgram != 0) {
        GLES20.glDeleteProgram(glProgram);
        glProgram = 0;
      }
      if (eglSurface != EGL14.EGL_NO_SURFACE) {
        EGL14.eglDestroySurface(eglDisplay, eglSurface);
        eglSurface = EGL14.EGL_NO_SURFACE;
      }
      if (eglContext != EGL14.EGL_NO_CONTEXT) {
        EGL14.eglDestroyContext(eglDisplay, eglContext);
        eglContext = EGL14.EGL_NO_CONTEXT;
      }
      EGL14.eglTerminate(eglDisplay);
      eglDisplay = EGL14.EGL_NO_DISPLAY;
    }
    texWidth = 0;
    texHeight = 0;
    lastQuadVideoW = 0;
    lastQuadVideoH = 0;
    lastQuadSurfaceW = 0;
    lastQuadSurfaceH = 0;
  }

  // ── frame rendering (RGBA → GL texture → eglSwapBuffers) ─────────────────

  private void renderFrame(ByteBuffer data, int w, int h) {
    if (w <= 0 || h <= 0 || eglDisplay == EGL14.EGL_NO_DISPLAY) return;

    // Upload RGBA data as texture
    GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, glTextureId);
    data.rewind();
    if (w != texWidth || h != texHeight) {
      GLES20.glTexImage2D(GLES20.GL_TEXTURE_2D, 0, GLES20.GL_RGBA,
          w, h, 0, GLES20.GL_RGBA, GLES20.GL_UNSIGNED_BYTE, data);
      texWidth = w;
      texHeight = h;
    } else {
      GLES20.glTexSubImage2D(GLES20.GL_TEXTURE_2D, 0, 0, 0,
          w, h, GLES20.GL_RGBA, GLES20.GL_UNSIGNED_BYTE, data);
    }

    // Recompute quad vertices only when dimensions change
    if (w != lastQuadVideoW || h != lastQuadVideoH
        || surfaceWidth != lastQuadSurfaceW || surfaceHeight != lastQuadSurfaceH) {
      float videoAspect = (float) w / h;
      float surfaceAspect = (float) surfaceWidth / surfaceHeight;
      float quadW, quadH;
      if (videoAspect > surfaceAspect) {
        quadW = 1.0f;
        quadH = surfaceAspect / videoAspect;
      } else {
        quadH = 1.0f;
        quadW = videoAspect / surfaceAspect;
      }
      float[] vertices = {
          -quadW, -quadH,  quadW, -quadH,
          -quadW,  quadH,  quadW,  quadH,
      };
      vertexBuffer = ByteBuffer.allocateDirect(vertices.length * 4)
          .order(ByteOrder.nativeOrder()).asFloatBuffer();
      vertexBuffer.put(vertices).flip();
      lastQuadVideoW = w;
      lastQuadVideoH = h;
      lastQuadSurfaceW = surfaceWidth;
      lastQuadSurfaceH = surfaceHeight;
    }

    // Draw
    GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT);
    GLES20.glUseProgram(glProgram);

    GLES20.glEnableVertexAttribArray(aPosLoc);
    GLES20.glVertexAttribPointer(aPosLoc, 2, GLES20.GL_FLOAT, false, 0, vertexBuffer);

    GLES20.glEnableVertexAttribArray(aTexLoc);
    GLES20.glVertexAttribPointer(aTexLoc, 2, GLES20.GL_FLOAT, false, 0, texCoordBuffer);

    GLES20.glActiveTexture(GLES20.GL_TEXTURE0);
    GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, glTextureId);
    GLES20.glUniform1i(uTexLoc, 0);

    GLES20.glDrawArrays(GLES20.GL_TRIANGLE_STRIP, 0, 4);

    GLES20.glDisableVertexAttribArray(aPosLoc);
    GLES20.glDisableVertexAttribArray(aTexLoc);

    // Present (vsync-synchronized)
    if (!EGL14.eglSwapBuffers(eglDisplay, eglSurface)) {
      int err = EGL14.eglGetError();
      if (err == EGL14.EGL_BAD_SURFACE) {
        releaseEgl();
      }
    }
  }

  // ── GL helpers ───────────────────────────────────────────────────────────

  private static int compileShader(int type, String source) {
    int shader = GLES20.glCreateShader(type);
    GLES20.glShaderSource(shader, source);
    GLES20.glCompileShader(shader);
    int[] compiled = new int[1];
    GLES20.glGetShaderiv(shader, GLES20.GL_COMPILE_STATUS, compiled, 0);
    if (compiled[0] == 0) {
      String log = GLES20.glGetShaderInfoLog(shader);
      GLES20.glDeleteShader(shader);
      throw new RuntimeException("Shader compile failed: " + log);
    }
    return shader;
  }

  private static int createProgram(String vertexSrc, String fragmentSrc) {
    int vs = compileShader(GLES20.GL_VERTEX_SHADER, vertexSrc);
    int fs = compileShader(GLES20.GL_FRAGMENT_SHADER, fragmentSrc);
    int prog = GLES20.glCreateProgram();
    GLES20.glAttachShader(prog, vs);
    GLES20.glAttachShader(prog, fs);
    GLES20.glLinkProgram(prog);
    int[] linked = new int[1];
    GLES20.glGetProgramiv(prog, GLES20.GL_LINK_STATUS, linked, 0);
    if (linked[0] == 0) {
      String log = GLES20.glGetProgramInfoLog(prog);
      GLES20.glDeleteProgram(prog);
      throw new RuntimeException("Program link failed: " + log);
    }
    GLES20.glDeleteShader(vs);
    GLES20.glDeleteShader(fs);
    return prog;
  }
}
