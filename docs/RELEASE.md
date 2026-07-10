# 软件更新发布指南

本应用通过 **GitHub Release + jsDelivr CDN** 分发更新，桌面端用 Tauri Updater（带签名校验），Android 用自定义 APK 下载安装。

用户端在 **设置 → 关于** 面板检查更新；应用启动后也会静默检查（24 小时只提醒一次）。

---

## 一、首次准备（一次性）

### 1. 生成签名密钥（仅桌面端更新需要）

```bash
npx tauri signer generate -w ~/.tauri/prompt-muse.key
```

- 会要求你设一个密码，并生成一对密钥。
- **私钥 + 密码必须保密，绝不提交到仓库。**
- 命令会输出一段 **公钥（pubkey）**，把它填进 `src-tauri/tauri.conf.json` 的 `plugins.updater.pubkey` 字段（替换 `REPLACE_WITH_GENERATED_PUBKEY`）。

### 2. 在 GitHub 仓库设置 Actions Secret（用于自动签名）

仓库 → Settings → Secrets and variables → Actions，添加：
- `TAURI_SIGNING_PRIVATE_KEY`：私钥文件内容
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`：你设的密码

> 不用 GitHub Actions 手动构建时：本地构建前在终端 `set TAURI_SIGNING_PRIVATE_KEY=...` + `set TAURI_SIGNING_PRIVATE_KEY_PASSWORD=...`（Windows），Tauri 会自动给安装包签名并生成 `.sig` 文件。

---

## 二、每次发布新版本

### 1. 改版本号（三处必须同步）

| 文件 | 字段 |
|------|------|
| `src-tauri/tauri.conf.json` | `"version": "0.x.x"` ← Updater 用这个比较 |
| `src-tauri/Cargo.toml` | `version = "0.x.x"` |
| `package.json` | `"version": "0.x.x"` |

### 2. 更新 `update/latest.json`

```json
{
  "version": "0.3.0",                        ← 新版本号
  "notes": "- 新功能A\n- 修复B",             ← 更新说明（支持 \n 换行）
  "pub_date": "2026-07-08T00:00:00Z",
  "platforms": {
    "windows-x86_64": {
      "signature": "dW50cnVzdGVk...",        ← .sig 文件的内容（桌面端签名）
      "url": "https://github.com/mikuYongh/Eishougi/releases/download/v0.3.0/Eishougi_0.3.0_x64-setup.exe"
    },
    "android-universal": {
      "url": "https://github.com/mikuYongh/Eishougi/releases/download/v0.3.0/app-release.apk"
    }
  }
}
```

- `signature`：桌面构建会生成 `Eishougi_0.3.0_x64-setup.exe.sig`，把它的内容（base64 字符串）填这里。Android 不需要签名，留空即可。
- `url`：填 GitHub Release 上传后的下载地址。

### 3. 构建安装包

**桌面端（Windows）：**
```bash
# 先设签名环境变量（或在 CI 里）
set TAURI_SIGNING_PRIVATE_KEY=<私钥内容>
set TAURI_SIGNING_PRIVATE_KEY_PASSWORD=<密码>
npm run tauri build
```
产物在 `src-tauri/target/release/bundle/`，包含 `.exe`（NSIS 安装包）和对应的 `.sig` 签名文件。

**Android：**
```bash
npm run tauri android build
# 然后用 debug.keystore 签名（见 build-and-install-apk.sh）
```
产物是 `app-release.apk`。

### 4. 发布 GitHub Release

1. 仓库 → Releases → Draft a new release
2. Tag：`v0.3.0`（对应版本号）
3. 上传：`.exe`（桌面）+ `.app-release.apk`（安卓）
4. 发布

### 5. 提交 latest.json 更新

把改好的 `update/latest.json` 提交到 `main` 分支。jsDelivr CDN 会在几分钟内刷新，用户下次检查就能看到新版本。

> **jsDelivr 缓存**：如果用户反馈"明明发了新版但检查不到"，可能是 CDN 缓存。访问
> `https://cdn.jsdelivr.net/gh/mikuYongh/Eishougi@main/update/latest.json` 确认内容，必要时
> 在 jsDelivr 官网手动刷新缓存。GitHub Raw（备用 endpoint）始终是实时的。

---

## 三、用户端体验

- **桌面端**：设置→关于点"立即更新"→自动下载（进度条）→完成提示重启→安装最新版（签名校验，防篡改）。
- **Android**：设置→关于点"立即更新"→下载 APK 到应用目录→自动拉起系统安装器→用户确认安装。

---

## 四、配置位置速查

| 项 | 文件 | 说明 |
|----|------|------|
| 更新源 URL | `src-tauri/tauri.conf.json` → `plugins.updater.endpoints` | jsDelivr 主 + GitHub Raw 备 |
| 公钥 | `src-tauri/tauri.conf.json` → `plugins.updater.pubkey` | 客户端用它验签 |
| 版本清单 | `update/latest.json`（仓库根） | 提交即生效，CDN 自动分发 |
| 权限 | `src-tauri/capabilities/default.json` → `updater:default` | 已配置 |
| Android 安装 | `MainActivity.kt` → `installApk()` + `REQUEST_INSTALL_PACKAGES` 权限 | 已配置 |
