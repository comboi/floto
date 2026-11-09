import { beforeEach, describe, expect, it } from 'vitest';
import { createRecipe, loadRecipes, saveRecipes } from './recipes';
import { filmPresets, neutralAdjustments } from './config';

describe('recipes profile metadata', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('stores the preset profile on a new recipe', () => {
    const profile = filmPresets.ilfordhp5_400.profile;
    const recipe = createRecipe('hp5', 'ilfordhp5_400', neutralAdjustments, profile);

    expect(recipe.profile).toEqual({ stock: 'ilfordhp5_400', iso: 400, calibration: ['juego1', 'juego2', 'leica'] });
  });

  it('leaves profile out when none is given, so old callers keep working', () => {
    const recipe = createRecipe('plain', 'none', neutralAdjustments);

    expect(recipe).not.toHaveProperty('profile');
  });

  it('loads recipes saved before B.3 without a profile', () => {
    const legacy = [{ id: 'old-1', name: 'old', presetId: 'portra400', adjustments: neutralAdjustments }];
    window.localStorage.setItem('floto.recipes.v1', JSON.stringify(legacy));

    const loaded = loadRecipes();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].profile).toBeUndefined();
    expect(loaded[0].adjustments.grain).toBe(neutralAdjustments.grain);
  });

  it('round-trips a recipe with its profile through storage', () => {
    const recipe = createRecipe('rt', 'portra400', neutralAdjustments, filmPresets.portra400.profile);
    saveRecipes([recipe]);

    expect(loadRecipes()[0].profile).toEqual(filmPresets.portra400.profile);
  });

  it('keeps each preset profile stock equal to its preset key', () => {
    for (const [id, preset] of Object.entries(filmPresets)) {
      expect(preset.profile?.stock).toBe(id);
    }
  });

  it('gives every film stock an ISO, except the neutral preset', () => {
    for (const [id, preset] of Object.entries(filmPresets)) {
      if (id === 'none') {
        expect(preset.profile?.iso).toBeNull();
      } else {
        expect(preset.profile?.iso).not.toBeNull();
      }
    }
    expect(filmPresets.ilfordhp5_800.profile?.iso).toBe(800);
    expect(filmPresets.ilfordhp5_1600.profile?.iso).toBe(1600);
  });
});
