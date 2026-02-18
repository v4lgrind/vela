#!/bin/bash
  set -e

  ANDROID_HOME="/home/vscode/android-sdk"
  # Android command-line tools version (check https://developer.android.com/studio#command-line-tools-only for updates)
  CMDLINE_TOOLS_VERSION="14742923"

  mkdir -p "$ANDROID_HOME"

  # Download and install Android command-line tools
  curl -fsSL "https://dl.google.com/android/repository/commandlinetools-linux-${CMDLINE_TOOLS_VERSION}_latest.zip" \
    -o /tmp/cmdline-tools.zip
  unzip -q /tmp/cmdline-tools.zip -d /tmp/cmdline-tools
  mkdir -p "$ANDROID_HOME/cmdline-tools"
  mv /tmp/cmdline-tools/cmdline-tools "$ANDROID_HOME/cmdline-tools/latest"
  rm -rf /tmp/cmdline-tools.zip /tmp/cmdline-tools

  # Accept all SDK licenses
  yes | sdkmanager --licenses > /dev/null 2>&1 || true

  # Install SDK components
  sdkmanager \
    "platform-tools" \
    "platforms;android-36" \
    "build-tools;36.0.0"

  echo "Android SDK installed at $ANDROID_HOME"