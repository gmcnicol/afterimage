import type { AnalysisFile, MidiMappingFile, ProjectFile } from '@afterimage/project-model';
import fixtureProjectJson from './fixtures/projects/core-engine.project.json';
import fixtureAnalysisJson from './fixtures/analysis/source-alpha.analysis.json';
import fixtureMidiJson from './fixtures/midi/studio-controls.midi-mapping.json';
import fixtureFfprobeJson from './fixtures/logs/source-alpha.ffprobe.json';
import fixtureSceneLog from './fixtures/logs/source-alpha.scene.log.json';

export const fixtureProject = fixtureProjectJson as ProjectFile;
export const fixtureAnalysis = fixtureAnalysisJson as AnalysisFile;
export const fixtureMidiMapping = fixtureMidiJson as MidiMappingFile;
export const fixtureFfprobeOutput = JSON.stringify(fixtureFfprobeJson, null, 2);
export const fixtureSceneDetectionLog = fixtureSceneLog.contents;
