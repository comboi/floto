import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useEditorState } from './useEditorState';
import type { Layer } from '../types';

const layer = (id: string, enabled = true): Layer => ({
  id,
  name: id,
  kind: 'image',
  enabled,
  opacity: 1,
  intensity: 1,
  blendMode: 'normal',
} as unknown as Layer);

function setupWithLayers(layers: Layer[]) {
  const hook = renderHook(() => useEditorState());
  act(() => hook.result.current.setLayers(layers));
  return hook;
}

const ids = (layers: Layer[]) => layers.map((entry) => entry.id);

describe('useEditorState.moveLayer', () => {
  it('moves a layer down to the position of the target', () => {
    const { result } = setupWithLayers([layer('a'), layer('b'), layer('c')]);

    act(() => result.current.moveLayer('a', 'c'));
    expect(ids(result.current.layers)).toEqual(['b', 'c', 'a']);
  });

  it('moves a layer up to the position of the target', () => {
    const { result } = setupWithLayers([layer('a'), layer('b'), layer('c')]);

    act(() => result.current.moveLayer('c', 'a'));
    expect(ids(result.current.layers)).toEqual(['c', 'a', 'b']);
  });

  it('keeps the same order when source and target are the same layer', () => {
    const { result } = setupWithLayers([layer('a'), layer('b')]);
    const before = result.current.layers;

    act(() => result.current.moveLayer('a', 'a'));
    expect(result.current.layers).toBe(before);
  });

  it('ignores unknown layer ids', () => {
    const { result } = setupWithLayers([layer('a'), layer('b')]);
    const before = result.current.layers;

    act(() => result.current.moveLayer('missing', 'b'));
    act(() => result.current.moveLayer('a', 'missing'));
    expect(result.current.layers).toBe(before);
  });

  it('keeps the enabled flag of a disabled layer when it moves', () => {
    const { result } = setupWithLayers([layer('a', false), layer('b'), layer('c')]);

    act(() => result.current.moveLayer('a', 'c'));
    expect(ids(result.current.layers)).toEqual(['b', 'c', 'a']);
    expect(result.current.layers[2].enabled).toBe(false);
  });
});
