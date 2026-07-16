# Agent 审查与 Generative UI 实施方案

## 本轮已修复

- 旧 assistant tool call 的 arguments 不再被截断为非法 JSON。
- 工具调用数组在递归前过滤空槽，避免异常 provider 响应导致崩溃。
- `maxRounds=0` 仍表示开放预算，但增加 32 轮硬上限。
- Agent 消息同步绑定原始 `sessionId`，切换会话后后台结果不会写入当前会话。
- 面板关闭和会话视图切换不取消后台运行。
- 生成成功推荐要求 `status=completed` 且包含非空图片结果。
- 推荐最多保留 5 项，优先 AI 具体建议，固定建议只补 2 项并去重。
- 会话持久化 token 统计：运行次数、输入 token、输出 token、总 token 和最后运行时间。

## 仍需优先处理

### P0：运行隔离与副作用确认

1. 把 `TauriAgent` 的 `_cancelRunId`、预览等待和工具执行状态改为按 `runId` 管理。
2. 为删除项目、删除工作流、安装自定义节点、批量打标和 MCP 写操作增加统一确认协议。
3. 关闭面板继续后台运行，但在队列/通知中心提供运行归属、取消和失败恢复入口。

### P1：上下文与协议

1. 从固定消息数裁剪升级为 token budget；按完整 user/assistant/tool 事务组压缩。
2. 旧工具结果只保留结构化摘要，文件附件采用首尾摘要或分段读取。
3. 对 tool call 的 id、name、arguments 和 tool result 做协议校验。
4. MCP 字符串结果统一包装成稳定的 JSON envelope，并保留错误分类。
5. SSE 解析异常记录 run、chunk 和 provider 信息，不再静默吞掉。

### P2：用户体验与可观测性

1. 用户不在底部时不强制滚动，改为显示“有新消息”按钮。
2. 工具卡片显示运行中、成功、失败、取消和耗时。
3. 统计增加 provider、model、run、round、tool、延迟和估算/真实 token 标记。
4. 建立 Agent 状态回放和错误诊断视图。

## Generative UI 采用策略

当前项目已经拥有 AG-UI 事件流和受控 React 组件，不建议立即引入完整 CopilotKit Runtime。

### 第一阶段：受控 Generative UI

将现有 `gen_preview`、`character_picker`、`model_picker` 统一为结构化卡片协议：

```json
{
  "component": "generation_preview",
  "sessionId": "...",
  "runId": "...",
  "toolCallId": "...",
  "props": {},
  "actions": ["approve", "reject", "edit"]
}
```

Agent 只选择组件和提供数据，布局、权限、确认和结果回传仍由本地 UI 控制。这对应 CopilotKit 文档中的 Controlled Generative UI / AG-UI 模式。

### 第二阶段：A2UI/Open-JSON-UI 评估

适合用于只读的推荐卡、参数对比卡、队列状态卡和模型能力卡。必须先做 schema 白名单渲染，禁止任意 HTML、脚本和事件注入。

### 暂不接入 MCP Apps

MCP Apps 适合外部服务器提供完整 iframe 应用，例如 Excalidraw。Prompt Muse 当前的核心交互都在本地 Tauri 权限边界内，直接接入会增加 iframe、来源校验、权限和主题一致性成本。等 MCP 工具权限、审计和取消协议稳定后再评估。
