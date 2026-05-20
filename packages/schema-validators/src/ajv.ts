import Ajv2020 from 'ajv/dist/2020.js';
import type {
  AnalysisFile,
  ArchiveMetadataFile,
  MidiMappingFile,
  Preset,
  ProjectFile,
  Sequence
} from '@afterimage/project-model';
import sharedDefsSchema from '../../../schemas/shared-defs.schema.json' with { type: 'json' };
import projectSchema from '../../../schemas/project.schema.json' with { type: 'json' };
import presetSchema from '../../../schemas/preset.schema.json' with { type: 'json' };
import sequenceSchema from '../../../schemas/sequence.schema.json' with { type: 'json' };
import analysisSchema from '../../../schemas/analysis.schema.json' with { type: 'json' };
import archiveSchema from '../../../schemas/archive.schema.json' with { type: 'json' };
import midiMappingSchema from '../../../schemas/midi-mapping.schema.json' with { type: 'json' };

const ajv = new Ajv2020({
  allErrors: true,
  strict: true,
  useDefaults: true
});

ajv.addSchema(sharedDefsSchema);

export const projectValidator = ajv.compile<ProjectFile>(projectSchema);
export const presetValidator = ajv.compile<Preset>(presetSchema);
export const sequenceValidator = ajv.compile<Sequence>(sequenceSchema);
export const analysisValidator = ajv.compile<AnalysisFile>(analysisSchema);
export const archiveValidator = ajv.compile<ArchiveMetadataFile>(archiveSchema);
export const midiMappingValidator = ajv.compile<MidiMappingFile>(midiMappingSchema);
