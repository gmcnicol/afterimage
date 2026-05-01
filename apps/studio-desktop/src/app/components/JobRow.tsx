import type { DesktopJob } from '../../lib/studio-client';
import { getStudioClient } from '../../lib/studio-client';
import { useUiStore } from '../../stores/ui-store';
import { ToolbarButton } from './ToolbarButton';

export function JobRow({ job }: { job: DesktopJob }) {
  const api = getStudioClient();
  const addNotification = useUiStore((state) => state.addNotification);
  const cancellable = job.status === 'queued' || job.status === 'running';
  const retryable = job.status === 'failed' || job.status === 'cancelled';
  const progress = typeof job.progress === 'number'
    ? Math.max(0, Math.min(100, Math.round(job.progress * 100)))
    : undefined;
  const statusText = progress !== undefined && job.status === 'running'
    ? `${job.status} ${progress}%`
    : job.status;

  return (
    <div className="job-row" title={`${job.type}: ${job.target}`}>
      <div className="job-row__main">
        <div className="job-row__topline">
          <span className="job-row__type">{job.type}</span>
          <span className={`job-row__status status-${job.status}`}>{statusText}</span>
          {progress !== undefined ? (
            <span className="job-row__progress" aria-label={`Progress ${progress}%`}>
              <span className="job-row__progress-bar" style={{ width: `${progress}%` }} />
            </span>
          ) : null}
        </div>
        <div className="job-row__target">{job.target}</div>
      </div>
      {(cancellable || retryable) ? (
        <div className="job-row__actions">
          {cancellable ? (
            <ToolbarButton onClick={() => void api.jobs.cancel(job.id).then((cancelled) => {
              addNotification(cancelled ? `Cancelled job ${job.id}.` : `Job ${job.id} is no longer running.`, cancelled ? 'success' : 'warn');
            })} style={{ padding: '3px 7px', fontSize: 11 }}>Cancel</ToolbarButton>
          ) : null}
          {retryable ? (
            <ToolbarButton onClick={() => void api.jobs.retry(job.id).then((retried) => {
              addNotification(retried ? `Retried job ${job.id}.` : `Job ${job.id} cannot be retried.`, retried ? 'success' : 'warn');
            })} style={{ padding: '3px 7px', fontSize: 11 }}>Retry</ToolbarButton>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
