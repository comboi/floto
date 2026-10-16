import { useCallback } from 'react';
import { save } from '@tauri-apps/plugin-dialog';
import { exportImage } from '../api/editorApi';
import {
  STATUS_MESSAGES,
  statusExportCompleted,
  statusExportFailed,
} from '../statusMessages';
import type { Adjustments, Layer } from '../types';

type UseExportFlowOptions = {
  sourcePath: string | null;
  adjustments: Adjustments | null;
  layers: Layer[];
  onBusyChange: (busy: boolean) => void;
  onStatusChange: (status: string) => void;
};

export function useExportFlow(options: UseExportFlowOptions) {
  const exportCurrent = useCallback(async () => {
    if (!options.sourcePath || !options.adjustments) {
      options.onStatusChange(STATUS_MESSAGES.loadSourceFirst);
      return;
    }

    const output = await save({
      title: 'Export image',
      defaultPath: 'floto-export.jpg',
      filters: [
        { name: 'JPEG', extensions: ['jpg', 'jpeg'] },
        { name: 'PNG', extensions: ['png'] },
        { name: 'WebP', extensions: ['webp'] },
        { name: 'TIFF', extensions: ['tiff'] },
      ],
    });

    if (!output) return;

    options.onBusyChange(true);
    options.onStatusChange(STATUS_MESSAGES.exportingFullResolution);
    try {
      await exportImage({
        path: options.sourcePath,
        outputPath: output,
        adjustments: options.adjustments,
        layers: options.layers,
      });
      options.onStatusChange(statusExportCompleted(output));
    } catch (error) {
      options.onStatusChange(statusExportFailed(error));
    } finally {
      options.onBusyChange(false);
    }
  }, [options]);

  return {
    exportCurrent,
  };
}
