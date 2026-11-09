import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent } from 'react';

export type CompareMode = 'hold' | 'split';
export type SplitOrientation = 'vertical' | 'horizontal';

type ZoomAnchor = {
  clientX: number;
  clientY: number;
};

const KEYBOARD_ZOOM_STEP = 0.25;

export function usePreviewInteraction(sourcePath: string | null) {
  const [showOriginalHeld, setShowOriginalHeld] = useState(false);
  const [compareMode, setCompareMode] = useState<CompareMode>('hold');
  const [splitPosition, setSplitPosition] = useState(50);
  const [splitOrientation, setSplitOrientation] = useState<SplitOrientation>('vertical');
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);

  const previewViewportRef = useRef<HTMLDivElement | null>(null);
  const panStartRef = useRef<{ x: number; y: number; startPanX: number; startPanY: number } | null>(null);
  const lastPointerRef = useRef<ZoomAnchor | null>(null);
  const isDraggingSplitRef = useRef(false);

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

  const handlePreviewDoubleClick = useCallback(() => {
    if (!sourcePath) return;
    resetZoom();
  }, [resetZoom, sourcePath]);

  useEffect(() => {
    if (!sourcePath) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;

      if (event.key === '+' || event.key === '=') {
        event.preventDefault();
        setZoomClamped(zoom + KEYBOARD_ZOOM_STEP);
      } else if (event.key === '-' || event.key === '_') {
        event.preventDefault();
        setZoomClamped(zoom - KEYBOARD_ZOOM_STEP);
      } else if (event.key === '0') {
        event.preventDefault();
        resetZoom();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [resetZoom, setZoomClamped, sourcePath, zoom]);

  const toggleSplitOrientation = useCallback(() => {
    setSplitOrientation((current) => (current === 'vertical' ? 'horizontal' : 'vertical'));
  }, []);

  const updateSplitFromPointer = useCallback(
    (clientX: number, clientY: number) => {
      const viewport = previewViewportRef.current;
      if (!viewport) return;
      const rect = viewport.getBoundingClientRect();
      const isVertical = splitOrientation === 'vertical';
      const size = isVertical ? rect.width : rect.height;
      if (size <= 0) return;
      const offset = isVertical ? clientX - rect.left : clientY - rect.top;
      const percent = (offset / size) * 100;
      setSplitPosition(Math.max(0, Math.min(100, Math.round(percent))));
    },
    [splitOrientation],
  );

  const handleSplitPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      // Keep the pan handler on the viewport from starting a pan when the split line is grabbed.
      event.stopPropagation();
      isDraggingSplitRef.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      updateSplitFromPointer(event.clientX, event.clientY);
    },
    [updateSplitFromPointer],
  );

  const handleSplitPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!isDraggingSplitRef.current) return;
      updateSplitFromPointer(event.clientX, event.clientY);
    },
    [updateSplitFromPointer],
  );

  const endSplitDrag = useCallback(() => {
    isDraggingSplitRef.current = false;
  }, []);

  return {
    showOriginalHeld,
    setShowOriginalHeld,
    compareMode,
    setCompareMode,
    splitPosition,
    setSplitPosition,
    splitOrientation,
    toggleSplitOrientation,
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
    handlePreviewDoubleClick,
    endPan,
    handleSplitPointerDown,
    handleSplitPointerMove,
    endSplitDrag,
  };
}
