import type { Layer } from './types';
import type { FilmPresetId } from './types';

export function buildImageLayer(path: string, index: number): Layer {
  const slashParts = path.split('/');
  const backslashParts = path.split('\\');
  const segments =
    slashParts.length > backslashParts.length ? slashParts : backslashParts;
  const fileName = segments[segments.length - 1] ?? `Layer ${index + 1}`;

  return {
    id: `image-layer-${Date.now()}-${index}`,
    name: fileName,
    kind: 'image',
    enabled: true,
    opacity: 0.65,
    blendMode: 'overlay',
    color: [255, 255, 255],
    intensity: 0.85,
    imagePath: path,
  };
}

export function mapLayersForPreset(layers: Layer[], presetId: FilmPresetId): Layer[] {
  if (presetId === 'portra400' || presetId === 'portra400_over') {
    return layers.map((layer) => {
      if (layer.id === 'warm-film') {
        return {
          ...layer,
          enabled: true,
          opacity: 0.2,
          intensity: 0.7,
          blendMode: 'soft_light',
        };
      }
      if (layer.id === 'teal-shadows') {
        return { ...layer, enabled: false };
      }
      return layer;
    });
  }

  if (presetId.startsWith('ilfordhp5')) {
    return layers.map((layer) => {
      if (
        layer.id === 'warm-film' ||
        layer.id === 'teal-shadows' ||
        layer.id === 'light-leak'
      ) {
        return { ...layer, enabled: false };
      }
      return layer;
    });
  }

  return layers.map((layer) => {
    if (layer.id === 'warm-film') {
      return {
        ...layer,
        enabled: false,
        opacity: 0.22,
        intensity: 0.65,
        blendMode: 'soft_light',
      };
    }
    if (layer.id === 'teal-shadows') {
      return {
        ...layer,
        enabled: false,
        opacity: 0.2,
        intensity: 0.55,
        blendMode: 'overlay',
      };
    }
    if (layer.id === 'light-leak') {
      return {
        ...layer,
        enabled: false,
        opacity: 0.35,
        intensity: 0.8,
        blendMode: 'screen',
      };
    }
    return layer;
  });
}
