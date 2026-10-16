import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent } from 'react';

export type CompareMode = 'hold' | 'split';

type ZoomAnchor = {
  clientX: number;
  clientY: number;
};

export function usePreviewInteraction(sourcePath: string | null) {
  const [showOriginalHeld, setShowOriginalHeld] = useState(false);
  const [compareMode, setCompareMode] = useState<CompareMode>('hold');
  const [splitPosition, setSplitPosition] = useState(50);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);

  const previewViewportRef = useRef<HTMLDivElement | null>(null);
  const panStartRef = useRef<{ x: number; y: number; startPanX: number; startPanY: number } | null>(null);
  const lastPointerRef = useRef<ZoomAnchor | null>(null);

  useEffect(() => {
    if (sourcePath) return;
    setShowOriginalHeld(false);
    setSplitPosition(50);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setIsPanning(false);
    panStartRef.current = null;
    lastPointerRef.current = null;
  }, [sourcePath]);

  const clampPan = useCallback(
    (nextX: number, nextY: number, nextZoom = zoom) => {
      if (nextZoom <= 1) {
        return { x: 0, y: 0 };
      }

      const viewport = previewViewportRef.current;
      if (!viewport) {
        return { x: nextX, y: nextY };
      }

      const maxX = ((viewport.clientWidth || 0) * (nextZoom - 1)) * 0.5;
      const maxY = ((viewport.clientHeight || 0) * (nextZoom - 1)) * 0.5;
      return {
        x: Math.max(-maxX, Math.min(maxX, nextX)),
        y: Math.max(-maxY, Math.min(maxY, nextY)),
      };
    },
    [zoom],
  );

  const setZoomClamped = useCallback(
    (next: number, anchor?: ZoomAnchor) => {
      setZoom((currentZoom) => {
        const nextZoom = Math.max(1, Math.min(4, next));

        setPan((currentPan) => {
          if (nextZoom <= 1) {
            return { x: 0, y: 0 };
          }

          if (!anchor || !previewViewportRef.current || currentZoom <= 0) {
            return clampPan(currentPan.x, currentPan.y, nextZoom);
          }

          const rect = previewViewportRef.current.getBoundingClientRect();
          const cursorX = anchor.clientX - rect.left - rect.width * 0.5;
          const cursorY = anchor.clientY - rect.top - rect.height * 0.5;
          const k = nextZoom / currentZoom;
          const anchoredPanX = (1.0 - k) * cursorX + k * currentPan.x;
          const anchoredPanY = (1.0 - k) * cursorY + k * currentPan.y;
          return clampPan(anchoredPanX, anchoredPanY, nextZoom);
        });

        if (nextZoom <= 1) {
          setIsPanning(false);
          panStartRef.current = null;
        }

        return nextZoom;
      });
    },
    [clampPan],
  );

  const handlePreviewWheel = useCallback(
    (event: WheelEvent<HTMLDivElement>) => {
      if (!sourcePath) return;
      event.preventDefault();
      lastPointerRef.current = { clientX: event.clientX, clientY: event.clientY };
      const delta = event.deltaY < 0 ? 0.1 : -0.1;
      setZoomClamped(zoom + delta, { clientX: event.clientX, clientY: event.clientY });
    },
    [setZoomClamped, sourcePath, zoom],
  );

  const getZoomAnchor = useCallback(() => {
    if (lastPointerRef.current) {
      return lastPointerRef.current;
    }
    if (!previewViewportRef.current) {
      return undefined;
    }
    const rect = previewViewportRef.current.getBoundingClientRect();
    return {
      clientX: rect.left + rect.width * 0.5,
      clientY: rect.top + rect.height * 0.5,
    };
  }, []);

  const handlePreviewPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (zoom <= 1 || !sourcePath) return;
      panStartRef.current = {
        x: event.clientX,
        y: event.clientY,
        startPanX: pan.x,
        startPanY: pan.y,
      };
      setIsPanning(true);
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [pan.x, pan.y, sourcePath, zoom],
  );

  const handlePreviewPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      lastPointerRef.current = { clientX: event.clientX, clientY: event.clientY };
      if (!panStartRef.current || zoom <= 1) return;
      const dx = event.clientX - panStartRef.current.x;
      const dy = event.clientY - panStartRef.current.y;
      setPan(clampPan(panStartRef.current.startPanX + dx, panStartRef.current.startPanY + dy));
    },
    [clampPan, zoom],
  );

  const endPan = useCallback(() => {
    panStartRef.current = null;
    setIsPanning(false);
  }, []);

  const resetZoom = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setIsPanning(false);
    panStartRef.current = null;
  }, []);

  return {
    showOriginalHeld,
    setShowOriginalHeld,
    compareMode,
    setCompareMode,
    splitPosition,
    setSplitPosition,
    zoom,
    setZoomClamped,
    resetZoom,
    pan,
    isPanning,
    previewViewportRef,
    getZoomAnchor,
    handlePreviewWheel,
    handlePreviewPointerDown,
    handlePreviewPointerMove,
    endPan,
  };
}
