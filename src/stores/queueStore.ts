import { create } from 'zustand';
import { comfyService, getComfyUrl, getVideoComfyUrl, getWsUrl } from '../services/comfyService';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { UnlistenFn } from '@tauri-apps/api/event';
import { appLog } from '../utils/appLog';
import { useWorkflowStore } from './workflowStore';

export interface QueueJob {
  id: string;
  projectId: string;
  projectTitle: string;
  status: 'pending' | 'generating' | 'completed' | 'failed';
  progress: number;
  node?: string;
  images?: string[];
  error?: string;
  workflowId?: string;
  comfyPromptId?: string;
  createdAt: number;
}

export interface CompletionNotification {
  id: string;
  jobId: string;
  projectId: string;
  projectTitle: string;
  images: string[];
  createdAt: number;
}

interface QueueStore {
  jobs: QueueJob[];
  isConnected: boolean;
  completedNotifications: CompletionNotification[];
  addJob: (project: any, workflowId?: string, batchCount?: number) => Promise<string[][]>;
  addVideoJob: (tempProject: any, workflowId: string, imageFilename: string, fps: number, duration: number, width: number, height: number, prompt: string, baseModel: string) => Promise<string[]>;
  removeJob: (id: string) => void;
  clearCompleted: () => void;
  connect: () => Promise<void>;
  disconnect: () => void;
  dismissNotification: (id: string) => void;
  interruptJob: () => Promise<void>;
  historyUpdateTick: number;
}

// Module-level state — must survive Vite HMR. Cleaned up via import.meta.hot.dispose.
const _jobResolvers = new Map<string, { resolve: (images: string[]) => void; reject: (err: Error) => void }>();
let _isSetup = false;
let _unlisteners: UnlistenFn[] = [];

export const useQueueStore = create<QueueStore>((set, get) => {
  const globalClientId = Math.random().toString(36).substring(2, 15);

  const setupCallbacks = async () => {
    if (_isSetup) return;
    _isSetup = true;

    const u1 = await listen<string>('comfy-status', (event) => {
      set({ isConnected: event.payload === 'connected' });
    });
    _unlisteners.push(u1);

    const u2 = await listen<any>('comfy-progress', (event) => {
      const msg = event.payload;
      const promptId = msg.data?.prompt_id;
      const progress = { value: msg.data?.value || 0, max: msg.data?.max || 1, node: msg.data?.node || '' };
      
      set(state => {
        const activeIndex = promptId 
          ? state.jobs.findIndex(j => j.comfyPromptId === promptId)
          : state.jobs.findIndex(j => j.status === 'pending' || j.status === 'generating');
          
        if (activeIndex === -1) return state;
        
        const newJobs = [...state.jobs];
        newJobs[activeIndex] = {
          ...newJobs[activeIndex],
          status: 'generating',
          progress: Math.round((progress.value / progress.max) * 100),
          node: progress.node
        };
        return { jobs: newJobs };
      });
    });
    _unlisteners.push(u2);

    const u3 = await listen<any>('comfy-completed', (event) => {
      const payload = event.payload;
      const { job_id, images } = payload;
      const imgCount = Array.isArray(images) ? images.length : 0;
      console.info(`[ComfyWS] comfy-completed event: job_id=${job_id} images=${imgCount}`);

      const resolver = _jobResolvers.get(job_id);
      if (resolver) {
        resolver.resolve(images);
        _jobResolvers.delete(job_id);
      } else {
        console.warn(`[ComfyWS] comfy-completed for job_id=${job_id} but no resolver found (already cleaned up or unknown job)`);
        appLog.warn('ComfyWS', `comfy-completed with no resolver: job_id=${job_id}`);
      }

      set(state => {
        const activeIndex = state.jobs.findIndex(j => j.id === job_id);
        if (activeIndex === -1) return state;
        
        const newJobs = [...state.jobs];
        const job = newJobs[activeIndex];
        newJobs[activeIndex] = {
          ...job,
          status: 'completed',
          progress: 100,
          images
        };

        const newNotif = {
          id: "notif_" + Date.now(),
          jobId: job.id,
          projectId: job.projectId,
          projectTitle: job.projectTitle,
          images: images,
          createdAt: Date.now()
        };

        return { 
          jobs: newJobs,
          completedNotifications: [newNotif, ...state.completedNotifications].slice(0, 5),
          historyUpdateTick: state.historyUpdateTick + 1
        };
      });
    });
    _unlisteners.push(u3);

    const u4 = await listen<any>('comfy-error', (event) => {
      const msg = event.payload;
      const promptId = msg.data?.prompt_id;
      const rawError = msg.data?.exception_message || "Error";
      console.error(
        `[ComfyWS] comfy-error event: prompt_id=${promptId} exception=${rawError}`
      );
      appLog.error('ComfyWS', `comfy-error: prompt_id=${promptId} ${rawError}`);
      // Detect OOM / allocation errors and give a actionable hint to upgrade ComfyUI.
      // Older ComfyUI kernels mis-load the Anima CLIP as a full hidream/llama stack,
      // blowing up VRAM. Upgrading to v0.16.0+ fixes this.
      const isOOM = /OutOfMemory|Allocation on device|CUDA out of memory/i.test(rawError);
      const friendlyError = isOOM
        ? '显存不足（OOM）。请升级 ComfyUI 内核：进入绘世启动器 → 版本管理 → 内核，升级到 v0.16.0 以上后重启 ComfyUI 再试。'
        : rawError;
      set(state => {
        let activeIndex = promptId ? state.jobs.findIndex(j => j.comfyPromptId === promptId) : -1;

        // Reject the addJob promise so callers (onboarding test, agent, etc.) don't hang.
        if (activeIndex !== -1) {
          const jobId = state.jobs[activeIndex].id;
          const resolver = _jobResolvers.get(jobId);
          if (resolver) {
            resolver.reject(new Error(friendlyError));
            _jobResolvers.delete(jobId);
          }
        } else if (promptId) {
          // Race condition: comfyPromptId wasn't set on the job yet (HTTP response
          // hadn't arrived when the error fired). Try matching by pending/generating status
          // as a fallback, or reject all pending resolvers if only one job is in flight.
          const pending = state.jobs.filter(j => j.status === 'pending' || j.status === 'generating');
          if (pending.length === 1) {
            const resolver = _jobResolvers.get(pending[0].id);
            if (resolver) {
              resolver.reject(new Error(friendlyError));
              _jobResolvers.delete(pending[0].id);
            }
            activeIndex = state.jobs.findIndex(j => j.id === pending[0].id);
          }
        }

        if (activeIndex === -1) return state;

        const newJobs = [...state.jobs];
        newJobs[activeIndex] = {
          ...newJobs[activeIndex],
          status: 'failed',
          error: friendlyError
        };
        return { jobs: newJobs };
      });
    });
    _unlisteners.push(u4);
  };

  return {
    jobs: [],
    isConnected: false,
    completedNotifications: [],
    historyUpdateTick: 0,

    connect: async () => {
      const wsUrl = getWsUrl();
      console.info(`[ComfyWS] connect() called, wsUrl=${wsUrl}, alreadySetup=${_isSetup}`);
      await setupCallbacks();
    },

    disconnect: () => {
      console.info(`[ComfyWS] disconnect() called, removing ${_unlisteners.length} listeners`);
      _unlisteners.forEach(unlisten => unlisten());
      _unlisteners = [];
      _isSetup = false;
      // Reject all pending resolvers so callers don't hang forever after disconnect.
      for (const [id, resolver] of _jobResolvers) {
        resolver.reject(new Error('ComfyUI 连接已断开'));
        _jobResolvers.delete(id);
      }
      set({ isConnected: false });
    },

    addJob: async (project: any, workflowId?: string, batchCount: number = 1) => {
      const t0 = performance.now();
      const comfyUrl = getComfyUrl();
      console.info(
        `[ComfyQueue] addJob start: projectId=${project.id} title="${project.title}" ` +
        `workflowId=${workflowId || '(default)'} batch=${batchCount} comfyUrl=${comfyUrl}`
      );
      await get().connect();

      const jobIds: string[] = [];
      const jobPromises: Promise<string[]>[] = [];
      const jobs: QueueJob[] = [];
      for (let i = 0; i < batchCount; i++) {
        const jobId = "job_" + Date.now() + "_" + i;
        jobIds.push(jobId);
        const promise = new Promise<string[]>((resolve, reject) => {
          _jobResolvers.set(jobId, { resolve, reject });
        });
        jobPromises.push(promise);
        jobs.push({
          id: jobId,
          projectId: project.id,
          projectTitle: project.title,
          status: 'pending',
          progress: 0,
          workflowId: workflowId,
          createdAt: Date.now()
        });
      }

      set(state => ({ jobs: [...state.jobs, ...jobs] }));

      try {
        let wfString = "";
        if (workflowId) {
          try {
            const w = await invoke('get_workflow', { id: workflowId }) as any;
            if (w && w.jsonContent) {
              wfString = w.jsonContent;
              console.info(`[ComfyQueue] workflow loaded: id=${workflowId} size=${wfString.length}B`);
            }
          } catch (e) {
            console.warn(`[ComfyQueue] Failed to fetch workflow ${workflowId}:`, e);
          }
        }

        if (!wfString) {
          // 项目未绑定工作流时，回落到 DB 中标记为默认的工作流；
          // 找不到再回落到打包内嵌的占位工作流（仅作为最终兜底）。
          const defaultWf = useWorkflowStore.getState().workflows.find(w => w.type === 'text2img' && w.isDefault);
          if (defaultWf && defaultWf.jsonContent) {
            wfString = defaultWf.jsonContent;
            console.info(`[ComfyQueue] using DB default workflow: id=${defaultWf.id} size=${wfString.length}B`);
          }
        }

        if (!wfString) {
          const fallbackWorkflow = (await import('../assets/default_workflow.json')).default;
          wfString = JSON.stringify(fallbackWorkflow);
          console.info(`[ComfyQueue] using bundled fallback workflow, size=${wfString.length}B`);
        }

        for (let i = 0; i < batchCount; i++) {
          const injectedWf = await comfyService.injectParameters(wfString, project);
          if (!injectedWf) throw new Error("Failed to construct workflow JSON");

          const res = await invoke<any>('queue_prompt_and_track', {
            prompt: injectedWf,
            comfyUrl: getComfyUrl(),
            clientId: globalClientId,
            jobId: jobs[i].id,
            projectId: project.id,
            projectTitle: project.title,
            workflowId: workflowId || null,
            seed: parseInt(project.seed) || null
          });
          console.info(
            `[ComfyQueue] job ${jobs[i].id} queued, comfyPromptId=${res?.prompt_id || '(none)'}`
          );

          if (res && res.prompt_id) {
            set(state => {
              const newJobs = [...state.jobs];
              const jIdx = newJobs.findIndex(j => j.id === jobs[i].id);
              if (jIdx !== -1) {
                newJobs[jIdx] = { ...newJobs[jIdx], comfyPromptId: res.prompt_id };
              }
              return { jobs: newJobs };
            });
          }
        }

        // Timeout safety net: if neither comfy-completed nor comfy-error fires
        // (WS dropped, poll cap exceeded, etc.), reject after 10 minutes so the
        // caller doesn't hang forever.
        const timeoutMs = 10 * 60 * 1000;
        const results = await Promise.all(jobPromises.map((p, i) =>
          Promise.race([
            p,
            new Promise<string[]>((_, reject) =>
              setTimeout(() => {
                const r = _jobResolvers.get(jobIds[i]);
                if (r) { r.reject(new Error('生成超时（10 分钟无响应）')); _jobResolvers.delete(jobIds[i]); }
              }, timeoutMs)
            )
          ])
        ));
        const elapsed = Math.round(performance.now() - t0);
        console.info(`[ComfyQueue] addJob done in ${elapsed}ms, ${results.length} image set(s)`);
        return results;
      } catch (e: any) {
        const elapsed = Math.round(performance.now() - t0);
        console.error(`[ComfyQueue] addJob FAILED after ${elapsed}ms: ${e.message}`);
        appLog.error('ComfyQueue', `addJob FAILED after ${elapsed}ms: ${e.message}`);
        for (const id of jobIds) {
          _jobResolvers.delete(id);
        }
        set(state => ({
          jobs: state.jobs.map(j => jobs.some(bj => bj.id === j.id) ? { ...j, status: 'failed', error: e.message } : j)
        }));
        throw e;
      }
    },

    addVideoJob: async (tempProject: any, workflowId: string, imageFilename: string, fps: number, duration: number, width: number, height: number, prompt: string, baseModel: string) => {
      const t0 = performance.now();
      const videoComfyUrl = getVideoComfyUrl();
      console.info(
        `[ComfyQueue] addVideoJob start: workflowId=${workflowId} imageFilename=${imageFilename} ` +
        `fps=${fps} duration=${duration}s ${width}x${height} videoComfyUrl=${videoComfyUrl}`
      );
      await get().connect();

      const jobId = tempProject.id; // use tempProject id directly to match
      const promise = new Promise<string[]>((resolve, reject) => {
        _jobResolvers.set(jobId, { resolve, reject });
      });

      const job: QueueJob = {
        id: jobId,
        projectId: tempProject.id,
        projectTitle: tempProject.title,
        status: 'pending',
        progress: 0,
        workflowId: workflowId,
        createdAt: Date.now()
      };

      set(state => ({ jobs: [...state.jobs, job] }));

      try {
        let wfString = "";
        try {
          const w = await invoke('get_workflow', { id: workflowId }) as any;
          if (w && w.jsonContent) {
            wfString = w.jsonContent;
            console.info(`[ComfyQueue] video workflow loaded: id=${workflowId} size=${wfString.length}B`);
          }
        } catch (e) {
          console.warn(`[ComfyQueue] Failed to fetch video workflow ${workflowId}:`, e);
        }

        if (!wfString) {
          throw new Error("Cannot find workflow");
        }

        const injectedWf = comfyService.injectVideoParameters(
          JSON.parse(wfString),
          imageFilename,
          prompt,
          fps,
          duration,
          width,
          height,
          baseModel
        );

        const res = await invoke<any>('queue_prompt_and_track', {
          prompt: injectedWf,
          comfyUrl: videoComfyUrl,
          clientId: globalClientId,
          jobId: job.id,
          projectId: tempProject.id,
          projectTitle: tempProject.title,
          workflowId: workflowId,
          seed: tempProject.seed
        });
        console.info(
          `[ComfyQueue] video job ${job.id} queued, comfyPromptId=${res?.prompt_id || '(none)'}`
        );

        set(state => ({
          jobs: state.jobs.map(j => j.id === job.id ? { ...j, comfyPromptId: res.prompt_id } : j)
        }));

        const result = await promise;
        const elapsed = Math.round(performance.now() - t0);
        console.info(`[ComfyQueue] addVideoJob done in ${elapsed}ms, ${result.length} video(s)`);
        return result;
      } catch (e: any) {
        const elapsed = Math.round(performance.now() - t0);
        console.error(`[ComfyQueue] addVideoJob FAILED after ${elapsed}ms: ${e.message}`);
        appLog.error('ComfyQueue', `addVideoJob FAILED after ${elapsed}ms: ${e.message}`);
        _jobResolvers.delete(jobId);
        set(state => ({
          jobs: state.jobs.map(j => j.id === job.id ? { ...j, status: 'failed', error: e.message } : j)
        }));
        throw e;
      }
    },

    removeJob: (id) => {
      set(state => ({ jobs: state.jobs.filter(j => j.id !== id) }));
    },

    clearCompleted: () => {
      set(state => ({ jobs: state.jobs.filter(j => j.status === 'pending' || j.status === 'generating') }));
    },

    dismissNotification: (id) => {
      set(state => ({ completedNotifications: state.completedNotifications.filter(n => n.id !== id) }));
    },

    interruptJob: async () => {
      try {
        await comfyService.interrupt();
      } catch (e) {
        console.error("[Queue] Failed to interrupt job", e);
      }
    }
  };
});

// Vite HMR: clean up Tauri event listeners on hot reload.
// Without this, the old module's listeners stay active but the new module
// loses track of them, causing progress/completion events to be swallowed.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    _unlisteners.forEach(u => u());
    _unlisteners = [];
    _isSetup = false;
  });
}
