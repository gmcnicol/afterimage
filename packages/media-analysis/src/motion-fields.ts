export type MotionFieldGenerationMode = 'frame-difference' | 'optical-flow';
export type MotionFieldKind = 'motion-magnitude' | 'flow_x' | 'flow_y' | 'edge-turbulence';

export interface MotionFrameBuffer {
  width: number;
  height: number;
  channels?: 1 | 3 | 4;
  data: ArrayLike<number>;
}

export interface MotionFieldGenerationInput {
  previousFrame: MotionFrameBuffer;
  currentFrame: MotionFrameBuffer;
  mode?: MotionFieldGenerationMode;
}

export interface MotionFieldPlane {
  kind: MotionFieldKind;
  width: number;
  height: number;
  values: Float32Array;
}

export interface MotionFieldDiagnostic {
  id: string;
  severity: 'info' | 'warning' | 'error';
  message: string;
}

export interface MotionFieldGenerationResult {
  mode: MotionFieldGenerationMode;
  fields: {
    magnitude: MotionFieldPlane;
    flowX: MotionFieldPlane;
    flowY: MotionFieldPlane;
    edgeTurbulence: MotionFieldPlane;
  };
  diagnostics: MotionFieldDiagnostic[];
}

function assertFrameShape(previousFrame: MotionFrameBuffer, currentFrame: MotionFrameBuffer): void {
  if (previousFrame.width !== currentFrame.width || previousFrame.height !== currentFrame.height) {
    throw new Error('Motion field frames must have identical dimensions.');
  }

  const previousChannels = previousFrame.channels ?? 4;
  const currentChannels = currentFrame.channels ?? 4;
  if (previousFrame.data.length < previousFrame.width * previousFrame.height * previousChannels) {
    throw new Error('Previous motion field frame does not contain enough data.');
  }
  if (currentFrame.data.length < currentFrame.width * currentFrame.height * currentChannels) {
    throw new Error('Current motion field frame does not contain enough data.');
  }
}

function sampleLuma(frame: MotionFrameBuffer, index: number): number {
  const channels = frame.channels ?? 4;
  const offset = index * channels;
  const red = frame.data[offset] ?? 0;
  const green = channels === 1 ? red : frame.data[offset + 1] ?? red;
  const blue = channels === 1 ? red : frame.data[offset + 2] ?? red;
  const luma = (red * 0.2126) + (green * 0.7152) + (blue * 0.0722);

  return luma > 1 ? luma / 255 : luma;
}

export function normalizeMotionField(values: ArrayLike<number>, signed = false): Float32Array {
  let peak = 0;
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index] ?? 0;
    peak = Math.max(peak, signed ? Math.abs(value) : Math.max(0, value));
  }

  if (peak === 0) {
    return new Float32Array(values.length);
  }

  const normalized = new Float32Array(values.length);
  for (let index = 0; index < values.length; index += 1) {
    const value = (values[index] ?? 0) / peak;
    normalized[index] = signed ? Math.max(-1, Math.min(1, value)) : Math.max(0, Math.min(1, value));
  }

  return normalized;
}

function makePlane(kind: MotionFieldKind, width: number, height: number, values: Float32Array): MotionFieldPlane {
  return { kind, width, height, values };
}

export function generateMotionFields(input: MotionFieldGenerationInput): MotionFieldGenerationResult {
  assertFrameShape(input.previousFrame, input.currentFrame);
  const width = input.currentFrame.width;
  const height = input.currentFrame.height;
  const pixelCount = width * height;
  const rawMagnitude = new Float32Array(pixelCount);
  const rawFlowX = new Float32Array(pixelCount);
  const rawFlowY = new Float32Array(pixelCount);
  const rawTurbulence = new Float32Array(pixelCount);
  const diagnostics: MotionFieldDiagnostic[] = [];

  if (input.mode === 'optical-flow') {
    diagnostics.push({
      id: 'motion-field.optical-flow-fallback',
      severity: 'warning',
      message: 'Optical flow generation is not bundled in this runtime; deterministic frame-difference fields were generated instead.'
    });
  }

  for (let index = 0; index < pixelCount; index += 1) {
    rawMagnitude[index] = Math.abs(sampleLuma(input.currentFrame, index) - sampleLuma(input.previousFrame, index));
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width) + x;
      const left = x > 0 ? rawMagnitude[index - 1] : 0;
      const right = x < width - 1 ? rawMagnitude[index + 1] : 0;
      const up = y > 0 ? rawMagnitude[index - width] : 0;
      const down = y < height - 1 ? rawMagnitude[index + width] : 0;
      rawFlowX[index] = right - left;
      rawFlowY[index] = down - up;
      rawTurbulence[index] = Math.abs(rawMagnitude[index] - ((left + right + up + down) / 4));
    }
  }

  const mode: MotionFieldGenerationMode = input.mode === 'optical-flow' ? 'frame-difference' : input.mode ?? 'frame-difference';

  return {
    mode,
    fields: {
      magnitude: makePlane('motion-magnitude', width, height, normalizeMotionField(rawMagnitude)),
      flowX: makePlane('flow_x', width, height, normalizeMotionField(rawFlowX, true)),
      flowY: makePlane('flow_y', width, height, normalizeMotionField(rawFlowY, true)),
      edgeTurbulence: makePlane('edge-turbulence', width, height, normalizeMotionField(rawTurbulence))
    },
    diagnostics
  };
}
