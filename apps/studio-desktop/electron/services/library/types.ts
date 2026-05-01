import type { Dialog } from 'electron';
import type { StudioAgentOutput } from '@afterimage/studio-contracts';
import type { Logger } from '../logger.js';

export type LibraryJobRunner = (input: {
  type: 'library-scan' | 'library-analysis';
  target: string;
  run(signal: AbortSignal, report: (message: string, progress: number) => Promise<void> | void): Promise<StudioAgentOutput>;
}) => void;

export interface LibraryServiceOptions {
  dialog: Pick<Dialog, 'showOpenDialog'>;
  logger: Logger;
  databasePath: string;
  dataRoot: string;
  runLibraryJob?: LibraryJobRunner;
  autoAnalyze?: boolean;
}

export interface RootRow {
  id: string;
  path: string;
  role: string;
  enabled: number;
  last_scan_status: string;
  last_scan_started_at?: string;
  last_scan_ended_at?: string;
  last_scan_error?: string;
  created_at: string;
  updated_at: string;
}

export interface DirectoryRow {
  id: string;
  root_id: string;
  path: string;
  parent_path?: string;
  file_count: number;
  supported_file_count: number;
  scanned_at: string;
}

export interface AssetRow {
  id: string;
  root_id: string;
  directory_id: string;
  path: string;
  filename: string;
  media_type: string;
  asset_role: string;
  file_size: number;
  mtime_ms: number;
  hash_key: string;
  duration_ms?: number;
  width?: number;
  height?: number;
  frame_rate?: number;
  has_audio: number;
  analysis_status: string;
  missing: number;
  analysis_ref_id?: string;
  analysis_path?: string;
  thumbnail_manifest_path?: string;
  waveform_path?: string;
  analysis_summary?: string;
  scanned_at: string;
  updated_at: string;
}

export interface RootStatusPatch {
  error?: string;
}
