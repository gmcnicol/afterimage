import type { ExportProfileDefinition } from '@afterimage/export-profiles';

type ResolutionSource = 'env' | 'path';

export interface CommandSpec {
  label: string;
  binary: string;
  args: string[];
  env?: Record<string, string>;
  cwd?: string;
  expectedOutputs?: string[];
}

export interface AnalysisRequest {
  assetId: string;
  probeOutputPath: string;
  analysisOutputPath: string;
  overwrite?: boolean;
  sceneThreshold?: number;
}

export interface AudioChangeAnalysisRequest {
  assetId: string;
  astatsOutputPath: string;
  aspectralstatsOutputPath: string;
  ebur128OutputPath: string;
  silencedetectOutputPath: string;
  overwrite?: boolean;
}

export interface ThumbnailRequest {
  assetId: string;
  outputPattern: string;
  manifestOutputPath: string;
  overwrite?: boolean;
  width?: number;
}

export interface WaveformRequest {
  assetId: string;
  outputPath: string;
  overwrite?: boolean;
  width?: number;
  height?: number;
}

export interface PreviewRequest {
  sequenceId?: string;
  variantId?: string;
  outputPath: string;
  overwrite?: boolean;
  width?: number;
  height?: number;
  frameRate?: number;
}

export interface ExportRequest {
  sequenceId?: string;
  variantId?: string;
  outputPath: string;
  overwrite?: boolean;
  profile: ExportProfileDefinition;
}

export interface AnalysisPlan {
  projectId: string;
  assetId: string;
  sceneThreshold: number;
  artifacts: {
    probeOutputPath: string;
    analysisOutputPath: string;
  };
  commands: [CommandSpec, CommandSpec];
}

export interface AudioChangeAnalysisPlan {
  projectId: string;
  assetId: string;
  artifacts: {
    astatsOutputPath: string;
    aspectralstatsOutputPath: string;
    ebur128OutputPath: string;
    silencedetectOutputPath: string;
  };
  commands: [CommandSpec, CommandSpec, CommandSpec, CommandSpec];
}

export interface ThumbnailPlan {
  projectId: string;
  assetId: string;
  command: CommandSpec;
  manifestOutputPath: string;
}

export interface WaveformPlan {
  projectId: string;
  assetId: string;
  command: CommandSpec;
}

export interface RenderProfile {
  width: number;
  height: number;
  frameRate: number;
  container: 'mp4' | 'mov';
  videoCodec: 'libx264' | 'prores_ks';
  audioCodec: 'aac' | 'pcm_s24le';
  pixelFormat: 'yuv420p' | 'yuv422p10le';
  videoProfile?: '3';
  crf?: number;
  videoPreset?: 'medium' | 'fast' | 'slow';
  videoMaxrateKbps?: number;
  videoBufsizeKbps?: number;
  audioBitrateKbps?: number;
}

export interface RenderRequest {
  outputPath: string;
  overwrite?: boolean;
  profile: RenderProfile;
  sequenceId?: string;
  variantId?: string;
}

export interface PreviewPlan {
  projectId: string;
  sequenceId: string;
  variantId: string;
  outputPath: string;
  command: CommandSpec;
}

export interface RenderPlan {
  projectId: string;
  sequenceId: string;
  variantId: string;
  outputPath: string;
  command: CommandSpec;
}

export type RenderGraphPlanMode = 'preview' | 'export' | 'render';

export type RenderGraphNodeKind =
  | 'project'
  | 'sequence'
  | 'variant'
  | 'capture-replay'
  | 'input'
  | 'operation'
  | 'artifact';

export type RenderGraphEdgeKind =
  | 'identity'
  | 'timeline'
  | 'capture-input'
  | 'media-input'
  | 'artifact-output';

export type RenderGraphArtifactKind = 'video';

export type RenderGraphArtifactRole =
  | 'preview-output'
  | 'export-output'
  | 'render-output'
  | 'finalize-output';

export type RenderGraphBackend = 'ffmpeg';

export type PreviewCapabilityBackend = RenderGraphBackend | 'webgpu';

export type PreviewCapabilityStatus =
  | 'supported'
  | 'approximated'
  | 'unsupported'
  | 'rejected';

export type RenderGraphCapabilityDiagnosticSeverity = 'info' | 'warning' | 'error';

export interface RenderGraphToolchainIdentity {
  backend: RenderGraphBackend;
  binary: string;
  source: ResolutionSource;
  envVar?: string;
  provenance: FfmpegProvenance;
}

export interface RenderGraphProvenance {
  planId?: string;
  passId?: string;
  artifactId?: string;
  projectId?: string;
  sequenceId?: string;
  variantId?: string;
  mode?: RenderGraphPlanMode | 'finalize';
  role?: RenderGraphArtifactRole;
  toolchain: RenderGraphToolchainIdentity;
  cacheKey?: string;
  parentCacheKeys?: string[];
  metadata?: Record<string, unknown>;
}

export interface RenderGraphCacheIdentity {
  namespace: string;
  key: string;
  version: 1;
  algorithm: 'sha256';
  inputs: string[];
  status: 'placeholder' | 'derived';
  invalidatesOn?: string[];
  provenance?: RenderGraphProvenance;
}

export interface RenderGraphPlanIdentity {
  schemaVersion: 1;
  planId: string;
  projectId: string;
  sequenceId: string;
  variantId: string;
  mode: RenderGraphPlanMode;
}

export interface RenderGraphInputReference {
  id: string;
  assetId: string;
  path: string;
  mediaType?: string;
  role?: string;
  loop: boolean;
  inputIndex: number;
}

export interface RenderGraphNode {
  id: string;
  kind: RenderGraphNodeKind;
  label: string;
  cacheIdentity?: RenderGraphCacheIdentity;
  metadata?: Record<string, unknown>;
}

export interface RenderGraphEdge {
  id: string;
  from: string;
  to: string;
  kind: RenderGraphEdgeKind;
  label?: string;
  metadata?: Record<string, unknown>;
}

export interface RenderGraphArtifact {
  id: string;
  kind: RenderGraphArtifactKind;
  role: RenderGraphArtifactRole;
  path: string;
  profile: RenderProfile;
  producedBy: string;
  cacheIdentity: RenderGraphCacheIdentity;
  provenance: RenderGraphProvenance;
}

export interface RenderGraphBackendRequirement {
  id: string;
  backend: RenderGraphBackend;
  binary: string;
  required: boolean;
  capabilities: string[];
  provenance?: FfmpegProvenance;
  metadata?: Record<string, unknown>;
}

export interface RenderGraphCapabilityDiagnostic {
  id: string;
  severity: RenderGraphCapabilityDiagnosticSeverity;
  code: string;
  message: string;
  path?: string;
  nodeId?: string;
  passId?: string;
  requirementId?: string;
}

export interface PreviewBackendIdentity {
  backend: PreviewCapabilityBackend;
  label: string;
  runtime: 'command' | 'webgpu' | 'unknown';
  version?: string;
  metadata?: Record<string, unknown>;
}

export interface PreviewBackendRequirementReport {
  id: string;
  backend: PreviewCapabilityBackend;
  required: boolean;
  capabilities: string[];
  binary?: string;
  sourceRequirementId?: string;
  provenance?: FfmpegProvenance;
  metadata?: Record<string, unknown>;
}

export interface PreviewCapability {
  id: string;
  label: string;
  capability: string;
  backend?: PreviewCapabilityBackend;
  requirementIds?: string[];
  diagnosticIds?: string[];
  metadata?: Record<string, unknown>;
}

export interface PreviewCapabilityDegradation {
  id: string;
  label: string;
  reason: string;
  capabilityIds?: string[];
  diagnosticIds?: string[];
  metadata?: Record<string, unknown>;
}

export interface PreviewCapabilityRejectionReason {
  id: string;
  label: string;
  reason: string;
  severity: RenderGraphCapabilityDiagnosticSeverity;
  diagnosticCode: string;
  capabilityIds?: string[];
  diagnosticIds?: string[];
  requirementIds?: string[];
  metadata?: Record<string, unknown>;
}

export interface PreviewRuntimeDiagnostics {
  environment?: 'node' | 'browser' | 'electron' | 'unknown';
  renderer?: string;
  available?: boolean;
  diagnostics?: string[];
  metadata?: Record<string, unknown>;
}

export interface PreviewDeviceDiagnostics {
  adapterName?: string;
  vendorId?: number;
  deviceId?: number;
  architecture?: string;
  features?: string[];
  limits?: Record<string, number>;
  lost?: boolean;
  diagnostics?: string[];
  metadata?: Record<string, unknown>;
}

export interface PreviewCapabilityReport {
  schemaVersion: 1;
  id: string;
  status: PreviewCapabilityStatus;
  backend: PreviewBackendIdentity;
  renderGraph: {
    planId: string;
    projectId: string;
    sequenceId: string;
    variantId: string;
    mode: RenderGraphPlanMode;
    passIds: string[];
    artifactIds: string[];
    requirementIds: string[];
    diagnosticIds: string[];
  };
  target: {
    outputPath: string;
    profile: RenderProfile;
    durationMs: number;
  };
  backendRequirements: PreviewBackendRequirementReport[];
  requiredCapabilities: PreviewCapability[];
  optionalCapabilities: PreviewCapability[];
  degradations: PreviewCapabilityDegradation[];
  rejectionReasons: PreviewCapabilityRejectionReason[];
  diagnostics: RenderGraphCapabilityDiagnostic[];
  runtimeDiagnostics?: PreviewRuntimeDiagnostics;
  deviceDiagnostics?: PreviewDeviceDiagnostics;
  metadata?: Record<string, unknown>;
}

export interface BuildPreviewCapabilityReportOptions {
  backend?: PreviewBackendIdentity;
  status?: PreviewCapabilityStatus;
  optionalCapabilities?: PreviewCapability[];
  degradations?: PreviewCapabilityDegradation[];
  rejectionReasons?: PreviewCapabilityRejectionReason[];
  runtimeDiagnostics?: PreviewRuntimeDiagnostics;
  deviceDiagnostics?: PreviewDeviceDiagnostics;
  metadata?: Record<string, unknown>;
}

export interface CaptureReplayIdentity {
  projectId: string;
  compositionId: string;
  sequenceId: string;
  variantId: string;
  captureLogId: string;
  captureSessionId?: string;
  replayEventIds: string[];
}

export interface CaptureReplayFilterOverride {
  eventId: string;
  routeId?: string;
  seedId?: string;
  captureTimeMs: number;
  compositionTimeMs: number;
  filterId: string;
  property: string;
  value: number;
  mappingKind: 'linear' | 'step' | 'trigger';
}

export interface CaptureReplayDiagnosticSource {
  eventId?: string;
  path?: string;
  code: string;
  message: string;
}

export interface CaptureReplayRenderContext {
  identity: CaptureReplayIdentity;
  filterOverrides: CaptureReplayFilterOverride[];
  skippedEvents?: CaptureReplayDiagnosticSource[];
  diagnostics?: CaptureReplayDiagnosticSource[];
}

export type CaptureReplayRenderGraphPlanResult =
  | {
      ok: true;
      plan: RenderGraphPlan;
      diagnostics: RenderGraphCapabilityDiagnostic[];
    }
  | {
      ok: false;
      diagnostics: RenderGraphCapabilityDiagnostic[];
      plan?: undefined;
    };

export interface RenderGraphPass {
  id: string;
  backend: RenderGraphBackend;
  label: string;
  nodeId: string;
  order: number;
  inputNodeIds: string[];
  outputArtifactIds: string[];
  command: CommandSpec;
  requirements: string[];
  diagnostics: string[];
  cacheIdentity: RenderGraphCacheIdentity;
  invalidatesOn: string[];
  provenance: RenderGraphProvenance;
  semantics: {
    operation: RenderGraphPlanMode;
    profile: RenderProfile;
    durationMs: number;
    usesMaskTransitions: boolean;
    chunkedExportRecommended: boolean;
    captureReplay?: {
      captureSessionId?: string;
      captureLogId: string;
      replayEventIds: string[];
      filterOverrideCount: number;
      skippedEventCount: number;
    };
  };
}

export interface RenderGraphPlan {
  identity: RenderGraphPlanIdentity;
  target: {
    outputPath: string;
    profile: RenderProfile;
    durationMs: number;
  };
  inputs: RenderGraphInputReference[];
  nodes: RenderGraphNode[];
  edges: RenderGraphEdge[];
  passes: RenderGraphPass[];
  artifacts: RenderGraphArtifact[];
  backendRequirements: RenderGraphBackendRequirement[];
  diagnostics: RenderGraphCapabilityDiagnostic[];
  cacheIdentity: RenderGraphCacheIdentity;
}

export interface FinalizeRenderRequest {
  concatListPath: string;
  outputPath: string;
  overwrite?: boolean;
  profile: RenderProfile;
  durationMs: number;
  musicPath?: string;
  inputArtifacts?: RenderGraphArtifact[];
}

export interface FinalizeRenderPlan {
  outputPath: string;
  command: CommandSpec;
  artifact: RenderGraphArtifact;
  cacheIdentity: RenderGraphCacheIdentity;
}

export interface ToolVersionInfo {
  path: string;
  versionLine?: string;
  available: boolean;
}

export interface ToolHealthReport {
  available: boolean;
  versions: {
    ffmpeg: ToolVersionInfo;
    ffprobe: ToolVersionInfo;
    ffplay?: ToolVersionInfo;
  };
  warnings: string[];
}

export interface FfmpegProvenance {
  source: ResolutionSource;
  license: 'LGPL';
  lgplOnly: true;
  notes: string;
}

export interface ResolvedToolBinary {
  path: string;
  source: ResolutionSource;
  envVar?: string;
  provenance: FfmpegProvenance;
}

export interface ResolvedFfmpegTools {
  ffmpeg: ResolvedToolBinary;
  ffprobe: ResolvedToolBinary;
  ffplay?: ResolvedToolBinary;
}

export interface ResolveFfmpegToolsOptions {
  env?: NodeJS.ProcessEnv;
}

export interface CommandExecutionResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface CommandRunnerOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
}

export type CommandRunner = (
  binary: string,
  args: string[],
  options: CommandRunnerOptions
) => Promise<CommandExecutionResult>;
