/**
 * Hardware detection utilities
 */

export interface HardwareInfo {
  gpuVendor: string;
  gpuRenderer: string;
  hasNvidiaGpu: boolean;
  hasAmdGpu: boolean;
  hasAppleSilicon: boolean;
}

export async function detectHardware(): Promise<HardwareInfo> {
  const info: HardwareInfo = {
    gpuVendor: 'Unknown',
    gpuRenderer: 'Unknown',
    hasNvidiaGpu: false,
    hasAmdGpu: false,
    hasAppleSilicon: false,
  };

  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    
    if (gl) {
      const debugInfo = (gl as WebGLRenderingContext).getExtension('WEBGL_debug_renderer_info');
      if (debugInfo) {
        info.gpuVendor = (gl as WebGLRenderingContext).getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || '';
        info.gpuRenderer = (gl as WebGLRenderingContext).getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || '';
        
        const rendererLower = info.gpuRenderer.toLowerCase();
        const vendorLower = info.gpuVendor.toLowerCase();

        info.hasNvidiaGpu = rendererLower.includes('nvidia') || vendorLower.includes('nvidia');
        info.hasAmdGpu = rendererLower.includes('amd') || rendererLower.includes('radeon') || vendorLower.includes('amd');
        info.hasAppleSilicon = rendererLower.includes('apple') || vendorLower.includes('apple');
      }
    }
  } catch (err) {
    console.error('Failed to detect hardware:', err);
  }

  return info;
}

/**
 * Checks if local ComfyUI API is reachable
 */
export async function pingLocalComfyUI(port: number = 8188): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000); // 2 second timeout
    
    const response = await fetch(`http://127.0.0.1:${port}/system_stats`, {
      method: 'GET',
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    return response.ok;
  } catch (err) {
    return false;
  }
}
