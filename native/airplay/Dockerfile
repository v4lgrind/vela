# Builds cliairplay (https://github.com/music-assistant/airplay-cli, GPL-3.0),
# the AirPlay 1/2 audio sender the app runs to stream music to Apple TVs and
# AirPlay speakers. The output is committed under android/app/src/main/jniLibs
# like libffmpegJNI.so, so the regular Android build doesn't need the NDK.
#
#   docker build -f native/airplay/Dockerfile --output type=local,dest=android/app/src/main/jniLibs native/airplay

FROM debian:bookworm-slim AS build
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl unzip git make perl binutils python3 \
    && rm -rf /var/lib/apt/lists/*

ARG NDK_VERSION=r27c
RUN curl -fsSL "https://dl.google.com/android/repository/android-ndk-${NDK_VERSION}-linux.zip" -o /tmp/ndk.zip \
    && unzip -q /tmp/ndk.zip -d /opt \
    && mv /opt/android-ndk-${NDK_VERSION} /opt/ndk \
    && rm /tmp/ndk.zip

# OpenSSL 3.5 LTS replaces the unmaintained 1.1.1 bundled with libraop.
ARG OPENSSL_VERSION=3.5.9
ARG OPENSSL_SHA256=603f5602e2eef00d77fbd429d34dcd5822bb301757a1bc9cdb24c670f1eb859a
RUN curl -fsSL "https://github.com/openssl/openssl/releases/download/openssl-${OPENSSL_VERSION}/openssl-${OPENSSL_VERSION}.tar.gz" -o /tmp/openssl.tar.gz \
    && echo "${OPENSSL_SHA256}  /tmp/openssl.tar.gz" | sha256sum -c - \
    && tar -xzf /tmp/openssl.tar.gz -C /opt \
    && mv /opt/openssl-${OPENSSL_VERSION} /opt/openssl \
    && rm /tmp/openssl.tar.gz

# v0.5.8, pinned. Only the submodules the CLI build compiles are fetched.
ARG AIRPLAY_CLI_COMMIT=1701bc25e9d303b42532569f624b64c0d0afb1f6
RUN git clone -q https://github.com/music-assistant/airplay-cli.git /src \
    && cd /src && git checkout -q ${AIRPLAY_CLI_COMMIT} \
    && git submodule update -q --init --depth 1 libraop \
    && cd libraop \
    && git submodule update -q --init --depth 1 crosstools dmap-parser libmdns libcodecs curve25519 \
    && (cd libmdns && git submodule update -q --init --depth 1 mdnssd mdnssvc) \
    && (cd libcodecs && git submodule update -q --init --depth 1 alac)

COPY build.sh android_compat.c android_compat.h /build/
RUN NDK=/opt/ndk SRC=/src OPENSSL_SRC=/opt/openssl OUT=/out bash /build/build.sh

FROM scratch
COPY --from=build /out /
