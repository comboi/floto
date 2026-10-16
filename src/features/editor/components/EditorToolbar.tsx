import { Eye, ImagePlus, Layers, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import type { CompareMode } from '../hooks/usePreviewInteraction';

type EditorToolbarProps = {
  sourcePath: string | null;
  busy: boolean;
  hasOriginalPreview: boolean;
  compareMode: CompareMode;
  zoom: number;
  onOpenImage: () => void;
  onAddLayer: () => void;
  onExport: () => void;
  onToggleCompareMode: () => void;
  onHoldOriginalStart: () => void;
  onHoldOriginalEnd: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onZoomIn: () => void;
};

export function EditorToolbar(props: EditorToolbarProps) {
  return (
    <header className="flex h-14 items-center justify-between gap-3 border-b border-zinc-700 bg-zinc-900 px-3 lg:shrink-0">
      <div>
        <p className="text-[10px] font-normal tracking-[0.18em] text-zinc-100">FLOTO</p>
        <h1 className="mt-0.5 text-[11px] font-light uppercase tracking-[0.1em] text-zinc-400">Film Vintage Photo Lab</h1>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="default" onClick={props.onOpenImage} disabled={props.busy}>
          <ImagePlus className="mr-2 h-4 w-4" />Open Photo
        </Button>
        <Button type="button" variant="ghost" onClick={props.onAddLayer} disabled={!props.sourcePath || props.busy}>
          <Layers className="mr-2 h-4 w-4" />Add Layer
        </Button>
        <Button type="button" variant="amber" onClick={props.onExport} disabled={!props.sourcePath || props.busy}>Export</Button>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="px-2"
          disabled={!props.hasOriginalPreview}
          onClick={props.onToggleCompareMode}
          aria-label="Toggle compare mode"
          title={props.compareMode === 'hold' ? 'Switch to split compare mode' : 'Switch to hold compare mode'}>
          {props.compareMode === 'hold' ? 'Hold Compare' : 'Split Compare'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="px-2"
          disabled={!props.hasOriginalPreview || props.compareMode === 'split'}
          onMouseDown={props.onHoldOriginalStart}
          onMouseUp={props.onHoldOriginalEnd}
          onMouseLeave={props.onHoldOriginalEnd}
          onTouchStart={props.onHoldOriginalStart}
          onTouchEnd={props.onHoldOriginalEnd}
          onTouchCancel={props.onHoldOriginalEnd}
          aria-label="Hold to show original"
          title="Hold to show original">
          <Eye className="h-4 w-4" />
        </Button>

        <div className="flex items-center gap-1 rounded-[2px] border border-zinc-700 px-1 py-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-7 px-0"
            disabled={!props.sourcePath}
            onClick={props.onZoomOut}
            aria-label="Zoom out"
            title="Zoom out">
            <ZoomOut className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-[10px]"
            disabled={!props.sourcePath}
            onClick={props.onResetZoom}
            aria-label="Reset zoom"
            title="Reset zoom">
            {Math.round(props.zoom * 100)}%
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-7 px-0"
            disabled={!props.sourcePath}
            onClick={props.onZoomIn}
            aria-label="Zoom in"
            title="Zoom in">
            <ZoomIn className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </header>
  );
}
