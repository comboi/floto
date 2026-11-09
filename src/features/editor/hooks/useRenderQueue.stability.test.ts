import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useRenderQueue } from './useRenderQueue';

// Regression guard for the flicker bug: the object returned by useRenderQueue must be
// stable across re-renders, otherwise any effect depending on it re-runs on every render.
describe('useRenderQueue stability', () => {
  it('returns the same object across re-renders', () => {
    const options = {
      isInteracting: false,
      onBusyChange: vi.fn(),
      onStatusChange: vi.fn(),
      onRendered: vi.fn(),
    };
    const { result, rerender } = renderHook(() => useRenderQueue(options));
    const first = result.current;

    rerender();
    expect(result.current).toBe(first);
  });
});

describe('useRenderQueue callback stability', () => {
  // Regression guard for the busy flicker: scheduleRender must keep its identity when the
  // parent passes a new options object on every render, or the parent effect re-runs each time.
  it('keeps scheduleRender identity when options objects are rebuilt', () => {
    const make = () => ({
      isInteracting: false,
      onBusyChange: vi.fn(),
      onStatusChange: vi.fn(),
      onRendered: vi.fn(),
    });
    const { result, rerender } = renderHook(({ opts }) => useRenderQueue(opts), {
      initialProps: { opts: make() },
    });
    const first = result.current.scheduleRender;

    rerender({ opts: make() });
    rerender({ opts: make() });

    expect(result.current.scheduleRender).toBe(first);
  });
});
