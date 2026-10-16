import type {
  Adjustments,
  FilmPresetId,
  SavedRecipe,
} from './types';
import { neutralAdjustments } from './config';

const STORAGE_KEY = 'floto.recipes.v1';

export function loadRecipes(): SavedRecipe[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedRecipe[];
    if (!Array.isArray(parsed)) return [];
    return parsed.map((recipe) => ({
      ...recipe,
      adjustments: { ...neutralAdjustments, ...recipe.adjustments },
    }));
  } catch {
    return [];
  }
}

export function saveRecipes(recipes: SavedRecipe[]): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(recipes));
}

export function createRecipe(
  name: string,
  presetId: FilmPresetId,
  adjustments: Adjustments,
): SavedRecipe {
  return {
    id: `recipe-${Date.now()}-${Math.round(Math.random() * 1_000_000)}`,
    name,
    presetId,
    adjustments: { ...neutralAdjustments, ...adjustments },
  };
}
