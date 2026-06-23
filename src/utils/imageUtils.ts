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

  // Fix: If the url points to a ComfyUI instance (e.g. 127.0.0.1, localhost, or an old IP),
  // but the user's current comfyUrl has changed (e.g. switched WiFi networks or running on a phone),
  // we rewrite the origin to the actual configured comfyUrl IP.
  const comfyUrl = useSettingsStore.getState().settings.comfyUrl || 'http://127.0.0.1:8188';
  
  if (finalUrl.includes('/view?filename=')) {
    if (finalUrl.startsWith('http')) {
      // Rewrite any http(s)://<old-ip>:<port>/view?filename=... to current comfyUrl
      finalUrl = finalUrl.replace(/^https?:\/\/[^\/]+/, comfyUrl.replace(/\/$/, ''));
    } else if (finalUrl.startsWith('view?filename=')) {
      // Support legacy relative paths from old database entries
      finalUrl = `${comfyUrl.endsWith('/') ? comfyUrl.slice(0, -1) : comfyUrl}/${finalUrl}`;
    }
  }

  // If it's a valid remote URL or data URI, return as-is.
  if (finalUrl.startsWith('http') || finalUrl.startsWith('data:')) {
    return finalUrl;
  }

  // At this point, it's considered a local file path.
  // It might be URL-encoded (e.g., from Markdown parsing or previous encoding), decode it to raw path.
  try {
    finalUrl = decodeURIComponent(finalUrl);
  } catch(e) {
    // Ignore malformed URIs
  }

  // If it's a file:// URI (e.g. from markdown), strip it
  if (finalUrl.startsWith('file://')) {
    finalUrl = finalUrl.replace(/^file:\/\/\/?/, '');
  }

  // Always normalize backslashes to forward slashes. 
  // Tauri's convertFileSrc handles forward slashes perfectly on Windows, 
  // while backslashes often get double-encoded by the browser (e.g., %5C -> %255C) and break.
  finalUrl = finalUrl.replace(/\\/g, '/');

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
