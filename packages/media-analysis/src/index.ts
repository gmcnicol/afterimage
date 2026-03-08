export interface ThumbnailJob {
  sourceId: string;
  path: string;
}

export interface SceneAnalysisSummary {
  sourceId: string;
  sceneCount: number;
}

export function summarizeScenes(sourceId: string, sceneCount: number): SceneAnalysisSummary {
  return { sourceId, sceneCount };
}
