#!/bin/bash
# Cross-compiles music-assistant/airplay-cli (cliairplay) for Android.
# Runs inside native/airplay/Dockerfile; see that file for usage.
set -euo pipefail

: "${NDK:?}" "${SRC:?}" "${OPENSSL_SRC:?}" "${OUT:?}"
API=24
TC=$NDK/toolchains/llvm/prebuilt/linux-x86_64/bin
export PATH=$TC:$PATH
COMPAT=$(cd "$(dirname "$0")" && pwd)/android_compat.c
COMPAT_H=${COMPAT%.c}.h

build_abi() {
  local abi=$1 triple=$2 platform=$3 openssl_target=$4
  local cc=$TC/${triple}${API}-clang cxx=$TC/${triple}${API}-clang++
  local work=/tmp/build-$abi
  rm -rf "$work" && cp -a "$SRC" "$work"
  cd "$work"
  local raop=$work/libraop

  # OpenSSL 3 (libraop bundles an unmaintained 1.1.1), static, merged into
  # the libopenssl.a the Makefile expects
  local ssl_out=$raop/libopenssl/targets/android/$platform
  mkdir -p "$ssl_out"
  rm -rf "/tmp/openssl-$abi" && cp -a "$OPENSSL_SRC" "/tmp/openssl-$abi"
  (cd "/tmp/openssl-$abi" \
    && ANDROID_NDK_ROOT=$NDK ./Configure "$openssl_target" -D__ANDROID_API__=$API \
         no-shared no-tests no-apps no-docs no-ui-console no-engine no-dso \
    && make -j"$(nproc)" build_libs >/dev/null \
    && printf 'create %s\naddlib libssl.a\naddlib libcrypto.a\nsave\nend\n' "$ssl_out/libopenssl.a" | llvm-ar -M \
    && cp -r include "$ssl_out/")

  # libmdns (mdnssd + mdnssvc)
  local mdns_out=$raop/libmdns/targets/android/$platform
  mkdir -p "$mdns_out" /tmp/mdns-$abi
  for f in mdnssd/mdnssd.c mdnssvc/mdns.c mdnssvc/mdnsd.c; do
    "$cc" -O2 -fPIC -D_GNU_SOURCE -I"$raop/crosstools/src" -c "$raop/libmdns/$f" -o "/tmp/mdns-$abi/$(basename "$f" .c).o"
  done
  llvm-ar rcs "$mdns_out/libmdns.a" /tmp/mdns-$abi/*.o

  # libcodecs: only Apple's ALAC codec is used (the wrapper comes from src/alac_ext.cpp)
  local codecs_out=$raop/libcodecs/targets/android/$platform
  local alac=$raop/libcodecs/alac/codec
  mkdir -p "$codecs_out" /tmp/alac-$abi
  for f in "$alac"/*.c; do
    "$cc" -O2 -fPIC -c "$f" -o "/tmp/alac-$abi/$(basename "$f" .c).o"
  done
  for f in "$alac"/*.cpp; do
    "$cxx" -O2 -fPIC -std=gnu++17 -c "$f" -o "/tmp/alac-$abi/$(basename "$f" .cpp).o"
  done
  llvm-ar rcs "$codecs_out/libcodecs.a" /tmp/alac-$abi/*.o

  "$cc" -O2 -fPIC -c "$COMPAT" -o /tmp/compat-$abi.o

  # LDFLAGS on the command line replaces the Makefile's glibc-specific link flags.
  # 16 KB segment alignment: required on 16 KB page-size devices (Pixel 10+).
  make -j"$(nproc)" HOST=android PLATFORM="$platform" STATIC=1 VERSION=android \
    CC="$cc" CXX="$cxx" AR=llvm-ar \
    EXTRA_CFLAGS="-include $COMPAT_H" \
    LDFLAGS="/tmp/compat-$abi.o -static-libstdc++ -lm -ldl -s -Wl,-z,max-page-size=16384"

  mkdir -p "$OUT/$abi"
  # Named lib*.so so Android extracts it next to the app's native libs, where it may be executed.
  cp "bin/cliairplay-android-$platform" "$OUT/$abi/libcliairplay.so"
}

build_abi arm64-v8a aarch64-linux-android aarch64 android-arm64
