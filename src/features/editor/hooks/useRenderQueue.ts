import { useCallback, useMemo, useRef } from 'react';
import { renderPreview } from '../api/editorApi';
import { STATUS_MESSAGES, statusRenderFailed } from '../statusMessages';
import type { Adjustments, Layer, RenderResponse } from '../types';

type RenderInput = {
  sourcePath: string;
  adjustments: Adjustments;
  layers: Layer[];
};

type UseRenderQueueOptions = {
  isInteracting: boolean;
  onBusyChange: (busy: boolean) => void;
  onStatusChange: (status: string) => void;
  onRendered: (response: RenderResponse) => void;
};

export function useRenderQueue(options: UseRenderQueueOptions) {
  const inFlightRenderRef = useRef(false);
  const pendingRenderRef = useRef(false);
  const latestRenderInputRef = useRef<RenderInput | null>(null);
  const lastAppliedRenderIdRef = useRef(0);
  const debounceTimerRef = useRef<number | null>(null);

  // The parent rebuilds the options object on every render. Read the latest one through a ref so
  // scheduleRender keeps its identity; otherwise the parent's render effect re-runs on each render,
  // which toggles busy and repaints every control that depends on it.
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const drainRenderQueue = useCallback(async () => {
    const latest = optionsRef.current;
    const input = latestRenderInputRef.current;
    if (!input) return;

    if (inFlightRenderRef.current) {
      pendingRenderRef.current = true;
      return;
    }

    inFlightRenderRef.current = true;
    pendingRenderRef.current = false;
    latest.onBusyChange(true);
    latest.onStatusChange(STATUS_MESSAGES.renderingPreview);
    const renderId = lastAppliedRenderIdRef.current + 1;

    try {
      const response = await renderPreview({
        path: input.sourcePath,
        previewMaxSide: latest.isInteracting ? 1050 : 1400,
        adjustments: input.adjustments,
        layers: input.layers,
      });

      // Apply only if this result still belongs to the latest requested input: a result for a
      // previous source (or a superseded edit) must never replace what the user is looking at.
      const isCurrent = latestRenderInputRef.current?.sourcePath === input.sourcePath;
      if (isCurrent && renderId > lastAppliedRenderIdRef.current) {
        lastAppliedRenderIdRef.current = renderId;
        latest.onRendered(response);
      }
    } catch (error) {
      latest.onStatusChange(statusRenderFailed(error));
    } finally {
      inFlightRenderRef.current = false;
      if (pendingRenderRef.current) {
        void drainRenderQueue();
      } else {
        latest.onBusyChange(false);
      }
    }
  }, []);

  const scheduleRender = useCallback((input: RenderInput) => {
    latestRenderInputRef.current = input;
    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = window.setTimeout(() => {
      void drainRenderQueue();
    }, 220);
  }, [drainRenderQueue]);

  const clearScheduledRender = useCallback(() => {
    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
  }, []);

  // Memoised so consumers can depend on the returned object without re-running effects on every render.
  return useMemo(() => ({
    scheduleRender,
    clearScheduledRender,
  }), [scheduleRender, clearScheduledRender]);
}
