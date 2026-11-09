import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderPreview } from '../api/editorApi';
import { useRenderQueue } from './useRenderQueue';

vi.mock('../api/editorApi', () => ({ renderPreview: vi.fn() }));
const mocked = vi.mocked(renderPreview);

const input = (path: string) => ({ sourcePath: path, adjustments: {} as never, layers: [] });

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => { resolve = res; });
  return { promise, resolve };
}

describe('render queue cancellation (C.2)', () => {
  beforeEach(() => { vi.useFakeTimers(); mocked.mockReset(); });
  afterEach(() => { vi.useRealTimers(); });

  // Hueco 3: a result from the previous source must not be applied after the source changed.
  it('does not apply a stale result from a previous source', async () => {
    const first = deferred<never>();
    mocked.mockReturnValueOnce(first.promise);
    const onRendered = vi.fn();
    const { result } = renderHook(() =>
      useRenderQueue({ isInteracting: false, onBusyChange: vi.fn(), onStatusChange: vi.fn(), onRendered }),
    );

    act(() => result.current.scheduleRender(input('/old.jpg')));
    await act(async () => { vi.advanceTimersByTime(220); });

    act(() => result.current.scheduleRender(input('/new.jpg')));
    await act(async () => { vi.advanceTimersByTime(220); });

    await act(async () => {
      first.resolve({ dataUrl: 'old-result', info: {} } as never);
      await first.promise;
    });

    expect(onRendered).not.toHaveBeenCalledWith(expect.objectContaining({ dataUrl: 'old-result' }));
  });
});
