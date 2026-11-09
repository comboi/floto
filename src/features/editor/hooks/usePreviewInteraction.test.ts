import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { usePreviewInteraction } from './usePreviewInteraction';

function attachViewport(result: { current: ReturnType<typeof usePreviewInteraction> }, rect: Partial<DOMRect> = {}) {
  const viewport = {
    clientWidth: 1000,
    clientHeight: 800,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 800, right: 1000, bottom: 800, x: 0, y: 0, toJSON: () => ({}), ...rect }),
  } as unknown as HTMLDivElement;
  result.current.previewViewportRef.current = viewport;
}

describe('usePreviewInteraction', () => {
  it('starts with zoom 1, no pan and split at 50%', () => {
    const { result } = renderHook(() => usePreviewInteraction('/photo.jpg'));

    expect(result.current.zoom).toBe(1);
    expect(result.current.pan).toEqual({ x: 0, y: 0 });
    expect(result.current.splitPosition).toBe(50);
  });

  it('clamps zoom between 1 and 4', () => {
    const { result } = renderHook(() => usePreviewInteraction('/photo.jpg'));

    act(() => result.current.setZoomClamped(10));
    expect(result.current.zoom).toBe(4);

    act(() => result.current.setZoomClamped(0));
    expect(result.current.zoom).toBe(1);
  });

  it('resets zoom and pan on double click', () => {
    const { result } = renderHook(() => usePreviewInteraction('/photo.jpg'));

    act(() => result.current.setZoomClamped(2));
    expect(result.current.zoom).toBe(2);

    act(() => result.current.handlePreviewDoubleClick());
    expect(result.current.zoom).toBe(1);
    expect(result.current.pan).toEqual({ x: 0, y: 0 });
  });

  it('ignores double click when no source is loaded', () => {
    const { result } = renderHook(() => usePreviewInteraction(null));

    act(() => result.current.setZoomClamped(2));
    act(() => result.current.handlePreviewDoubleClick());
    expect(result.current.zoom).toBe(2);
  });

  it('zooms with + and - keys and resets with 0', () => {
    const { result } = renderHook(() => usePreviewInteraction('/photo.jpg'));

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '+' }));
    });
    expect(result.current.zoom).toBe(1.25);

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '-' }));
    });
    expect(result.current.zoom).toBe(1);

    act(() => result.current.setZoomClamped(3));
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '0' }));
    });
    expect(result.current.zoom).toBe(1);
  });

  it('ignores zoom shortcuts while typing in an input', () => {
    const { result } = renderHook(() => usePreviewInteraction('/photo.jpg'));
    const input = document.createElement('input');
    document.body.appendChild(input);

    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: '+', bubbles: true }));
    });
    expect(result.current.zoom).toBe(1);

    input.remove();
  });

  it('ignores zoom shortcuts with modifier keys', () => {
    const { result } = renderHook(() => usePreviewInteraction('/photo.jpg'));

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '+', metaKey: true }));
    });
    expect(result.current.zoom).toBe(1);
  });

  it('does not listen for shortcuts when no source is loaded', () => {
    const { result } = renderHook(() => usePreviewInteraction(null));

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '+' }));
    });
    expect(result.current.zoom).toBe(1);
  });

  it('moves the split position to the pointer x, as a percentage of the viewport', () => {
    const { result } = renderHook(() => usePreviewInteraction('/photo.jpg'));
    attachViewport(result);

    act(() => {
      result.current.handleSplitPointerDown({
        clientX: 250,
        pointerId: 1,
        currentTarget: { setPointerCapture: () => {} },
        stopPropagation: () => {},
      } as unknown as Parameters<typeof result.current.handleSplitPointerDown>[0]);
    });
    expect(result.current.splitPosition).toBe(25);

    act(() => {
      result.current.handleSplitPointerMove({ clientX: 730 } as Parameters<typeof result.current.handleSplitPointerMove>[0]);
    });
    expect(result.current.splitPosition).toBe(73);
  });

  it('does not move the split while the pointer is not dragging it', () => {
    const { result } = renderHook(() => usePreviewInteraction('/photo.jpg'));
    attachViewport(result);

    act(() => {
      result.current.handleSplitPointerMove({ clientX: 900 } as Parameters<typeof result.current.handleSplitPointerMove>[0]);
    });
    expect(result.current.splitPosition).toBe(50);
  });

  it('stops moving the split after the drag ends', () => {
    const { result } = renderHook(() => usePreviewInteraction('/photo.jpg'));
    attachViewport(result);

    act(() => {
      result.current.handleSplitPointerDown({
        clientX: 100,
        pointerId: 1,
        currentTarget: { setPointerCapture: () => {} },
        stopPropagation: () => {},
      } as unknown as Parameters<typeof result.current.handleSplitPointerDown>[0]);
    });
    act(() => result.current.endSplitDrag());
    act(() => {
      result.current.handleSplitPointerMove({ clientX: 800 } as Parameters<typeof result.current.handleSplitPointerMove>[0]);
    });
    expect(result.current.splitPosition).toBe(10);
  });

  it('starts with a vertical split and toggles to horizontal', () => {
    const { result } = renderHook(() => usePreviewInteraction('/photo.jpg'));

    expect(result.current.splitOrientation).toBe('vertical');

    act(() => result.current.toggleSplitOrientation());
    expect(result.current.splitOrientation).toBe('horizontal');

    act(() => result.current.toggleSplitOrientation());
    expect(result.current.splitOrientation).toBe('vertical');
  });

  it('uses the viewport height to set the split when horizontal', () => {
    const { result } = renderHook(() => usePreviewInteraction('/photo.jpg'));
    attachViewport(result, { top: 100, height: 800, bottom: 900 });

    act(() => result.current.toggleSplitOrientation());
    act(() => {
      result.current.handleSplitPointerDown({
        clientX: 0,
        clientY: 300,
        pointerId: 1,
        currentTarget: { setPointerCapture: () => {} },
        stopPropagation: () => {},
      } as unknown as Parameters<typeof result.current.handleSplitPointerDown>[0]);
    });
    expect(result.current.splitPosition).toBe(25);

    act(() => {
      result.current.handleSplitPointerMove({ clientX: 0, clientY: 700 } as Parameters<typeof result.current.handleSplitPointerMove>[0]);
    });
    expect(result.current.splitPosition).toBe(75);
  });

  it('clamps the split position between 0 and 100', () => {
    const { result } = renderHook(() => usePreviewInteraction('/photo.jpg'));
    attachViewport(result);

    act(() => {
      result.current.handleSplitPointerDown({
        clientX: 1500,
        pointerId: 1,
        currentTarget: { setPointerCapture: () => {} },
        stopPropagation: () => {},
      } as unknown as Parameters<typeof result.current.handleSplitPointerDown>[0]);
    });
    expect(result.current.splitPosition).toBe(100);

    act(() => {
      result.current.handleSplitPointerMove({ clientX: -200 } as Parameters<typeof result.current.handleSplitPointerMove>[0]);
    });
    expect(result.current.splitPosition).toBe(0);
  });
});
