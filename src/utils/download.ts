import { convertFileSrc } from "@tauri-apps/api/core";

export const downloadImage = async (url: string, filename: string) => {
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
};
