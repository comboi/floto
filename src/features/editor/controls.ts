import type { Adjustments } from './types';

type NumericAdjustmentKey = Exclude<keyof Adjustments, 'filmStock'>;
export type AdjustmentSection = 'Core' | 'Film Tone' | 'Film Grain' | 'Halation';

export type AdjustmentControl = {
  key: NumericAdjustmentKey;
  section: AdjustmentSection;
  label: string;
  min: number;
  max: number;
  step: number;
};

export const adjustmentControls: AdjustmentControl[] = [
  { key: 'exposure', section: 'Core', label: 'Exposure', min: -2, max: 2, step: 0.05 },
  { key: 'contrast', section: 'Core', label: 'Contrast', min: -1, max: 1, step: 0.01 },
  { key: 'saturation', section: 'Core', label: 'Saturation', min: -1, max: 1, step: 0.01 },
  { key: 'temperature', section: 'Core', label: 'Temperature', min: -1, max: 1, step: 0.01 },
  { key: 'vignette', section: 'Core', label: 'Vignette', min: 0, max: 1, step: 0.01 },
  { key: 'filmStrength', section: 'Film Tone', label: 'Film Strength', min: 0, max: 1.5, step: 0.01 },
  { key: 'fade', section: 'Film Tone', label: 'Fade', min: 0, max: 1, step: 0.01 },
  { key: 'tintShift', section: 'Film Tone', label: 'Tint Shift', min: -1, max: 1, step: 0.01 },
  { key: 'splitShadows', section: 'Film Tone', label: 'Split Shadows', min: 0, max: 1, step: 0.01 },
  { key: 'splitHighlights', section: 'Film Tone', label: 'Split Highlights', min: 0, max: 1, step: 0.01 },
  { key: 'splitBalance', section: 'Film Tone', label: 'Split Balance', min: -1, max: 1, step: 0.01 },
  { key: 'grain', section: 'Film Grain', label: 'Film Grain', min: 0, max: 1, step: 0.01 },
  { key: 'grainSize', section: 'Film Grain', label: 'Grain Size', min: 0, max: 1, step: 0.01 },
  { key: 'grainClump', section: 'Film Grain', label: 'Grain Clump', min: 0, max: 1, step: 0.01 },
  { key: 'grainChroma', section: 'Film Grain', label: 'Grain Chroma', min: 0, max: 1, step: 0.01 },
  { key: 'grainSoftness', section: 'Film Grain', label: 'Grain Softness', min: 0, max: 1, step: 0.01 },
  { key: 'halationAmount', section: 'Halation', label: 'Halation Amount', min: 0, max: 1, step: 0.01 },
  { key: 'halationRadius', section: 'Halation', label: 'Halation Radius', min: 0, max: 1, step: 0.01 },
  { key: 'halationWarmth', section: 'Halation', label: 'Halation Warmth', min: 0, max: 1, step: 0.01 },
];

export function getGroupedAdjustmentControls() {
  const sectionOrder: AdjustmentSection[] = ['Core', 'Film Tone', 'Film Grain', 'Halation'];
  const grouped = new Map<AdjustmentSection, AdjustmentControl[]>();

  for (const section of sectionOrder) {
    grouped.set(section, []);
  }

  for (const control of adjustmentControls) {
    grouped.get(control.section)?.push(control);
  }

  return sectionOrder
    .map((section) => ({ section, controls: grouped.get(section) ?? [] }))
    .filter((entry) => entry.controls.length > 0);
}
