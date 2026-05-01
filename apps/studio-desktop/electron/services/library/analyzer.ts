import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { buildAnalysisPlan, executeCommandSpec, resolveFfmpegTools } from '@afterimage/ffmpeg-compiler';
import { createAnalysisFile, parseFfprobeOutput, parseSceneDetectionOutput } from '@afterimage/media-analysis';
import { createEmptyProject } from '@afterimage/project-model';
import type { LibraryAsset } from '@afterimage/studio-contracts';
import {
  firstVideoStream,
  nowIso,
  parseFrameRate,
  toSqlBool
} from './utils.js';

export function createLibraryAnalyzer({ db, dataRoot }: { db: DatabaseSync; dataRoot: string }) {
  async function probeAsset(asset: LibraryAsset, signal?: AbortSignal): Promise<void> {
    const tools = resolveFfmpegTools();
    const analysisRoot = path.join(dataRoot, 'analysis');
    await mkdir(analysisRoot, { recursive: true });
    const probeOutputPath = path.join(analysisRoot, `${asset.id}.ffprobe.json`);
    const analysisLogPath = path.join(analysisRoot, `${asset.id}.scene.log`);
    const analysisSidecarPath = path.join(analysisRoot, `${asset.id}.analysis.json`);

    db.prepare('UPDATE library_assets SET analysis_status = ?, updated_at = ? WHERE id = ?').run('running', nowIso(), asset.id);
    try {
      const probeResult = await executeCommandSpec({
        label: `library-probe:${asset.filename}`,
        binary: tools.ffprobe.path,
        args: ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', asset.path]
      }, { signal });
      await writeFile(probeOutputPath, probeResult.stdout, 'utf8');

      const probe = parseFfprobeOutput(probeResult.stdout);
      const videoStream = firstVideoStream(probe);
      let sceneCuts: ReturnType<typeof parseSceneDetectionOutput>['sceneCuts'] = [];

      if (asset.mediaType === 'video') {
        const project = createEmptyProject({
          id: 'catalog-analysis',
          name: 'Catalog Analysis'
        });
        const analysisProject = {
          ...project,
          assets: [{
            id: asset.id,
            filename: asset.filename,
            mediaType: asset.mediaType,
            assetRole: asset.assetRole,
            path: { absolutePath: asset.path },
            hasAudio: asset.hasAudio,
            importStatus: 'ready' as const,
            analysisStatus: 'running' as const
          }]
        };
        const plan = buildAnalysisPlan(analysisProject, {
          assetId: asset.id,
          probeOutputPath,
          analysisOutputPath: analysisLogPath
        }, tools);
        const sceneResult = await executeCommandSpec(plan.commands[1], { signal });
        const sceneLog = [sceneResult.stdout, sceneResult.stderr].filter(Boolean).join('\n');
        await writeFile(analysisLogPath, sceneLog, 'utf8');
        sceneCuts = parseSceneDetectionOutput(sceneLog).sceneCuts;
      }

      const analysisFile = createAnalysisFile(`analysis-${asset.id}`, asset.id, probe, sceneCuts);
      await writeFile(analysisSidecarPath, `${JSON.stringify(analysisFile, null, 2)}\n`, 'utf8');

      db.exec('BEGIN');
      try {
        db.prepare(`
          UPDATE library_assets
          SET duration_ms = ?, width = ?, height = ?, frame_rate = ?, has_audio = ?, analysis_status = ?, updated_at = ?
          WHERE id = ?
        `).run(
          probe.durationMs,
          videoStream?.width ?? null,
          videoStream?.height ?? null,
          parseFrameRate(videoStream?.avgFrameRate) ?? null,
          toSqlBool(probe.streams.some((stream) => stream.codecType === 'audio')),
          'completed',
          nowIso(),
          asset.id
        );
        db.prepare(`
          INSERT INTO library_analysis_refs (asset_id, id, path, summary, updated_at)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(asset_id) DO UPDATE SET
            id = excluded.id,
            path = excluded.path,
            summary = excluded.summary,
            updated_at = excluded.updated_at
        `).run(asset.id, `analysis-${asset.id}`, analysisSidecarPath, JSON.stringify(analysisFile.summary ?? null), nowIso());
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    } catch (error) {
      db.prepare('UPDATE library_assets SET analysis_status = ?, updated_at = ? WHERE id = ?').run('failed', nowIso(), asset.id);
      throw error;
    }
  }

  return { probeAsset };
}
