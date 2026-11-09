import { invoke } from '@tauri-apps/api/core';
import type { Adjustments, DefaultState, Layer, RenderResponse } from '../types';

type RenderPreviewRequest = {
  path: string;
  previewMaxSide: number;
  adjustments: Adjustments;
  layers: Layer[];
};

type ExportImageRequest = {
  path: string;
  outputPath: string;
  adjustments: Adjustments;
  layers: Layer[];
};

export async function getDefaultState(): Promise<DefaultState> {
  return invoke<DefaultState>('default_state');
}

export async function renderPreview(request: RenderPreviewRequest): Promise<RenderResponse> {
  return invoke<RenderResponse>('render_preview', { request });
}

export async function exportImage(request: ExportImageRequest): Promise<string> {
  return invoke<string>('export_image', { request });
}
