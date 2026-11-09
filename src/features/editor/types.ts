export type Adjustments = {
  exposure: number;
  contrast: number;
  saturation: number;
  temperature: number;
  filmStock: string;
  filmStrength: number;
  tintShift: number;
  fade: number;
  grain: number;
  grainSize: number;
  grainClump: number;
  grainChroma: number;
  grainSoftness: number;
  splitShadows: number;
  splitHighlights: number;
  splitBalance: number;
  halationAmount: number;
  halationRadius: number;
  halationWarmth: number;
  vignette: number;
};

export type LayerKind = 'color' | 'image';

export type Layer = {
  id: string;
  name: string;
  kind: LayerKind;
  enabled: boolean;
  opacity: number;
  blendMode: string;
  color: [number, number, number];
  intensity: number;
  imagePath: string | null;
};

export type DefaultState = {
  adjustments: Adjustments;
  layers: Layer[];
};

export type RenderInfo = {
  width: number;
  height: number;
  previewWidth: number;
  previewHeight: number;
};

export type RenderResponse = {
  dataUrl: string;
  info: RenderInfo;
};

export type FilmPresetId =
  | 'none'
  | 'portra400'
  | 'portra400_over'
  | 'agfa_vista_400'
  | 'ilfordhp5_400'
  | 'ilfordhp5_800'
  | 'ilfordhp5_1600';

export type FilmPreset = {
  label: string;
  adjustments: Adjustments;
  profile?: ProfileMeta;
};

/** Internal traceability for a film profile: which stock it models and what it was calibrated against. */
export type ProfileMeta = {
  stock: string;
  iso: number | null;
  /** Reference scenes used for the last calibration, or null when the profile is not calibrated. */
  calibration: string[] | null;
};

export type SavedRecipe = {
  id: string;
  name: string;
  presetId: FilmPresetId;
  adjustments: Adjustments;
  /** Optional so recipes saved before B.3 still load. */
  profile?: ProfileMeta;
};
