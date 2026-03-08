import { describe, expect, it } from 'vitest';
import { buildExportFilename, getExportProfileById } from '../src';

describe('@afterimage/export-profiles', () => {
  it('builds deterministic filenames for export variants', () => {
    const profile = getExportProfileById('portrait-short-form');

    expect(buildExportFilename(
      { name: 'Afterimage Fixture' },
      { name: 'Main Sequence' },
      { name: 'Assembly A' },
      profile
    )).toBe('afterimage-fixture-main-sequence-assembly-a-portrait-short-form.mp4');

    expect(buildExportFilename(
      { name: 'Afterimage Fixture' },
      { name: 'Main Sequence' },
      { name: 'Assembly A' },
      profile,
      2
    )).toBe('afterimage-fixture-main-sequence-assembly-a-portrait-short-form-2.mp4');
  });
});
