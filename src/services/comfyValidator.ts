/**
 * 工作流校验引擎 (Workflow Validator)
 *
 * 核心思路：不自己重新发明校验逻辑——调用 ComfyUI 自带的 validate_prompt。
 * ComfyUI 的 POST /prompt 会先校验图结构（节点是否存在、模型是否在列表里、
 * 是否有 OUTPUT_NODE、输入值是否合法），校验通过才入队。
 *
 * 试运行校验：
 *   1. POST /prompt 提交工作流（用唯一 client_id）
 *   2. 如果 200 → 立即 DELETE /queue 取消（防止真的执行），返回 valid
 *   3. 如果 400 → 解析 ComfyUI 返回的 error + node_errors，翻译成人类可读报告
 *   4. 如果连接失败 → 返回 offline
 */

import { getComfyUrl, comfyService } from "./comfyService";
import { matchCapabilities, getCapabilities, type CapabilityMatch } from "./workflowCapabilities";

// ── 类型定义 ──────────────────────────────────────────

export type NodeValidationStatus =
  | "valid"        // ✅ 节点存在、值有效、已被能力契约匹配
  | "missing_node" // ❌ class_type 在 ComfyUI 里不存在（自定义节点没装）
  | "invalid_value" // ⚠️ 节点存在但模型名/参数不在系统里
  | "no_output"    // ❌ 整个工作流没有输出节点
  | "unused";      // ⬜ 节点正常但不接受任何注入参数

export interface NodeIssue {
  nodeId: string;
  nodeTitle: string;
  classType: string;
  status: NodeValidationStatus;
  message: string;
  suggestion: string;
  /** 如果是 invalid_value 且找到了近似模型名，这里存建议值 */
  suggestedValue?: string;
  /** 出问题的输入字段名 */
  inputKey?: string;
}

export interface ValidationReport {
  status: "valid" | "invalid" | "offline";
  /** ComfyUI 原始返回 */
  rawError?: string;
  /** 每个节点的校验状态（供 UI 着色用） */
  nodeStatuses: Record<string, NodeValidationStatus>;
  /** 结构化问题列表（供报告面板展示） */
  issues: NodeIssue[];
  /** 能力契约匹配结果 */
  capabilities: CapabilityMatch[];
  /** 校验时间戳 */
  timestamp: number;
}

// ── 模型名 fuzzy match ──────────────────────────────────

/**
 * Levenshtein 距离 — 用于找最接近的模型名
 */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
    }
  }
  return dp[m][n];
}

/**
 * 从可用模型列表里找最接近的名称
 */
export function findClosestModel(input: string, available: string[]): string | null {
  if (!input || available.length === 0) return null;
  const inputLower = input.toLowerCase();

  let best = "";
  let bestDist = Infinity;

  for (const candidate of available) {
    const dist = levenshtein(inputLower, candidate.toLowerCase());
    // 归一化到 0-1（距离 / 较长字符串长度）
    const maxLen = Math.max(inputLower.length, candidate.length);
    const ratio = dist / maxLen;

    // 相似度 >= 70% 才建议
    if (ratio < 0.3 && dist < bestDist) {
      bestDist = dist;
      best = candidate;
    }
  }

  return best || null;
}

// ── ComfyUI 已安装节点 + 模型缓存 ────────────────────────

export type ModelCategory = "checkpoints" | "loras" | "vaes" | "clips" | "unets";
export type ModelInventory = Record<ModelCategory, string[]>;

let cachedNodeTypes: Set<string> | null = null;
let cachedModels: ModelInventory | null = null;

/**
 * 从 ComfyUI 拉取已安装的节点类型 + 模型列表。
 * 复用 comfyService.fetchObjectInfo（逐节点拉取，比全量 /object_info 快且省内存）。
 */
export async function fetchComfyuiInventory(comfyUrl?: string, force = false): Promise<void> {
  const url = comfyUrl || getComfyUrl();
  if (!force && cachedNodeTypes && cachedNodeTypes.size > 0) return; // 已缓存
  try {
    // 先拉取全量节点类型名（只需 keys，不需要完整 schema）
    // 用 AbortController 而非 AbortSignal.timeout（兼容性更好）
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);

    const resp = await fetch(`${url}/object_info`, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();

    cachedNodeTypes = new Set(Object.keys(data));

    // 从 loader 节点提取模型列表
    const extractModels = (nodeType: string, inputKey: string): string[] => {
      const node = data[nodeType];
      if (!node?.input) return [];
      const required = node.input.required || {};
      const optional = node.input.optional || {};
      const inputDef = required[inputKey] || optional[inputKey];
      if (Array.isArray(inputDef) && Array.isArray(inputDef[0])) {
        return inputDef[0] as string[];
      }
      return [];
    };

    cachedModels = {
      checkpoints: [
        ...extractModels("CheckpointLoaderSimple", "ckpt_name"),
        ...extractModels("CheckpointLoader", "ckpt_name"),
      ],
      unets: extractModels("UNETLoader", "unet_name"),
      loras: extractModels("LoraLoader", "lora_name"),
      vaes: extractModels("VAELoader", "vae_name"),
      clips: [
        ...extractModels("CLIPLoader", "clip_name"),
        ...extractModels("LTXAVTextEncoderLoader", "text_encoder"),
      ],
    };

    // 去重
    for (const k of Object.keys(cachedModels)) {
      cachedModels[k as ModelCategory] = [
        ...new Set(cachedModels[k as ModelCategory]),
      ];
    }
  } catch (e) {
    console.error("[Validator] Failed to fetch ComfyUI inventory:", e);
    // Fallback: 尝试用 comfyService 已有的逐节点拉取
    try {
      const partial = await comfyService.getObjectInfo();
      if (partial && Object.keys(partial).length > 0) {
        cachedNodeTypes = new Set(Object.keys(partial));
        const extractModels = (nodeType: string, inputKey: string): string[] => {
          const node = partial[nodeType];
          if (!node?.input) return [];
          const required = node.input.required || {};
          const optional = node.input.optional || {};
          const inputDef = required[inputKey] || optional[inputKey];
          if (Array.isArray(inputDef) && Array.isArray(inputDef[0])) {
            return inputDef[0] as string[];
          }
          return [];
        };
        cachedModels = {
          checkpoints: [
            ...extractModels("CheckpointLoaderSimple", "ckpt_name"),
          ],
          unets: extractModels("UNETLoader", "unet_name"),
          loras: extractModels("LoraLoader", "lora_name"),
          vaes: [],
          clips: [],
        };
      }
    } catch (e2) {
      console.error("[Validator] Fallback fetch also failed:", e2);
    }
  }
}

/**
 * 检查一个 class_type 是否在 ComfyUI 中已安装
 */
export function isNodeInstalled(classType: string): boolean {
  if (!cachedNodeTypes) return true; // 没拉到清单时不报缺失，交给 ComfyUI 校验
  return cachedNodeTypes.has(classType);
}

/**
 * 检查一个模型名是否在系统中存在
 */
export function isModelAvailable(modelName: string, category?: ModelCategory): boolean {
  if (!cachedModels) return true; // 没拉到清单时不报
  if (!category) {
    // 检查所有类别
    return Object.values(cachedModels).some((list) => list.includes(modelName));
  }
  return (cachedModels[category] || []).includes(modelName);
}

/**
 * 获取建议的模型名
 */
export function suggestModel(modelName: string): { value: string; category: string } | null {
  if (!cachedModels) return null;
  for (const [cat, list] of Object.entries(cachedModels)) {
    const match = findClosestModel(modelName, list);
    if (match) return { value: match, category: cat };
  }
  return null;
}

// ── ComfyUI 自定义节点名映射 ──────────────────────────────

/**
 * 常见 class_type → ComfyUI Manager 包名映射（供修复建议用）
 */
const NODE_TO_PACKAGE: Record<string, string> = {
  "Power Lora Loader (rgthree)": "rgthree-comfy",
  "SDXLEmptyLatentSizePicker+": "ComfyUI-Inspire-Pack",
  "Simple String": "pysssss-custom-scripts",
  "ComfyMathExpression": "ComfyUI-Math",
  "ConsoleDebug+": "ComfyUI-Inspire-Pack",
  "ResizeImageMaskNode": "ComfyUI-Impact-Pack",
  "ResizeImagesByLongerEdge": "ComfyUI-Impact-Pack",
  "LLM": "ComfyUI-LLM-node",
  "LLM_api_loader": "ComfyUI-LLM-node",
  "About_us": "ComfyUI-LLM-node",
};

function getPackageName(classType: string): string {
  return NODE_TO_PACKAGE[classType] || "";
}

// ── 格式归一化 ──────────────────────────────────────────

/**
 * 判断工作流是否为 API 格式
 */
function isApiFormat(workflow: any): boolean {
  if (!workflow || typeof workflow !== "object") return false;
  if (Array.isArray(workflow.nodes)) return false; // UI 格式有 nodes 数组
  for (const v of Object.values(workflow)) {
    if (typeof v === "object" && v !== null && "class_type" in v) return true;
    break;
  }
  return false;
}

/**
 * 将任意格式的工作流归一化为 API 格式（扁平 {id: {class_type, inputs, _meta}}）。
 * 校验和能力匹配都基于 API 格式工作。
 * 如果输入已经是 API 格式，直接返回。
 * 如果是 UI 格式（LiteGraph），展开 nodes 数组 + links，转换为 API 格式。
 */
export function normalizeToApiFormat(workflow: any): any {
  if (!workflow || typeof workflow !== "object") return workflow;

  // 已经是 API 格式
  if (isApiFormat(workflow)) return workflow;

  // UI 格式（LiteGraph）
  if (!Array.isArray(workflow.nodes)) return workflow; // 未知格式，原样返回

  const linksArr: any[] = workflow.links || [];
  // link_id → [linkId, srcNode, srcSlot, dstNode, dstSlot, type]
  const linkMap = new Map<number, any[]>();
  for (const l of linksArr) {
    if (Array.isArray(l) && l.length >= 5) linkMap.set(l[0], l);
  }

  // 构建 nodeId → widget 名称映射（从 links 的 widget 字段）
  // 构建 dstNode:dstSlot → srcNode 的连线映射
  const nodeInputs = new Map<string, Record<string, [string, number]>>();
  for (const l of linksArr) {
    if (!Array.isArray(l) || l.length < 5) continue;
    const [, srcNode, , dstNode, dstSlot] = l;
    const dstKey = `${dstNode}`;
    if (!nodeInputs.has(dstKey)) nodeInputs.set(dstKey, {});
    // slot index → source
    nodeInputs.get(dstKey)![`_slot_${dstSlot}`] = [String(srcNode), 0];
  }

  const result: any = {};
  for (const node of workflow.nodes) {
    const nodeId = String(node.id);
    const classType = node.type;
    // 跳过 UUID 子图节点（无法在 API 格式表示）
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(classType);
    if (isUuid) continue;

    // 从 inputs 数组中提取具名 widget 和连线引用，保持 ComfyUI 保存的 widget 顺序。
    const inputs: Record<string, any> = {};
    const rawInputs: any[] = node.inputs || [];
    const widgets = Array.isArray(node.widgets_values) ? node.widgets_values : [];
    let widgetIndex = 0;
    for (const inp of rawInputs) {
      if (inp.widget) {
        inputs[inp.name || `widget_${widgetIndex}`] = widgets[widgetIndex];
        widgetIndex += 1;
        // ComfyUI 在 seed/noise_seed 后保存一个额外的 control_after_generate widget。
        if (/seed/i.test(inp.name || "") && widgets[widgetIndex] !== undefined) {
          inputs.control_after_generate = widgets[widgetIndex];
          widgetIndex += 1;
        }
      } else if (inp.link != null && inp.link !== null) {
        const linkData = linkMap.get(inp.link);
        if (linkData) {
          inputs[inp.name || "input"] = [String(linkData[1]), linkData[2] || 0];
        }
      }
    }

    // 保留聚合 widget，供 Power Lora Loader 和版本不匹配的自定义节点使用。
    if (Array.isArray(node.widgets_values)) {
      inputs._widget_values = node.widgets_values;
      node.widgets_values.forEach((value: any, index: number) => {
        if (value && typeof value === "object") inputs[`_obj_${index}`] = value;
      });
    }

    result[nodeId] = {
      class_type: classType,
      inputs,
      _meta: { title: node.title || classType },
    };
  }

  return result;
}

// ── 校验主函数 ──────────────────────────────────────────

/**
 * 校验工作流：试运行提交到 ComfyUI，解析结果。
 *
 * @param workflow ComfyUI 工作流对象（API 或 UI 格式均可）
 * @param workflowType 工作流类型（text2img/img2video...）
 * @param comfyUrl 可选，默认从 settings 读
 */
export async function validateWorkflow(
  workflowInput: any,
  workflowType: string,
  comfyUrl?: string,
): Promise<ValidationReport> {
  const url = comfyUrl || getComfyUrl();
  const timestamp = Date.now();

  // 归一化为 API 格式
  const workflow = normalizeToApiFormat(workflowInput);
  const hasUiSubgraphs = Array.isArray(workflowInput?.nodes) && Boolean(workflowInput.definitions?.subgraphs);

  // 先做能力匹配（不依赖网络）
  const capSet = getCapabilities(workflowType);
  const capMatches = matchCapabilities(workflow, capSet);

  // 初始化所有节点为 unused
  const nodeStatuses: Record<string, NodeValidationStatus> = {};
  for (const [nodeId, node] of Object.entries<any>(workflow)) {
    if (node?.class_type) nodeStatuses[nodeId] = "unused";
  }

  // 能力匹配到的节点标记为 valid（后续可能被问题覆盖）
  for (const cm of capMatches) {
    if (cm.matched && cm.nodeId) {
      nodeStatuses[cm.nodeId] = "valid";
    }
  }

  // 确保已拉取 ComfyUI 清单
  if (!cachedNodeTypes) {
    await fetchComfyuiInventory(url);
  }

  // 本地预检：缺失节点 + 无效模型名
  const issues: NodeIssue[] = [];
  for (const [nodeId, node] of Object.entries<any>(workflow)) {
    if (!node?.class_type) continue;
    const classType = node.class_type;
    const title = node._meta?.title || classType;
    const inputs = node.inputs || {};

    // 检查节点是否安装
    if (!isNodeInstalled(classType)) {
      nodeStatuses[nodeId] = "missing_node";
      const pkg = getPackageName(classType);
      issues.push({
        nodeId,
        nodeTitle: title,
        classType,
        status: "missing_node",
        message: `自定义节点未安装：${classType}`,
        suggestion: pkg
          ? `请在 ComfyUI Manager 安装「${pkg}」`
          : `请安装提供 ${classType} 的自定义节点`,
      });
      continue;
    }

    // 检查模型名是否有效
    // API 格式：inputs.ckpt_name / inputs.unet_name 等具名字段
    // UI 格式：inputs._w0 / inputs._w1 等（widget 索引）→ 需要启发式扫描
    const modelChecks: Array<[string, string, ModelCategory]> = [
      ["ckpt_name", "模型文件", "checkpoints"],
      ["unet_name", "模型文件", "unets"],
      ["lora_name", "LoRA 文件", "loras"],
      ["vae_name", "VAE 文件", "vaes"],
      ["clip_name", "CLIP 文件", "clips"],
      ["text_encoder", "文本编码器", "clips"],
      ["model_name", "模型文件", "unets"],
    ];

    for (const [inputKey, label, cat] of modelChecks) {
      const val = inputs[inputKey];
      if (typeof val === "string" && val && !isModelAvailable(val, cat)) {
        nodeStatuses[nodeId] = "invalid_value";
        const suggestion = suggestModel(val);
        issues.push({
          nodeId,
          nodeTitle: title,
          classType,
          status: "invalid_value",
          inputKey,
          message: `${label}不存在：${val}`,
          suggestion: suggestion
            ? `最接近的可用文件：${suggestion.value}`
            : `请确认文件是否在 models/ 目录下`,
          suggestedValue: suggestion?.value,
        });
      }
    }

    // UI 格式启发式：扫描 _w* widget 值，看是否像模型文件名
    // （.safetensors / .ckpt / .pt 后缀的值，且不在系统里）
    if (!cachedModels) continue; // 没拉到清单就跳过
    for (const [key, val] of Object.entries(inputs)) {
      if (!key.startsWith("_w")) continue;
      if (typeof val !== "string" || !val) continue;
      // 只检查看起来像模型文件的值
      if (!/\.(safetensors|ckpt|pt|pth|gguf|bin)$/i.test(val)) continue;
      // 检查所有类别
      const allModels = [
        ...cachedModels.checkpoints,
        ...cachedModels.unets,
        ...cachedModels.loras,
        ...cachedModels.vaes,
        ...cachedModels.clips,
      ];
      if (!allModels.includes(val)) {
        // 避免重复报（如果具名字段已经报过了）
        if (issues.some((i) => i.nodeId === nodeId && i.message.includes(val))) continue;
        nodeStatuses[nodeId] = "invalid_value";
        const suggestion = suggestModel(val);
        issues.push({
          nodeId,
          nodeTitle: title,
          classType,
          status: "invalid_value",
          inputKey: key,
          message: `模型文件不存在：${val}`,
          suggestion: suggestion
            ? `最接近的可用文件：${suggestion.value}`
            : `请确认文件是否在 models/ 目录下`,
          suggestedValue: suggestion?.value,
        });
      }
    }
  }

  // 如果本地预检没问题，做 ComfyUI 试运行校验
  // UI 子图不能无损转换成 API prompt；只做本地节点/模型/能力检查，避免把边界节点误报为无效。
  if (hasUiSubgraphs) {
    return {
      status: issues.length > 0 ? "invalid" : "valid",
      rawError: "UI 子图工作流已完成本地结构校验",
      nodeStatuses,
      issues,
      capabilities: capMatches,
      timestamp,
    };
  }

  if (issues.filter((i) => i.status === "missing_node").length === 0) {
    try {
      const clientId = `dryrun_${timestamp}`;
      const valController = new AbortController();
      const valTimeoutId = setTimeout(() => valController.abort(), 15000);
      const resp = await fetch(`${url}/prompt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: workflow, client_id: clientId }),
        signal: valController.signal,
      });
      clearTimeout(valTimeoutId);

      if (resp.ok) {
        const result = await resp.json();
        const promptId = result.prompt_id;

        // 校验通过但已入队——立即取消
        if (promptId) {
          try {
            await fetch(`${url}/queue`, {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ delete: [promptId] }),
            });
            // 如果已经开始执行，interrupt
            await fetch(`${url}/interrupt`, { method: "POST" }).catch(() => {});
          } catch {
            // 取消失败不影响校验结果（最多浪费一次生成）
          }
        }

        // 检查 ComfyUI 返回的 node_errors（可能校验通过但有警告）
        const nodeErrors = result.node_errors || {};
        const hasErrors = Object.keys(nodeErrors).length > 0;

        return {
          status: hasErrors ? "invalid" : "valid",
          nodeStatuses,
          issues: hasErrors
            ? [...issues, ...parseNodeErrors(nodeErrors, workflow)]
            : issues,
          capabilities: capMatches,
          timestamp,
        };
      } else {
        // 400 — 解析 ComfyUI 的校验错误
        const errBody = await resp.json().catch(() => null);
        if (errBody) {
          const parsed = parseComfyuiError(errBody, workflow);
          // 合并 nodeStatuses
          for (const issue of parsed) {
            if (issue.nodeId) {
              nodeStatuses[issue.nodeId] = issue.status;
            }
          }
          return {
            status: "invalid",
            rawError: JSON.stringify(errBody).slice(0, 500),
            nodeStatuses,
            issues: [...issues, ...parsed],
            capabilities: capMatches,
            timestamp,
          };
        }
        return {
          status: "invalid",
          rawError: `HTTP ${resp.status}`,
          nodeStatuses,
          issues,
          capabilities: capMatches,
          timestamp,
        };
      }
    } catch (e: any) {
      // 网络错误 → offline（但本地预检结果仍返回）
      return {
        status: "offline",
        rawError: e?.message || String(e),
        nodeStatuses,
        issues,
        capabilities: capMatches,
        timestamp,
      };
    }
  }

  // 本地预检发现问题，直接返回（不提交到 ComfyUI）
  return {
    status: issues.length > 0 ? "invalid" : "valid",
    nodeStatuses,
    issues,
    capabilities: capMatches,
    timestamp,
  };
}

/**
 * 解析 ComfyUI 的 node_errors 结构
 */
function parseNodeErrors(nodeErrors: any, workflow: any): NodeIssue[] {
  const issues: NodeIssue[] = [];
  for (const [nodeId, errData] of Object.entries<any>(nodeErrors)) {
    const node = workflow[nodeId];
    const classType = errData.class_type || node?.class_type || "?";
    const title = node?._meta?.title || classType;
    const errors = errData.errors || [];

    for (const err of errors) {
      const errType = err.type || "";
      const message = err.message || "";
      const details = err.details || "";

      let status: NodeValidationStatus = "invalid_value";
      let suggestion = "";

      if (errType === "value_not_in_list") {
        status = "invalid_value";
        suggestion = `请确认该值在系统可用列表中`;
        // 尝试 fuzzy match
        const suggestionResult = suggestModel(details.split(":")[1]?.trim() || details);
        if (suggestionResult) {
          suggestion = `最接近的可用值：${suggestionResult}`;
        }
      } else if (errType.includes("required")) {
        status = "invalid_value";
        suggestion = `缺少必需输入：${details}`;
      }

      issues.push({
        nodeId,
        nodeTitle: title,
        classType,
        status,
        message: `${message}${details ? ": " + details : ""}`,
        suggestion,
      });
    }
  }
  return issues;
}

/**
 * 解析 ComfyUI 的顶层 error 结构
 */
function parseComfyuiError(errBody: any, workflow: any): NodeIssue[] {
  const issues: NodeIssue[] = [];
  const error = errBody.error || {};

  switch (error.type) {
    case "missing_node_type": {
      const nodeId = error.extra_info?.node_id || "";
      const classType = error.extra_info?.class_type || "";
      const title = error.extra_info?.node_title || classType;
      const pkg = getPackageName(classType);
      issues.push({
        nodeId,
        nodeTitle: title,
        classType,
        status: "missing_node",
        message: `节点未安装：${title}`,
        suggestion: pkg
          ? `请在 ComfyUI Manager 安装「${pkg}」`
          : `请安装提供 ${classType} 的自定义节点`,
      });
      break;
    }
    case "prompt_no_outputs": {
      issues.push({
        nodeId: "",
        nodeTitle: "工作流",
        classType: "",
        status: "no_output",
        message: "工作流没有输出节点",
        suggestion: "请添加 SaveImage（文生图）或 SaveVideo（视频）作为终端节点",
      });
      break;
    }
    case "prompt_outputs_failed_validation": {
      // 详细错误在 node_errors 里
      const nodeErrors = errBody.node_errors || {};
      issues.push(...parseNodeErrors(nodeErrors, workflow));
      break;
    }
    default: {
      issues.push({
        nodeId: "",
        nodeTitle: "工作流",
        classType: "",
        status: "invalid_value",
        message: error.message || "未知错误",
        suggestion: error.details || "",
      });
    }
  }

  return issues;
}
