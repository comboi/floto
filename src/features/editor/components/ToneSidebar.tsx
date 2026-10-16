import { RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { RangeControl } from './RangeControl';
import type { AdjustmentControl } from '../controls';
import type { Adjustments, FilmPreset, FilmPresetId, SavedRecipe } from '../types';

type GroupedControls = {
  section: string;
  controls: AdjustmentControl[];
};

type ToneSidebarProps = {
  adjustments: Adjustments;
  busy: boolean;
  selectedPreset: FilmPresetId;
  filmPresets: Record<FilmPresetId, FilmPreset>;
  recipes: SavedRecipe[];
  recipeNameInput: string;
  groupedAdjustmentControls: GroupedControls[];
  neutralAdjustments: Adjustments;
  onRecipeNameChange: (value: string) => void;
  onSaveRecipe: () => void;
  onApplyRecipe: (recipeId: string) => void;
  onDeleteRecipe: (recipeId: string) => void;
  onApplyFilmPreset: (presetId: FilmPresetId) => void;
  onSetAdjustment: (key: keyof Adjustments, value: number) => void;
  onInteractionStart: () => void;
  onInteractionEnd: () => void;
  onResetAll: () => void;
};

export function ToneSidebar(props: ToneSidebarProps) {
  return (
    <Card className="rounded-none border-0 border-b border-zinc-700 bg-zinc-900 lg:flex lg:h-full lg:min-h-0 lg:flex-col lg:border-b-0 lg:border-r">
      <CardHeader className="lg:shrink-0">
        <div className="flex items-center justify-between gap-2">
          <CardTitle>Tone Controls</CardTitle>
          <Button type="button" variant="default" size="sm" onClick={props.onResetAll} disabled={props.busy}>
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />Reset
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:px-5 lg:pb-5">
        <div className="space-y-2 border-b border-zinc-800 pb-2.5">
          <p className="text-[10px] font-light uppercase tracking-[0.08em] text-zinc-500">Film Simulations</p>
          <div className="grid grid-cols-2 gap-1.5">
            {(Object.keys(props.filmPresets) as FilmPresetId[]).map((presetId) => (
              <Button
                key={presetId}
                type="button"
                size="sm"
                variant="default"
                className={props.selectedPreset === presetId ? 'border-zinc-300 text-zinc-50' : ''}
                onClick={() => props.onApplyFilmPreset(presetId)}>
                {props.filmPresets[presetId].label}
              </Button>
            ))}
          </div>
        </div>

        <div className="space-y-2 border-b border-zinc-800 pb-2.5">
          <p className="text-[10px] font-light uppercase tracking-[0.08em] text-zinc-500">Recipes</p>
          <div className="flex items-center gap-1.5">
            <input
              value={props.recipeNameInput}
              onChange={(event) => props.onRecipeNameChange(event.target.value)}
              placeholder="Recipe name"
              className="h-7 flex-1 rounded-[2px] border border-zinc-700 bg-zinc-800 px-2 text-[10px] font-light uppercase tracking-[0.08em] text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-zinc-400"
            />
            <Button type="button" size="sm" variant="default" className="h-7 px-2" onClick={props.onSaveRecipe} disabled={props.busy}>
              Save
            </Button>
          </div>
          {props.recipes.length === 0 ? (
            <p className="text-[10px] font-light uppercase tracking-[0.08em] text-zinc-600">No recipes yet</p>
          ) : (
            <div className="space-y-1.5">
              {props.recipes.slice(0, 10).map((recipe) => (
                <div key={recipe.id} className="flex items-center gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="default"
                    className="flex-1 justify-start overflow-hidden text-ellipsis whitespace-nowrap px-2"
                    onClick={() => props.onApplyRecipe(recipe.id)}>
                    {recipe.name}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 px-0"
                    aria-label={`Delete ${recipe.name}`}
                    onClick={() => props.onDeleteRecipe(recipe.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {props.groupedAdjustmentControls.map((group) => (
          <section key={group.section} className="space-y-2 border-b border-zinc-800 pb-2.5 last:border-b-0 last:pb-0">
            <p className="text-[10px] font-light uppercase tracking-[0.08em] text-zinc-500">{group.section}</p>
            <div className="space-y-1.5">
              {group.controls.map((control) => (
                <RangeControl
                  key={control.key}
                  label={control.label}
                  min={control.min}
                  max={control.max}
                  step={control.step}
                  value={props.adjustments[control.key]}
                  defaultValue={props.neutralAdjustments[control.key]}
                  onChange={(value) => props.onSetAdjustment(control.key, value)}
                  onInteractionStart={props.onInteractionStart}
                  onInteractionEnd={props.onInteractionEnd}
                />
              ))}
            </div>
          </section>
        ))}
      </CardContent>
    </Card>
  );
}
