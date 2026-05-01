import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from '@playwright/test';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.join(__dirname, '..');
const electronMain = path.join(appRoot, 'dist-electron', 'electron', 'main.js');

const projectPath = process.argv[2];

if (!projectPath) {
  console.error('Usage: node scripts/exercise-project-export.mjs <project-file>');
  process.exit(1);
}

const projectRoot = path.dirname(projectPath);
const expectedOutputPath = path.join(projectRoot, 'exports', 'afterimagetest1-landscape-master.mp4');

async function waitForFile(filePath, timeoutMs = 600000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const stat = await fs.stat(filePath);
      if (stat.size > 0) {
        return stat;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error(`Timed out waiting for ${filePath}`);
}

const electronApp = await electron.launch({
  args: [electronMain, '--project', projectPath]
});

try {
  const window = await electronApp.firstWindow();
  const pageErrors = [];

  window.on('pageerror', (error) => {
    pageErrors.push(error.message);
  });

  await window.waitForLoadState('domcontentloaded');
  await window.getByRole('button', { name: 'Project', exact: true }).click();
  await window.getByRole('button', { name: 'Media', exact: true }).click();
  await window.getByRole('button', { name: 'Cuts', exact: true }).click();
  await window.waitForTimeout(1500);
  await window.getByRole('button', { name: 'Sequence', exact: true }).click();
  await window.waitForTimeout(1000);
  await window.getByRole('button', { name: 'Music', exact: true }).click();
  await window.waitForTimeout(1000);
  await window.getByRole('button', { name: 'Export', exact: true }).click();
  await window.getByText('Export Profiles', { exact: true }).waitFor({ timeout: 15000 });
  await window.getByRole('button', { name: 'Export Enabled Profiles' }).click();

  await waitForFile(expectedOutputPath);

  const jobs = await window.evaluate(async () => {
    return await window.afterimage.invoke('query', 'jobs.list', undefined);
  });

  const failedJobs = jobs.filter((job) => job.status === 'failed');
  if (failedJobs.length > 0) {
    throw new Error(`Export job failed: ${failedJobs.map((job) => `${job.id} ${job.target}`).join(', ')}`);
  }

  if (pageErrors.length > 0) {
    throw new Error(`Renderer errors: ${pageErrors.join(' | ')}`);
  }

  console.log(expectedOutputPath);
} finally {
  await electronApp.close();
}
