import { create } from 'zustand';
import type { DiagnosticsSnapshot, LogEntry } from '../lib/desktop-api';

interface DiagnosticsStoreState {
  report?: DiagnosticsSnapshot;
  logs: LogEntry[];
  setReport: (report: DiagnosticsSnapshot) => void;
  setLogs: (logs: LogEntry[]) => void;
}

export const useDiagnosticsStore = create<DiagnosticsStoreState>((set) => ({
  logs: [],
  setReport: (report) => set({ report }),
  setLogs: (logs) => set({ logs })
}));
