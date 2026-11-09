import { RotateCcw } from 'lucide-react';
import { Slider } from '../../../components/ui/slider';

type RangeControlProps = {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  defaultValue?: number;
  onChange: (value: number) => void;
  onInteractionStart?: () => void;
  onInteractionEnd?: () => void;
};

export function RangeControl(props: RangeControlProps) {
  const defaultValue = props.defaultValue ?? 0;

  return (
    <div
      className="space-y-1"
      onDoubleClick={() => {
        props.onChange(defaultValue);
      }}>
      <div className="flex items-center justify-between text-[10px] font-light uppercase tracking-[0.08em] text-zinc-300">
        <span>{props.label}</span>
        <div className="flex items-center gap-1.5">
          <span className="text-zinc-500">{props.value.toFixed(2)}</span>
          <button
            type="button"
            className="inline-flex h-4 w-4 items-center justify-center rounded-[1px] border border-zinc-700 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
            aria-label={`Reset ${props.label}`}
            title={`Reset ${props.label}`}
            onClick={() => {
              props.onChange(defaultValue);
            }}>
            <RotateCcw className="h-3 w-3" />
          </button>
        </div>
      </div>
      <Slider
        min={props.min}
        max={props.max}
        step={props.step}
        value={[props.value]}
        onValueChange={(next) => props.onChange(next[0] ?? props.value)}
        onPointerDown={props.onInteractionStart}
        onPointerUp={props.onInteractionEnd}
        onPointerCancel={props.onInteractionEnd}
      />
    </div>
  );
}

type RangeControlCompactProps = {
  label: string;
  value: number;
  onChange: (value: number) => void;
};

export function RangeControlCompact(props: RangeControlCompactProps) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[10px] font-light uppercase tracking-[0.08em] text-zinc-400">
        <span>{props.label}</span>
        <span className="text-zinc-500">{props.value.toFixed(2)}</span>
      </div>
      <Slider
        min={0}
        max={1}
        step={0.01}
        value={[props.value]}
        onValueChange={(next) => props.onChange(next[0] ?? props.value)}
      />
    </div>
  );
}
