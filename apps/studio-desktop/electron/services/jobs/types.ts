import type {
  DesktopJob,
  RunAnalysisRequest,
  RunExportRequest,
  RunPreviewRequest
} from '@afterimage/studio-contracts';

export type QueueClass = 'analysis' | 'heavy';
export type JobResult = NonNullable<DesktopJob['result']>;
export type RetryPayload =
  | ({ kind: 'analysis' } & RunAnalysisRequest)
  | ({ kind: 'preview' } & RunPreviewRequest)
  | ({ kind: 'export' } & RunExportRequest);
export type LibraryJobType = 'library-scan' | 'library-analysis';
export type JobWithRetry = DesktopJob & { retryPayload?: RetryPayload };

export interface JobTask {
  jobId: string;
  queueClass: QueueClass;
  retryPayload?: RetryPayload;
  run(signal: AbortSignal, report: (message: string, progress: number) => void): Promise<JobResult>;
}

export interface EnqueueJobInput {
  type: DesktopJob['type'];
  target: string;
  queueClass: QueueClass;
  retryPayload?: RetryPayload;
  run: JobTask['run'];
}

export type EnqueueJob = (input: EnqueueJobInput) => DesktopJob;
