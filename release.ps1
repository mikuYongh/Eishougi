# release.ps1
# ====================================================================
# EISHOUGI 一体化发布脚本
# 构建（Windows NSIS + Android APK）→ 签名 → 更新 latest.json → git 推送 → GitHub Release
#
# 用法:
#   .\release.ps1 -Version 0.3.0              # 发布 0.3.0（Win + Android）
#   .\release.ps1 -Version 0.3.0 -SkipAndroid # 只发 Windows
#   .\release.ps1 -Version 0.3.0 -SkipWindows # 只发 Android
#   .\release.ps1 -Version 0.3.0 -Notes "修复XX，新增YY"
#
# 前提:
#   - 签名密钥在 .\.tauri\prompt-muse.key（密码 yangwei）
#   - gh CLI 已登录（gh auth status）
#   - Android SDK + NDK + build-tools 已安装
# ====================================================================

param(
    [Parameter(Mandatory=$true)]
    [string]$Version,                    # 版本号，如 0.3.0
    [string]$Notes = "",                 # 更新说明（可选，留空则用默认）
    [switch]$SkipWindows,
    [switch]$SkipAndroid,
    [switch]$SkipPush                    # 跳过 git push + gh release（只构建）
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

# ---- 配置 ----
$REPO = "mikuYongh/Eishougi"
$KEY_PATH = "$PSScriptRoot\~\.tauri\prompt-muse.key"
$KEY_PASSWORD = "yangwei"
$GH_ACCEL = "https://ghfast.top"        # GitHub 下载加速前缀（国内）
$SDK = "$env:LOCALAPPDATA\Android\Sdk"
$buildToolsDir = Get-ChildItem "$SDK\build-tools" -Directory | Sort-Object Name -Descending | Select-Object -First 1
$apksigner = "$($buildToolsDir.FullName)\apksigner.bat"

# ---- 校验 ----
Write-Host "`n{'='*60}" -ForegroundColor Cyan
Write-Host "  EISHOUGI v$Version 发布脚本" -ForegroundColor Cyan
Write-Host "{'='*60}" -ForegroundColor Cyan

if (-not (Test-Path $KEY_PATH)) {
    Write-Host "❌ 签名密钥未找到: $KEY_PATH" -ForegroundColor Red
    Write-Host "   运行: npx tauri signer generate -w $KEY_PATH" -ForegroundColor Yellow
    exit 1
}

if ($Notes -eq "") {
    $Notes = "EISHOUGI v$Version 更新。详细变更请查看 commits。"
}

# ---- 设置签名环境变量（Tauri 构建时自动签名 Windows 安装包）----
$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content $KEY_PATH -Raw
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = $KEY_PASSWORD
Write-Host "✅ 签名密钥已加载" -ForegroundColor Green

# ====================================================================
# Step 1: 更新版本号（三处同步）
# ====================================================================
Write-Host "`n=== [1/7] 更新版本号 → $Version ===" -ForegroundColor Cyan

$tauriConf = Get-Content "src-tauri\tauri.conf.json" -Raw
$tauriConf = $tauriConf -replace '"version": "[^"]*"', "`"version`": `"$Version`""
Set-Content "src-tauri\tauri.conf.json" $tauriConf -NoNewline

$cargoToml = Get-Content "src-tauri\Cargo.toml" -Raw
$cargoToml = $cargoToml -replace '^version = "[^"]*"', "version = `"$Version`""
Set-Content "src-tauri\Cargo.toml" $cargoToml -NoNewline

$pkgJson = Get-Content "package.json" -Raw
$pkgJson = $pkgJson -replace '"version": "[^"]*"', "`"version`": `"$Version`""
Set-Content "package.json" $pkgJson -NoNewline

Write-Host "  ✅ tauri.conf.json / Cargo.toml / package.json → $Version" -ForegroundColor Green

# ====================================================================
# Step 2: 构建 Windows NSIS（带签名）
# ====================================================================
$winExe = $null
$winSig = $null

if (-not $SkipWindows) {
    Write-Host "`n=== [2/7] 构建 Windows 安装包（NSIS + 免安装便携版，带签名）===" -ForegroundColor Cyan
    npx tauri build 2>&1 | Out-Default

    # 查找产物 — NSIS 安装包
    $nsisDir = "src-tauri\target\release\bundle\nsis"
    $winExe = Get-ChildItem "$nsisDir\*.exe" | Where-Object { $_.Name -notmatch "uninstall" } | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    $winSig = Get-ChildItem "$nsisDir\*.sig" | Sort-Object LastWriteTime -Descending | Select-Object -First 1

    # 查找产物 — 免安装便携版（直接从 target/release 取编译好的 exe）
    $portableSrc = "src-tauri\target\release\prompt-muse.exe"
    $portableExe = $null
    if (Test-Path $portableSrc) {
        $portableExe = Get-Item $portableSrc
    }

    if ($winExe) {
        $sizeMB = [math]::Round($winExe.Length / 1MB, 1)
        Write-Host "  ✅ NSIS 安装包: $($winExe.Name) ($sizeMB MB)" -ForegroundColor Green
    } else {
        Write-Host "  ❌ NSIS 安装包未找到" -ForegroundColor Red
        exit 1
    }
    if ($winSig) {
        Write-Host "  ✅ 签名文件: $($winSig.Name)" -ForegroundColor Green
    } else {
        Write-Host "  ⚠️ 未找到 .sig 签名文件（签名环境变量可能未生效）" -ForegroundColor Yellow
    }
    if ($portableExe) {
        $sizeMB = [math]::Round($portableExe.Length / 1MB, 1)
        Write-Host "  ✅ 免安装便携版: $($portableExe.Name) ($sizeMB MB)" -ForegroundColor Green
    } else {
        Write-Host "  ⚠️ 免安装便携版未找到" -ForegroundColor Yellow
    }
} else {
    Write-Host "`n=== [2/7] 跳过 Windows 构建 ===" -ForegroundColor DarkGray
}

# ====================================================================
# Step 3: 构建 Android APK
# ====================================================================
$apkFile = $null

if (-not $SkipAndroid) {
    Write-Host "`n=== [3/7] 构建 Android APK ===" -ForegroundColor Cyan

    # 同步库资源到 Android assets
    $assetsDir = "src-tauri\gen\android\app\src\main\assets"
    if (-not (Test-Path $assetsDir)) { New-Item -ItemType Directory -Path $assetsDir | Out-Null }
    foreach ($res in @("characters.json", "artists.json")) {
        $src = "src-tauri\resources\$res"
        if (Test-Path $src) {
            Copy-Item -Path $src -Destination (Join-Path $assetsDir $res) -Force
        }
    }

    # 构建单架构（aarch64，现代手机）以加速编译
    $env:NDK_HOME = "$SDK\ndk\28.1.13356709"
    $env:ANDROID_NDK_HOME = $env:NDK_HOME
    $env:CI = "1"
    npx tauri android build -t aarch64 --apk --ci 2>&1 | Out-Default

    # 签名 APK
    $unsignedApk = "src-tauri\gen\android\app\build\outputs\apk\universal\release\app-universal-release-unsigned.apk"
    $apkFile = "$PSScriptRoot\app-release.apk"
    if (Test-Path $unsignedApk) {
        & $apksigner sign --ks "debug.keystore" --ks-pass pass:android --ks-key-alias debug --key-pass pass:android --out $apkFile $unsignedApk 2>&1 | Out-Default
        $sizeMB = [math]::Round((Get-Item $apkFile).Length / 1MB, 1)
        Write-Host "  ✅ APK: app-release.apk ($sizeMB MB)" -ForegroundColor Green
    } else {
        Write-Host "  ❌ APK 未找到" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "`n=== [3/7] 跳过 Android 构建 ===" -ForegroundColor DarkGray
}

if ($SkipPush) {
    Write-Host "`n=== -SkipPush 已设置，跳过推送。产物已生成。 ===" -ForegroundColor Yellow
    exit 0
}

# ====================================================================
# Step 4: 创建 GitHub Release（先创建，拿到实际下载 URL）
# ====================================================================
Write-Host "`n=== [4/7] 创建 GitHub Release v$Version ===" -ForegroundColor Cyan

# 检查 gh 是否已登录
$ghStatus = gh auth status 2>&1 | Out-String
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ gh CLI 未登录。运行: gh auth login" -ForegroundColor Red
    exit 1
}

# 如果 release 已存在则先删除
gh release delete "v$Version" --yes --repo $REPO 2>&1 | Out-Null
git push origin ":refs/tags/v$Version" 2>&1 | Out-Null

# 创建 release（先不上传文件，拿到 URL 后更新 latest.json 再上传）
gh release create "v$Version" --repo $REPO --title "v$Version" --notes $Notes --latest 2>&1 | Out-Null
Write-Host "  ✅ Release v$Version 已创建" -ForegroundColor Green

# ====================================================================
# Step 5: 上传产物到 Release
# ====================================================================
Write-Host "`n=== [5/7] 上传构建产物 ===" -ForegroundColor Cyan

$uploadFiles = @()
if ($winExe) {
    # 重命名为规范文件名（避免中文文件名在 URL 里编码问题）
    $winDest = "$PSScriptRoot\Eishougi_${Version}_x64-setup.exe"
    Copy-Item $winExe.FullName $winDest -Force
    $uploadFiles += $winDest
    if ($winSig) {
        $sigDest = "$PSScriptRoot\Eishougi_${Version}_x64-setup.exe.sig"
        Copy-Item $winSig.FullName $sigDest -Force
        $uploadFiles += $sigDest
    }
}
if ($portableExe) {
    $portableDest = "$PSScriptRoot\Eishougi_${Version}_x64-portable.exe"
    Copy-Item $portableExe.FullName $portableDest -Force
    $uploadFiles += $portableDest
}
if ($apkFile -and (Test-Path $apkFile)) {
    $uploadFiles += $apkFile
}

foreach ($f in $uploadFiles) {
    $fname = Split-Path $f -Leaf
    Write-Host "  上传 $fname ..." -ForegroundColor DarkGray
    gh release upload "v$Version" $f --repo $REPO --clobber 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ✅ $fname" -ForegroundColor Green
    } else {
        Write-Host "  ❌ $fname 上传失败" -ForegroundColor Red
    }
}

# ====================================================================
# Step 6: 更新 update/latest.json
# ====================================================================
Write-Host "`n=== [6/7] 更新 latest.json ===" -ForegroundColor Cyan

# GitHub 原始下载 URL（会被 app 端的加速源回退覆盖）
$winUrl = "https://github.com/$REPO/releases/download/v$Version/Eishougi_${Version}_x64-setup.exe"
$apkUrl = "https://github.com/$REPO/releases/download/v$Version/app-release.apk"

# 读取 .sig 签名内容
$sigContent = ""
if ($winSig) {
    $sigCopy = "$PSScriptRoot\Eishougi_${Version}_x64-setup.exe.sig"
    if (Test-Path $sigCopy) { $sigContent = (Get-Content $sigCopy -Raw).Trim() }
}

$pubDate = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")

# 构建 latest.json（下载 URL 用 GitHub 原始地址，app 端 update.rs 会自动尝试加速源）
$latest = @{
    version = $Version
    notes = $Notes
    pub_date = $pubDate
    platforms = @{
        "windows-x86_64" = @{
            signature = $sigContent
            url = $winUrl
        }
        "android-universal" = @{
            url = $apkUrl
        }
    }
} | ConvertTo-Json -Depth 5

Set-Content "update\latest.json" $latest -Encoding UTF8
Write-Host "  ✅ update/latest.json 已更新" -ForegroundColor Green
Write-Host "  Windows URL: $winUrl" -ForegroundColor DarkGray
Write-Host "  Android URL: $apkUrl" -ForegroundColor DarkGray
Write-Host "  加速前缀: $GH_ACCEL（app 端自动回退）" -ForegroundColor DarkGray

# ====================================================================
# Step 7: git 提交 + 推送
# ====================================================================
Write-Host "`n=== [7/7] 提交并推送 ===" -ForegroundColor Cyan

git add update/latest.json src-tauri/tauri.conf.json src-tauri/Cargo.toml package.json
git commit -m "release: v$Version" 2>&1 | Out-Default
git push origin (git branch --show-current) 2>&1 | Out-Default
Write-Host "  ✅ 代码已推送" -ForegroundColor Green

# 清理临时文件
foreach ($f in @("$PSScriptRoot\Eishougi_${Version}_x64-setup.exe", "$PSScriptRoot\Eishougi_${Version}_x64-setup.exe.sig", "$PSScriptRoot\Eishougi_${Version}_x64-portable.exe")) {
    if (Test-Path $f) { Remove-Item $f -Force }
}

# ====================================================================
# 完成
# ====================================================================
Write-Host "`n{'='*60}" -ForegroundColor Green
Write-Host "  ✅ v$Version 发布完成！" -ForegroundColor Green
Write-Host "{'='*60}" -ForegroundColor Green
Write-Host "`n  Release: https://github.com/$REPO/releases/tag/v$Version" -ForegroundColor Cyan
Write-Host "  latest.json 已推送，jsDelivr CDN 将在数分钟内刷新`n" -ForegroundColor DarkGray
