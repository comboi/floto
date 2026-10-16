import { useCallback } from 'react';
import type { Adjustments, FilmPresetId, Layer } from '../types';

type EditorActionsDeps = {
  setStatusMessage: (message: string) => void;
  applyOptionalStatus: (message: string | null) => void;
  setIsInteracting: (value: boolean) => void;
  setHoveredLayerId: (id: string | null) => void;
  prefetchLayerPreview: (layer: Layer) => Promise<void>;
  saveCurrentRecipe: () => string | null;
  applyRecipe: (recipeId: string) => string | null;
  deleteRecipe: (recipeId: string) => string;
  applyFilmPreset: (presetId: FilmPresetId) => string;
  setAdjustment: (key: keyof Adjustments, value: number) => void;
  resetAllAdjustments: () => string;
  removeLayer: (id: string) => string;
};

export function useEditorActions(deps: EditorActionsDeps) {
  const onSaveRecipe = useCallback(() => {
    deps.applyOptionalStatus(deps.saveCurrentRecipe());
  }, [deps]);

  const onApplyRecipe = useCallback((recipeId: string) => {
    deps.applyOptionalStatus(deps.applyRecipe(recipeId));
  }, [deps]);

  const onDeleteRecipe = useCallback((recipeId: string) => {
    deps.setStatusMessage(deps.deleteRecipe(recipeId));
  }, [deps]);

  const onApplyFilmPreset = useCallback((presetId: FilmPresetId) => {
    deps.setStatusMessage(deps.applyFilmPreset(presetId));
  }, [deps]);

  const onSetAdjustment = useCallback((key: keyof Adjustments, value: number) => {
    deps.setAdjustment(key, value);
  }, [deps]);

  const onInteractionStart = useCallback(() => {
    deps.setIsInteracting(true);
  }, [deps]);

  const onInteractionEnd = useCallback(() => {
    deps.setIsInteracting(false);
  }, [deps]);

  const onResetAll = useCallback(() => {
    deps.setStatusMessage(deps.resetAllAdjustments());
  }, [deps]);

  const onHoverLayer = useCallback((layer: Layer) => {
    deps.setHoveredLayerId(layer.id);
    void deps.prefetchLayerPreview(layer);
  }, [deps]);

  const onLeaveLayer = useCallback(() => {
    deps.setHoveredLayerId(null);
  }, [deps]);

  const onRemoveLayer = useCallback((id: string) => {
    deps.setStatusMessage(deps.removeLayer(id));
  }, [deps]);

  return {
    onSaveRecipe,
    onApplyRecipe,
    onDeleteRecipe,
    onApplyFilmPreset,
    onSetAdjustment,
    onInteractionStart,
    onInteractionEnd,
    onResetAll,
    onHoverLayer,
    onLeaveLayer,
    onRemoveLayer,
  };
}
