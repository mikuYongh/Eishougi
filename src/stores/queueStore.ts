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
  removeJob: (id: string) => void;
  clearCompleted: () => void;
  connect: () => Promise<void>;
  disconnect: () => void;
  dismissNotification: (id: string) => void;
  interruptJob: () => Promise<void>;
  historyUpdateTick: number;
}

export const useQueueStore = create<QueueStore>((set, get) => {
  let _resolveConnect: (() => void) | null = null;
  let _jobResolvers = new Map<string, (images: string[]) => void>();

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
            const job = completedJob as QueueJob;
            // Resolve the waiting addJob Promise
            const resolver = _jobResolvers.get(job.id);
            if (resolver) {
              resolver(job.images || []);
              _jobResolvers.delete(job.id);
            }
            set(state => ({
            completedNotifications: [
              {
                id: "notif_" + Date.now(),
                jobId: job.id,
                projectId: job.projectId,
                projectTitle: job.projectTitle,
                images: job.images || [],
                createdAt: Date.now()
              },
              ...state.completedNotifications
            ].slice(0, 5)
          }));

          try {
            const project = await invoke('get_prompt', { id: job.projectId }) as any;
            if (project) {
              for (let i = 0; i < images.length; i++) {
                const url = images[i];
                const imageObj = {
                  id: "img_" + Date.now().toString() + "_" + i,
                  promptId: project.id,
                  workflowId: job.workflowId || null,
                  seed: project.seed,
                  outputPath: url,
                  outputType: "image",
                  status: "completed",
                  errorMsg: null,
                  createdAt: Date.now()
                };
                try {
                  await invoke('save_generated_image', { image: imageObj });
                } catch (dbErr) {
                  console.warn("[Queue] Failed to save image, retrying without workflowId...", dbErr);
                  imageObj.workflowId = null;
                  await invoke('save_generated_image', { image: imageObj });
                }
              }
              console.log("[Queue] saved history for", job.projectId);
              set(state => ({ historyUpdateTick: state.historyUpdateTick + 1 }));
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

  let _connectPromise: Promise<void> | null = null;

  const connectImpl = async () => {
    if (get().isConnected) return;
    if (_connectPromise) return _connectPromise;

    console.log("[Queue] connect: starting WebSocket connection...");
    
    _connectPromise = new Promise<void>((resolve, reject) => {
      _resolveConnect = resolve;
      setupCallbacks();
      
      setTimeout(() => {
        if (!get().isConnected) {
          console.error("[Queue] connect: timeout after 15s");
          _resolveConnect = null;
          _connectPromise = null;
          reject(new Error('WebSocket connection timeout'));
        }
      }, 15000);
    });

    try {
      await _connectPromise;
    } finally {
      _connectPromise = null;
    }
  };

  return {
  jobs: [],
  isConnected: false,
  completedNotifications: [],
  historyUpdateTick: 0,

  connect: connectImpl,

  disconnect: () => {
    console.log("[Queue] disconnect");
    comfyService.disconnect();
    set({ isConnected: false });
  },

  addJob: async (project: any, workflowId?: string, batchCount: number = 1) => {
    const jobIds: string[] = [];
    const jobPromises: Promise<string[]>[] = [];
    const jobs: QueueJob[] = [];
    for (let i = 0; i < batchCount; i++) {
      const jobId = "job_" + Date.now() + "_" + i;
      jobIds.push(jobId);
      const promise = new Promise<string[]>((resolve) => {
        _jobResolvers.set(jobId, resolve);
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

    console.log("[Queue] addJob:", jobs.length, "job(s) for", project.title, "wf:", workflowId);
    set(state => ({ jobs: [...state.jobs, ...jobs] }));

    try {
      if (!get().isConnected) {
        console.log("[Queue] addJob: WebSocket disconnected, connecting...");
        await get().connect();
      }
      console.log("[Queue] addJob: WebSocket connected, proceeding");

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
        const injectedWf = await comfyService.injectParameters(wfString, project);
        if (!injectedWf) throw new Error("Failed to construct workflow JSON");

        console.log("[Queue] addJob: queueing prompt", i + 1, "of", batchCount);
        await comfyService.queuePrompt(injectedWf);
        console.log("[Queue] addJob: prompt", i + 1, "queued successfully");
      }

      // Wait for all jobs to complete via WebSocket callbacks
      console.log("[Queue] addJob: waiting for generation to complete...");
      const results = await Promise.all(jobPromises);
      console.log("[Queue] addJob: all jobs completed, images:", results.flat().length);
      return results;
    } catch (e: any) {
      console.error("[Queue] addJob error:", e.message);
      // Reject pending resolvers so they don't hang forever
      for (const id of jobIds) {
        _jobResolvers.delete(id);
      }
      set(state => ({
        jobs: state.jobs.map(j => jobs.some(bj => bj.id === j.id) ? { ...j, status: 'failed', error: e.message } : j)
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
