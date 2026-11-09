import { renderHook, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { exportImage } from '../api/editorApi';
import { save } from '@tauri-apps/plugin-dialog';
import { neutralAdjustments } from '../config';
import { useExportFlow } from './useExportFlow';

vi.mock('../api/editorApi', () => ({ exportImage: vi.fn() }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ save: vi.fn() }));

const exportMock = vi.mocked(exportImage);
const saveMock = vi.mocked(save);

const makeOptions = (overrides: Partial<Parameters<typeof useExportFlow>[0]> = {}) => ({
  sourcePath: '/photo.jpg',
  adjustments: { ...neutralAdjustments, grain: 0.3 },
  layers: [],
  onBusyChange: vi.fn(),
  onStatusChange: vi.fn(),
  ...overrides,
});

describe('export flow (D.2 integration: edit -> export)', () => {
  beforeEach(() => {
    exportMock.mockReset();
    saveMock.mockReset();
  });

  it('exports the current edits to the chosen path and reports completion', async () => {
    saveMock.mockResolvedValue('/out/result.jpg');
    exportMock.mockResolvedValue('/out/result.jpg');
    const options = makeOptions();
    const { result } = renderHook(() => useExportFlow(options));

    await act(async () => { await result.current.exportCurrent(); });

    expect(exportMock).toHaveBeenCalledWith(expect.objectContaining({
      path: '/photo.jpg',
      outputPath: '/out/result.jpg',
      adjustments: options.adjustments,
    }));
    expect(options.onBusyChange).toHaveBeenNthCalledWith(1, true);
    expect(options.onBusyChange).toHaveBeenLastCalledWith(false);
  });

  it('does nothing when the user cancels the save dialog', async () => {
    saveMock.mockResolvedValue(null);
    const options = makeOptions();
    const { result } = renderHook(() => useExportFlow(options));

    await act(async () => { await result.current.exportCurrent(); });

    expect(exportMock).not.toHaveBeenCalled();
    expect(options.onBusyChange).not.toHaveBeenCalled();
  });

  it('asks for a source first when none is loaded', async () => {
    const options = makeOptions({ sourcePath: null });
    const { result } = renderHook(() => useExportFlow(options));

    await act(async () => { await result.current.exportCurrent(); });

    expect(saveMock).not.toHaveBeenCalled();
    expect(options.onStatusChange).toHaveBeenCalled();
  });

  it('uses the latest edits, not the ones from the first render', async () => {
    saveMock.mockResolvedValue('/out/a.jpg');
    exportMock.mockResolvedValue('/out/a.jpg');
    const first = makeOptions();
    const { result, rerender } = renderHook(({ opts }) => useExportFlow(opts), { initialProps: { opts: first } });

    const edited = makeOptions({ adjustments: { ...neutralAdjustments, grain: 0.9 } });
    rerender({ opts: edited });
    await act(async () => { await result.current.exportCurrent(); });

    expect(exportMock.mock.calls[0][0].adjustments.grain).toBe(0.9);
  });

  // Regression guard: the export callback must keep its identity across renders.
  it('keeps exportCurrent identity when options are rebuilt', () => {
    const { result, rerender } = renderHook(({ opts }) => useExportFlow(opts), { initialProps: { opts: makeOptions() } });
    const first = result.current.exportCurrent;
    rerender({ opts: makeOptions() });
    expect(result.current.exportCurrent).toBe(first);
  });
});
