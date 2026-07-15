import type { LGraphNode as LGraphNodeInterface } from "../../../types/comfy";
import { registerNodeAdapter } from "./registry";

function addTextWidget(node: LGraphNodeInterface, name: string, value: any, multiline = false) {
  node.addWidget("text", name, value ?? "", () => {}, multiline ? { multiline: true } : {});
}

function addPowerLoraWidgets(node: LGraphNodeInterface) {
  const values = Array.isArray(node.widgets_values) ? node.widgets_values : [];
  node.addWidget("button", "全部开启", "", () => setLoraEnabled(node, true));
  node.addWidget("button", "全部关闭", "", () => setLoraEnabled(node, false));
  let rowCount = 0;
  for (const value of values) {
    if (!value || typeof value !== "object" || value.type === "PowerLoraLoaderHeaderWidget") continue;
    const name = typeof value.lora === "string" && value.lora ? value.lora : "空 LoRA 槽位";
    const index = values.indexOf(value);
    node.addWidget("toggle", name, value.on !== false, (enabled) => {
      value.on = Boolean(enabled);
      node.widgets_values = values;
      node.setDirtyCanvas?.(true, true);
    });
    node.addWidget("number", "Strength", typeof value.strength === "number" ? value.strength : 1, (strength) => {
      value.strength = Number(strength);
      values[index] = value;
      node.widgets_values = values;
      node.setDirtyCanvas?.(true, true);
    }, { min: -4, max: 4, step: 0.05 });
    rowCount += 1;
  }
  node.addWidget("button", "+ 添加 LoRA", "", () => {
    window.dispatchEvent(new CustomEvent("workflow:lora-picker", { detail: { nodeId: node.id } }));
  });
  if (!rowCount) node.addWidget("text", "状态", "暂无 LoRA，可点击下方添加", () => {});
}

function setLoraEnabled(node: LGraphNodeInterface, enabled: boolean) {
  if (!Array.isArray(node.widgets_values)) return;
  node.widgets_values = node.widgets_values.map((value: any) => {
    if (!value || typeof value !== "object" || value.type === "PowerLoraLoaderHeaderWidget") return value;
    return { ...value, on: enabled };
  });
  node.widgets?.forEach((widget: any) => {
    if (widget.type === "toggle") widget.value = enabled;
  });
  node.setDirtyCanvas?.(true, true);
}

function addSizePickerWidgets(node: LGraphNodeInterface) {
  const values = Array.isArray(node.widgets_values) ? node.widgets_values : [];
  ["Resolution", "Batch size", "Width override", "Height override"].forEach((name, index) => {
    node.addWidget("text", name, values[index] ?? "", () => {});
  });
}

function addSamplerAdvancedWidgets(node: LGraphNodeInterface) {
  const values = Array.isArray(node.widgets_values) ? node.widgets_values : [];
  [
    "add_noise", "seed", "control_after_generate", "steps", "CFG", "sampler",
    "scheduler", "start_at_step", "end_at_step", "leftover noise",
  ].forEach((name, index) => node.addWidget("text", name, values[index] ?? "", () => {}));
}

function addSimpleStringWidgets(node: LGraphNodeInterface) {
  const value = Array.isArray(node.widgets_values) ? node.widgets_values[0] : "";
  addTextWidget(node, "string", value);
  node.size = [Math.max(node.size?.[0] || 270, 270), Math.max(node.size?.[1] || 58, 58)];
}

function addCaptionerWidgets(node: LGraphNodeInterface) {
  const values = Array.isArray(node.widgets_values) ? node.widgets_values : [];
  values.slice(0, 11).forEach((value, index) => addTextWidget(node, `value_${index + 1}`, value));
}

registerNodeAdapter("Power Lora Loader (rgthree)", addPowerLoraWidgets);
registerNodeAdapter("SDXLEmptyLatentSizePicker+", addSizePickerWidgets);
registerNodeAdapter("KSamplerAdvanced", addSamplerAdvancedWidgets);
registerNodeAdapter("Simple String", addSimpleStringWidgets);
registerNodeAdapter("ToriiGate_Captioner", addCaptionerWidgets);

export function isAdapterType(type: string) {
  return [
    "Power Lora Loader (rgthree)",
    "SDXLEmptyLatentSizePicker+",
    "KSamplerAdvanced",
    "Simple String",
    "ToriiGate_Captioner",
  ].includes(type);
}
