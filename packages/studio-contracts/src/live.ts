import type {
  PreviewAdapterReadinessResult,
  PreviewBackendIdentity,
  PreviewCapabilityReport,
  PreviewCapabilityStatus,
  RenderGraphCapabilityDiagnosticSeverity
} from '@afterimage/ffmpeg-compiler';

export type LiveSessionStatus = 'ready' | 'blocked';
export type LivePreviewStatus = PreviewCapabilityStatus | 'not-evaluated';

export type LiveSessionDiagnosticSource =
  | 'live-session'
  | 'project-loader'
  | 'project-parser'
  | 'composition-resolver'
  | 'preview-adapter';

export interface LiveSessionDiagnostic {
  id: string;
  severity: RenderGraphCapabilityDiagnosticSeverity;
  code: string;
  message: string;
  source: LiveSessionDiagnosticSource;
  path?: string;
  nodeId?: string;
  passId?: string;
  requirementId?: string;
}

export interface LiveCompositionRef {
  projectId: string;
  projectName: string;
  compositionId: string;
  compositionName: string;
  sequenceId: string;
  sequenceName: string;
  variantId: string;
  variantName: string;
}

export interface LiveSessionReadiness {
  status: LiveSessionStatus;
  previewStatus: LivePreviewStatus;
  backend: PreviewBackendIdentity;
  diagnostics: LiveSessionDiagnostic[];
  report?: PreviewCapabilityReport;
  adapter?: PreviewAdapterReadinessResult;
}

export interface LiveSessionSnapshot {
  schemaVersion: 1;
  projectPath?: string;
  projectRoot?: string;
  compositionRef?: LiveCompositionRef;
  readiness: LiveSessionReadiness;
}

export interface LiveQueryMap {
  'live.getSession': {
    payload: undefined;
    result: LiveSessionSnapshot;
  };
}

export type LiveQueryRoute = keyof LiveQueryMap & string;

export type LiveInvokeEnvelope = {
  [Route in LiveQueryRoute]: {
    kind: 'query';
    route: Route;
    payload: LiveQueryMap[Route]['payload'];
  }
}[LiveQueryRoute];

export interface LivePreloadBridge {
  invoke<Route extends LiveQueryRoute>(
    kind: 'query',
    route: Route,
    payload: LiveQueryMap[Route]['payload']
  ): Promise<LiveQueryMap[Route]['result']>;
  getSession(): Promise<LiveQueryMap['live.getSession']['result']>;
}
