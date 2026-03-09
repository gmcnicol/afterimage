import type { DesktopJob } from '../../lib/desktop-api';
import { getDesktopApi } from '../../lib/desktop-api';
import { useUiStore } from '../../stores/ui-store';
import { pillStyle, muted } from '../styles';
import { ToolbarButton } from './ToolbarButton';

export function JobRow({ job }: { job: DesktopJob }) {
  const api = getDesktopApi();
  const addNotification = useUiStore((state) => state.addNotification);
  const cancellable = job.status === 'queued' || job.status === 'running';
  const retryable = job.status === 'failed' || job.status === 'cancelled';

  return (
    <div style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 14, background: 'rgba(255,255,255,0.03)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <strong>{job.type}</strong>
          <div style={{ color: muted, fontSize: 13 }}>{job.target}</div>
        </div>
        <span style={pillStyle(job.status === 'completed' ? 'success' : job.status === 'failed' ? 'warn' : 'default')}>{job.status}</span>
      </div>
      {typeof job.progress === 'number' ? (
        <div style={{ color: muted, fontSize: 13, marginTop: 10 }}>Progress {Math.round(job.progress * 100)}%</div>
      ) : null}
      {job.log.length > 0 ? (
        <div style={{ color: muted, fontSize: 13, marginTop: 10 }}>{job.log[job.log.length - 1]}</div>
      ) : null}
      {(cancellable || retryable) ? (
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          {cancellable ? (
            <ToolbarButton onClick={() => void api.jobs.cancel(job.id).then((cancelled) => {
              addNotification(cancelled ? `Cancelled job ${job.id}.` : `Job ${job.id} is no longer running.`, cancelled ? 'success' : 'warn');
            })}>Cancel</ToolbarButton>
          ) : null}
          {retryable ? (
            <ToolbarButton onClick={() => void api.jobs.retry(job.id).then((retried) => {
              addNotification(retried ? `Retried job ${job.id}.` : `Job ${job.id} cannot be retried.`, retried ? 'success' : 'warn');
            })}>Retry</ToolbarButton>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
