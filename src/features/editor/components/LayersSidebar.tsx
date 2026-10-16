import { Trash2 } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { ScrollArea } from '../../../components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select';
import { Switch } from '../../../components/ui/switch';
import { RangeControlCompact } from './RangeControl';
import type { Layer } from '../types';

type LayersSidebarProps = {
  layers: Layer[];
  blendModes: readonly string[];
  hoveredLayerId: string | null;
  layerPreviewCache: Record<string, string>;
  onHoverLayer: (layer: Layer) => void;
  onLeaveLayer: () => void;
  onUpdateLayer: (id: string, patch: Partial<Layer>) => void;
  onRemoveLayer: (id: string) => void;
};

export function LayersSidebar(props: LayersSidebarProps) {
  return (
    <Card className="rounded-none border-0 border-t border-zinc-700 bg-zinc-900 lg:flex lg:h-full lg:min-h-0 lg:flex-col lg:border-t-0 lg:border-l">
      <CardHeader className="lg:shrink-0"><CardTitle>Layer Stack</CardTitle></CardHeader>
      <CardContent className="lg:min-h-0 lg:flex-1 lg:p-0">
        <ScrollArea className="h-[66vh] pr-3 lg:h-full lg:px-5 lg:pb-5">
          <div className="space-y-3">
            {props.layers.map((layer) => (
              <article
                key={layer.id}
                className="relative rounded-md border border-zinc-800 bg-zinc-900/72 p-3"
                onMouseEnter={() => props.onHoverLayer(layer)}
                onMouseLeave={props.onLeaveLayer}>
                {props.hoveredLayerId === layer.id && props.layerPreviewCache[layer.id] ? (
                  <div className="pointer-events-none absolute -left-56 top-1/2 z-20 -translate-y-1/2 rounded-sm border border-zinc-700 bg-zinc-950/95 p-1 shadow-[0_8px_22px_rgba(0,0,0,0.45)]">
                    <img src={props.layerPreviewCache[layer.id]} alt={`${layer.name} preview`} className="h-28 w-44 object-cover" />
                  </div>
                ) : null}

                <div className="mb-3 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.12em] text-zinc-100">{layer.name}</p>
                    <p className="text-[10px] font-light uppercase tracking-[0.1em] text-zinc-500">{layer.kind === 'image' ? 'Image Layer' : 'Color Layer'}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Switch checked={layer.enabled} onCheckedChange={(enabled: boolean) => props.onUpdateLayer(layer.id, { enabled })} />
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 px-0"
                      aria-label={`Remove ${layer.name}`}
                      onClick={() => props.onRemoveLayer(layer.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-3">
                  <RangeControlCompact label="Opacity" value={layer.opacity} onChange={(value) => props.onUpdateLayer(layer.id, { opacity: value })} />
                  <RangeControlCompact label="Intensity" value={layer.intensity} onChange={(value) => props.onUpdateLayer(layer.id, { intensity: value })} />
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-light uppercase tracking-[0.12em] text-zinc-500">Blend Mode</p>
                    <Select value={layer.blendMode} onValueChange={(value) => props.onUpdateLayer(layer.id, { blendMode: value })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select blend" />
                      </SelectTrigger>
                      <SelectContent>
                        {props.blendModes.map((mode) => (
                          <SelectItem key={mode} value={mode}>{mode}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
