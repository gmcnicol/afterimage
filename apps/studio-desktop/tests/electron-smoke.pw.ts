import { test, expect, _electron as electron } from '@playwright/test';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.join(__dirname, '..', '..', '..');
const fixtureProjectPath = path.join(repoRoot, 'packages', 'test-fixtures', 'src', 'fixtures', 'projects', 'core-engine.project.json');

async function createFixtureProjectCopy(): Promise<string> {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'afterimage-e2e-'));
  const projectRoot = path.join(tempRoot, 'project');
  const projectFilePath = path.join(projectRoot, 'studio-fixture.afterimage.json');
  const rawProject = await readFile(fixtureProjectPath, 'utf8');
  const project = JSON.parse(rawProject) as Record<string, unknown>;

  await mkdir(projectRoot, { recursive: true });
  await writeFile(projectFilePath, `${JSON.stringify(project, null, 2)}\n`, 'utf8');

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
    await expect(window.locator('nav[aria-label="Workflow navigation"]')).toBeVisible();

    const runtimeInfo = await window.evaluate(async () => {
      return await window.afterimage?.shell.getRuntimeInfo();
    });

    expect(runtimeInfo?.electron).toBeTruthy();
  } finally {
    await electronApp.close();
  }
});

test('loads a project and can open Media and Export without renderer crashes', async () => {
  test.skip(process.env.AFTERIMAGE_RUN_ELECTRON_SMOKE !== '1', 'Set AFTERIMAGE_RUN_ELECTRON_SMOKE=1 after approving Electron build scripts.');

  const projectPath = await createFixtureProjectCopy();
  const electronApp = await launchStudio(projectPath);

  try {
    const window = await electronApp.firstWindow();
    const pageErrors: string[] = [];
    window.on('pageerror', (error) => {
      pageErrors.push(error.message);
    });

    await expect(window.locator('.studio-hero__headline h2')).toHaveText('Project');
    await expect(window.locator('.studio-shell__project-title')).toHaveText('Studio Fixture');
    await expect(window.getByRole('heading', { name: 'Project Home' })).toBeVisible();

    await window.locator('nav[aria-label="Workflow navigation"]').getByRole('button', { name: /^Media/ }).click();
    await expect(window.getByRole('heading', { name: 'Media Library' })).toBeVisible();
    await expect(window.getByRole('heading', { name: 'Analysis Queue' })).toBeVisible();
    await expect(window.getByRole('button', { name: /Source Alpha/ })).toBeVisible();

    await window.locator('nav[aria-label="Workflow navigation"]').getByRole('button', { name: /^Export/ }).click();
    await expect(window.getByRole('heading', { name: 'Export Profiles' })).toBeVisible();
    await expect(window.getByRole('heading', { name: 'Render Queue' })).toBeVisible();

    expect(pageErrors).toEqual([]);
  } finally {
    await electronApp.close();
  }
});
