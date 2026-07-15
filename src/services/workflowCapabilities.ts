/**
 * 工作流能力契约系统 (Workflow Capability Contract)
 *
 * 核心思想：每种工作流类型（text2img/img2video...）需要一组「能力」，
 * 每个能力由特定的节点类型 + 输入字段满足。校验时对照能力清单逐一匹配，
 * 注入时按匹配结果直接定位 nodeId + inputKey，不再靠 title 字符串猜测。
 *
 * 取代旧逻辑：comfyService.injectParameters / injectVideoParameters 里
 * 靠 class_type + _meta.title 粗暴遍历匹配的方式。
 */

// ── 类型定义 ──────────────────────────────────────────

export type CapabilityCategory =
  | "text"
  | "image"
  | "model"
  | "dimension"
  | "video"
  | "output"
  | "sampler";

/** 节点匹配器 — 描述哪种节点类型能满足一个能力 */
export interface NodeMatcher {
  /** ComfyUI class_type，支持多个候选（按优先级排列） */
  classType: string | string[];
  /** 该节点上承载这个能力的输入字段名 */
  inputKey: string;
  /** 可选：title 提示词，用于区分同类节点（如 Positive vs Negative CLIPTextEncode） */
  titleHint?: string;
}

/** 能力定义 */
export interface Capability {
  id: string;
  label: string;
  required: boolean;
  category: CapabilityCategory;
  matchers: NodeMatcher[];
}

/** 能力匹配结果 — 校验/注入都用这个 */
export interface CapabilityMatch {
  capability: Capability;
  matched: boolean;
  /** 匹配到的节点 ID（API 格式的 key） */
  nodeId?: string;
  /** 匹配到的输入字段名 */
  inputKey?: string;
  /** 该节点当前的值（字面值；如果是连线则 undefined） */
  currentValue?: any;
  /** 如果 inputKey 值是连线 [srcNode, slot]，记录源节点信息 */
  linkedFrom?: string;
}

// ── 能力集 ──────────────────────────────────────────────

/**
 * 文生图能力集
 * 覆盖 Anima/Pony/SDXL 等主流 txt2img 工作流
 */
const TEXT2IMG_CAPABILITIES: Capability[] = [
  {
    id: "positive_prompt",
    label: "正向提示词",
    required: true,
    category: "text",
    matchers: [
      // pysssss 的 Simple String 是最通用的 prompt 入口
      { classType: "Simple String", inputKey: "string" },
      { classType: "SimpleString", inputKey: "string" },
      // PrimitiveStringMultiline（rgthree 等常用）
      { classType: "PrimitiveStringMultiline", inputKey: "value" },
      // 直接 CLIPTextEncode（title 含 Positive）
      { classType: "CLIPTextEncode", inputKey: "text", titleHint: "positive" },
      // StringConcatenate 的第二个输入（常见于 prompt 拼接流）
      { classType: "StringConcatenate", inputKey: "string_b" },
    ],
  },
  {
    id: "negative_prompt",
    label: "负面提示词",
    required: false,
    category: "text",
    matchers: [
      { classType: "CLIPTextEncode", inputKey: "text", titleHint: "negative" },
    ],
  },
  {
    id: "base_model",
    label: "基础模型",
    required: false,
    category: "model",
    matchers: [
      { classType: "UNETLoader", inputKey: "unet_name" },
      { classType: "CheckpointLoaderSimple", inputKey: "ckpt_name" },
      { classType: "CheckpointLoader", inputKey: "ckpt_name" },
    ],
  },
  {
    id: "vae_model",
    label: "VAE 模型",
    required: false,
    category: "model",
    matchers: [
      { classType: "VAELoader", inputKey: "vae_name" },
    ],
  },
  {
    id: "resolution",
    label: "分辨率",
    required: false,
    category: "dimension",
    matchers: [
      { classType: "SDXLEmptyLatentSizePicker+", inputKey: "resolution" },
      { classType: "EmptyLatentImage", inputKey: "width" },
      { classType: "EmptySD3LatentImage", inputKey: "width" },
      { classType: "EmptyHunyuanLatentVideo", inputKey: "width" },
    ],
  },
  {
    id: "lora",
    label: "LoRA",
    required: false,
    category: "model",
    matchers: [
      { classType: "Power Lora Loader (rgthree)", inputKey: "_slots" },
      { classType: "LoraLoader", inputKey: "lora_name" },
      { classType: "LoraLoaderModelOnly", inputKey: "lora_name" },
    ],
  },
  {
    id: "sampler",
    label: "采样器",
    required: false,
    category: "sampler",
    matchers: [
      { classType: "KSampler", inputKey: "_sampler_params" },
      { classType: "KSamplerAdvanced", inputKey: "_sampler_params" },
      { classType: "KSampler (Efficient)", inputKey: "_sampler_params" },
    ],
  },
  {
    id: "output_image",
    label: "图像输出",
    required: true,
    category: "output",
    matchers: [
      { classType: ["SaveImage", "SaveImageWebsocket", "PreviewImage"], inputKey: "_output" },
    ],
  },
];

/**
 * 图生视频能力集
 * 覆盖 LTX-Video/Wan2.2/CogVideoX 等 i2v 工作流
 */
const IMG2VIDEO_CAPABILITIES: Capability[] = [
  {
    id: "prompt_text",
    label: "视频描述",
    required: true,
    category: "text",
    matchers: [
      { classType: "Simple String", inputKey: "string" },
      { classType: "PrimitiveStringMultiline", inputKey: "value" },
      { classType: "CLIPTextEncode", inputKey: "text", titleHint: "positive" },
    ],
  },
  {
    id: "image_input",
    label: "输入图像",
    required: true,
    category: "image",
    matchers: [
      { classType: "LoadImage", inputKey: "image" },
      { classType: "LoadImageBase64", inputKey: "image" },
    ],
  },
  {
    id: "frame_rate",
    label: "帧率",
    required: false,
    category: "video",
    matchers: [
      { classType: "PrimitiveInt", inputKey: "value", titleHint: "frame rate" },
      { classType: "PrimitiveInt", inputKey: "value", titleHint: "fps" },
    ],
  },
  {
    id: "duration",
    label: "时长",
    required: false,
    category: "video",
    matchers: [
      { classType: "PrimitiveInt", inputKey: "value", titleHint: "duration" },
      { classType: "PrimitiveInt", inputKey: "value", titleHint: "length" },
      { classType: "PrimitiveInt", inputKey: "value", titleHint: "frames" },
    ],
  },
  {
    id: "base_model",
    label: "基础模型",
    required: false,
    category: "model",
    matchers: [
      { classType: "CheckpointLoaderSimple", inputKey: "ckpt_name" },
      { classType: "UNETLoader", inputKey: "unet_name" },
      { classType: "ImageOnlyCheckpointLoader", inputKey: "ckpt_name" },
    ],
  },
  {
    id: "output_video",
    label: "视频输出",
    required: true,
    category: "output",
    matchers: [
      { classType: ["SaveVideo", "SaveAnimatedWEBP", "SaveAnimatedPNG", "VHS_VideoCombine"], inputKey: "_output" },
    ],
  },
];

/**
 * 图生图能力集
 * 和 text2img 类似，但需要图片输入
 */
const IMG2IMG_CAPABILITIES: Capability[] = [
  ...TEXT2IMG_CAPABILITIES,
  {
    id: "image_input",
    label: "输入图像",
    required: true,
    category: "image",
    matchers: [
      { classType: "LoadImage", inputKey: "image" },
      { classType: "LoadImageBase64", inputKey: "image" },
    ],
  },
];

/** 按工作流类型分组的能力集 */
export const CAPABILITY_SETS: Record<string, Capability[]> = {
  text2img: TEXT2IMG_CAPABILITIES,
  img2video: IMG2VIDEO_CAPABILITIES,
  img2img: IMG2IMG_CAPABILITIES,
  // text2video: 和 img2video 相似，但图片输入非必需
  text2video: IMG2VIDEO_CAPABILITIES.filter((c) => c.id !== "image_input"),
};

// ── 匹配算法 ────────────────────────────────────────────

/**
 * 判断一个字符串是否包含某个提示词（不区分大小写）
 */
function titleMatches(title: string, hint: string): boolean {
  return title.toLowerCase().includes(hint.toLowerCase());
}

/**
 * 判断 class_type 是否匹配 matcher（支持单值和数组）
 */
function classTypeMatches(classType: string, matcher: NodeMatcher): boolean {
  const ct = matcher.classType;
  if (Array.isArray(ct)) return ct.includes(classType);
  return classType === ct;
}

/**
 * 沿连线反追到字面值节点。
 * ComfyUI API 格式中，连线的值是 [sourceNodeId, outputSlot] 数组。
 * 返回源节点 ID、字面值字段名和它承载的字面值（如果是 Literal 节点）。
 */
function traceLink(
  workflow: any,
  linkValue: any[],
  depth = 0,
): { nodeId: string; literalField?: string; literalValue?: any } | null {
  if (depth > 10) return null; // 防止环
  const srcId = String(linkValue[0]);
  const srcNode = workflow[srcId];
  if (!srcNode || !srcNode.inputs) return { nodeId: srcId };

  // PrimitiveString / PrimitiveInt / Simple String 等透传节点 → 拿它们的字面值
  const passThroughTypes = [
    "PrimitiveString",
    "PrimitiveStringMultiline",
    "PrimitiveInt",
    "PrimitiveFloat",
    "PrimitiveBoolean",
    "Simple String",
    "SimpleString",
    "Reroute",
  ];
  if (passThroughTypes.includes(srcNode.class_type)) {
    const field = srcNode.inputs.value !== undefined ? "value" : "string";
    const val = srcNode.inputs[field];
    if (val !== undefined && !Array.isArray(val)) {
      return { nodeId: srcId, literalField: field, literalValue: val };
    }
    // 如果透传节点的值本身也是连线，继续追
    if (Array.isArray(val)) {
      return traceLink(workflow, val, depth + 1);
    }
  }

  return { nodeId: srcId };
}

/**
 * 对照能力清单，逐一匹配工作流中的节点。
 *
 * @param workflow ComfyUI API 格式工作流（{ nodeId: { class_type, inputs, _meta } }）
 * @param capabilitySet 能力清单（从 CAPABILITY_SETS 取）
 * @returns 每个能力的匹配结果
 */
export function matchCapabilities(
  workflow: any,
  capabilitySet: Capability[],
): CapabilityMatch[] {
  const results: CapabilityMatch[] = [];

  for (const cap of capabilitySet) {
    let bestMatch: CapabilityMatch = { capability: cap, matched: false };

    for (const [nodeId, node] of Object.entries<any>(workflow)) {
      if (!node || !node.class_type) continue;
      const classType = node.class_type;
      const title = node._meta?.title || "";
      const inputs = node.inputs || {};

      for (const matcher of cap.matchers) {
        if (!classTypeMatches(classType, matcher)) continue;

        // titleHint 检查（如 Positive/Negative 区分）
        if (matcher.titleHint && !titleMatches(title, matcher.titleHint)) {
          continue;
        }

        // 特殊 inputKey：_slots / _output / _sampler_params 是聚合标记
        if (matcher.inputKey === "_output" || matcher.inputKey === "_slots" || matcher.inputKey === "_sampler_params") {
          bestMatch = {
            capability: cap,
            matched: true,
            nodeId,
            inputKey: matcher.inputKey,
            currentValue: undefined,
          };
          break;
        }

        const val = inputs[matcher.inputKey];
        if (val === undefined) continue;

        // 如果值是连线 [srcNode, slot]，沿连线追到字面值
        if (Array.isArray(val) && val.length === 2) {
          const traced = traceLink(workflow, val);
          bestMatch = {
            capability: cap,
            matched: true,
            // 注入目标 = 源字面值节点（如 Simple String），不是连线消费方
            nodeId: traced?.nodeId || nodeId,
            // 注入字段 = 源节点的字面值字段名（如 "string"），不是消费方的 "text"
            inputKey: traced?.literalField || matcher.inputKey,
            currentValue: traced?.literalValue,
            linkedFrom: nodeId, // 记录连线来源（消费方节点）
          };
          break;
        }

        // 字面值 — 直接匹配
        bestMatch = {
          capability: cap,
          matched: true,
          nodeId,
          inputKey: matcher.inputKey,
          currentValue: val,
        };
        break;
      }

      if (bestMatch.matched) break; // 第一个匹配即可
    }

    results.push(bestMatch);
  }

  return results;
}

/**
 * 获取工作流类型的默认能力集
 */
export function getCapabilities(workflowType: string): Capability[] {
  return CAPABILITY_SETS[workflowType] || CAPABILITY_SETS.text2img;
}

/**
 * 根据工作流内容自动推断类型（用于导入时检测）
 */
export function inferWorkflowType(workflow: any): string {
  const nodeTypes = new Set<string>();
  const nodes = Array.isArray(workflow?.nodes)
    ? workflow.nodes
    : Object.values<any>(workflow || {});
  for (const node of nodes) {
    if (node?.class_type) nodeTypes.add(node.class_type);
    if (node?.type) nodeTypes.add(node.type);
  }

  // 视频输出节点 → 视频类
  const videoOutputs = ["SaveVideo", "SaveAnimatedWEBP", "SaveAnimatedPNG", "VHS_VideoCombine"];
  if (videoOutputs.some((t) => nodeTypes.has(t))) {
    // 有 LoadImage → 图生视频，否则文生视频
    return nodeTypes.has("LoadImage") ? "img2video" : "text2video";
  }

  // 有 LoadImage 但不是视频 → 图生图
  if (nodeTypes.has("LoadImage")) return "img2img";

  // 默认文生图
  return "text2img";
}
