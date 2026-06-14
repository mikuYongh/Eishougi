import { invoke, convertFileSrc } from "@tauri-apps/api/core";

export const downloadImage = async (url: string, filename: string) => {
  try {
    // Try native export first (best for Android and Desktop)
    const destPath = await invoke('export_image_to_downloads', { url });
    console.log("Image exported to:", destPath);
    // You might want to show a toast here, but we can just let it succeed silently
  } catch (nativeErr) {
    console.warn("Native export failed, falling back to web download:", nativeErr);
    try {
      const src = url.startsWith('http') || url.startsWith('data:') ? url : convertFileSrc(url);
      const response = await fetch(src);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      setTimeout(() => {
        URL.revokeObjectURL(objectUrl);
      }, 1000);
    } catch (err) {
      console.error("Failed to download image:", err);
      alert("下载失败，请检查文件或权限");
    }
  }
};
