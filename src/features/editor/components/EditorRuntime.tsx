import { useEffect, useMemo, useState } from 'react';
import { getGroupedAdjustmentControls } from '../controls';
import { blendModes, filmPresets, neutralAdjustments } from '../config';
import { EditorToolbar } from './EditorToolbar';
import { LayersSidebar } from './LayersSidebar';
import { PreviewViewport } from './PreviewViewport';
import { ToneSidebar } from './ToneSidebar';
import { useBootAndOriginalPreview } from '../hooks/useBootAndOriginalPreview';
import { useEditorActions } from '../hooks/useEditorActions';
import { useEditorState } from '../hooks/useEditorState';
import { useExportFlow } from '../hooks/useExportFlow';
import { usePreviewInteraction } from '../hooks/usePreviewInteraction';
import { usePreviewMeta } from '../hooks/usePreviewMeta';
import { useRenderQueue } from '../hooks/useRenderQueue';
import { useSourceLayerInput } from '../hooks/useSourceLayerInput';
import { useStatus } from '../hooks/useStatus';
import { buildImageLayer } from '../layers';
import { STATUS_MESSAGES } from '../statusMessages';
import type { Adjustments, RenderInfo } from '../types';

type EditorRuntimeProps = {
  sourcePath: string | null;
  onSourcePathChange: (path: string | null) => void;
};

export function EditorRuntime(props: EditorRuntimeProps) {
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [info, setInfo] = useState<RenderInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [isInteracting, setIsInteracting] = useState(false);

  const editor = useEditorState();
  const preview = usePreviewInteraction(props.sourcePath);
  const statusState = useStatus();

  const renderQueue = useRenderQueue({
    isInteracting,
    onBusyChange: setBusy,
    onStatusChange: statusState.setStatusMessage,
    onRendered: (response) => {
      setPreviewSrc(response.dataUrl);
      setInfo(response.info);
      statusState.setStatusMessage(STATUS_MESSAGES.previewUpdated);
    },
  });

  const exportFlow = useExportFlow({
    sourcePath: props.sourcePath,
    adjustments: editor.adjustments,
    layers: editor.layers,
    onBusyChange: setBusy,
    onStatusChange: statusState.setStatusMessage,
  });

  const sourceLayerInput = useSourceLayerInput({
    sourcePath: props.sourcePath,
    onSetSourcePath: (path) => props.onSourcePathChange(path),
    onResetPreviewState: () => {
      setPreviewSrc(null);
      setInfo(null);
    },
    onAddLayerPaths: (paths) => {
      editor.setLayers((current) => [...current, ...paths.map((path, index) => buildImageLayer(path, current.length + index))]);
    },
    onStatusChange: statusState.setStatusMessage,
  });

  const editorActions = useEditorActions({
    setStatusMessage: statusState.setStatusMessage,
    applyOptionalStatus: statusState.applyOptionalStatus,
    setIsInteracting,
    setHoveredLayerId: editor.setHoveredLayerId,
    prefetchLayerPreview: editor.prefetchLayerPreview,
    saveCurrentRecipe: editor.saveCurrentRecipe,
    applyRecipe: editor.applyRecipe,
    deleteRecipe: editor.deleteRecipe,
    applyFilmPreset: editor.applyFilmPreset,
    setAdjustment: editor.setAdjustment,
    resetAllAdjustments: editor.resetAllAdjustments,
    removeLayer: editor.removeLayer,
  });

  const bootAndOriginalPreview = useBootAndOriginalPreview(props.sourcePath, editor.hydrateFromDefault);
  const previewMeta = usePreviewMeta(info);
  const groupedAdjustmentControls = useMemo(() => getGroupedAdjustmentControls(), []);

  useEffect(() => {
    if (!props.sourcePath || !editor.adjustments) return;
    renderQueue.scheduleRender({ sourcePath: props.sourcePath, adjustments: editor.adjustments, layers: editor.layers });
    return () => {
      renderQueue.clearScheduledRender();
    };
  }, [props.sourcePath, editor.adjustments, editor.layers, renderQueue]);

  if (bootAndOriginalPreview.bootError) {
    return <div className="min-h-screen bg-zinc-950 p-6 text-red-300">FLOTO FAILED TO BOOT: {bootAndOriginalPreview.bootError}</div>;
  }

  if (!editor.adjustments) {
    return <div className="min-h-screen bg-zinc-950 p-6 text-zinc-100">{STATUS_MESSAGES.booting}</div>;
  }

  return (
    <div className="relative min-h-screen bg-[#111111] p-0 text-zinc-100 lg:h-screen lg:overflow-hidden">
      {sourceLayerInput.dropActive ? (
        <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="rounded-sm border border-zinc-500 bg-zinc-900 px-6 py-4 text-center text-xs font-light uppercase tracking-[0.12em] text-zinc-200">
            Drop image files to add custom layers
          </div>
        </div>
      ) : null}

      <EditorToolbar
        sourcePath={props.sourcePath}
        busy={busy}
        hasOriginalPreview={Boolean(bootAndOriginalPreview.originalPreviewSrc)}
        compareMode={preview.compareMode}
        zoom={preview.zoom}
        onOpenImage={sourceLayerInput.openImage}
        onAddLayer={sourceLayerInput.addLayerFromDialog}
        onExport={exportFlow.exportCurrent}
        onToggleCompareMode={() => preview.setCompareMode(preview.compareMode === 'hold' ? 'split' : 'hold')}
        onHoldOriginalStart={() => preview.setShowOriginalHeld(true)}
        onHoldOriginalEnd={() => preview.setShowOriginalHeld(false)}
        onZoomOut={() => preview.setZoomClamped(preview.zoom - 0.2, preview.getZoomAnchor())}
        onResetZoom={preview.resetZoom}
        onZoomIn={() => preview.setZoomClamped(preview.zoom + 0.2, preview.getZoomAnchor())}
      />

      <main className="grid min-h-[calc(100vh-56px)] grid-cols-1 gap-0 lg:h-[calc(100vh-56px)] lg:grid-cols-[320px_minmax(0,1fr)_320px] lg:overflow-hidden">
        <ToneSidebar
          adjustments={editor.adjustments}
          busy={busy}
          selectedPreset={editor.selectedPreset}
          filmPresets={filmPresets}
          recipes={editor.recipes}
          recipeNameInput={editor.recipeNameInput}
          groupedAdjustmentControls={groupedAdjustmentControls}
          neutralAdjustments={neutralAdjustments}
          onRecipeNameChange={editor.setRecipeNameInput}
          onSaveRecipe={editorActions.onSaveRecipe}
          onApplyRecipe={editorActions.onApplyRecipe}
          onDeleteRecipe={editorActions.onDeleteRecipe}
          onApplyFilmPreset={editorActions.onApplyFilmPreset}
          onSetAdjustment={(key: keyof Adjustments, value: number) => editorActions.onSetAdjustment(key, value)}
          onInteractionStart={editorActions.onInteractionStart}
          onInteractionEnd={editorActions.onInteractionEnd}
          onResetAll={editorActions.onResetAll}
        />

        <PreviewViewport
          sourcePath={props.sourcePath}
          previewSrc={previewSrc}
          originalPreviewSrc={bootAndOriginalPreview.originalPreviewSrc}
          showOriginalHeld={preview.showOriginalHeld}
          compareMode={preview.compareMode}
          splitPosition={preview.splitPosition}
          zoom={preview.zoom}
          pan={preview.pan}
          isPanning={preview.isPanning}
          imageStats={previewMeta.imageStats}
          status={statusState.status}
          previewViewportRef={preview.previewViewportRef}
          onSetSplitPosition={preview.setSplitPosition}
          onWheel={preview.handlePreviewWheel}
          onPointerDown={preview.handlePreviewPointerDown}
          onPointerMove={preview.handlePreviewPointerMove}
          onPointerUp={preview.endPan}
          onPointerCancel={preview.endPan}
          onPointerLeave={preview.endPan}
        />

        <LayersSidebar
          layers={editor.layers}
          blendModes={blendModes}
          hoveredLayerId={editor.hoveredLayerId}
          layerPreviewCache={editor.layerPreviewCache}
          onHoverLayer={editorActions.onHoverLayer}
          onLeaveLayer={editorActions.onLeaveLayer}
          onUpdateLayer={editor.updateLayer}
          onRemoveLayer={editorActions.onRemoveLayer}
        />
      </main>
    </div>
  );
}
