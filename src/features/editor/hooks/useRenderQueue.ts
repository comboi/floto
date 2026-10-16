import { useCallback, useRef } from 'react';
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

  const drainRenderQueue = useCallback(async () => {
    const input = latestRenderInputRef.current;
    if (!input) return;

    if (inFlightRenderRef.current) {
      pendingRenderRef.current = true;
      return;
    }

    inFlightRenderRef.current = true;
    pendingRenderRef.current = false;
    options.onBusyChange(true);
    options.onStatusChange(STATUS_MESSAGES.renderingPreview);
    const renderId = lastAppliedRenderIdRef.current + 1;

    try {
      const response = await renderPreview({
        path: input.sourcePath,
        previewMaxSide: options.isInteracting ? 1050 : 1400,
        adjustments: input.adjustments,
        layers: input.layers,
      });

      if (renderId > lastAppliedRenderIdRef.current) {
        lastAppliedRenderIdRef.current = renderId;
        options.onRendered(response);
      }
    } catch (error) {
      options.onStatusChange(statusRenderFailed(error));
    } finally {
      inFlightRenderRef.current = false;
      if (pendingRenderRef.current) {
        void drainRenderQueue();
      } else {
        options.onBusyChange(false);
      }
    }
  }, [options]);

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

  return {
    scheduleRender,
    clearScheduledRender,
  };
}
