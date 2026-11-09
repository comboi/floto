import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderPreview } from '../api/editorApi';
import { useRenderQueue } from './useRenderQueue';

vi.mock('../api/editorApi', () => ({
  renderPreview: vi.fn(),
}));

const mockedRenderPreview = vi.mocked(renderPreview);

const input = (path: string) => ({
  sourcePath: path,
  adjustments: {} as never,
  layers: [],
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function setup(isInteracting = false) {
  const options = {
    isInteracting,
    onBusyChange: vi.fn(),
    onStatusChange: vi.fn(),
    onRendered: vi.fn(),
  };
  const hook = renderHook(() => useRenderQueue(options));
  return { ...hook, options };
}

describe('useRenderQueue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockedRenderPreview.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('debounces renders by 220ms and only renders the latest input', async () => {
    mockedRenderPreview.mockResolvedValue({ previewBase64: 'a' } as never);
    const { result } = setup();

    act(() => {
      result.current.scheduleRender(input('/a.jpg'));
      result.current.scheduleRender(input('/b.jpg'));
      result.current.scheduleRender(input('/c.jpg'));
    });

    await act(async () => {
      vi.advanceTimersByTime(219);
    });
    expect(mockedRenderPreview).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1);
      await Promise.resolve();
    });
    expect(mockedRenderPreview).toHaveBeenCalledTimes(1);
    expect(mockedRenderPreview.mock.calls[0][0].path).toBe('/c.jpg');
  });

  it('uses a smaller preview size while interacting', async () => {
    mockedRenderPreview.mockResolvedValue({} as never);
    const { result } = setup(true);

    act(() => result.current.scheduleRender(input('/a.jpg')));
    await act(async () => {
      vi.advanceTimersByTime(220);
      await Promise.resolve();
    });

    expect(mockedRenderPreview.mock.calls[0][0].previewMaxSide).toBe(1050);
  });

  it('cancels a scheduled render', async () => {
    const { result } = setup();

    act(() => result.current.scheduleRender(input('/a.jpg')));
    act(() => result.current.clearScheduledRender());
    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    expect(mockedRenderPreview).not.toHaveBeenCalled();
  });

  it('reports busy while rendering and idle when done', async () => {
    const pending = deferred<never>();
    mockedRenderPreview.mockReturnValue(pending.promise);
    const { result, options } = setup();

    act(() => result.current.scheduleRender(input('/a.jpg')));
    await act(async () => {
      vi.advanceTimersByTime(220);
    });
    expect(options.onBusyChange).toHaveBeenLastCalledWith(true);

    await act(async () => {
      pending.resolve({} as never);
      await pending.promise;
    });
    expect(options.onBusyChange).toHaveBeenLastCalledWith(false);
    expect(options.onRendered).toHaveBeenCalledTimes(1);
  });

  it('queues one follow-up render when inputs change during an in-flight render', async () => {
    const first = deferred<never>();
    mockedRenderPreview.mockReturnValueOnce(first.promise).mockResolvedValueOnce({} as never);
    const { result } = setup();

    act(() => result.current.scheduleRender(input('/a.jpg')));
    await act(async () => {
      vi.advanceTimersByTime(220);
    });

    act(() => result.current.scheduleRender(input('/b.jpg')));
    await act(async () => {
      vi.advanceTimersByTime(220);
    });
    expect(mockedRenderPreview).toHaveBeenCalledTimes(1);

    await act(async () => {
      first.resolve({} as never);
      await first.promise;
      await Promise.resolve();
    });

    expect(mockedRenderPreview).toHaveBeenCalledTimes(2);
    expect(mockedRenderPreview.mock.calls[1][0].path).toBe('/b.jpg');
  });

  it('reports a status error when rendering fails', async () => {
    mockedRenderPreview.mockRejectedValue(new Error('boom'));
    const { result, options } = setup();

    act(() => result.current.scheduleRender(input('/a.jpg')));
    await act(async () => {
      vi.advanceTimersByTime(220);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(options.onRendered).not.toHaveBeenCalled();
    expect(options.onStatusChange).toHaveBeenLastCalledWith(expect.any(String));
    expect(options.onBusyChange).toHaveBeenLastCalledWith(false);
  });
});
