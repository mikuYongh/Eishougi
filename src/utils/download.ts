import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { useSettingsStore } from "../stores/settingsStore";

/**
 * Save an image (by any supported URL/path scheme) to the OS gallery/downloads.
 * The destination subfolder is read from the global settings (saveFolder), so the
 * user can customise where images land on both desktop and Android.
 */
export const downloadImage = async (url: string, _filename: string) => {
  try {
    const folder = useSettingsStore.getState().settings.saveFolder;
    const destPath = await invoke<string>('export_image_to_downloads', {
      url,
      saveFolder: folder,
    });
    toast.success(`已保存至 ${destPath}`);
  } catch (err) {
    console.error("Failed to download image:", err);
    toast.error("保存失败: " + String(err));
  }
};
