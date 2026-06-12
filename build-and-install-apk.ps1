# build-and-install-apk.ps1
# 构建独立APK并安装到手机

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$sdk = "$env:LOCALAPPDATA\Android\Sdk"
$buildTools = Get-ChildItem "$sdk\build-tools" -Directory | Sort-Object Name -Descending | Select-Object -First 1
$apksigner = "$($buildTools.FullName)\apksigner.bat"
$apk = "src-tauri\gen\android\app\build\outputs\apk\universal\release\app-universal-release-unsigned.apk"

Write-Host "=== 1/4 构建前端 ===" -ForegroundColor Cyan
npm run build

Write-Host "`n=== 2/4 编译 Rust -> Android APK ===" -ForegroundColor Cyan
npx tauri android build

Write-Host "`n=== 3/4 签名 APK ===" -ForegroundColor Cyan
$keystore = "debug.keystore"
if (-not (Test-Path $keystore)) {
    Write-Host "  生成签名密钥..." -ForegroundColor Yellow
    & keytool -genkey -v -keystore $keystore -alias debug -keyalg RSA -keysize 2048 -validity 365 -storepass android -keypass android -dname "CN=Debug, OU=Dev, O=PromptMuse, L=City, S=State, C=CN" 2>$null
}

$signed = "app-release.apk"
& $apksigner sign --ks $keystore --ks-pass pass:android --ks-key-alias debug --key-pass pass:android --out $signed $apk

Write-Host "`n=== 4/4 安装到设备 ===" -ForegroundColor Cyan
adb install -r $signed

Write-Host "`n=== 完成 ===" -ForegroundColor Green
$size = [math]::Round((Get-Item $signed).Length / 1MB, 1)
Write-Host "APK: $(Resolve-Path $signed) ($size MB)"
