import { create } from 'zustand';
import { comfyService } from '../services/comfyService';
import { invoke } from '@tauri-apps/api/core';

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
  createdAt: number;
}

interface QueueStore {
  jobs: QueueJob[];
  isConnected: boolean;
  addJob: (project: any, workflowId?: string, batchCount?: number) => Promise<void>;
  removeJob: (id: string) => void;
  clearCompleted: () => void;
  connect: () => Promise<void>;
  disconnect: () => void;
}

export const useQueueStore = create<QueueStore>((set, get) => {
  let _resolveConnect: (() => void) | null = null;

  const setupCallbacks = () => {
    comfyService.connect(
      (progress) => {
        console.log("[Queue] progress callback", progress);
        set(state => {
          const activeIndex = state.jobs.findIndex(j => j.status === 'pending' || j.status === 'generating');
          if (activeIndex === -1) { console.log("[Queue] progress: no active job found"); return state; }
          
          const newJobs = [...state.jobs];
          newJobs[activeIndex] = {
            ...newJobs[activeIndex],
            status: 'generating',
            progress: Math.round((progress.value / progress.max) * 100),
            node: progress.node
          };
          console.log("[Queue] progress: updated job", newJobs[activeIndex].id, newJobs[activeIndex].status);
          return { jobs: newJobs };
        });
      },
      async (images) => {
        console.log("[Queue] complete callback, images:", images?.length);
        let completedJob: QueueJob | null = null;
        
        set(state => {
          const activeIndex = state.jobs.findIndex(j => j.status === 'generating' || j.status === 'pending');
          if (activeIndex === -1) { console.log("[Queue] complete: no active job found"); return state; }
          
          const newJobs = [...state.jobs];
          completedJob = {
            ...newJobs[activeIndex],
            status: 'completed',
            progress: 100,
            images
          };
          newJobs[activeIndex] = completedJob;
          console.log("[Queue] complete: updated job", completedJob.id, "-> completed");
          return { jobs: newJobs };
        });

        if (completedJob) {
          try {
            const project = await invoke('get_prompt', { id: completedJob.projectId }) as any;
            if (project) {
              for (let i = 0; i < images.length; i++) {
                const url = images[i];
                const imageObj = {
                  id: "img_" + Date.now().toString() + "_" + i,
                  promptId: project.id,
                  workflowId: completedJob.workflowId || null,
                  seed: project.seed,
                  outputPath: url,
                  outputType: "image",
                  status: "completed",
                  errorMsg: null,
                  createdAt: Date.now()
                };
                await invoke('save_generated_image', { image: imageObj });
              }
              console.log("[Queue] saved history for", completedJob.projectId);
            }
          } catch (e) {
            console.error("[Queue] Failed to save history from queue:", e);
          }
        }
      },
      (error) => {
        console.log("[Queue] error callback:", error);
        set(state => {
          const activeIndex = state.jobs.findIndex(j => j.status === 'generating' || j.status === 'pending');
          if (activeIndex === -1) return state;
          
          const newJobs = [...state.jobs];
          newJobs[activeIndex] = {
            ...newJobs[activeIndex],
            status: 'failed',
            error
          };
          return { jobs: newJobs };
        });
      },
      (status) => {
        console.log("[Queue] connection status:", status);
        set({ isConnected: status === 'connected' });
        if (status === 'connected') {
          _resolveConnect?.();
          _resolveConnect = null;
        }
      }
    );
  };

  return {
  jobs: [],
  isConnected: false,

  connect: async () => {
    console.log("[Queue] connect: starting WebSocket connection...");
    set({ isConnected: false });
    
    return new Promise<void>((resolve, reject) => {
      _resolveConnect = resolve;
      setupCallbacks();
      
      setTimeout(() => {
        if (!get().isConnected) {
          console.error("[Queue] connect: timeout after 15s");
          _resolveConnect = null;
          reject(new Error('WebSocket connection timeout'));
        }
      }, 15000);
    });
  },

  disconnect: () => {
    console.log("[Queue] disconnect");
    comfyService.disconnect();
    set({ isConnected: false });
  },

  addJob: async (project: any, workflowId?: string, batchCount: number = 1) => {
    const jobs: QueueJob[] = [];
    for (let i = 0; i < batchCount; i++) {
      jobs.push({
        id: "job_" + Date.now() + "_" + i,
        projectId: project.id,
        projectTitle: project.title,
        status: 'pending',
        progress: 0,
        workflowId: workflowId,
        createdAt: Date.now()
      });
    }

    console.log("[Queue] addJob:", jobs.length, "job(s) for", project.title, "wf:", workflowId);
    set(state => ({ jobs: [...state.jobs, ...jobs] }));

    try {
      console.log("[Queue] addJob: reconnecting WebSocket...");
      await get().connect();
      console.log("[Queue] addJob: connected, proceeding");

      let wfString = "";
      if (workflowId) {
        try {
          const w = await invoke('get_workflow', { id: workflowId }) as any;
          if (w && w.jsonContent) {
            wfString = w.jsonContent;
          }
        } catch (e) {
          console.warn("[Queue] Failed to fetch workflow, falling back to default", e);
        }
      }

      if (!wfString) {
        const defaultWorkflow = (await import('../assets/default_workflow.json')).default;
        wfString = JSON.stringify(defaultWorkflow);
      }

      for (let i = 0; i < batchCount; i++) {
        const injectedWf = comfyService.injectParameters(wfString, project);
        if (!injectedWf) throw new Error("Failed to construct workflow JSON");

        console.log("[Queue] addJob: queueing prompt", i + 1, "of", batchCount);
        await comfyService.queuePrompt(injectedWf);
        console.log("[Queue] addJob: prompt", i + 1, "queued successfully");
      }
    } catch (e: any) {
      console.error("[Queue] addJob error:", e.message);
      set(state => ({
        jobs: state.jobs.map(j => jobs.some(bj => bj.id === j.id) ? { ...j, status: 'failed', error: e.message } : j)
      }));
    }
  },

  removeJob: (id) => {
    set(state => ({ jobs: state.jobs.filter(j => j.id !== id) }));
  },

  clearCompleted: () => {
    set(state => ({ jobs: state.jobs.filter(j => j.status === 'pending' || j.status === 'generating') }));
  }
  };
});
