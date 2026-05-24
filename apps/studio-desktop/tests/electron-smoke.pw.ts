import { test, expect, _electron as electron } from '@playwright/test';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.join(__dirname, '..', '..', '..');
const fixtureProjectPath = path.join(repoRoot, 'packages', 'test-fixtures', 'src', 'fixtures', 'projects', 'core-engine.project.json');
const fixtureArchivePath = path.join(repoRoot, 'packages', 'test-fixtures', 'src', 'fixtures', 'archive', 'source-alpha.archive.json');

async function createFixtureProjectCopy(): Promise<string> {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'afterimage-e2e-'));
  const projectRoot = path.join(tempRoot, 'project');
  const projectFilePath = path.join(projectRoot, 'studio-fixture.afterimage.json');
  const rawProject = await readFile(fixtureProjectPath, 'utf8');
  const rawArchive = await readFile(fixtureArchivePath, 'utf8');
  const project = JSON.parse(rawProject) as Record<string, unknown>;

  await mkdir(path.join(projectRoot, '.afterimage', 'archive'), { recursive: true });
  await writeFile(projectFilePath, `${JSON.stringify(project, null, 2)}\n`, 'utf8');
  await writeFile(path.join(projectRoot, '.afterimage', 'archive', 'archive-source-alpha.archive.json'), rawArchive, 'utf8');

  return projectFilePath;
}

async function launchStudio(projectPath?: string) {
  const args = [path.join(__dirname, '..', 'dist-electron', 'electron', 'main.js')];
  if (projectPath) {
    args.push('--project', projectPath);
  }

  return electron.launch({ args });
}

test('boots the Studio Desktop shell and exposes preload APIs', async () => {
  test.skip(process.env.AFTERIMAGE_RUN_ELECTRON_SMOKE !== '1', 'Set AFTERIMAGE_RUN_ELECTRON_SMOKE=1 after approving Electron build scripts.');

  const electronApp = await launchStudio();

  try {
    const window = await electronApp.firstWindow();
    await expect(window.getByRole('navigation', { name: 'Studio spaces' })).toBeVisible();
    await expect(window.locator('nav[aria-label="Workflow navigation"]')).toHaveCount(0);
    await expect(window.getByRole('button', { name: 'Archive', exact: true })).toBeVisible();
    await expect(window.getByRole('button', { name: 'World', exact: true })).toBeVisible();
    await expect(window.getByRole('button', { name: 'Performance', exact: true })).toBeVisible();
    await expect(window.getByRole('button', { name: 'Capture', exact: true })).toBeVisible();
    await expect(window.getByRole('button', { name: 'Observatory', exact: true })).toBeVisible();
    await expect(window.getByLabel('Async task status')).toBeVisible();

    const runtimeInfo = await window.evaluate(async () => {
      return await window.afterimage?.invoke('query', 'shell.getRuntimeInfo', undefined);
    });

    expect(runtimeInfo?.electron).toBeTruthy();
    const bridgeShape = await window.evaluate(() => ({
      hasInvoke: typeof window.afterimage?.invoke === 'function',
      hasSubscribe: typeof window.afterimage?.subscribe === 'function',
      exposesNestedShell: 'shell' in (window.afterimage ?? {})
    }));
    expect(bridgeShape).toEqual({
      hasInvoke: true,
      hasSubscribe: true,
      exposesNestedShell: false
    });
  } finally {
    await electronApp.close();
  }
});

test('loads a project and can open Archive, World, Performance, Capture, and Observatory without renderer crashes', async () => {
  test.skip(process.env.AFTERIMAGE_RUN_ELECTRON_SMOKE !== '1', 'Set AFTERIMAGE_RUN_ELECTRON_SMOKE=1 after approving Electron build scripts.');

  const projectPath = await createFixtureProjectCopy();
  const electronApp = await launchStudio(projectPath);

  try {
    const window = await electronApp.firstWindow();
    const pageErrors: string[] = [];
    window.on('pageerror', (error) => {
      pageErrors.push(error.message);
    });

    const spaces = window.getByRole('navigation', { name: 'Studio spaces' });
    await expect(window.getByLabel('Archive workspace')).toBeVisible();
    await expect(window.getByLabel('Archive workspace').getByText('Studio Fixture')).toBeVisible();
    await expect(window.getByRole('heading', { name: 'Archive sidecars' })).toBeVisible();
    await expect(window.getByText('archive-source-alpha').first()).toBeVisible();
    await expect(window.getByText('hallway concrete affinity')).toBeVisible();

    await spaces.getByRole('button', { name: 'World' }).click();
    await expect(window.getByLabel('World workspace')).toBeVisible();
    await expect(window.getByLabel('World creation surface')).toBeVisible();
    await expect(window.getByRole('heading', { name: 'Studio Fixture' })).toBeVisible();
    await expect(window.getByRole('heading', { name: 'Atlas' })).toBeVisible();
    await expect(window.getByRole('heading', { name: 'Main Scene field' })).toBeVisible();
    await expect(window.getByText('Intro Source').first()).toBeVisible();

    await spaces.getByRole('button', { name: 'Performance' }).click();
    await expect(window.getByLabel('Performance workspace')).toBeVisible();
    await expect(window.getByLabel('Performance Space')).toBeVisible();
    await expect(window.getByRole('heading', { name: 'Studio Fixture' })).toBeVisible();
    await expect(window.getByRole('heading', { name: 'Rehearsal Set' })).toBeVisible();
    await expect(window.getByRole('heading', { name: 'Main Scene universe' })).toBeVisible();
    await expect(window.getByText('Intro Source').first()).toBeVisible();
    await expect(window.getByLabel('Performance preview and replay output strip').getByRole('button', { name: 'Coalesce' })).toBeVisible();
    await expect(window.getByText('rehearsal ready')).toBeVisible();

    await spaces.getByRole('button', { name: 'Capture' }).click();
    await expect(window.getByLabel('Capture workspace')).toBeVisible();
    await expect(window.getByRole('heading', { name: 'Export', exact: true })).toBeVisible();
    await expect(window.getByRole('heading', { name: 'Export Queue' })).toBeVisible();

    await spaces.getByRole('button', { name: 'Observatory' }).click();
    await expect(window.getByLabel('Observatory workspace')).toBeVisible();
    await expect(window.getByLabel('Observatory Space')).toBeVisible();
    await expect(window.getByRole('heading', { name: 'Studio Fixture' })).toBeVisible();
    await expect(window.getByText('Observatory Space').first()).toBeVisible();
    await expect(window.getByText(/blockers/).first()).toBeVisible();
    await expect(window.getByText('Bloom MIDI').first()).toBeVisible();
    await expect(window.getByText('entropy-scene-pressure').first()).toBeVisible();
    await expect(window.getByText('FFmpeg toolchain').first()).toBeVisible();
    await expect(window.getByLabel('Observatory activity strip')).toBeVisible();
    await expect(window.getByLabel('Async task status')).toBeVisible();

    expect(pageErrors).toEqual([]);
  } finally {
    await electronApp.close();
  }
});
