import { invoke, convertFileSrc } from "@tauri-apps/api/core";

import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";

export const downloadImage = async (url: string, filename: string) => {
  try {
    const destPath = await invoke<string>('export_image_to_downloads', { url });
    alert(`已一键保存至相册！\n文件位置：${destPath}`);
  } catch (err) {
    console.error("Failed to download image:", err);
    alert("保存失败: " + String(err));
  }
};
