import { useCallback, useEffect, useState } from 'react';
import { filmPresets, neutralAdjustments } from '../config';
import { mapLayersForPreset } from '../layers';
import { createRecipe, loadRecipes, saveRecipes } from '../recipes';
import { renderPreview } from '../api/editorApi';
import {
  STATUS_MESSAGES,
  statusFilmPresetApplied,
  statusRecipeApplied,
  statusRecipeSaved,
} from '../statusMessages';
import type { Adjustments, DefaultState, FilmPresetId, Layer, SavedRecipe } from '../types';

export function useEditorState() {
  const [adjustments, setAdjustments] = useState<Adjustments | null>(null);
  const [layers, setLayers] = useState<Layer[]>([]);
  const [selectedPreset, setSelectedPreset] = useState<FilmPresetId>('none');
  const [recipes, setRecipes] = useState<SavedRecipe[]>([]);
  const [recipeNameInput, setRecipeNameInput] = useState('');
  const [hoveredLayerId, setHoveredLayerId] = useState<string | null>(null);
  const [layerPreviewCache, setLayerPreviewCache] = useState<Record<string, string>>({});

  useEffect(() => {
    setRecipes(loadRecipes());
  }, []);

  useEffect(() => {
    saveRecipes(recipes);
  }, [recipes]);

  const hydrateFromDefault = useCallback((state: DefaultState) => {
    setAdjustments(state.adjustments);
    setLayers(state.layers);
  }, []);

  const setAdjustment = useCallback((key: keyof Adjustments, value: number) => {
    setAdjustments((current) => (current ? { ...current, [key]: value } : current));
  }, []);

  const resetAllAdjustments = useCallback(() => {
    setAdjustments({ ...neutralAdjustments });
    setSelectedPreset('none');
    return STATUS_MESSAGES.allAdjustmentsReset;
  }, []);

  const saveCurrentRecipe = useCallback(() => {
    if (!adjustments) return null;
    const recipeName = recipeNameInput.trim() || `Recipe ${recipes.length + 1}`;
    const next = [createRecipe(recipeName, selectedPreset, adjustments), ...recipes].slice(0, 20);
    setRecipes(next);
    setRecipeNameInput('');
    return statusRecipeSaved(recipeName);
  }, [adjustments, recipeNameInput, recipes, selectedPreset]);

  const applyRecipe = useCallback((recipeId: string) => {
    const recipe = recipes.find((entry) => entry.id === recipeId);
    if (!recipe) return null;
    setAdjustments({ ...recipe.adjustments });
    setSelectedPreset(recipe.presetId);
    setLayers((current) => mapLayersForPreset(current, recipe.presetId));
    return statusRecipeApplied(recipe.name);
  }, [recipes]);

  const deleteRecipe = useCallback((recipeId: string) => {
    setRecipes((current) => current.filter((entry) => entry.id !== recipeId));
    return STATUS_MESSAGES.recipeRemoved;
  }, []);

  const applyFilmPreset = useCallback((presetId: FilmPresetId) => {
    const preset = filmPresets[presetId];
    setAdjustments({ ...preset.adjustments });
    setSelectedPreset(presetId);
    setLayers((current) => mapLayersForPreset(current, presetId));
    return statusFilmPresetApplied(preset.label);
  }, []);

  const updateLayer = useCallback((id: string, patch: Partial<Layer>) => {
    setLayers((current) => current.map((layer) => (layer.id === id ? { ...layer, ...patch } : layer)));
  }, []);

  const removeLayer = useCallback((id: string) => {
    setLayers((current) => current.filter((layer) => layer.id !== id));
    setLayerPreviewCache((current) => {
      if (!current[id]) return current;
      const next = { ...current };
      delete next[id];
      return next;
    });
    return STATUS_MESSAGES.layerRemoved;
  }, []);

  const prefetchLayerPreview = useCallback(async (layer: Layer) => {
    if (layer.kind !== 'image' || !layer.imagePath || layerPreviewCache[layer.id]) return;
    try {
      const response = await renderPreview({
        path: layer.imagePath,
        previewMaxSide: 320,
        adjustments: neutralAdjustments,
        layers: [],
      });
      setLayerPreviewCache((current) => ({ ...current, [layer.id]: response.dataUrl }));
    } catch {
      setLayerPreviewCache((current) => ({ ...current, [layer.id]: '' }));
    }
  }, [layerPreviewCache]);

  return {
    adjustments,
    setAdjustments,
    layers,
    setLayers,
    selectedPreset,
    recipes,
    recipeNameInput,
    setRecipeNameInput,
    hoveredLayerId,
    setHoveredLayerId,
    layerPreviewCache,
    hydrateFromDefault,
    setAdjustment,
    resetAllAdjustments,
    saveCurrentRecipe,
    applyRecipe,
    deleteRecipe,
    applyFilmPreset,
    updateLayer,
    removeLayer,
    prefetchLayerPreview,
  };
}
