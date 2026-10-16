import type { PointerEvent as ReactPointerEvent, WheelEvent } from 'react';
import { Card, CardContent } from '../../../components/ui/card';

type PreviewViewportProps = {
  sourcePath: string | null;
  previewSrc: string | null;
  originalPreviewSrc: string | null;
  showOriginalHeld: boolean;
  compareMode: 'hold' | 'split';
  splitPosition: number;
  zoom: number;
  pan: { x: number; y: number };
  isPanning: boolean;
  imageStats: string;
  status: string;
  previewViewportRef: React.RefObject<HTMLDivElement | null>;
  onSetSplitPosition: (value: number) => void;
  onWheel: (event: WheelEvent<HTMLDivElement>) => void;
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerUp: () => void;
  onPointerCancel: () => void;
  onPointerLeave: () => void;
};

export function PreviewViewport(props: PreviewViewportProps) {
  const activePreviewSrc = props.showOriginalHeld && props.originalPreviewSrc ? props.originalPreviewSrc : props.previewSrc;
  const showSplitCompare = props.compareMode === 'split' && Boolean(props.previewSrc && props.originalPreviewSrc);

  return (
    <Card className="rounded-none border-0 bg-black lg:order-none lg:flex lg:h-full lg:min-h-0 lg:flex-col">
      <CardContent className="space-y-3 p-0 lg:flex lg:h-full lg:min-h-0 lg:flex-col">
        <div
          className="relative flex min-h-[55vh] items-center justify-center overflow-hidden bg-black lg:min-h-0 lg:flex-1"
          onWheel={props.onWheel}
          onPointerDown={props.onPointerDown}
          onPointerMove={props.onPointerMove}
          onPointerUp={props.onPointerUp}
          onPointerCancel={props.onPointerCancel}
          onPointerLeave={props.onPointerLeave}
          style={{ cursor: props.zoom > 1 ? (props.isPanning ? 'grabbing' : 'grab') : 'default' }}>
          {activePreviewSrc ? (
            <div ref={props.previewViewportRef} className="relative flex h-full w-full items-center justify-center">
              {showSplitCompare && props.previewSrc && props.originalPreviewSrc ? (
                <>
                  <div
                    className="relative flex h-full w-full items-center justify-center"
                    style={{
                      transform: `translate(${props.pan.x}px, ${props.pan.y}px) scale(${props.zoom})`,
                      transformOrigin: 'center center',
                    }}>
                    <img src={props.originalPreviewSrc} alt="Before preview" className="max-h-full max-w-full object-contain object-center" />
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center" style={{ clipPath: `inset(0 0 0 ${props.splitPosition}%)` }}>
                      <img src={props.previewSrc} alt="After preview" className="max-h-full max-w-full object-contain object-center" />
                    </div>
                  </div>

                  <div className="pointer-events-none absolute inset-y-0 z-20 w-px bg-zinc-100/80" style={{ left: `${props.splitPosition}%` }} />
                  <div className="pointer-events-none absolute top-2 z-20 rounded-[2px] bg-black/65 px-2 py-1 text-[9px] font-light uppercase tracking-[0.08em] text-zinc-300" style={{ left: '8px' }}>
                    Before
                  </div>
                  <div className="pointer-events-none absolute top-2 z-20 rounded-[2px] bg-black/65 px-2 py-1 text-[9px] font-light uppercase tracking-[0.08em] text-zinc-300" style={{ right: '8px' }}>
                    After
                  </div>

                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={props.splitPosition}
                    onChange={(event) => props.onSetSplitPosition(Number(event.target.value))}
                    className="absolute bottom-4 z-30 w-[min(460px,82%)] accent-zinc-200"
                    aria-label="Before and after split slider"
                  />
                </>
              ) : (
                <div
                  className="relative flex h-full w-full items-center justify-center"
                  style={{
                    transform: `translate(${props.pan.x}px, ${props.pan.y}px) scale(${props.zoom})`,
                    transformOrigin: 'center center',
                  }}>
                  <img src={activePreviewSrc} alt="Photo preview" className="max-h-full max-w-full object-contain object-center" />
                </div>
              )}
            </div>
          ) : (
            <div className="flex h-[460px] items-center justify-center text-center text-xs font-light uppercase tracking-[0.1em] text-zinc-500">
              Open a source photo and drag image files to add custom layers
            </div>
          )}
        </div>
        <div className="space-y-1 border-t border-zinc-800 bg-zinc-900 px-4 py-2 text-[10px] font-light uppercase tracking-[0.08em] text-zinc-500">
          <p>{props.imageStats}</p>
          <p>{props.status}</p>
        </div>
      </CardContent>
    </Card>
  );
}
