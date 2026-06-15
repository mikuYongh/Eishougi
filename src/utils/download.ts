import { invoke, convertFileSrc } from "@tauri-apps/api/core";

import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";

export const downloadImage = async (url: string, filename: string) => {
  try {
    const ext = url.split('.').pop()?.split('?')[0] || 'png';
    const filePath = await save({
      defaultPath: filename || `eishougi_${Date.now()}.${ext}`,
      filters: [{ name: "Image", extensions: [ext, "png", "jpg", "jpeg", "webp"] }]
    });

    if (!filePath) return;

    let bytes: Uint8Array;
    if (url.startsWith('http') || url.startsWith('data:')) {
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      bytes = new Uint8Array(arrayBuffer);
    } else {
      // Local path on PC or Android. Read via invoke from backend
      const data = await invoke<number[]>('read_file_as_bytes', { path: url.replace('asset://localhost/', '').replace('asset://localhost', '') });
      bytes = new Uint8Array(data);
    }

    await writeFile(filePath, bytes);
    alert(`保存成功！\n文件已保存至：${filePath}`);
  } catch (err) {
    console.error("Failed to download image:", err);
    alert("下载失败，请检查权限或路径: " + String(err));
  }
};
