import type { DesktopJob, RunAnalysisRequest, RunExportRequest, RunPreviewRequest } from '@afterimage/studio-contracts';
import type { RetryPayload } from './types.js';

export interface RetryHandlers {
  runAnalysis(input: RunAnalysisRequest): Promise<DesktopJob[]>;
  runPreview(input: RunPreviewRequest): Promise<DesktopJob>;
  runExport(input: RunExportRequest): Promise<DesktopJob[]>;
}

export async function retryPayload(payload: RetryPayload, handlers: RetryHandlers): Promise<DesktopJob | null> {
  if (payload.kind === 'analysis') {
    const [retried] = await handlers.runAnalysis(payload);
    return retried ?? null;
  }
  if (payload.kind === 'preview') {
    return await handlers.runPreview(payload);
  }
  if (payload.kind === 'export') {
    const [retried] = await handlers.runExport(payload);
    return retried ?? null;
  }

  return null;
}
