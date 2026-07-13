import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";
import { useSettingsStore } from "../stores/settingsStore";

/**
 * Save an image (by any supported URL/path scheme) to the OS gallery/downloads.
 * - Desktop: if settings.saveDir is set, images go into that absolute directory;
 *   otherwise fall back to Downloads/<saveFolder>/photo/.
 * - Mobile: always uses saveFolder via the gallery API (saveDir ignored).
 */
export const downloadImage = async (url: string, _filename: string) => {
  try {
    const { saveFolder, saveDir } = useSettingsStore.getState().settings;
    const destPath = await invoke<string>('export_image_to_downloads', {
      url,
      saveFolder,
      saveDir,
    });
    toast.success(`已保存至 ${destPath}`);
  } catch (err) {
    console.error("Failed to download image:", err);
    toast.error("保存失败: " + String(err));
  }
};
