#!/bin/bash
# build-and-install-apk.sh
# 构建独立APK并安装到连接的Android设备

set -e
cd "$(dirname "$0")"

echo -e "\033[36m=== 1/4 构建前端 ===\033[0m"
npm run build

echo -e "\n\033[36m=== 2/4 编译 Rust 到 Android (全架构) ===\033[0m"
npx tauri android build

APK="src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release-unsigned.apk"
if [ ! -f "$APK" ]; then
    echo -e "\033[31mAPK未找到: $APK\033[0m"
    exit 1
fi

echo -e "\n\033[36m=== 3/4 签名 APK ===\033[0m"
KEYSTORE="debug.keystore"
if [ ! -f "$KEYSTORE" ]; then
    echo -e "\033[33m  生成debug签名密钥...\033[0m"
    keytool -genkey -v \
        -keystore "$KEYSTORE" \
        -alias debug \
        -keyalg RSA -keysize 2048 -validity 365 \
        -storepass android -keypass android \
        -dname "CN=Debug, OU=Dev, O=PromptMuse, L=City, S=State, C=CN" 2>/dev/null
fi

SIGNED="app-release.apk"

# 从 Windows 环境变量获取 Android SDK 路径
SDK="$ANDROID_HOME"
if [ -z "$SDK" ]; then SDK="$ANDROID_SDK_ROOT"; fi
if [ -z "$SDK" ]; then
    # 默认 Windows 路径
    SDK="$HOME/AppData/Local/Android/Sdk"
fi
SDK=$(echo "$SDK" | tr '\\' '/')
APKSIGNER="$SDK/build-tools/36.0.0/apksigner"

# 如果 36.0.0 不存在，尝试找到可用的版本
if [ ! -f "$APKSIGNER" ]; then
    echo -e "\033[33m  Android SDK: $SDK\033[0m"
    for ver in 36.0.0 35.0.0 34.0.0; do
        if [ -f "$SDK/build-tools/$ver/apksigner" ]; then
            APKSIGNER="$SDK/build-tools/$ver/apksigner"
            break
        fi
    done
fi

if [ ! -f "$APKSIGNER" ]; then
    echo -e "\033[31mapksigner 未找到\033[0m"
    echo "请确认 Android SDK build-tools 已安装"
    exit 1
fi

echo -e "\033[36m  使用 $APKSIGNER\033[0m"
"$APKSIGNER" sign \
    --ks "$KEYSTORE" --ks-pass pass:android \
    --ks-key-alias debug --key-pass pass:android \
    --out "$SIGNED" "$APK"

echo -e "\n\033[36m=== 4/4 安装到设备 ===\033[0m"
adb install -r "$SIGNED"

echo -e "\n\033[32m=== 完成 ===\033[0m"
ls -lh "$SIGNED"
