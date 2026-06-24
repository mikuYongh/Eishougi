# build-and-install-apk.ps1
# 构建独立APK并安装到手机

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$sdk = "$env:LOCALAPPDATA\Android\Sdk"
$buildTools = Get-ChildItem "$sdk\build-tools" -Directory | Sort-Object Name -Descending | Select-Object -First 1
$apksigner = "$($buildTools.FullName)\apksigner.bat"
$adb = "$sdk\platform-tools\adb.exe"

$javaDir = "C:\Program Files\Android\Android Studio\jbr\bin"
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$keytool = if (Test-Path "$javaDir\keytool.exe") { "$javaDir\keytool.exe" } else { "keytool" }

$apk = "src-tauri\gen\android\app\build\outputs\apk\universal\release\app-universal-release-unsigned.apk"

Write-Host "=== 1/6 构建前端 ===" -ForegroundColor Cyan
# Redirect stderr→stdout so node/vite warnings (INEFFECTIVE_DYNAMIC_IMPORT etc.)
# don't trigger $ErrorActionPreference "Stop" and abort the script.
npm run build 2>&1 | Out-Default

Write-Host "`n=== 2/6 同步库资源到 Android assets ===" -ForegroundColor Cyan
$assetsDir = "src-tauri\gen\android\app\src\main\assets"
if (-not (Test-Path $assetsDir)) { New-Item -ItemType Directory -Path $assetsDir | Out-Null }
foreach ($res in @("characters.json", "artists.json")) {
    $src = "src-tauri\resources\$res"
    if (Test-Path $src) {
        Copy-Item -Path $src -Destination (Join-Path $assetsDir $res) -Force
        Write-Host "  copied $res"
    } else {
        Write-Host "  WARN: $src not found" -ForegroundColor Yellow
    }
}

Write-Host "`n=== 3/6 清理 Gradle 缓存（确保 Kotlin 重新编译）===" -ForegroundColor Cyan
$gradleDir = "src-tauri\gen\android"
if (Test-Path "$gradleDir\app\build") {
    Remove-Item -Recurse -Force "$gradleDir\app\build" -ErrorAction SilentlyContinue
    Write-Host "  已删除 app/build 目录"
}
if (Test-Path "$gradleDir\.gradle") {
    Remove-Item -Recurse -Force "$gradleDir\.gradle" -ErrorAction SilentlyContinue  
    Write-Host "  已删除 .gradle 缓存"
}
# 确保 Kotlin daemon 已停止，避免增量编译缓存不一致（不同根路径 bug）
& "$gradleDir\gradlew" --stop 2>&1 | Out-Null

Write-Host "`n=== 4/6 编译 Rust -> Android APK ===" -ForegroundColor Cyan
npx tauri android build --apk 2>&1 | Out-Default

Write-Host "`n=== 5/6 签名 APK ===" -ForegroundColor Cyan
$keystore = "debug.keystore"
if (-not (Test-Path $keystore)) {
    Write-Host "  生成签名密钥..." -ForegroundColor Yellow
    & $keytool -genkey -v -keystore $keystore -alias debug -keyalg RSA -keysize 2048 -validity 365 -storepass android -keypass android -dname "CN=Debug, OU=Dev, O=PromptMuse, L=City, S=State, C=CN" 2>$null
}

$signed = "app-release.apk"
& $apksigner sign --ks $keystore --ks-pass pass:android --ks-key-alias debug --key-pass pass:android --out $signed $apk 2>&1 | Out-Default

Write-Host "`n=== 6/6 安装到设备 ===" -ForegroundColor Cyan
& $adb install -r $signed 2>&1 | Out-Default

Write-Host "`n=== 完成 ===" -ForegroundColor Green
$size = [math]::Round((Get-Item $signed).Length / 1MB, 1)
Write-Host "APK: $(Resolve-Path $signed) ($size MB)"
