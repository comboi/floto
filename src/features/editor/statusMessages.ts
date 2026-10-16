export const STATUS_MESSAGES = {
  ready: 'READY',
  noImageLoaded: 'NO IMAGE LOADED',
  booting: 'BOOTING FLOTO...',
  renderingPreview: 'RENDERING PREVIEW...',
  previewUpdated: 'PREVIEW UPDATED',
  loadSourceFirst: 'LOAD A SOURCE IMAGE FIRST',
  exportingFullResolution: 'EXPORTING FULL RESOLUTION...',
  dropOnlyImages: 'DROP ONLY IMAGE FILES',
  sourceLoaded: 'SOURCE PHOTO LOADED',
  sourceLoadedFromDrop: 'SOURCE PHOTO LOADED FROM DROP',
  allAdjustmentsReset: 'ALL ADJUSTMENTS RESET',
  recipeRemoved: 'RECIPE REMOVED',
  layerRemoved: 'LAYER REMOVED',
} as const;

export function statusSourceLoadedWithLayers(count: number): string {
  return `SOURCE LOADED + ${count} LAYERS ADDED`;
}

export function statusCustomLayersAdded(count: number): string {
  return `${count} CUSTOM LAYER(S) ADDED`;
}

export function statusRecipeSaved(name: string): string {
  return `RECIPE SAVED: ${name.toUpperCase()}`;
}

export function statusRecipeApplied(name: string): string {
  return `RECIPE APPLIED: ${name.toUpperCase()}`;
}

export function statusFilmPresetApplied(label: string): string {
  return `FILM PRESET APPLIED: ${label.toUpperCase()}`;
}

export function statusExportCompleted(path: string): string {
  return `EXPORT COMPLETED: ${path}`;
}

export function statusExportFailed(error: unknown): string {
  return `EXPORT FAILED: ${String(error)}`;
}

export function statusRenderFailed(error: unknown): string {
  return `RENDER FAILED: ${String(error)}`;
}
