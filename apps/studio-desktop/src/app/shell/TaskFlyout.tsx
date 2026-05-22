import { getStudioClient } from '../../lib/studio-client';
import { useJobsStore } from '../../stores/jobs-store';
import { useUiStore } from '../../stores/ui-store';
import { ToolbarButton } from '../components/ToolbarButton';
import { getWorkspaceDefinition } from './registry';
import { getJobProgress, getJobRoute } from './task-routing';

export function TaskFlyout() {
  const api = getStudioClient();
  const jobs = useJobsStore((state) => state.jobs);
  const selectedTaskId = useUiStore((state) => state.selectedTaskId);
  const selectTask = useUiStore((state) => state.selectTask);
  const setWorkspaceSurface = useUiStore((state) => state.setWorkspaceSurface);
  const addNotification = useUiStore((state) => state.addNotification);
  const job = jobs.find((candidate) => candidate.id === selectedTaskId);

  if (!job) {
    return null;
  }

  const progress = getJobProgress(job);
  const route = getJobRoute(job);
  const owningWorkspace = getWorkspaceDefinition(route.space);
  const cancellable = job.status === 'queued' || job.status === 'running';
  const retryable = job.status === 'failed' || job.status === 'cancelled';
  const logLines = job.log.length > 0 ? job.log : ['No logs yet.'];

  return (
    <aside className="studio-task-flyout" aria-label="Task detail">
      <div className="studio-task-flyout__header">
        <div className="studio-task-flyout__title">
          <strong>{job.type} / {job.status}</strong>
          <span className="studio-task-flyout__subtitle">{job.target}</span>
        </div>
        <ToolbarButton onClick={() => selectTask(undefined)} compact>Close</ToolbarButton>
      </div>
      <div className="studio-task-flyout__section">
        <div className="studio-task-flyout__progress" aria-label={progress !== undefined ? `Progress ${progress}%` : 'Progress unavailable'}>
          <div className="studio-task-flyout__progress-bar" style={{ width: `${progress ?? (job.status === 'completed' ? 100 : 0)}%` }} />
        </div>
      </div>
      <div className="studio-task-flyout__logs studio-scrollable">
        {job.error ? <div className="studio-task-flyout__error">{job.error}</div> : null}
        {logLines.map((line, index) => (
          <div key={`${job.id}-log-${index}`}>{line}</div>
        ))}
      </div>
      <div className="studio-task-flyout__actions">
        <ToolbarButton primary onClick={() => setWorkspaceSurface(route.space, route.tab)}>
          Open {owningWorkspace.label}
        </ToolbarButton>
        {cancellable ? (
          <ToolbarButton onClick={() => void api.jobs.cancel(job.id).then((cancelled) => {
            addNotification(cancelled ? `Cancelled job ${job.id}.` : `Job ${job.id} is no longer running.`, cancelled ? 'success' : 'warn');
          })}>Cancel</ToolbarButton>
        ) : null}
        {retryable ? (
          <ToolbarButton onClick={() => void api.jobs.retry(job.id).then((launch) => {
            const retried = launch.jobIds.length > 0;
            addNotification(retried ? `Retried job ${job.id}.` : `Job ${job.id} cannot be retried.`, retried ? 'success' : 'warn');
          })}>Retry</ToolbarButton>
        ) : null}
      </div>
    </aside>
  );
}
