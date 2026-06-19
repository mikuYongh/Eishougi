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

  // Support legacy relative paths from old database entries
  if (finalUrl.startsWith('view?filename=')) {
    const comfyUrl = useSettingsStore.getState().settings.comfyUrl || 'http://127.0.0.1:8188';
    return `${comfyUrl.endsWith('/') ? comfyUrl.slice(0, -1) : comfyUrl}/${finalUrl}`;
  }

  // If it's a valid remote URL or data URI, return as-is.
  if (finalUrl.startsWith('http') || finalUrl.startsWith('data:')) {
    return finalUrl;
  }

  // Otherwise, it's a local file path. Use Tauri's convertFileSrc
  // Handle case where path might already contain asset://
  if (finalUrl.startsWith('asset://')) return finalUrl;
  
  return convertFileSrc(finalUrl);
};

const VIDEO_EXTS = new Set(['mp4', 'webm', 'avi', 'mov', 'mkv', 'm4v']);

export const isVideoFile = (path: string) => {
  const ext = path.split('?')[0].split('.').pop()?.toLowerCase() || '';
  return VIDEO_EXTS.has(ext);
};
