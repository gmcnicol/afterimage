import type {
  DesktopJob,
  JobLaunchResult,
  RunAnalysisRequest,
  RunExportRequest,
  RunPreviewRequest
} from '@afterimage/studio-contracts';
import { createAnalysisJobs } from './jobs/analysis-job.js';
import { createExportJobs } from './jobs/export-job.js';
import { createLibraryJobs } from './jobs/library-job.js';
import { createPreviewJobs } from './jobs/preview-job.js';
import {
  createProgressRunner,
  parseFfmpegProgressRecords,
  parseFfmpegProgressTimeToMs
} from './jobs/progress.js';
import { createJobQueue } from './jobs/queue.js';
import { retryPayload } from './jobs/retry.js';
import type { JobResult, LibraryJobType, QueueClass } from './jobs/types.js';
import type { Logger } from './logger.js';

interface JobManagerOptions {
  logger: Logger;
  onJobsChanged(jobs: DesktopJob[]): void;
}

export {
  createProgressRunner,
  parseFfmpegProgressRecords,
  parseFfmpegProgressTimeToMs
};

export function createJobManager({ logger, onJobsChanged }: JobManagerOptions) {
  const queue = createJobQueue({ logger, onJobsChanged });
  const { runAnalysis } = createAnalysisJobs({
    logger,
    enqueue: queue.enqueue,
    findActiveAnalysisJob: queue.findActiveAnalysisJob
  });
  const { runPreview } = createPreviewJobs({ logger, enqueue: queue.enqueue });
  const { runExport } = createExportJobs({ logger, enqueue: queue.enqueue });
  const { runLibraryJob } = createLibraryJobs({ enqueue: queue.enqueue });

  function launchResult(jobs: DesktopJob | DesktopJob[] | null): JobLaunchResult {
    const queuedJobs = Array.isArray(jobs) ? jobs : jobs ? [jobs] : [];
    return {
      jobIds: queuedJobs.map((job) => job.id)
    };
  }

  async function retry(jobId: string): Promise<JobLaunchResult> {
    const job = queue.findJob(jobId);
    if (!job?.retryPayload) {
      return { jobIds: [] };
    }

    return launchResult(await retryPayload(job.retryPayload, {
      runAnalysis,
      runPreview: async (input: RunPreviewRequest) => runPreview(input),
      runExport: async (input: RunExportRequest) => runExport(input)
    }));
  }

  return {
    list(): DesktopJob[] {
      return queue.list();
    },
    async runAnalysis(input: RunAnalysisRequest): Promise<JobLaunchResult> {
      return launchResult(await runAnalysis(input));
    },
    async runPreview(input: RunPreviewRequest): Promise<JobLaunchResult> {
      return launchResult(runPreview(input));
    },
    async runExport(input: RunExportRequest): Promise<JobLaunchResult> {
      return launchResult(runExport(input));
    },
    runLibraryJob(input: {
      type: LibraryJobType;
      target: string;
      queueClass?: QueueClass;
      run(signal: AbortSignal, report: (message: string, progress: number) => void): Promise<JobResult>;
    }): DesktopJob {
      return runLibraryJob(input);
    },
    cancel: queue.cancel,
    retry
  };
}
