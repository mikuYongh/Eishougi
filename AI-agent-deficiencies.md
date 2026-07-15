# AI Agent 缺陷/漏洞/改进清单

> 生成于 2026-07-15。基于对 `src/agent/TauriAgent.ts`、`src/agent/hooks/useTauriAgent.ts`、`src/pages/Settings.tsx`、`settingsStore.ts`、`auto_deploy.rs`、`files.rs`、`mod.rs` 的全面审查。

---

## 🔴 P0 严重问题（影响功能/安全/成本）

### 1. 中止生成无法真正取消后端 HTTP 流（token 照烧）
- **位置**：`TauriAgent.ts:183-186` + `auto_deploy.rs:425-439`
- **现象**：用户点"停止"后，前端只设 `aborted=true`，但 Rust 端的 `bytes_stream` 循环没有任何取消机制，后端继续读取完整响应直到结束。`on_chunk.send` 失败被 `let _ =` 忽略。
- **后果**：用户以为停了，token 仍在持续消耗。长响应可能多烧数万 token。
- **修复方向**：Rust 端用 CancellationToken，或检测 channel.send 错误后 break。

### 2. `_imageCache` 无界增长 → Android OOM
- **位置**：`TauriAgent.ts:139`
- **现象**：`Map<string, string>` 永不清理、无大小上限。每张图 ≈ 6.7 MB（5MB×1.33 base64）。聊 50 张图 = 300 MB+ 常驻内存。
- **后果**：手机端极易 OOM 崩溃。
- **修复方向**：改 LRU（限条数/字节数），会话切换时清空。

### 3. `read_image_base64` 路径穿越 + 无大小限制
- **位置**：`files.rs:134-152`
- **现象**：`fs::read(&path)` 同步读取全文件，无大小上限、无路径白名单。LLM 可控的 images 路径若被注入 `../../../etc/passwd`，会被 base64 编码后回传。
- **修复方向**：路径白名单 + 文件大小上限。

### 4. Anthropic 供应商根本无法工作（假选项）
- **位置**：`Settings.tsx:727` + `auto_deploy.rs:370` + `mod.rs:28`
- **现象**：UI 提供 anthropic 选项，但后端统一用 `Authorization: Bearer`（Anthropic 要 `x-api-key`）、OpenAI 的 `messages` 结构（Anthropic 要顶层 `system`）、且 `enable_thinking` 字段 Anthropic 不认。
- **后果**：选 Anthropic 后 100% 报错。
- **修复方向**：移除该选项（不完整实现不如不提供）。

### 5. API Key 明文存 localStorage + 打包进备份文件
- **位置**：`settingsStore.ts:113` + `Settings.tsx:184`
- **现象**：apiKey 明文进 localStorage，F12 即可读取。导出备份（`.eishougi` 文件）也包含明文 key，用户分享求助时直接泄漏。
- **修复方向**：用 Tauri 安全存储（OS keychain），导出时默认脱敏。

### 6. llmService 从 VITE_* 读 key（与安全策略矛盾）
- **位置**：`llmService.ts:5`
- **现象**：`import.meta.env.VITE_AGNES_API_KEY` 若构建时设置，会被内联进前端 bundle/APK。`settingsStore.ts:77-81` 的注释明确警告过这种做法，但这里违反了。

### 7. 无并发锁 → 消息错乱
- **位置**：`useTauriAgent.ts:247`（sendMessage）
- **现象**：sendMessage 没检查 `isGenerating`。快速连点发送、或 approvePreview/confirmCharacters/confirmModel 同时触发，会并发跑多个 runAgent，共享同一 agentRef 单例，消息互相覆盖。
- **修复方向**：sendMessage 开头 `if (isGenerating) return;`。

### 8. `_auto` suggestion 覆盖 AI 具体建议（竞态）
- **位置**：`TauriAgent.ts:599-614` + `useTauriAgent.ts:401-403`
- **现象**：generate_image 后**总是**发 `_auto:true` 事件，前端 `_auto` 分支直接**覆盖**（而非合并）当前 suggestions。如果 AI 同轮先调了 show_suggestions 给了具体建议，紧接着 generate_image 完成触发 _auto，AI 的建议被清空。
- **修复方向**：固定维度应合并而非覆盖。

### 9. ComfyUI 状态检测 URL 硬编码 127.0.0.1
- **位置**：多处（check_comfyui_status 等工具执行器 + Rust 后端）
- **现象**：所有 ComfyUI 状态检测/连接都硬编码 `127.0.0.1`，无法连远程/局域网 ComfyUI。
- **修复方向**：从 settings 读取 ComfyUI host。

---

## 🟠 P1 重要问题（影响体验/稳定性）

### 10. 系统提示词引用不存在的工具
- **位置**：`agentStore.ts:121-123`
- **现象**：提示词提到 `get_custom_styles / add_custom_style / update_custom_style / delete_custom_style`，但工具定义和执行器都没有。LLM 会尝试调用永远失败的函数。

### 11. 工具列表数量错误：说"3 个"实为 4 个
- **位置**：`useTauriAgent.ts:179`
- **现象**：`"你有 3 个专门的交互工具"`，但实际定义了 4 个（新增的 select_model 没计入）。

### 12. TOOL_CALL_END 在执行前发射（事件顺序错乱）
- **位置**：`TauriAgent.ts:461-463`
- **现象**：所有 toolCalls 批量发 END 在执行循环之前。事件序列变成 `START → END → RESULT`，UI 可能看到"已结束但还没结果"。

### 13. 工具返回的 images 被完全丢弃
- **位置**：`TauriAgent.ts:588, 617-623`
- **现象**：`images = result.images` 赋值后从未使用，TOOL_CALL_RESULT 只发 content。工具产出的图片路径本应作为 attachment 发给前端，目前丢失。

### 14. tool_calls 流式拼接依赖顺序而非 index
- **位置**：`TauriAgent.ts:372-387`
- **现象**：用 `toolCallState`（上一次的工具）承接增量，而非按 OpenAI 协议的 `tc.index` 索引。模型一次输出多个 tool_call 且 arguments 交错时，会错位。

### 15. 工具参数普遍缺 description
- **位置**：`useTauriAgent.ts:24-67`
- **现象**：绝大多数参数只有 type 没有 description。LLM 靠猜参数含义，调用易出错。

### 16. reasoningEffort 滑块完全无效（死代码）
- **位置**：`agentStore.ts:19` + `AgentPanel.tsx:47`
- **现象**：UI 有滑块，默认值 `'medium'`，但 `TauriAgent` 构造 payload 时从未使用 reasoningEffort。调了没效果。

### 17. temperature/maxTokens 无运行时校验
- **位置**：`Settings.tsx:840, 860`
- **现象**：`Number(e.target.value)` 无 clamp、无 isNaN 防御。粘贴/导入 `-5`、`999`、`NaN` 会原样发给 API。

### 18. 切换供应商不清理 apiKey
- **位置**：`Settings.tsx:715-734`
- **现象**：切到 Ollama（本地无需 key）后旧的 `sk-...` 仍以 `Authorization: Bearer` 发给本地服务。

### 19. 会话切换不重置 agent 内部状态
- **位置**：`useTauriAgent.ts:519`
- **现象**：切换会话时 `_imageCache`、`modelModal`、`refineDimRef`、`agentRef` 都不重置。旧会话状态串扰新会话。

---

## 🟡 P2 改进项（影响质量/精度）

### 20. 缺少 top_p / frequency_penalty / presence_penalty / seed
- **位置**：`settingsStore.ts:15-24`
- **现象**：完全没有这些常用参数。生成 tag 列表时无法用 penalty 控制重复；无法用 seed 复现结果。

### 21. token 估算对中文严重偏低
- **位置**：`TauriAgent.ts:433-436`
- **现象**：`chars / 2.5` 适合英文，中文 1 字符 ≈ 1-2 token，实际低估 2-3 倍。token 面板显示不准。

### 22. 模型列表不持久化、切页即丢
- **位置**：`Settings.tsx:52`
- **现象**：fetchedModels 是组件本地 state，离开设置页再回来列表为空，需重新点"获取"。

### 23. maxTokens/temperature 默认值四处不一致
- **现象**：maxTokens 在 store=8192、UI=4096、后端=8192、useAgent=4096。同一字段两种兜底值。

### 24. fetch_llm_models 超时固定 15s，Ollama 易误报失败
- **位置**：`mod.rs:24`
- **现象**：Ollama 加载大模型时 `/api/tags` 可能超 15s。

### 25. 脆弱字符串匹配判断成功
- **位置**：`TauriAgent.ts:599`
- **现象**：`!resultStr.includes('"status":"pending"')` 子串匹配，应改为结构化 `JSON.parse(resultStr).status`。

### 26. 缺少 TEXT_MESSAGE_END 事件
- **位置**：`TauriAgent.ts:415`（全文）
- **现象**：只有 CHUNK 没有 END，UI 光标可能不停止。

### 27. 工具串行执行、无单工具超时
- **位置**：`TauriAgent.ts:470`
- **现象**：一个 generate_image（10-60s）会阻塞同轮其他工具。

### 28. confirm_generation 与 generate_image 参数名不统一
- **现象**：`model`/`sampler`/`loras` vs `base_model`/`sampler_name`/`lora_configs`，LLM 容易传错。

---

## 🟢 P3 细节优化

### 29. 大量裸 `catch {}` 吞异常
- **位置**：`TauriAgent.ts` 多处（89, 97, 122, 389, 510, 521）
- **现象**：完全丢弃错误对象，排查困难。建议至少 `console.warn`。

### 30. `enable_thinking` 对所有供应商硬编码
- **位置**：`TauriAgent.ts:307, 311`
- **现象**：OpenAI/Anthropic 不认此字段，某些严格代理会 400。建议按 provider 决定。

### 31. provider 预设分散三处
- **现象**：`settingsStore.ts:16` 类型 + `Settings.tsx:735-740` 下拉 + `Settings.tsx:717-730` 切换逻辑，新增供应商需改三处。建议抽 `PROVIDER_PRESETS` 常量。

### 32. 导入备份后内存 store 与 localStorage 不一致
- **位置**：`Settings.tsx:236-247`
- **现象**：导入后要求"请重启应用"，但用户不重启的话 UI 显示旧值会覆盖新导入数据。

### 33. `[DONE]` 大小写敏感
- **位置**：`TauriAgent.ts:351`
- **现象**：某些 provider 返回 `[done]` 小写，被当普通 chunk 然后 JSON.parse 失败。

### 34. messageId 用 `Date.now()+random`
- **位置**：`TauriAgent.ts:330, 333`
- **现象**：高频场景理论碰撞，建议 `crypto.randomUUID()`。

### 35. 文件读取截断 20000 字符硬编码
- **位置**：`useTauriAgent.ts:268`
- **现象**：大文件截断后 LLM 拿残缺内容。**不应完全去掉**（会撑爆上下文），改为可配置阈值，默认提高到合理值。

---

## 修复状态跟踪

| # | 问题 | 优先级 | 状态 |
|---|------|--------|------|
| 1 | 中止无法取消后端流 | P0 | ✅ cancel_llm_run + run_id |
| 2 | _imageCache 无界增长 | P0 | ✅ LRU 8张限制 |
| 3 | read_image_base64 大小限制 | P0 | ✅ 20MB 上限 |
| 4 | Anthropic 假供应商 | P0 | ✅ 移除选项 |
| 5 | API Key 明文 | P0 | ⏭️ 暂缓（需 OS keychain） |
| 6 | llmService VITE key | P0 | ✅ 移除 VITE_AGNES_API_KEY |
| 7 | 无并发锁 | P0 | ✅ sendMessage 加 isGenerating 检查 |
| 8 | _auto suggestion 覆盖 | P0 | ✅ 改为合并 |
| 9 | ComfyUI URL 硬编码 | P0 | ✅ agentToolExecutors 读 settings + StatusBar 动态 |
| 10 | 提示词引用不存在的工具 | P1 | ✅ 移除 custom_styles |
| 11 | 工具数量 3→4 | P1 | ✅ 改为 4 |
| 12 | TOOL_CALL_END 顺序 | P1 | ✅ 移到执行后 |
| 13 | 工具 images 丢弃 | P1 | ✅ tool_images CUSTOM 事件 |
| 14 | tool_calls 按 index | P1 | ✅ 按 tc.index 索引 |
| 15 | 工具参数 description | P1 | ✅ 全部补上 |
| 16 | reasoningEffort 死代码 | P1 | ✅ 从类型+UI+store 全部移除 |
| 17 | temperature/maxTokens 校验 | P1 | ✅ clamp + isNaN |
| 18 | 切换供应商不清理 key | P1 | ⏭️ 暂缓（保留远程 key 合理） |
| 19 | 会话切换不重置 | P1 | ✅ modelModal+refineDim+agentRef 重置 |
| 35 | 文件读取截断阈值 | P2 | ✅ 动态按 maxTokens + 扩展名扩充 |
| 20-34 | 其余 P2/P3 | 低 | ⏳ 待后续迭代 |

> 状态图例：⏳ 待修复 / 🔧 修复中 / ✅ 已修复 / ⏭️ 暂缓
