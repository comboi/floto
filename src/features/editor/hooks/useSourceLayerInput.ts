import { useCallback, useEffect, useState } from 'react';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { open } from '@tauri-apps/plugin-dialog';
import {
  STATUS_MESSAGES,
  statusCustomLayersAdded,
  statusSourceLoadedWithLayers,
} from '../statusMessages';

type UseSourceLayerInputOptions = {
  sourcePath: string | null;
  onSetSourcePath: (path: string) => void;
  onResetPreviewState: () => void;
  onAddLayerPaths: (paths: string[]) => void;
  onStatusChange: (status: string) => void;
};

export function useSourceLayerInput(options: UseSourceLayerInputOptions) {
  const [dropActive, setDropActive] = useState(false);

  const handleDroppedPaths = useCallback(async (paths: string[]) => {
    if (paths.length === 0) return;
    const imagePaths = paths.filter((path) => /\.(jpe?g|png|webp|tiff?)$/i.test(path));
    if (imagePaths.length === 0) {
      options.onStatusChange(STATUS_MESSAGES.dropOnlyImages);
      return;
    }

    if (!options.sourcePath) {
      options.onSetSourcePath(imagePaths[0]);
      options.onResetPreviewState();
      options.onStatusChange(STATUS_MESSAGES.sourceLoadedFromDrop);

      if (imagePaths.length > 1) {
        const extra = imagePaths.slice(1);
        options.onAddLayerPaths(extra);
        options.onStatusChange(statusSourceLoadedWithLayers(imagePaths.length - 1));
      }
      return;
    }

    options.onAddLayerPaths(imagePaths);
    options.onStatusChange(statusCustomLayersAdded(imagePaths.length));
  }, [options]);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;

    const bind = async () => {
      unlisten = await getCurrentWebview().onDragDropEvent((event) => {
        if (disposed) return;

        if (event.payload.type === 'enter' || event.payload.type === 'over') {
          setDropActive(true);
          return;
        }
        if (event.payload.type === 'leave') {
          setDropActive(false);
          return;
        }
        if (event.payload.type === 'drop') {
          setDropActive(false);
          void handleDroppedPaths(event.payload.paths);
        }
      });
    };

    void bind();
    return () => {
      disposed = true;
      if (unlisten) unlisten();
    };
  }, [handleDroppedPaths]);

  const openImage = useCallback(async () => {
    const selected = await open({
      title: 'Open image',
      multiple: false,
      filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'tif', 'tiff'] }],
    });
    if (!selected || Array.isArray(selected)) return;

    options.onSetSourcePath(selected);
    options.onResetPreviewState();
    options.onStatusChange(STATUS_MESSAGES.sourceLoaded);
  }, [options]);

  const addLayerFromDialog = useCallback(async () => {
    const selected = await open({
      title: 'Add custom layer',
      multiple: true,
      filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'tif', 'tiff'] }],
    });
    if (!selected) return;
    await handleDroppedPaths(Array.isArray(selected) ? selected : [selected]);
  }, [handleDroppedPaths]);

  return {
    dropActive,
    openImage,
    addLayerFromDialog,
  };
}
