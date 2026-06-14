<p align="center">
  <img src="public/logo.png" alt="EISHOUGI Logo" width="800" />
</p>

<h1 align="center">詠唱机 EISHOUGI</h1>

<p align="center">
  <strong>✨ 用文字咒语召唤画面的 AI 创作工作台 ✨</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Tauri-2.0-24C8D8?style=for-the-badge&logo=tauri&logoColor=white" alt="Tauri" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React" />
  <img src="https://img.shields.io/badge/Rust-Backend-000000?style=for-the-badge&logo=rust&logoColor=white" alt="Rust" />
  <img src="https://img.shields.io/badge/Tailwind-CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white" alt="Tailwind" />
  <img src="https://img.shields.io/badge/Platform-Win%20%7C%20Mac%20%7C%20Android-4CAF50?style=for-the-badge" alt="Platform" />
</p>

---

## 🌍 Language

- [简体中文 (Simplified Chinese)](#) (Current)
- *English documentation coming soon*

---

## 🌟 核心愿景 (Vision)

**詠唱机 (EISHOUGI)** 是一款专为 AI 绘画（特别是基于 ComfyUI 的高端创作者）打造的跨平台工作台。
我们将繁杂冰冷的技术参数温柔剥离，赋予纯粹的文字以魔法般的重构力量。您只需尽情倾诉创意，它便会静候在侧，将思绪编织为精准的视觉咒语，并于指尖召唤出突破现实的绚丽画卷。

---

## ✨ 核心特性 (Features)

### 🔮 魔法级提示词管理 (Prompt Project)
- **多语法支持**: 完美兼容 Danbooru 标准标签、自然语言 (Natural)、以及高级 XML 结构提示词。
- **一键注入 ComfyUI**: 可将项目中的提示词、尺寸、Seed、以及复杂的 LoRA 配置动态注入到绑定的 ComfyUI 工作流 (JSON) 中。
- **动态响应**: 深度对接 ComfyUI WebSocket，实时监控生成进度。

### 🤖 内置智能 AI 助手 (NEXUS Agent)
- **顶级逻辑规划**: 通过配置 OpenAI 兼容 API（支持如 `o1`, `o3-mini`, `DeepSeek-R1`, `Claude 3.5` 等），让 AI 替你自动拆解镜头语言并生成复杂的提示词结构。
- **深度思考 (Reasoning Effort)**: 完美支持并可直接调节 O 系列或 R1 推理模型的“思考深度”，为您获取最高质量的提示词构架。
- **零负担应用**: AI 生成的提示词和参数只需点击“一键应用”，即可无缝同步到当前项目中。

### 📚 全能资产库与典藏库 (Assets & Vault)
- **历史回溯**: 所有通过咏唱机生成的图片都会被无感记录（本地 SQLite 数据库），支持查看完整生成参数和 Seed。
- **原生下载保存**: 彻底解决 Web 端下载限制，移动端与 PC 端均直接调用 Rust 底层指令，将美图一键无损保存至系统相册/下载目录。
- **画廊展示**: 赛博朋克 + 毛玻璃美学的瀑布流画廊。

---

## 🚀 使用指南与快速开始 (Usage Guide)

### 1. 环境准备
使用本软件的生图功能，您必须在本地或远端拥有一套正常运行的 **ComfyUI** 实例。
- 启动您的 ComfyUI 服务（默认地址为 `http://127.0.0.1:8188`，可在软件右上角设置中更改）。
- 下载或构建本项目的安装包（见后文打包说明）。

### 2. 导入与绑定工作流 (Workflow)
软件通过**解析并覆盖 ComfyUI 工作流 JSON 文件（API 格式）**来实现动态生图。
我们在项目中提供了一个官方的演示工作流，您可以直接导入测试：

📁 **示例文件路径**: [`docs/workflows/Anima+Preview3_Txt2Img_Example.json`](./docs/workflows/Anima+Preview3_Txt2Img_Example.json)

**如何在软件中使用它？**
1. 打开《詠唱机 EISHOUGI》的 **Workflows (工作流)** 菜单。
2. 点击新建，导入上述的 `Anima+Preview3_Txt2Img_Example.json`。
3. 保存后，前往 **Prompts (提示词项目)** 页面新建一个项目，在底部工作流下拉框中选择刚刚绑定的工作流。
4. 现在，您可以输入提示词并点击 **“生成 (Generate)”**，系统将自动把参数注入节点并投递至您的 ComfyUI 队列。

### 3. 🧩 示例工作流依赖节点说明 (Required ComfyUI Nodes)
如果您使用的是本项目的示例工作流 `Anima+Preview3_Txt2Img_Example.json`，请确保您的 ComfyUI 中已安装以下关键自定义节点（可通过 *ComfyUI Manager* 搜索并安装）：

- **rgthree-comfy** (`Power Lora Loader (rgthree)` 节点)
- **ComfyUI Custom Scripts (pysssss)** 或等效工具 (`Simple String` 文本输入节点)
- **Inspire Pack / 类似拓展** (`SDXLEmptyLatentSizePicker+` 高级分辨率节点)
- **ToriiGate_Captioner** (用于特定提示词翻译或预处理的节点，如果缺失，可以在工作流中将其替换为原生的 `CLIP Text Encode` 节点并重新导出 API JSON)

*注：您完全可以使用自己平时的 ComfyUI 工作流，只需在 ComfyUI 中开启 "Enable Dev mode Options"，然后点击 "Save (API format)" 导出 JSON 并在本软件中导入即可！软件会自动识别核心文本与参数节点。*

---

## 🛠️ 本地开发与编译打包

### 1. 基础环境
- 安装 [Node.js](https://nodejs.org/) (推荐 v20+)
- 安装 [Rust 语言工具链](https://rustup.rs/)

### 2. 启动开发模式
```bash
git clone https://github.com/your-repo/prompt-muse.git
cd prompt-muse
npm install

# 启动桌面端开发模式
npm run tauri dev
```

### 3. 编译发布版应用
```bash
# 构建 Windows (exe/msi) 或 macOS (app/dmg)
npm run tauri build

# 构建 Android (apk/aab) - 需配置好 Android Studio SDK & NDK
npm run tauri android build
```

---

> *"用精确的咒语，编织出梦境般的视觉奇观。"* —— 詠唱机 EISHOUGI
