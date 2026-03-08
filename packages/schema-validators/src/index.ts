import Ajv from 'ajv';
import projectSchema from '../../../schemas/project.schema.json';
import presetSchema from '../../../schemas/preset.schema.json';
import sequenceSchema from '../../../schemas/sequence.schema.json';
import analysisSchema from '../../../schemas/analysis.schema.json';
import midiMappingSchema from '../../../schemas/midi-mapping.schema.json';

const ajv = new Ajv({ allErrors: true });

export const validateProject = ajv.compile(projectSchema);
export const validatePreset = ajv.compile(presetSchema);
export const validateSequence = ajv.compile(sequenceSchema);
export const validateAnalysis = ajv.compile(analysisSchema);
export const validateMidiMapping = ajv.compile(midiMappingSchema);
