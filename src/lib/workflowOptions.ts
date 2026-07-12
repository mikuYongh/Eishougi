/**
 * Shared sampler / scheduler option lists used by PromptEdit, Generate, and WorkflowEdit.
 * Keep these in one place so all UIs show the same selectable values.
 *
 * The lists are the union of what ComfyUI commonly supports across model architectures.
 * If a workflow uses a value not in this list, the dropdown will still display it correctly
 * (GlassDropdown shows the current value even if it's not in options).
 */

export const SAMPLER_OPTIONS = [
  { label: "euler", value: "euler" },
  { label: "euler_ancestral", value: "euler_ancestral" },
  { label: "heun", value: "heun" },
  { label: "dpm_2", value: "dpm_2" },
  { label: "dpm_2_ancestral", value: "dpm_2_ancestral" },
  { label: "dpmpp_2s_ancestral", value: "dpmpp_2s_ancestral" },
  { label: "dpmpp_2m", value: "dpmpp_2m" },
  { label: "dpmpp_2m_sde", value: "dpmpp_2m_sde" },
  { label: "dpmpp_sde", value: "dpmpp_sde" },
  { label: "dpmpp_3m_sde", value: "dpmpp_3m_sde" },
  { label: "uni_pc", value: "uni_pc" },
];

export const SCHEDULER_OPTIONS = [
  { label: "normal", value: "normal" },
  { label: "karras", value: "karras" },
  { label: "exponential", value: "exponential" },
  { label: "sgm_uniform", value: "sgm_uniform" },
  { label: "simple", value: "simple" },
  { label: "ddim_uniform", value: "ddim_uniform" },
  { label: "beta", value: "beta" },
  { label: "beta57", value: "beta57" },
  { label: "kl_optimal", value: "kl_optimal" },
  { label: "linear_quadratic", value: "linear_quadratic" },
];
