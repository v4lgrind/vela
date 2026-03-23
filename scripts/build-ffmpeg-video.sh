#!/usr/bin/env bash
# =============================================================================
# build-ffmpeg-video.sh
#
# Rebuilds libffmpegJNI.so with both AUDIO and VIDEO codec support.
# Adds HEVC + H264 video decoders and swscale (for 10-bit → 8-bit conversion).
#
# Prerequisites:
#   - Android NDK r26.3+ (auto-installed via sdkmanager if ANDROID_HOME is set)
#   - CMake 3.22.1 (auto-installed via sdkmanager)
#   - Internet access to clone repos
#   - ~4 GB free disk space
#
# Usage:
#   bash scripts/build-ffmpeg-video.sh
#
# Output:
#   android/app/src/main/jniLibs/{arm64-v8a,armeabi-v7a,x86,x86_64}/libffmpegJNI.so
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BUILD_DIR="$SCRIPT_DIR/.ffmpeg-build"
JNI_OUT="$PROJECT_ROOT/android/app/src/main/jniLibs"
JNI_SRC="$PROJECT_ROOT/android/app/src/main/jni"

ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
NDK_VERSION="26.3.11579264"
CMAKE_VERSION="3.22.1"
ANDROID_NDK_PATH="$ANDROID_HOME/ndk/$NDK_VERSION"
CMAKE_BIN="$ANDROID_HOME/cmake/$CMAKE_VERSION/bin/cmake"

JELLYFIN_MEDIA3_REPO="https://github.com/jellyfin/jellyfin-androidx-media.git"
FFMPEG_REPO="https://git.ffmpeg.org/ffmpeg.git"
FFMPEG_BRANCH="release/6.0"

echo "=== FFmpeg video build script ==="
echo "Build dir   : $BUILD_DIR"
echo "NDK         : $ANDROID_NDK_PATH"
echo "Output      : $JNI_OUT"
echo ""

# ── 0. Install NDK + CMake if missing ────────────────────────────────────────
SDKMANAGER="$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager"
if [ ! -d "$ANDROID_NDK_PATH" ] && [ -f "$SDKMANAGER" ]; then
  echo "[0] Installing NDK $NDK_VERSION..."
  "$SDKMANAGER" "ndk;$NDK_VERSION" --sdk_root="$ANDROID_HOME"
fi
if [ ! -f "$CMAKE_BIN" ] && [ -f "$SDKMANAGER" ]; then
  echo "[0] Installing CMake $CMAKE_VERSION..."
  "$SDKMANAGER" "cmake;$CMAKE_VERSION" --sdk_root="$ANDROID_HOME"
fi
if [ ! -d "$ANDROID_NDK_PATH" ]; then
  echo "ERROR: NDK not found at $ANDROID_NDK_PATH"; exit 1
fi
if [ ! -f "$CMAKE_BIN" ]; then
  echo "ERROR: CMake not found at $CMAKE_BIN"; exit 1
fi

mkdir -p "$BUILD_DIR"
cd "$BUILD_DIR"

# ── 1. Clone jellyfin-androidx-media ─────────────────────────────────────────
if [ ! -d "jellyfin-androidx-media/.git" ]; then
  echo "[1/5] Cloning jellyfin-androidx-media..."
  git clone --depth=1 -b master "$JELLYFIN_MEDIA3_REPO" jellyfin-androidx-media
fi
cd jellyfin-androidx-media

# ── 2. Initialize media submodule ────────────────────────────────────────────
if [ ! -f "media/libraries/decoder_ffmpeg/src/main/jni/build_ffmpeg.sh" ]; then
  echo "[2/5] Initializing media submodule..."
  git submodule update --init media
fi

# Clone ffmpeg source (submodule fetch may fail for unadvertised commits)
if [ ! -f "ffmpeg/configure" ]; then
  echo "[2/5] Cloning FFmpeg $FFMPEG_BRANCH..."
  rm -rf ffmpeg/.git  # remove gitfile if present from failed submodule init
  git clone --depth=1 -b "$FFMPEG_BRANCH" "$FFMPEG_REPO" ffmpeg
fi

# ── 3. Patch build files ──────────────────────────────────────────────────────
echo "[3/5] Patching build files..."
JNI_DIR="media/libraries/decoder_ffmpeg/src/main/jni"

# Patch build.sh: correct NDK path, host platform, add hevc/h264 decoders
HOST_PLATFORM="linux-x86_64"
[[ "$(uname)" == "Darwin" ]] && HOST_PLATFORM="darwin-x86_64"

cat > build.sh <<EOF
#!/bin/bash
export ANDROID_NDK_PATH="$ANDROID_NDK_PATH"
[[ ! -d "\$ANDROID_NDK_PATH" ]] && echo "No NDK found, quitting..." && exit 1
export ANDROIDX_MEDIA_ROOT="\${PWD}/media"
export FFMPEG_MOD_PATH="\${ANDROIDX_MEDIA_ROOT}/libraries/decoder_ffmpeg/src/main"
export FFMPEG_PATH="\${PWD}/ffmpeg"
export ENABLED_DECODERS=(flac alac pcm_mulaw pcm_alaw mp3 aac ac3 eac3 dca mlp truehd hevc h264)
ln -sf "\${FFMPEG_PATH}" "\${FFMPEG_MOD_PATH}/jni/ffmpeg"
cd "\${FFMPEG_MOD_PATH}/jni"
./build_ffmpeg.sh "\${FFMPEG_MOD_PATH}" "\${ANDROID_NDK_PATH}" "$HOST_PLATFORM" 23 "\${ENABLED_DECODERS[@]}"
EOF

# Patch build_ffmpeg.sh: enable swscale
sed -i.bak 's/--disable-swscale/--enable-swscale/' "$JNI_DIR/build_ffmpeg.sh"

# Patch CMakeLists.txt: add swscale lib + video JNI source
CMAKE_FILE="$JNI_DIR/CMakeLists.txt"
if ! grep -q "swscale" "$CMAKE_FILE"; then
  sed -i.bak 's/foreach(ffmpeg_lib avutil swresample avcodec)/foreach(ffmpeg_lib avutil swresample swscale avcodec)/' "$CMAKE_FILE"
fi
if ! grep -q "ffmpeg_video_jni" "$CMAKE_FILE"; then
  sed -i.bak '/ffmpeg_jni\.cc/a\\            ffmpeg_video_jni.c' "$CMAKE_FILE"
  sed -i.bak 's/PRIVATE swresample/PRIVATE swresample\n                      PRIVATE swscale/' "$CMAKE_FILE"
fi

# ── 4. Copy our video JNI source ─────────────────────────────────────────────
echo "[4/5] Copying ffmpeg_video_jni.c..."
cp "$JNI_SRC/ffmpeg_video_jni.c" "$JNI_DIR/ffmpeg_video_jni.c"

# ── 5. Build FFmpeg static libraries ─────────────────────────────────────────
echo "[5a/5] Building FFmpeg static libraries (this takes 10-20 minutes)..."
bash build.sh

# ── 5b. Build libffmpegJNI.so via CMake ──────────────────────────────────────
echo "[5b/5] Building libffmpegJNI.so via CMake..."
FFMPEG_MOD_PATH="media/libraries/decoder_ffmpeg/src/main"
ABS_JNI_DIR="$(pwd)/$JNI_DIR"

for ABI in arm64-v8a armeabi-v7a x86 x86_64; do
  echo "  → $ABI"
  CMAKE_BUILD_DIR="/tmp/ffmpeg-jni-build/$ABI"
  mkdir -p "$CMAKE_BUILD_DIR"
  "$CMAKE_BIN" \
    -DANDROID_ABI="$ABI" \
    -DANDROID_PLATFORM=android-23 \
    -DANDROID_NDK="$ANDROID_NDK_PATH" \
    -DCMAKE_TOOLCHAIN_FILE="$ANDROID_NDK_PATH/build/cmake/android.toolchain.cmake" \
    -DCMAKE_BUILD_TYPE=Release \
    -S "$ABS_JNI_DIR" \
    -B "$CMAKE_BUILD_DIR" > /dev/null 2>&1
  "$CMAKE_BIN" --build "$CMAKE_BUILD_DIR" --target ffmpegJNI -j8 2>&1 | grep -v "^--"
  mkdir -p "$JNI_OUT/$ABI"
  cp "$CMAKE_BUILD_DIR/libffmpegJNI.so" "$JNI_OUT/$ABI/libffmpegJNI.so"
  echo "    ✓ $ABI/libffmpegJNI.so ($(du -h "$JNI_OUT/$ABI/libffmpegJNI.so" | cut -f1))"
done

echo ""
echo "=== Build complete ==="
echo "Rebuild the APK with:  cd '$PROJECT_ROOT' && npm run android:build"
echo ""
echo "Verify video support in logs:"
echo "  adb logcat -s FfmpegVideo"
