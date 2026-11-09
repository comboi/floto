import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSourceLayerInput } from './useSourceLayerInput';

const onDragDropEvent = vi.fn(async () => () => {});

vi.mock('@tauri-apps/api/webview', () => ({
  getCurrentWebview: () => ({ onDragDropEvent }),
}));
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn() }));

const makeOptions = (sourcePath: string | null = null) => ({
  sourcePath,
  onSetSourcePath: vi.fn(),
  onResetPreviewState: vi.fn(),
  onAddLayerPaths: vi.fn(),
  onStatusChange: vi.fn(),
});

describe('useSourceLayerInput listener binding', () => {
  beforeEach(() => {
    onDragDropEvent.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // Regression guard for the load-time flicker: a new options object on every render must not
  // unbind and rebind the Tauri drag-drop listener.
  it('binds the drag-drop listener once across re-renders with new options objects', async () => {
    const { rerender } = renderHook(({ opts }) => useSourceLayerInput(opts), {
      initialProps: { opts: makeOptions() },
    });
    await Promise.resolve();

    rerender({ opts: makeOptions() });
    rerender({ opts: makeOptions('/photo.jpg') });
    rerender({ opts: makeOptions('/other.jpg') });

    expect(onDragDropEvent).toHaveBeenCalledTimes(1);
  });
});
