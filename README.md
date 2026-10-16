# Floto

Minimalist desktop photo editor for macOS focused on film and vintage looks.

## MVP scope

- Open large photos from disk (JPG, PNG, WebP, TIFF)
- Fast preview rendering from a downscaled working image
- Core tonal controls: exposure, contrast, saturation, temperature
- Film controls: fade, tint shift, split toning, grain, halation, vignette
- Layer stack with blend modes and per-layer opacity/intensity
- Custom image layers by drag and drop
- Full-resolution export in JPG, PNG, WebP, TIFF
- Film simulation presets with stock-aware behavior (Portra + HP5 variants)
- Recipe save/apply workflow persisted in local storage
- Recipe naming and quick recall from side panel

## Stack

- Frontend: React 19 + TypeScript + Vite
- Desktop shell: Tauri 2
- Engine: Rust (`image` crate) with a command bridge

## Run

```bash
npm install
npm run tauri:dev
```

## Build

```bash
npm run tauri:build
```

## Architecture notes

- The frontend sends a full editor state to Rust through Tauri commands.
- Preview rendering uses a max-side downscale to keep interaction responsive.
- Preview uses dynamic draft mode while interacting with sliders to keep feedback snappy.
- Film grain simulation now combines layered value-noise fields (micro + clump + subtle chroma separation) to avoid blocky digital pixelation.
- Grain Character controls added: `Grain Clump`, `Grain Chroma`, and `Grain Softness` for dialing analog texture style per image.
- Export always reprocesses from source at full resolution.
- Drag and drop behavior:
  - If no source is loaded, the first dropped image becomes the source.
  - Additional dropped images are appended as custom image layers.
  - If a source is already loaded, all dropped images are added as layers.
- Layer blend modes currently supported in MVP:
  - normal
  - multiply
  - screen
  - overlay
  - soft_light
  - hard_light
  - color_dodge

## Film simulation engine status

- The processing pipeline is separated into:
  - base edits (exposure, contrast, saturation, temperature, fade, vignette)
  - stock-aware film simulation (split toning, halation, grain)
- Stock-aware profiles currently supported:
  - Portra 400
  - Portra 400 Over
  - HP5 400
  - HP5 800
  - HP5 1600
- Halation controls are available and tuned per stock through profile defaults plus user controls.
- Stock profiles now include dedicated tonal response model (toe/shoulder, channel mix, saturation bias).
- Grain model now includes stock-dependent clumping and micro-blur behavior.
- Recipes can be saved/applied/removed from the left panel and are persisted in browser local storage.

## Next steps after MVP

- Tile-based renderer and cache for very large images
- Masking and per-layer transforms
- Preset packs and LUT support
- RAW decoding pipeline integration
- Pro color pipeline: linear workflow, higher precision stages (16-bit/float where needed), and stronger color consistency across devices
- Evaluate specialized libraries for critical operators (advanced blur/halation/resampling/color transforms) while keeping `lib.rs` as orchestration layer
- Add GPU preview path for real-time interaction on heavy edits
- Build an internal REA workflow + dedicated film-emulation skill to extract and systematize film-look heuristics from references and convert them into reproducible profile parameters
- Add validation suite for film emulation quality (A/B reference scenes, grain behavior checks, tone curve stability)
