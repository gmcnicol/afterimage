import type { Preset } from '@afterimage/project-model';

export const starterPresets: Preset[] = [
  {
    id: 'preset-vhs-rental-tape',
    name: 'Rental Tape',
    family: 'vhs',
    filters: [
      { type: 'tracking-wobble', amount: 0.35 },
      { type: 'chroma-bleed', amount: 0.25 }
    ]
  },
  {
    id: 'preset-liminal-fluorescent-dream',
    name: 'Fluorescent Dream',
    family: 'liminal',
    filters: [
      { type: 'fluorescent-flicker', amount: 0.2 },
      { type: 'desaturation-lfo', amount: 0.4 }
    ]
  }
];
