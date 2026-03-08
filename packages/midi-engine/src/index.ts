export interface MidiEvent {
  channel: number;
  type: 'note-on' | 'note-off' | 'cc';
  data1: number;
  data2: number;
  timestampMs: number;
}

export function quantizeToGrid(timestampMs: number, gridMs: number): number {
  if (gridMs <= 0) {
    return timestampMs;
  }
  return Math.round(timestampMs / gridMs) * gridMs;
}
