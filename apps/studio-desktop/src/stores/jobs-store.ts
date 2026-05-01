import { create } from 'zustand';
import type { DesktopJob } from '../lib/studio-client';

interface JobsStoreState {
  jobs: DesktopJob[];
  setJobs: (jobs: DesktopJob[]) => void;
  upsertJobs: (jobs: DesktopJob[]) => void;
}

export const useJobsStore = create<JobsStoreState>((set) => ({
  jobs: [],
  setJobs: (jobs) => set({ jobs }),
  upsertJobs: (incomingJobs) => {
    set((state) => {
      const next = new Map(state.jobs.map((job) => [job.id, job]));
      for (const job of incomingJobs) {
        next.set(job.id, job);
      }

      return {
        jobs: [...next.values()].sort((left, right) => left.id.localeCompare(right.id))
      };
    });
  }
}));
