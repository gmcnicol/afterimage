import type { DesktopJob } from '@afterimage/studio-contracts';
import type { EnqueueJob, JobResult, LibraryJobType, QueueClass } from './types.js';

export function createLibraryJobs({ enqueue }: { enqueue: EnqueueJob }) {
  function runLibraryJob(input: {
    type: LibraryJobType;
    target: string;
    queueClass?: QueueClass;
    run(signal: AbortSignal, report: (message: string, progress: number) => void): Promise<JobResult>;
  }): DesktopJob {
    return enqueue({
      type: input.type,
      target: input.target,
      queueClass: input.queueClass ?? 'analysis',
      run: input.run
    });
  }

  return { runLibraryJob };
}
