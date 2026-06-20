import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";

export const downloadImage = async (url: string, filename: string) => {
  try {
    const destPath = await invoke<string>('export_image_to_downloads', { url });
    toast.success(`已保存至 ${destPath}`);
  } catch (err) {
    console.error("Failed to download image:", err);
    toast.error("保存失败: " + String(err));
  }
};
