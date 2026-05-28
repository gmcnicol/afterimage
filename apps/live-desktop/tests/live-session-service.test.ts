import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseProject } from '@afterimage/schema-validators';
import { fixtureProject } from '../../../packages/test-fixtures/src/index.js';
import {
  buildLiveSessionSnapshotFromProject,
  createLiveSessionService
} from '../electron/services/live-session-service.js';

describe('@afterimage/live-desktop live session service', () => {
  const tmpRoots: string[] = [];

  afterEach(async () => {
    await Promise.all(tmpRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  async function writeProjectFile(project = fixtureProject): Promise<string> {
    const root = await mkdtemp(path.join(tmpdir(), 'afterimage-live-session-'));
    tmpRoots.push(root);
    const projectPath = path.join(root, 'studio-fixture.afterimage.json');
    await writeFile(projectPath, JSON.stringify(project, null, 2), 'utf8');
    return projectPath;
  }

  it('returns blocked readiness when no project path is supplied', async () => {
    const snapshot = await createLiveSessionService({}).getSession();

    expect(snapshot.readiness.status).toBe('blocked');
    expect(snapshot.readiness.previewStatus).toBe('not-evaluated');
    expect(snapshot.readiness.diagnostics).toEqual([{
      id: 'diagnostic:live-session:no-project',
      severity: 'error',
      code: 'LIVE_SESSION_NO_PROJECT',
      message: 'No project file was supplied. Start Live Desktop with --project /path/to/project.afterimage.json.',
      source: 'live-session'
    }]);
  });

  it('resolves the canonical fixture session and supported preview readiness', async () => {
    const projectPath = await writeProjectFile();
    const snapshot = await createLiveSessionService({ projectPath }).getSession();

    expect(snapshot.projectPath).toBe(projectPath);
    expect(snapshot.projectRoot).toBe(path.dirname(projectPath));
    expect(snapshot.compositionRef).toEqual({
      projectId: 'project-core-engine-fixture',
      projectName: 'Studio Fixture',
      compositionId: 'composition-main',
      compositionName: 'Studio Fixture',
      sequenceId: 'sequence-main',
      sequenceName: 'Main Sequence',
      variantId: 'variant-main',
      variantName: 'Assembly A'
    });
    expect(snapshot.readiness.status).toBe('ready');
    expect(snapshot.readiness.previewStatus).toBe('supported');
    expect(snapshot.readiness.report?.renderGraph).toEqual(expect.objectContaining({
      projectId: 'project-core-engine-fixture',
      sequenceId: 'sequence-main',
      variantId: 'variant-main',
      mode: 'preview'
    }));
    expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot);
  });

  it('returns blocked readiness with resolver diagnostics for broken composition refs', () => {
    const project = parseProject(fixtureProject);
    const snapshot = buildLiveSessionSnapshotFromProject({
      ...project,
      composition: {
        ...project.composition,
        sequenceId: 'sequence-missing'
      }
    }, '/tmp/studio-fixture.afterimage.json');

    expect(snapshot.readiness.status).toBe('blocked');
    expect(snapshot.readiness.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        source: 'composition-resolver',
        code: 'COMPOSITION_MISSING_REFERENCE',
        path: 'composition.sequenceId',
        message: 'Composition "composition-main" references missing sequence "sequence-missing".'
      })
    ]));
  });

  it('surfaces missing deterministic seed references as readiness diagnostics', () => {
    const project = parseProject(fixtureProject);
    const snapshot = buildLiveSessionSnapshotFromProject({
      ...project,
      composition: {
        ...project.composition,
        deterministicSeeds: []
      }
    }, '/tmp/studio-fixture.afterimage.json');

    expect(snapshot.readiness.status).toBe('blocked');
    expect(snapshot.readiness.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        source: 'composition-resolver',
        code: 'COMPOSITION_MISSING_REFERENCE',
        path: 'composition.modulationRoutes.route-bloom-midi.seedId',
        message: 'Modulation route "route-bloom-midi" references missing deterministic seed "seed-composition-main".'
      })
    ]));
  });
});
