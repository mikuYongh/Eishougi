# Prompt Muse / EISHOUGI 项目审查报告

审查日期：2026-07-16
审查方式：静态代码审查、工作流结构检查、`npm run build` 构建验证。
范围：`src/`、`src-tauri/src/`、内置工作流、主要页面和状态管理。
限制：本轮没有连接真实发布包、真实 ComfyUI GPU 队列、移动端设备或远程 MCP 客户端，因此并未声称完成运行时渗透测试、跨设备视觉回归或生成质量验收。

## 1. 结论摘要

项目已经具备完整产品雏形：React + Tauri + Rust + SQLite + ComfyUI + Agent + MCP。但当前代码仍处于“功能不断叠加、边界逐步补丁化”的阶段，主要风险不在单个页面，而在跨层契约没有统一：

1. 工作流同时存在 API、UI、子图三种结构，但生成、校验、分析、渲染四条链路各自维护一套转换规则，容易出现“能显示但不能生成”“能生成但校验失败”“保存后格式被改变”。
2. Tauri 命令暴露了多个任意路径读写能力；在 MCP、外部 URL 和前端可调用命令组合后，安全边界偏宽。
3. 默认值、项目值、工作流值、Agent 参数、页面临时覆盖值之间缺少统一优先级和类型约束，用户会看到参数已经改变，但实际入队仍使用旧值或另一套默认值。
4. UI 体验偏向熟悉 ComfyUI 和 AI 工具的用户，新手缺少“当前状态、下一步、失败原因、恢复动作”的连续引导。
5. 测试基础设施薄弱，`package.json` 只有构建脚本，没有单元测试、组件测试、端到端测试、Rust 测试门禁或 lint 门禁。

## 2. 严重问题清单

### P0 / 高危安全边界

#### P0-1 任意文件读写命令暴露

位置：`src-tauri/src/commands/files.rs:133`、`src-tauri/src/commands/files.rs:161`、`src-tauri/src/commands/files.rs:166`、`src-tauri/src/commands/files.rs:171`、`src-tauri/src/lib.rs:351`

`read_image_base64(path)`、`read_text_file(path)`、`write_bytes_to_file(path, data)`、`read_file_as_bytes(path)` 接收任意路径，没有限制到应用数据目录、用户明确选择的文件或允许目录。

影响：

- 任何能调用 Tauri IPC 的前端代码、注入脚本或未来暴露的 WebView 内容，都可能读取本机敏感文件。
- `write_bytes_to_file` 可以覆盖任意用户可写路径。
- Agent/MCP 一旦出现参数污染或工具误用，会把“创作工作台”升级成任意文件操作代理。

修复建议：

- 删除通用文件命令，改成 `read_user_selected_file`、`write_export_file` 等最小权限命令。
- 所有路径先 canonicalize，再校验是否位于 app data、临时目录或用户选择目录。
- 限制文件大小、扩展名、MIME 和写入目标；对写入操作增加前端确认。
- 对 MCP 写工具默认关闭，并对每个文件类工具单独授权，而不是只用一个 `write` 总开关。

#### P0-2 下载/状态检查接口存在 SSRF 风险

位置：`src-tauri/src/commands/images.rs:13`、`src-tauri/src/commands/images.rs:41`、`src-tauri/src/commands/auto_deploy.rs:92`、`src-tauri/src/commands/auto_deploy.rs:111`

多个命令接受任意 URL 并由 Rust 发起请求。`download_comfyui_image` 直接 `reqwest::get(url)`；ComfyUI 状态检查也允许传入任意地址。

影响：

- 若外部 MCP 或 Agent 能间接触发，可能访问内网服务、云 metadata 地址或本机管理端口。
- 下载接口没有统一大小上限、响应类型限制和重定向限制，可能造成内存/磁盘消耗。

修复建议：

- 默认只允许配置过的 ComfyUI origin、白名单 CDN 和 HTTPS 地址。
- 拒绝 loopback 之外的内网地址、link-local、metadata、文件协议和非 HTTP(S) scheme。
- 使用受限 HTTP client：连接超时、响应体上限、重定向次数上限、Content-Type 校验。

#### P0-3 自定义节点安装可执行不受信任代码

位置：`src-tauri/src/commands/auto_deploy.rs:70`、`src-tauri/src/commands/auto_deploy.rs:81`、`src-tauri/src/commands/auto_deploy.rs:84`

`install_custom_node` 接收任意 `node_url`，直接执行 `git clone` 或目标目录中的 `git pull`。这会把外部仓库的 Python 代码安装进 ComfyUI 执行环境。

修复建议：

- 只允许注册表 ID 或固定仓库白名单，不允许任意 URL。
- 记录仓库 commit、来源、版本和安装时间；安装前显示风险确认。
- 禁止自动 `git pull` 覆盖用户本地修改，改为显式更新并展示 diff。
- 安装后隔离依赖、记录失败日志并支持回滚。

### P1 / 生成和数据一致性

#### P1-1 工作流格式转换链路重复且容易漂移

位置：`src/services/comfyService.ts`、`src/services/comfyValidator.ts`、`src/services/workflowRenderModel.ts`、`src/utils/litegraph-setup.ts`

当前至少存在四套相关逻辑：

- `comfyService.analyzeWorkflow`：按页面参数提取字段。
- `comfyValidator.normalizeToApiFormat`：为校验生成 API 结构。
- `workflowRenderModel`：为 LiteGraph 生成渲染模型。
- `comfyService.uiWorkflowToApi`：入队前转换 UI 工作流。

这些逻辑对 widget 顺序、seed 控件、子图边界、LoRA 对象、节点 title 的理解不完全一致。未来再改一个节点 schema，很容易只修到其中一条链路。

建议建立唯一的 `WorkflowDocument` 中间模型：

- 原始 UI/API 数据只读保存。
- 一个 schema-aware adapter 层负责字段解析和写回。
- 渲染、校验、分析、注入都消费同一个中间模型。
- 每个节点 adapter 配套输入字段、widget 顺序、socket、子图边界测试。

#### P1-2 UI 子图无法直接作为 ComfyUI API prompt

位置：`src-tauri/resources/default_workflows/img2video.json`、`src/components/workflows/WorkflowGraph.tsx`、`src/services/comfyService.ts`

视频 UI 工作流的根画布包含子图实例，真正 45 个内部节点位于 `definitions.subgraphs`。UI 工作流不能简单转换成普通 API prompt；如果跳过 UUID 子图节点，根连线会指向不存在的节点。

当前安全策略是保留视频默认 API 工作流、文生图默认使用 Anima UI 工作流并在入队前转换。这个边界必须写入产品约束，否则后续用户导入视频 UI 工作流后会得到“画布显示正常、生成失败”。

建议：

- 明确标记“可渲染 UI 工作流”和“可执行 API 工作流”。
- 对含子图的工作流显示“可预览；当前不支持无损入队转换”，而不是假装校验通过。
- 长期实现带 boundary mapping 的子图 API 展开器，并为每个子图输入输出建立测试。

#### P1-3 默认工作流只在“没有默认值”时种入，老用户不会自动获得新资源

位置：`src-tauri/src/db/init.rs:53-101`

原逻辑只在某类型不存在默认工作流时插入。这样更新内置 JSON 后，已有数据库仍然使用旧工作流。当前已增加针对 `seed_*_default` 内置默认记录的刷新逻辑，但仍需避免覆盖用户主动修改过的内置记录。

建议引入 `builtin_workflow_schema_version` 或资源 hash：只在记录仍是旧内置版本时迁移，用户编辑过后停止自动覆盖。

#### P1-4 视频时长在页面和队列层语义不一致

位置：`src/pages/generate/VideoGenerate.tsx:66-85`、`src/stores/queueStore.ts:380-388`

页面把 `fps * duration` 作为 `totalFrames` 传给 `addVideoJob` 的 `duration` 参数，但 API 名称和注入逻辑有时把它当成秒数。相同字段在 UI 上显示“秒”、队列日志显示“duration=s”、工作流内部可能需要帧数，存在 off-by-fps 或过长视频风险。

建议拆成明确字段：`durationSeconds`、`frameCount`、`fps`，禁止复用 `duration`。

#### P1-5 队列失败和 Store 失败的用户反馈不可靠

位置：`src/stores/workflowStore.ts:62-117`、`src/stores/queueStore.ts:324-334`

多个 Store action 捕获异常后只写 console，不向调用方重新抛出。页面可能在数据库操作失败后仍继续显示成功 toast，或继续执行后续流程。

建议所有写操作返回 `Result` 风格结果或抛出错误；页面统一显示失败原因、保留用户输入、提供重试按钮。

#### P1-6 生成任务 resolver 和超时生命周期复杂

位置：`src/stores/queueStore.ts:223-319`、`src/stores/queueStore.ts:347-423`

批量图片任务为每个 job 设置 resolver，同时再套一层 timeout Promise；断线、HMR、组件卸载、用户取消之间存在多个清理路径。视频任务没有与图片任务一致的超时保护。

建议抽象 `JobController`：统一 `enqueue / progress / complete / fail / cancel / timeout / cleanup`，所有 resolver 在 finally 中清理。

### P1 / 前端体验和交互

#### P1-7 全屏预览依赖画布内部状态，曾导致按钮无效和空白

位置：`src/components/workflows/WorkflowGraph.tsx:172-200`、`src/components/workflows/WorkflowGraph.tsx:228-244`

LiteGraph 版本没有 `canvas.ds.zoomFit()`，调用异常会中断全屏后的视图适配。当前已改成显式固定定位和节点边界 fit；仍建议补浏览器回归测试，覆盖进入/退出全屏 5 次、ESC、窗口 resize、子图返回。

#### P1-8 工作流编辑页高度和滚动层级过多

位置：`src/pages/workflows/WorkflowEdit.tsx:416-433`、`src/pages/workflows/WorkflowEdit.tsx:465`

画布、校验报告、配置表单和 JSON 编辑器嵌套在多个 `flex`、`overflow-y-auto`、固定高度容器中。不同窗口高度、缩放比例和移动端布局容易出现“页面滚动失效、弹窗被裁切、报告看不到底部”的问题。

当前报告已增加独立最大高度滚动，但建议以后只保留一个页面主滚动容器，画布和报告分别使用明确的 `min-height: 0`。

#### P1-9 新手缺少明确的工作流状态模型

当前页面把导入、解析、校验、节点缺失、模型缺失、可渲染、可执行混在同一套按钮和 toast 中。用户不容易理解：

- API JSON 和 UI JSON 的区别。
- 为什么画布能显示但生成不能执行。
- 为什么验证需要连接 ComfyUI。
- 哪个模型应该放到哪个目录。
- 自定义节点缺失时应该安装什么。

建议页面顶部显示明确状态条：`已导入 → 可解析 → 节点完整 → 模型完整 → 可执行`，每个失败状态提供单一下一步按钮。

#### P1-10 “拖拽图片至此”没有对应拖放事件

位置：`src/pages/generate/VideoGenerate.tsx:132-143`

界面文案宣称支持拖拽，但代码只有 click 触发文件选择，没有 `dragover / drop / dragenter / dragleave`。这是典型的文案与交互不一致。

建议实现真实拖放，或把文案改成“点击上传图片”。

#### P1-11 对象 URL 没有释放

位置：`src/pages/generate/VideoGenerate.tsx:49-54`

每次选择图片都创建 `URL.createObjectURL(file)`，更换图片或卸载时没有 `URL.revokeObjectURL`，长时间使用会积累内存。

#### P1-12 视频工作流选择默认值不是 `isDefault`

位置：`src/pages/generate/VideoGenerate.tsx:25-27`、`src/pages/generate/VideoGenerate.tsx:40-45`

初始化使用 `videoWorkflows[0]`，而不是按 `isDefault` 选择；数据库默认工作流可能不是列表第一条。图片页和 Agent 使用了另一套 default 逻辑，用户在不同入口可能生成不同工作流。

#### P1-13 页面临时覆盖值、项目持久化值和工作流默认值相互覆盖

位置：`src/pages/generate/Generate.tsx:156-235`、`src/pages/generate/Generate.tsx:315-343`

工作流切换、项目加载和 Store 更新都会触发多个 effect，可能重置用户刚编辑的参数。生成前又自动保存所有覆盖值，用户很难区分“本次生成参数”和“项目默认参数”。

建议明确三层优先级：工作流默认 < 项目保存值 < 本次生成临时值，并只在用户点击“保存为项目默认”时写回数据库。

#### P1-14 `useEffect` 依赖和异步竞态较多

代表位置：`src/pages/workflows/WorkflowEdit.tsx:81-102`、`src/pages/generate/Generate.tsx:156-235`、`src/components/workflows/WorkflowGraph.tsx:93-170`

多个 effect 同时读取 Store、修改本地状态、触发解析或请求。切换项目/工作流较快时，旧请求可能覆盖新选择。建议加入 request token、AbortController 或版本号检查。

### P2 / 代码质量和维护性

#### P2-1 TypeScript 中 `any` 使用面过宽

工作流、Agent、Tauri 返回值和 ComfyUI JSON 大量使用 `any`。这直接掩盖字段命名错误，例如 `sampler`/`samplerName`、`duration`/`frameCount`、`jsonContent`/`json_content`。

建议为以下边界建立类型：`ApiWorkflow`、`UiWorkflow`、`WorkflowInputValue`、`PromptProject`、`QueueJobEvent`、`TauriWorkflow`，在 IPC 边界使用运行时 schema 校验。

#### P2-2 重复兼容层和旧逻辑没有集中淘汰

`comfyService`、校验器、渲染器各自保留 UI/API 兼容代码；`src/assets/default_workflow.json`、Rust resources、skills data 还存在多个默认工作流副本。副本更新顺序没有自动检查，容易再次出现默认值不一致。

建议只保留一个 canonical workflow source，其他资源在构建时生成或带 hash 校验。

#### P2-3 调试输出过多且可能泄露路径、URL 和任务信息

代表位置：`src/stores/queueStore.ts:217-322`、`src/services/comfyService.ts:342-374`、`src/components/workflows/WorkflowGraph.tsx:106-149`

生产环境仍输出 ComfyUI URL、工作流大小、任务 ID、节点信息和完整错误。当前工作流诊断日志应在定位完成后移除或接入可关闭的 debug logger，并对 API key、token、用户路径做脱敏。

#### P2-4 空 catch 过多，错误被静默吞掉

代表位置：`src/pages/workflows/WorkflowEdit.tsx:696`、`src/agent/TauriAgent.ts:447`、`src/agent/components/MessageBubble.tsx:55-118`。

JSON 解析、IPC、Agent tool 参数解析失败后没有统一错误状态。用户看到的可能是空白、旧数据或无响应。

#### P2-5 依赖和构建门禁不足

`package.json` 只有 `dev/build/preview/tauri`，没有 test、lint、format、typecheck 分离任务。当前构建只能发现 TypeScript 编译错误，不能发现：

- 工作流节点数量/连线数量变化。
- 注入后 API prompt 结构错误。
- 默认工作流缺失。
- Store action 失败后状态错误。
- 全屏和滚动回归。

建议增加 Vitest、React Testing Library、Playwright/Tauri smoke test，以及 Rust `cargo test`。

#### P2-6 组件和页面职责过重

`WorkflowEdit.tsx`、`Generate.tsx`、`agentToolExecutors.ts` 同时负责表单、持久化、工作流解析、参数注入、队列提交和错误提示。单文件变更风险大，回归定位困难。

建议抽出：`useWorkflowParameters`、`useGenerationController`、`workflowInjectionService`、`useValidationReport`。

## 3. 界面与新手体验审查

### 工作流页面

- “导入 JSON”没有在按钮旁说明支持 UI workflow 还是 API prompt，README 又只宣传 API 格式。
- “校验”实际上可能是本地预检、远程 `/prompt` dry-run 或 UI 子图本地检查，状态名称没有区分。
- 自定义节点缺失时，建议没有统一的安装按钮，也没有显示来源仓库、版本和重启要求。
- 模型缺失只显示文件名，未统一显示目标目录、下载入口、磁盘空间和预计大小。
- 节点渲染失败和工作流 JSON 解析失败没有统一的错误详情折叠区。
- 校验报告长列表已补滚动，但应增加“仅显示错误”“复制诊断”“导出报告”。

### 文生图页面

- 页面参数名称与 ComfyUI 参数名称不完全一致，初学者不知道 CFG、Scheduler、VAE 的作用。
- 默认值来源不透明，用户切换工作流后参数可能重置。
- 生成按钮缺少提交前摘要：工作流、模型、尺寸、批量数、预计显存。
- 失败后没有直接跳到对应节点或显示 ComfyUI 原始错误。
- 自动保存生成参数可能让用户误以为只影响本次生成。

### 图生视频页面

- “AnimateDiff 或 SVD”文案与当前 LTX-2.3 默认工作流不一致，属于严重产品描述错误。
- FPS、秒数、帧数三种概念没有拆开解释。
- 只显示固定分辨率选项，没有说明输入图像比例会不会裁切/缩放。
- 上传图片支持文案与实际交互不一致，缺少拖放。
- 没有首帧预览、上传成功状态、ComfyUI input 文件名和失败重试说明。
- 视频完成后应显示播放控件、下载、保存到历史和打开输出目录，而不是复用图片结果语义。

### Agent 与 MCP

- Agent 工具描述很长但普通用户看不到当前工具执行阶段和权限范围。
- 生成、删除、安装节点、更新设置等写操作的确认等级不统一。
- MCP token、端口、写工具开关虽然存在，但新手不理解“仅本机监听”和“外部客户端可访问”的区别。
- Agent 从聊天消息中寻找最近图片的策略隐式且不可见，视频失败时用户不知道选中了哪张图。

### 通用可用性

- 需要系统化检查按钮无文字图标的 `aria-label`、表单 label 关联、键盘焦点、Escape 关闭和对比度。
- 多处固定高度和 `overflow-hidden` 会让小屏用户看不到内容；应以移动端 360px 宽、低高度桌面窗口作为最低验收尺寸。
- Toast 适合短消息，不适合承载 JSON 错误、下载说明或多步恢复动作。
- 许多错误只写控制台，普通用户没有任何可见反馈。

## 4. 建议实施顺序

1. 先修 P0 文件权限、URL 白名单、MCP 写操作边界。
2. 统一工作流中间模型，删除重复 UI/API 映射，补 UI、API、子图三类 fixture。
3. 固化默认工作流版本和迁移规则，确保新安装与升级安装行为一致。
4. 抽象统一生成队列控制器，明确图片/视频的参数单位和状态生命周期。
5. 建立工作流页面状态条、错误诊断、模型/节点安装引导。
6. 增加测试门禁：类型检查、注入快照、校验快照、Tauri 命令安全测试、全屏/滚动 E2E。
7. 最后移除诊断日志、空 catch 和已被新模型替代的旧兼容逻辑。

## 5. 本轮已处理项

- 修复工作流画布全屏布局：显式使用 `fixed / 100vw / 100vh`，并阻止按钮事件被画布拦截。
- 文生图默认资源替换为指定 Anima UI 工作流。
- 视频默认资源保留可执行的 API 工作流，避免把带子图的 UI 文件直接提交到 `/prompt`。
- 现有内置默认记录在仍是内置默认时会刷新资源；用户改过或选择了其他默认时不覆盖。
- UI 工作流入队前转换为 API prompt；含子图的 UI 工作流仍明确限制为预览/本地校验范围。

## 6. 验收建议

- 新安装数据库：确认 `text2img` 默认是 Anima，`img2video` 默认是 LTX API 工作流。
- 已有数据库：确认旧的 `seed_*_default` 记录只刷新一次且不覆盖用户自定义默认。
- 文生图：导入 UI Anima，校验、保存、重新打开、生成各执行一次。
- 图生视频：上传首帧，确认 FPS/秒数/帧数单位，检查注入后的 API prompt，再执行一次真实生成。
- 画布：进入/退出全屏 5 次、ESC 退出、窗口 resize、子图进入/返回。
- 安全：尝试通过前端和 MCP 传入任意文件路径、内网 URL、任意 git URL，确认全部被拒绝或需要明确授权。
