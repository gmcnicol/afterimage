import type { DesktopJob } from '@afterimage/studio-contracts';
import type { Logger } from '../logger.js';
import type { EnqueueJobInput, JobTask, JobWithRetry, QueueClass } from './types.js';

interface JobQueueOptions {
  logger: Logger;
  onJobsChanged(jobs: DesktopJob[]): void;
}

export function createJobQueue({ logger, onJobsChanged }: JobQueueOptions) {
  let jobs: JobWithRetry[] = [];
  const running = new Map<string, AbortController>();
  const queue: JobTask[] = [];
  const limits: Record<QueueClass, number> = {
    analysis: 1,
    heavy: 1
  };
  const activeCounts: Record<QueueClass, number> = {
    analysis: 0,
    heavy: 0
  };

  function snapshot(): DesktopJob[] {
    return jobs
      .slice()
      .sort((left, right) => left.id.localeCompare(right.id))
      .map(({ retryPayload: _retryPayload, ...job }) => job);
  }

  function updateJob(jobId: string, patch: Partial<JobWithRetry>): void {
    jobs = jobs.map((job) => job.id === jobId ? { ...job, ...patch } : job);
    onJobsChanged(snapshot());
  }

  function enqueue(input: EnqueueJobInput): DesktopJob {
    const job: JobWithRetry = {
      id: `job-${input.type}-${jobs.length + 1}`,
      type: input.type,
      target: input.target,
      status: 'queued',
      log: [],
      retryPayload: input.retryPayload
    };
    jobs = [...jobs, job];
    queue.push({
      jobId: job.id,
      queueClass: input.queueClass,
      run: input.run,
      retryPayload: input.retryPayload
    });
    onJobsChanged(snapshot());
    pump();
    const { retryPayload: _retryPayload, ...publicJob } = job;
    return publicJob;
  }

  function pump(): void {
    for (const queueClass of ['analysis', 'heavy'] as QueueClass[]) {
      while (activeCounts[queueClass] < limits[queueClass]) {
        const index = queue.findIndex((task) => task.queueClass === queueClass);
        if (index < 0) {
          break;
        }

        const [task] = queue.splice(index, 1);
        activeCounts[queueClass] += 1;
        void startTask(task);
      }
    }
  }

  async function startTask(task: JobTask): Promise<void> {
    const queuedJob = jobs.find((job) => job.id === task.jobId);
    if (!queuedJob || queuedJob.status !== 'queued') {
      activeCounts[task.queueClass] -= 1;
      pump();
      return;
    }

    const controller = new AbortController();
    running.set(task.jobId, controller);
    updateJob(task.jobId, {
      status: 'running',
      startedAt: new Date().toISOString(),
      progress: 0
    });

    try {
      const result = await task.run(controller.signal, (message, progress) => {
        if (controller.signal.aborted) {
          return;
        }
        updateJob(task.jobId, {
          log: [...(jobs.find((job) => job.id === task.jobId)?.log ?? []), message].slice(-12),
          progress
        });
      });
      if (controller.signal.aborted) {
        throw new DOMException(`Job "${task.jobId}" aborted.`, 'AbortError');
      }
      updateJob(task.jobId, {
        status: 'completed',
        endedAt: new Date().toISOString(),
        progress: 1,
        result
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const aborted = error instanceof Error && error.name === 'AbortError';
      updateJob(task.jobId, {
        status: aborted ? 'cancelled' : 'failed',
        endedAt: new Date().toISOString(),
        error: message,
        log: [...(jobs.find((job) => job.id === task.jobId)?.log ?? []), message].slice(-12)
      });
      await logger.log('error', `Job ${task.jobId} failed.`, message);
    } finally {
      running.delete(task.jobId);
      activeCounts[task.queueClass] -= 1;
      pump();
    }
  }

  async function cancel(jobId: string): Promise<boolean> {
    const queuedIndex = queue.findIndex((task) => task.jobId === jobId);
    if (queuedIndex >= 0) {
      queue.splice(queuedIndex, 1);
      updateJob(jobId, {
        status: 'cancelled',
        endedAt: new Date().toISOString(),
        log: [...(jobs.find((job) => job.id === jobId)?.log ?? []), 'Cancelled before execution.'].slice(-12)
      });
      return true;
    }

    const controller = running.get(jobId);
    if (!controller) {
      return false;
    }
    controller.abort();
    updateJob(jobId, {
      status: 'cancelled',
      endedAt: new Date().toISOString(),
      log: [...(jobs.find((job) => job.id === jobId)?.log ?? []), 'Cancellation requested.'].slice(-12)
    });
    return true;
  }

  function findJob(jobId: string): JobWithRetry | undefined {
    return jobs.find((candidate) => candidate.id === jobId);
  }

  function findActiveAnalysisJob(): DesktopJob | undefined {
    const job = jobs.find((candidate) =>
      candidate.type === 'analysis' && (candidate.status === 'queued' || candidate.status === 'running')
    );
    if (!job) {
      return undefined;
    }
    const { retryPayload: _retryPayload, ...publicJob } = job;
    return publicJob;
  }

  return {
    enqueue,
    list: snapshot,
    cancel,
    findJob,
    findActiveAnalysisJob
  };
}
