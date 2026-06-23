import { invoke } from '@tauri-apps/api/core';

/**
 * 把前端业务日志转发到 Rust 侧的 tauri_plugin_log，自动写入 app.log。
 *
 * 用法：
 *   appLog.info('ComfyModel', 'fetchModels done in 288ms');
 *   appLog.warn('ComfyHTTP', 'object_info timeout');
 *   appLog.error('Agent', 'LLM call failed: HTTP 500');
 *
 * 同时也会 console.info/warn/error 到浏览器控制台，方便开发时调试。
 * 写入失败（如 Tauri 环境不可用）静默降级，绝不影响业务流程。
 */

type Level = 'info' | 'warn' | 'error';

const fireAndForget = (level: Level, prefix: string, message: string) => {
  // 浏览器控制台同步输出，开发时立即可见
  const line = `[${prefix}] ${message}`;
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.info(line);

  // 转发到 Rust 写 app.log（异步，不阻塞业务）
  invoke('write_log', { level, prefix, message }).catch(() => {
    // 静默降级（非 Tauri 环境、命令未注册、或网络不可用）
  });
};

export const appLog = {
  info: (prefix: string, message: string) => fireAndForget('info', prefix, message),
  warn: (prefix: string, message: string) => fireAndForget('warn', prefix, message),
  error: (prefix: string, message: string) => fireAndForget('error', prefix, message),
};
