import { useMemo } from 'react';
import { STATUS_MESSAGES } from '../statusMessages';
import type { RenderInfo } from '../types';

export function usePreviewMeta(info: RenderInfo | null) {
  const imageStats = useMemo(() => {
    if (!info) return STATUS_MESSAGES.noImageLoaded;
    return `SOURCE ${info.width}x${info.height}  PREVIEW ${info.previewWidth}x${info.previewHeight}`;
  }, [info]);

  return {
    imageStats,
  };
}
