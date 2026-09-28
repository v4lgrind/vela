# Android Docker build — 2026-09-24

## Investigation
- The local Android SDK configured in `android/local.properties` does not exist here. Docker is available.
- The existing CI workflow uses Node 22, JDK 21, Android API 36, `npm ci`, Capacitor sync, and Gradle `assembleDebug`.
- The Gradle project names the output `mediaserver-client.apk` and signs it with the repository's fixed debug-grade key.

## Changes
- Added `Dockerfile.android`: Node 22, Temurin JDK 21, Android command-line tools 19, platform 36 and build-tools 36.0.0. It type-checks and builds the web app, synchronizes Capacitor, and compiles the debug APK. The default target is a reusable `mediaserver-android` builder image; the `apk` target exports only the artifact.
- Added `.dockerignore`, excluded the documented `out/` directory in `.gitignore`, and documented both export methods in `README.md`. Updated the previously incorrect local APK path there.

## Verification
- `docker build -f Dockerfile.android -t mediaserver-android .` completed `:app:assembleDebug` successfully.
- `docker build -f Dockerfile.android --target apk --output type=local,dest=./out .` exported `out/mediaserver-client.apk`; `unzip -tq` found no errors. Extraction from the builder image produced the same SHA-256: `899986b8e87c9fa11ce9a1974283ad9f3ace798f410a8b65e725a273a7c85184`.
- `docker run --rm mediaserver-android` verified Node 22.23.3, OpenJDK 21.0.12 and sdkmanager 19.0.
- No Android device/emulator was available to launch the resulting APK.
