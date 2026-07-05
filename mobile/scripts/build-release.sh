#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ANDROID_DIR="$ROOT/android"
KEYSTORE="$ANDROID_DIR/qihe-release.jks"

export JAVA_HOME="${JAVA_HOME:-/Users/liuqian/Library/Java/JavaVirtualMachines/jbr-17.0.14/Contents/Home}"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"

if [[ ! -f "$KEYSTORE" ]]; then
  echo "生成签名证书 qihe-release.jks ..."
  keytool -genkeypair -v \
    -keystore "$KEYSTORE" \
    -alias qihe \
    -keyalg RSA -keysize 2048 -validity 10000 \
    -storepass "${KEYSTORE_PASSWORD:-qihe2026}" \
    -keypass "${KEY_PASSWORD:-qihe2026}" \
    -dname "CN=Qihe Contract, OU=Mobile, O=Qihe, L=Beijing, ST=Beijing, C=CN"
fi

echo "同步 Web 资源到 Android ..."
cd "$ROOT"
npx cap sync android

echo "构建 Release APK ..."
cd "$ANDROID_DIR"
chmod +x gradlew
./gradlew assembleRelease --no-daemon

APK=$(find app/build/outputs/apk/release -name '*.apk' | head -1)
if [[ -n "$APK" ]]; then
  OUT="$ROOT/../dist"
  mkdir -p "$OUT"
  cp "$APK" "$OUT/qihe-release.apk"
  echo ""
  echo "✅ Release APK: $OUT/qihe-release.apk"
  echo "   原始路径: $APK"
else
  echo "❌ 未找到 APK 输出" >&2
  exit 1
fi
