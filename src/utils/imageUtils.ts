import { convertFileSrc } from "@tauri-apps/api/core";
import { useSettingsStore } from "../stores/settingsStore";

/**
 * Transforms a raw image URL/path into a source suitable for <img src="...">
 * Specifically fixes localhost/127.0.0.1 ComfyUI URLs on Android by rewriting
 * them to the actual configured ComfyUI IP address.
 */
export const getImgSrc = (url?: string): string => {
  if (!url) return '';

  let finalUrl = url;

  // Fix: If the url points to a local ComfyUI instance (127.0.0.1 or localhost),
  // but we are running on a phone (or a different IP), it will fail to load.
  // We rewrite 127.0.0.1/localhost to the actual configured comfyUrl IP.
  if (finalUrl.includes('127.0.0.1:8188') || finalUrl.includes('localhost:8188')) {
    const comfyUrl = useSettingsStore.getState().settings.comfyUrl;
    if (comfyUrl && !comfyUrl.includes('127.0.0.1') && !comfyUrl.includes('localhost')) {
      finalUrl = finalUrl.replace(/https?:\/\/(127\.0\.0\.1|localhost):8188/, comfyUrl);
    }
  }

  // If it's a web URL or data URL, return as is.
  if (finalUrl.startsWith('http') || finalUrl.startsWith('data:')) {
    return finalUrl;
  }

  // Otherwise, it's a local file path. Use Tauri's convertFileSrc
  // Handle case where path might already contain asset://
  if (finalUrl.startsWith('asset://')) return finalUrl;
  
  return convertFileSrc(finalUrl);
};
