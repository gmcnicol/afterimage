import { describe, expect, it } from 'vitest';
import type { DesktopJob } from '../../lib/studio-client';
import { getWorkspaceDefinition } from './registry';
import { getJobProgress, getJobRoute, sortJobsByRelevance } from './task-routing';

function job(input: Partial<DesktopJob> & Pick<DesktopJob, 'id' | 'type' | 'status'>): DesktopJob {
  return {
    target: 'target',
    log: [],
    ...input
  } as DesktopJob;
}

describe('studio task routing', () => {
  it('opens Performance on the dedicated Performance surface by default', () => {
    expect(getWorkspaceDefinition('performance')).toMatchObject({
      defaultTab: 'performance',
      surfaces: ['performance']
    });
  });

  it('opens Observatory on the dedicated Observatory surface by default and keeps legacy diagnostics mapped', () => {
    expect(getWorkspaceDefinition('observatory')).toMatchObject({
      defaultTab: 'observatory',
      surfaces: ['observatory', 'diagnostics']
    });
  });

  it('routes job types through registered workspaces', () => {
    expect(getJobRoute(job({ id: 'analysis', type: 'analysis', status: 'queued' }))).toEqual({ space: 'archive', tab: 'archive' });
    expect(getJobRoute(job({ id: 'library', type: 'library-scan', status: 'running' }))).toEqual({ space: 'archive', tab: 'archive' });
    expect(getJobRoute(job({ id: 'preview', type: 'preview', status: 'completed' }))).toEqual({ space: 'performance', tab: 'performance' });
    expect(getJobRoute(job({ id: 'export', type: 'export', status: 'failed' }))).toEqual({ space: 'capture', tab: 'export' });
  });

  it('sorts active and recent jobs ahead of older completed work', () => {
    const jobs = [
      job({ id: 'completed-newer', type: 'export', status: 'completed', endedAt: '2026-01-03T00:00:00Z' }),
      job({ id: 'queued', type: 'analysis', status: 'queued', startedAt: '2026-01-01T00:00:00Z' }),
      job({ id: 'running', type: 'preview', status: 'running', startedAt: '2026-01-01T00:00:00Z' }),
      job({ id: 'failed', type: 'export', status: 'failed', endedAt: '2026-01-02T00:00:00Z' })
    ];

    expect(sortJobsByRelevance(jobs).map((candidate) => candidate.id)).toEqual([
      'running',
      'queued',
      'failed',
      'completed-newer'
    ]);
  });

  it('normalizes fractional progress to a 0-100 integer', () => {
    expect(getJobProgress(job({ id: 'low', type: 'preview', status: 'running', progress: -0.2 }))).toBe(0);
    expect(getJobProgress(job({ id: 'middle', type: 'preview', status: 'running', progress: 0.456 }))).toBe(46);
    expect(getJobProgress(job({ id: 'high', type: 'preview', status: 'running', progress: 1.2 }))).toBe(100);
    expect(getJobProgress(job({ id: 'missing', type: 'preview', status: 'running' }))).toBeUndefined();
  });
});
