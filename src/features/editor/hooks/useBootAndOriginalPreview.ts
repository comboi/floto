import { useEffect, useState } from 'react';
import { getDefaultState, renderPreview } from '../api/editorApi';
import { neutralAdjustments } from '../config';
import type { DefaultState } from '../types';

export function useBootAndOriginalPreview(
  sourcePath: string | null,
  onHydrateDefaultState: (state: DefaultState) => void,
) {
  const [bootError, setBootError] = useState<string | null>(null);
  const [originalPreviewSrc, setOriginalPreviewSrc] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const loadDefaultState = async () => {
      try {
        const state = await getDefaultState();
        if (!active) return;
        onHydrateDefaultState(state);
      } catch (error) {
        if (!active) return;
        setBootError(String(error));
      }
    };

    void loadDefaultState();
    return () => {
      active = false;
    };
  }, [onHydrateDefaultState]);

  useEffect(() => {
    if (!sourcePath) {
      setOriginalPreviewSrc(null);
      return;
    }

    let active = true;

    const loadOriginalPreview = async () => {
      try {
        const response = await renderPreview({
          path: sourcePath,
          previewMaxSide: 1400,
          adjustments: neutralAdjustments,
          layers: [],
        });
        if (!active) return;
        setOriginalPreviewSrc(response.dataUrl);
      } catch {
        if (!active) return;
        setOriginalPreviewSrc(null);
      }
    };

    void loadOriginalPreview();
    return () => {
      active = false;
    };
  }, [sourcePath]);

  return {
    bootError,
    originalPreviewSrc,
  };
}
