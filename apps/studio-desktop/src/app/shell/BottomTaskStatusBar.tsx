import { useMemo } from 'react';
import { useJobsStore } from '../../stores/jobs-store';
import { useUiStore } from '../../stores/ui-store';
import { getJobProgress, sortJobsByRelevance } from './task-routing';

export function BottomTaskStatusBar() {
  const jobs = useJobsStore((state) => state.jobs);
  const selectedTaskId = useUiStore((state) => state.selectedTaskId);
  const selectTask = useUiStore((state) => state.selectTask);
  const counts = useMemo(() => ({
    queued: jobs.filter((job) => job.status === 'queued').length,
    running: jobs.filter((job) => job.status === 'running').length,
    failed: jobs.filter((job) => job.status === 'failed').length,
    completed: jobs.filter((job) => job.status === 'completed').length
  }), [jobs]);
  const taskSnippets = useMemo(() => sortJobsByRelevance(jobs).slice(0, 5), [jobs]);

  return (
    <section className="studio-statusbar" aria-label="Async task status">
      <div className="studio-statusbar__counts">
        <span className="studio-statusbar__label">Tasks</span>
        <span className="studio-statusbar__count">Queued {counts.queued}</span>
        <span className="studio-statusbar__count">Running {counts.running}</span>
        <span className="studio-statusbar__count">Failed {counts.failed}</span>
        <span className="studio-statusbar__count">Done {counts.completed}</span>
      </div>
      <div className="studio-statusbar__tasks">
        {taskSnippets.length > 0 ? taskSnippets.map((job) => {
          const progress = getJobProgress(job);
          const label = progress !== undefined && job.status === 'running' ? `${job.status} ${progress}%` : job.status;
          return (
            <button
              key={job.id}
              type="button"
              className={`studio-statusbar__task${selectedTaskId === job.id ? ' is-current' : ''}`}
              onClick={() => selectTask(job.id)}
              title={`${job.type}: ${job.target}`}
            >
              <span>{job.type}</span>
              <span className={`job-row__status status-${job.status}`}>{label}</span>
              <span className="studio-statusbar__task-target">{job.target}</span>
            </button>
          );
        }) : (
          <span className="studio-statusbar__empty">No background work</span>
        )}
      </div>
    </section>
  );
}
