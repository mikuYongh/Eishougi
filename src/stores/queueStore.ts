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
  addJob: (project: any, workflowId?: string) => Promise<void>;
  removeJob: (id: string) => void;
  clearCompleted: () => void;
  connect: () => void;
  disconnect: () => void;
}

export const useQueueStore = create<QueueStore>((set, get) => ({
  jobs: [],
  isConnected: false,

  connect: () => {
    if (get().isConnected) return;
    
    comfyService.connect(
      (progress) => {
        set(state => {
          // Find the first non-completed/non-failed job
          const activeIndex = state.jobs.findIndex(j => j.status === 'pending' || j.status === 'generating');
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
      },
      async (images) => {
        let completedJob: QueueJob | null = null;
        
        set(state => {
          const activeIndex = state.jobs.findIndex(j => j.status === 'generating' || j.status === 'pending');
          if (activeIndex === -1) return state;
          
          const newJobs = [...state.jobs];
          completedJob = {
            ...newJobs[activeIndex],
            status: 'completed',
            progress: 100,
            images
          };
          newJobs[activeIndex] = completedJob;
          return { jobs: newJobs };
        });

        // Save history entry
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
            }
          } catch (e) {
            console.error("Failed to save history from queue:", e);
          }
        }
      },
      (error) => {
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
        set({ isConnected: status === 'connected' });
      }
    );
  },

  disconnect: () => {
    comfyService.disconnect();
    set({ isConnected: false });
  },

  addJob: async (project: any, workflowId?: string) => {
    const job: QueueJob = {
      id: "job_" + Date.now(),
      projectId: project.id,
      projectTitle: project.title,
      status: 'pending',
      progress: 0,
      workflowId: workflowId,
      createdAt: Date.now()
    };

    set(state => ({ jobs: [...state.jobs, job] }));

    try {
      // Connect if not connected
      if (!get().isConnected) {
        get().connect();
      }

      let wfString = "";
      if (workflowId) {
        try {
          const w = await invoke('get_workflow', { id: workflowId }) as any;
          if (w && w.jsonContent) {
            wfString = w.jsonContent;
          }
        } catch (e) {
          console.warn("Failed to fetch workflow, falling back to default", e);
        }
      }

      if (!wfString) {
        const defaultWorkflow = (await import('../assets/default_workflow.json')).default;
        wfString = JSON.stringify(defaultWorkflow);
      }
      
      const injectedWf = comfyService.injectParameters(wfString, project);
      if (!injectedWf) throw new Error("Failed to construct workflow JSON");

      await comfyService.queuePrompt(injectedWf);
    } catch (e: any) {
      set(state => ({
        jobs: state.jobs.map(j => j.id === job.id ? { ...j, status: 'failed', error: e.message } : j)
      }));
    }
  },

  removeJob: (id) => {
    set(state => ({ jobs: state.jobs.filter(j => j.id !== id) }));
  },

  clearCompleted: () => {
    set(state => ({ jobs: state.jobs.filter(j => j.status === 'pending' || j.status === 'generating') }));
  }
}));
