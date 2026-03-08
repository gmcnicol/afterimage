export interface AnalysisCommandOptions {
  inputPath: string;
  outputPath: string;
  sceneThreshold?: number;
}

export interface RenderCommandOptions {
  inputPath: string;
  outputPath: string;
  presetName?: string;
}

export function buildSceneAnalysisCommand(options: AnalysisCommandOptions): string[] {
  const threshold = options.sceneThreshold ?? 0.4;
  return [
    'ffmpeg',
    '-i', options.inputPath,
    '-vf', `select='gt(scene,${threshold})',showinfo`,
    '-f', 'null',
    options.outputPath
  ];
}

export function buildRenderCommand(options: RenderCommandOptions): string[] {
  return [
    'ffmpeg',
    '-i', options.inputPath,
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', '18',
    '-c:a', 'aac',
    options.outputPath
  ];
}
