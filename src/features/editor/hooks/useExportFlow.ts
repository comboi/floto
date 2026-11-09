import { useCallback, useRef } from 'react';
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
  // Same pattern as the other hooks: read the latest options through a ref so the returned
  // callback keeps its identity across renders.
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const exportCurrent = useCallback(async () => {
    const latest = optionsRef.current;
    if (!latest.sourcePath || !latest.adjustments) {
      latest.onStatusChange(STATUS_MESSAGES.loadSourceFirst);
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

    latest.onBusyChange(true);
    latest.onStatusChange(STATUS_MESSAGES.exportingFullResolution);
    try {
      await exportImage({
        path: latest.sourcePath,
        outputPath: output,
        adjustments: latest.adjustments,
        layers: latest.layers,
      });
      latest.onStatusChange(statusExportCompleted(output));
    } catch (error) {
      latest.onStatusChange(statusExportFailed(error));
    } finally {
      latest.onBusyChange(false);
    }
  }, []);

  return {
    exportCurrent,
  };
}
