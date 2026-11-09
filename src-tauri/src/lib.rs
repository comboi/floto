mod grain;
use base64::Engine;
use image::imageops::FilterType;
use image::{DynamicImage, GenericImageView, ImageFormat, RgbaImage};
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::Cursor;
use std::path::Path;
use std::sync::{Mutex, OnceLock};

#[derive(Debug, Clone)]
struct CachedPreview {
  path: String,
  max_side: u32,
  source_width: u32,
  source_height: u32,
  preview_source: RgbaImage,
}

static PREVIEW_CACHE: OnceLock<Mutex<Option<CachedPreview>>> = OnceLock::new();

/// Error returned by Tauri commands (D.1): a stable code the UI can branch on, plus a readable message.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct CommandError {
  code: String,
  message: String,
}

impl CommandError {
  fn new(code: &str, message: impl Into<String>) -> Self {
    Self { code: code.to_string(), message: message.into() }
  }
}

// Lets existing `?` on String errors (from helpers that still return String) keep working.
impl From<String> for CommandError {
  fn from(message: String) -> Self {
    Self::new("INTERNAL", message)
  }
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct Adjustments {
  exposure: f32,
  contrast: f32,
  saturation: f32,
  temperature: f32,
  #[serde(default = "default_film_stock")]
  film_stock: String,
  #[serde(default = "default_film_strength")]
  film_strength: f32,
  tint_shift: f32,
  fade: f32,
  grain: f32,
  grain_size: f32,
  #[serde(default = "default_grain_clump")]
  grain_clump: f32,
  #[serde(default = "default_grain_chroma")]
  grain_chroma: f32,
  #[serde(default = "default_grain_softness")]
  grain_softness: f32,
  split_shadows: f32,
  split_highlights: f32,
  split_balance: f32,
  #[serde(default)]
  halation_amount: f32,
  #[serde(default)]
  halation_radius: f32,
  #[serde(default = "default_halation_warmth")]
  halation_warmth: f32,
  vignette: f32,
}

impl Default for Adjustments {
  fn default() -> Self {
    Self {
      exposure: 0.0,
      contrast: 0.0,
      saturation: 0.0,
      temperature: 0.0,
      film_stock: default_film_stock(),
      film_strength: default_film_strength(),
      tint_shift: 0.0,
      fade: 0.0,
      grain: 0.0,
      grain_size: 0.0,
      grain_clump: default_grain_clump(),
      grain_chroma: default_grain_chroma(),
      grain_softness: default_grain_softness(),
      split_shadows: 0.0,
      split_highlights: 0.0,
      split_balance: 0.0,
      halation_amount: 0.0,
      halation_radius: 0.15,
      halation_warmth: default_halation_warmth(),
      vignette: 0.0,
    }
  }
}

fn default_film_stock() -> String {
  "custom".to_string()
}

fn default_film_strength() -> f32 {
  1.0
}

fn default_halation_warmth() -> f32 {
  0.5
}

fn default_grain_clump() -> f32 {
  0.45
}

fn default_grain_chroma() -> f32 {
  0.2
}

fn default_grain_softness() -> f32 {
  0.2
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum FilmStock {
  None,
  Portra400,
  Portra400Over,
  Agfa400,
  IlfordHp5,
  IlfordHp5_400,
  IlfordHp5_800,
  IlfordHp5_1600,
  Custom,
}

impl FilmStock {
  fn from_id(id: &str) -> Self {
    match id.to_ascii_lowercase().as_str() {
      "none" => Self::None,
      "portra400" | "kodak_portra_400" => Self::Portra400,
      "portra400_over" | "kodak_portra_400_over" => Self::Portra400Over,
      "agfa_vista_400" | "agfa_vista400" => Self::Agfa400,
      "ilfordhp5" | "ilford_hp5" | "ilford_hp5_plus" => Self::IlfordHp5,
      "ilfordhp5_400" => Self::IlfordHp5_400,
      "ilfordhp5_800" => Self::IlfordHp5_800,
      "ilfordhp5_1600" => Self::IlfordHp5_1600,
      _ => Self::Custom,
    }
  }
}

#[derive(Debug, Clone, Copy)]
struct BaseAdjustments {
  exposure: f32,
  contrast: f32,
  saturation: f32,
  temperature: f32,
  fade: f32,
  vignette: f32,
}

#[derive(Debug, Clone, Copy)]
struct FilmSimulationSettings {
  stock: FilmStock,
  film_strength: f32,
  tint_shift: f32,
  split_shadows: f32,
  split_highlights: f32,
  split_balance: f32,
  halation_amount: f32,
  halation_radius: f32,
  halation_warmth: f32,
  grain_amount: f32,
  grain_size: f32,
  grain_clump: f32,
  grain_chroma: f32,
  grain_softness: f32,
}

impl From<&Adjustments> for BaseAdjustments {
  fn from(adjustments: &Adjustments) -> Self {
    Self {
      exposure: adjustments.exposure,
      contrast: adjustments.contrast,
      saturation: adjustments.saturation,
      temperature: adjustments.temperature,
      fade: adjustments.fade,
      vignette: adjustments.vignette,
    }
  }
}

impl From<&Adjustments> for FilmSimulationSettings {
  fn from(adjustments: &Adjustments) -> Self {
    Self {
      stock: FilmStock::from_id(&adjustments.film_stock),
      film_strength: adjustments.film_strength,
      tint_shift: adjustments.tint_shift,
      split_shadows: adjustments.split_shadows,
      split_highlights: adjustments.split_highlights,
      split_balance: adjustments.split_balance,
      halation_amount: adjustments.halation_amount,
      halation_radius: adjustments.halation_radius,
      halation_warmth: adjustments.halation_warmth,
      grain_amount: adjustments.grain,
      grain_size: adjustments.grain_size,
      grain_clump: adjustments.grain_clump,
      grain_chroma: adjustments.grain_chroma,
      grain_softness: adjustments.grain_softness,
    }
  }
}

#[derive(Debug, Clone, Copy)]
struct FilmProfile {
  base_saturation: f32,
  contrast_bias: f32,
  toe: f32,
  shoulder: f32,
  channel_mix: [[f32; 3]; 3],
  monochrome_strength: f32,
  tint_shift: f32,
  split_shadows: f32,
  split_highlights: f32,
  split_balance: f32,
  shadow_tint: [f32; 3],
  highlight_tint: [f32; 3],
  shadow_strength: f32,
  highlight_strength: f32,
  grain_size_bias: f32,
  grain_chroma: f32,
  halation_red: f32,
  halation_green: f32,
  halation_blue: f32,
}

fn film_profile(stock: FilmStock) -> FilmProfile {
  match stock {
    FilmStock::Portra400 => FilmProfile {
      base_saturation: 1.05,
      contrast_bias: 0.04,
      toe: 0.10,
      shoulder: 0.16,
      channel_mix: [
        [1.04, -0.02, -0.02],
        [0.00, 1.01, -0.01],
        [-0.01, -0.03, 1.04],
      ],
      monochrome_strength: 0.0,
      tint_shift: -0.02,
      split_shadows: 0.34,
      split_highlights: 0.10,
      split_balance: -0.16,
      shadow_tint: [0.23, 0.34, 0.54],
      highlight_tint: [0.84, 0.80, 0.73],
      shadow_strength: 0.35,
      highlight_strength: 0.16,
      grain_size_bias: 0.25,
      grain_chroma: 0.22,
      halation_red: 1.0,
      halation_green: 0.42,
      halation_blue: 0.2,
    },
    FilmStock::Portra400Over => FilmProfile {
      base_saturation: 0.98,
      contrast_bias: -0.03,
      toe: 0.16,
      shoulder: 0.22,
      channel_mix: [
        [1.03, -0.02, -0.01],
        [0.00, 1.00, 0.00],
        [0.00, -0.02, 1.02],
      ],
      monochrome_strength: 0.0,
      tint_shift: -0.03,
      split_shadows: 0.30,
      split_highlights: 0.12,
      split_balance: -0.20,
      shadow_tint: [0.24, 0.36, 0.56],
      highlight_tint: [0.87, 0.83, 0.76],
      shadow_strength: 0.34,
      highlight_strength: 0.18,
      grain_size_bias: 0.30,
      grain_chroma: 0.20,
      halation_red: 1.0,
      halation_green: 0.45,
      halation_blue: 0.22,
    },
    FilmStock::Agfa400 => FilmProfile {
      base_saturation: 1.12,
      contrast_bias: 0.02,
      toe: 0.12,
      shoulder: 0.18,
      channel_mix: [
        [1.05, -0.03, -0.02],
        [0.00, 1.00, 0.00],
        [-0.01, -0.02, 1.03],
      ],
      monochrome_strength: 0.0,
      tint_shift: -0.01,
      split_shadows: 0.28,
      split_highlights: 0.10,
      split_balance: -0.12,
      shadow_tint: [0.22, 0.34, 0.52],
      highlight_tint: [0.86, 0.82, 0.74],
      shadow_strength: 0.32,
      highlight_strength: 0.16,
      grain_size_bias: 0.34,
      grain_chroma: 0.42,
      halation_red: 0.95,
      halation_green: 0.40,
      halation_blue: 0.18,
    },
    FilmStock::IlfordHp5 => FilmProfile {
      base_saturation: 0.20,
      contrast_bias: 0.10,
      toe: 0.18,
      shoulder: 0.10,
      channel_mix: [
        [1.00, 0.00, 0.00],
        [0.00, 1.00, 0.00],
        [0.00, 0.00, 1.00],
      ],
      monochrome_strength: 0.92,
      tint_shift: 0.0,
      split_shadows: 0.07,
      split_highlights: 0.05,
      split_balance: -0.06,
      shadow_tint: [0.31, 0.32, 0.35],
      highlight_tint: [0.70, 0.70, 0.70],
      shadow_strength: 0.10,
      highlight_strength: 0.07,
      grain_size_bias: 0.62,
      grain_chroma: 0.0,
      halation_red: 0.72,
      halation_green: 0.62,
      halation_blue: 0.58,
    },
    FilmStock::IlfordHp5_400 => FilmProfile {
      base_saturation: 0.14,
      contrast_bias: 0.06,
      toe: 0.16,
      shoulder: 0.12,
      channel_mix: [
        [1.00, 0.00, 0.00],
        [0.00, 1.00, 0.00],
        [0.00, 0.00, 1.00],
      ],
      monochrome_strength: 0.97,
      tint_shift: 0.0,
      split_shadows: 0.06,
      split_highlights: 0.04,
      split_balance: -0.08,
      shadow_tint: [0.31, 0.32, 0.35],
      highlight_tint: [0.70, 0.70, 0.70],
      shadow_strength: 0.10,
      highlight_strength: 0.07,
      grain_size_bias: 0.52,
      grain_chroma: 0.0,
      halation_red: 0.72,
      halation_green: 0.62,
      halation_blue: 0.58,
    },
    FilmStock::IlfordHp5_800 => FilmProfile {
      base_saturation: 0.10,
      contrast_bias: 0.18,
      toe: 0.24,
      shoulder: 0.14,
      channel_mix: [
        [1.00, 0.00, 0.00],
        [0.00, 1.00, 0.00],
        [0.00, 0.00, 1.00],
      ],
      monochrome_strength: 1.0,
      tint_shift: 0.0,
      split_shadows: 0.08,
      split_highlights: 0.05,
      split_balance: -0.10,
      shadow_tint: [0.30, 0.31, 0.34],
      highlight_tint: [0.69, 0.69, 0.69],
      shadow_strength: 0.12,
      highlight_strength: 0.08,
      grain_size_bias: 0.64,
      grain_chroma: 0.0,
      halation_red: 0.70,
      halation_green: 0.61,
      halation_blue: 0.57,
    },
    FilmStock::IlfordHp5_1600 => FilmProfile {
      base_saturation: 0.08,
      contrast_bias: 0.24,
      toe: 0.30,
      shoulder: 0.17,
      channel_mix: [
        [1.00, 0.00, 0.00],
        [0.00, 1.00, 0.00],
        [0.00, 0.00, 1.00],
      ],
      monochrome_strength: 1.0,
      tint_shift: 0.0,
      split_shadows: 0.10,
      split_highlights: 0.06,
      split_balance: -0.12,
      shadow_tint: [0.30, 0.31, 0.33],
      highlight_tint: [0.68, 0.68, 0.68],
      shadow_strength: 0.14,
      highlight_strength: 0.09,
      grain_size_bias: 0.76,
      grain_chroma: 0.0,
      halation_red: 0.68,
      halation_green: 0.60,
      halation_blue: 0.56,
    },
    FilmStock::None => FilmProfile {
      base_saturation: 1.0,
      contrast_bias: 0.0,
      toe: 0.0,
      shoulder: 0.0,
      channel_mix: [
        [1.0, 0.0, 0.0],
        [0.0, 1.0, 0.0],
        [0.0, 0.0, 1.0],
      ],
      monochrome_strength: 0.0,
      tint_shift: 0.0,
      split_shadows: 0.0,
      split_highlights: 0.0,
      split_balance: 0.0,
      shadow_tint: [0.22, 0.34, 0.50],
      highlight_tint: [0.84, 0.79, 0.68],
      shadow_strength: 0.28,
      highlight_strength: 0.24,
      grain_size_bias: 0.0,
      grain_chroma: 0.0,
      halation_red: 0.85,
      halation_green: 0.55,
      halation_blue: 0.3,
    },
    FilmStock::Custom => FilmProfile {
      base_saturation: 1.0,
      contrast_bias: 0.0,
      toe: 0.0,
      shoulder: 0.0,
      channel_mix: [
        [1.0, 0.0, 0.0],
        [0.0, 1.0, 0.0],
        [0.0, 0.0, 1.0],
      ],
      monochrome_strength: 0.0,
      tint_shift: 0.0,
      split_shadows: 0.0,
      split_highlights: 0.0,
      split_balance: 0.0,
      shadow_tint: [0.22, 0.34, 0.50],
      highlight_tint: [0.84, 0.79, 0.68],
      shadow_strength: 0.28,
      highlight_strength: 0.24,
      grain_size_bias: 0.0,
      grain_chroma: 0.10,
      halation_red: 0.9,
      halation_green: 0.55,
      halation_blue: 0.3,
    },
  }
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct Layer {
  id: String,
  name: String,
  kind: String,
  enabled: bool,
  opacity: f32,
  blend_mode: String,
  color: [u8; 3],
  intensity: f32,
  image_path: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RenderRequest {
  path: String,
  preview_max_side: u32,
  adjustments: Adjustments,
  layers: Vec<Layer>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExportRequest {
  path: String,
  output_path: String,
  adjustments: Adjustments,
  layers: Vec<Layer>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ImageInfo {
  width: u32,
  height: u32,
  preview_width: u32,
  preview_height: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RenderResponse {
  data_url: String,
  info: ImageInfo,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DefaultState {
  adjustments: Adjustments,
  layers: Vec<Layer>,
}

#[tauri::command]
fn default_state() -> DefaultState {
  DefaultState {
    adjustments: Adjustments::default(),
    layers: vec![
      Layer {
        id: "warm-film".to_string(),
        name: "Warm Film".to_string(),
        kind: "color".to_string(),
        enabled: false,
        opacity: 0.22,
        blend_mode: "soft_light".to_string(),
        color: [244, 191, 125],
        intensity: 0.65,
        image_path: None,
      },
      Layer {
        id: "teal-shadows".to_string(),
        name: "Teal Shadows".to_string(),
        kind: "color".to_string(),
        enabled: false,
        opacity: 0.20,
        blend_mode: "overlay".to_string(),
        color: [57, 112, 121],
        intensity: 0.55,
        image_path: None,
      },
      Layer {
        id: "light-leak".to_string(),
        name: "Light Leak".to_string(),
        kind: "color".to_string(),
        enabled: false,
        opacity: 0.35,
        blend_mode: "screen".to_string(),
        color: [255, 132, 78],
        intensity: 0.80,
        image_path: None,
      },
    ],
  }
}

#[tauri::command]
fn render_preview(request: RenderRequest) -> Result<RenderResponse, CommandError> {
  let preview_max_side = request.preview_max_side.max(512);
  let (preview, width, height) = load_preview_source(&request.path, preview_max_side)?;
  let processed = process_image(preview, &request.adjustments, &request.layers);
  let processed_width = processed.width();
  let processed_height = processed.height();

  let mut png_bytes = Vec::new();
  DynamicImage::ImageRgba8(processed)
    .write_to(&mut Cursor::new(&mut png_bytes), ImageFormat::Png)
    .map_err(|err| format!("Failed to encode preview PNG: {err}"))?;

  let data_url = format!(
    "data:image/png;base64,{}",
    base64::engine::general_purpose::STANDARD.encode(png_bytes)
  );

  Ok(RenderResponse {
    data_url,
    info: ImageInfo {
      width,
      height,
      preview_width: processed_width,
      preview_height: processed_height,
    },
  })
}

#[tauri::command]
fn export_image(request: ExportRequest) -> Result<String, CommandError> {
  let image = image::open(&request.path)
    .map_err(|err| format!("Failed to open image '{}': {err}", request.path))?;
  let source = image.to_rgba8();
  let processed = process_image(source, &request.adjustments, &request.layers);
  let extension = Path::new(&request.output_path)
    .extension()
    .and_then(|ext| ext.to_str())
    .unwrap_or("png")
    .to_lowercase();

  let format = match extension.as_str() {
    "jpg" | "jpeg" => ImageFormat::Jpeg,
    "webp" => ImageFormat::WebP,
    "tif" | "tiff" => ImageFormat::Tiff,
    _ => ImageFormat::Png,
  };

  DynamicImage::ImageRgba8(processed)
    .save_with_format(&request.output_path, format)
    .map_err(|err| format!("Failed to export image '{}': {err}", request.output_path))?;

  Ok(request.output_path)
}

fn resize_for_preview(image: DynamicImage, max_side: u32) -> RgbaImage {
  let (width, height) = image.dimensions();
  let longest = width.max(height) as f32;
  if longest <= max_side as f32 {
    return image.to_rgba8();
  }

  let scale = max_side as f32 / longest;
  let new_width = (width as f32 * scale).round().max(1.0) as u32;
  let new_height = (height as f32 * scale).round().max(1.0) as u32;
  image
    .resize_exact(new_width, new_height, FilterType::Triangle)
    .to_rgba8()
}

fn load_preview_source(path: &str, max_side: u32) -> Result<(RgbaImage, u32, u32), CommandError> {
  let cache = PREVIEW_CACHE.get_or_init(|| Mutex::new(None));
  let mut guard = cache
    .lock()
    .map_err(|_| CommandError::new("PREVIEW_CACHE_LOCKED", "Preview cache lock poisoned"))?;

  if let Some(entry) = guard.as_ref() {
    if entry.path == path && entry.max_side == max_side {
      return Ok((
        entry.preview_source.clone(),
        entry.source_width,
        entry.source_height,
      ));
    }
  }

  let image = image::open(path).map_err(|err| format!("Failed to open image '{}': {err}", path))?;
  let (source_width, source_height) = image.dimensions();
  let preview = resize_for_preview(image, max_side);

  *guard = Some(CachedPreview {
    path: path.to_string(),
    max_side,
    source_width,
    source_height,
    preview_source: preview.clone(),
  });

  Ok((preview, source_width, source_height))
}

fn process_image(mut image: RgbaImage, adjustments: &Adjustments, layers: &[Layer]) -> RgbaImage {
  let base = BaseAdjustments::from(adjustments);
  let film = FilmSimulationSettings::from(adjustments);

  let mut timer = StageTimer::start();
  apply_base_adjustments(&mut image, &base);
  timer.lap("base adjustments");
  apply_film_simulation(&mut image, &film);
  timer.lap("film simulation");
  apply_layers(&mut image, layers);
  timer.lap("layers");
  image
}

/// Per-stage timing for the render pipeline (D.3). Compiled into debug builds only, so release
/// output and speed are unchanged. Each lap is logged with the stage name and elapsed milliseconds.
struct StageTimer {
  #[cfg(debug_assertions)]
  last: std::time::Instant,
}

impl StageTimer {
  fn start() -> Self {
    Self {
      #[cfg(debug_assertions)]
      last: std::time::Instant::now(),
    }
  }

  #[allow(unused_variables)]
  fn lap(&mut self, stage: &str) {
    #[cfg(debug_assertions)]
    {
      let ms = self.last.elapsed().as_secs_f64() * 1000.0;
      eprintln!("[render] {stage}: {ms:.1} ms");
      self.last = std::time::Instant::now();
    }
  }
}

fn apply_base_adjustments(image: &mut RgbaImage, adjustments: &BaseAdjustments) {
  let width_u32 = image.width().max(1);
  let width_usize = width_u32 as usize;
  let width = width_u32 as f32;
  let height = image.height().max(1) as f32;
  let center_x = width * 0.5;
  let center_y = height * 0.5;
  let max_distance = (center_x * center_x + center_y * center_y).sqrt().max(1.0);

  let row_stride = width_usize * 4;

  image
    .as_mut()
    .par_chunks_mut(row_stride)
    .enumerate()
    .for_each(|(y, row)| {
      for x in 0..width_usize {
        let idx = x * 4;
        let mut r = row[idx] as f32 / 255.0;
        let mut g = row[idx + 1] as f32 / 255.0;
        let mut b = row[idx + 2] as f32 / 255.0;

        let exposure_factor = 2.0_f32.powf(adjustments.exposure);
        r *= exposure_factor;
        g *= exposure_factor;
        b *= exposure_factor;

        let contrast = adjustments.contrast.clamp(-1.0, 1.0);
        r = ((r - 0.5) * (1.0 + contrast)) + 0.5;
        g = ((g - 0.5) * (1.0 + contrast)) + 0.5;
        b = ((b - 0.5) * (1.0 + contrast)) + 0.5;

        let luma = (0.2126 * r) + (0.7152 * g) + (0.0722 * b);
        let saturation_factor = 1.0 + adjustments.saturation.clamp(-1.0, 1.0);
        r = luma + (r - luma) * saturation_factor;
        g = luma + (g - luma) * saturation_factor;
        b = luma + (b - luma) * saturation_factor;

        let warm_shift = adjustments.temperature.clamp(-1.0, 1.0) * 0.18;
        r += warm_shift;
        b -= warm_shift;

        let fade = adjustments.fade.clamp(0.0, 1.0) * 0.55;
        r = mix(r, 0.56, fade);
        g = mix(g, 0.55, fade);
        b = mix(b, 0.53, fade);

        let vignette = adjustments.vignette.clamp(0.0, 1.0);
        if vignette > 0.0 {
          let dx = x as f32 - center_x;
          let dy = y as f32 - center_y;
          let distance = (dx * dx + dy * dy).sqrt() / max_distance;
          let edge = distance.powf(1.35).clamp(0.0, 1.0);
          let vignette_factor = 1.0 - edge * vignette * 0.75;
          r *= vignette_factor;
          g *= vignette_factor;
          b *= vignette_factor;
        }

        row[idx] = to_byte(r);
        row[idx + 1] = to_byte(g);
        row[idx + 2] = to_byte(b);
      }
    });
}

fn apply_film_simulation(image: &mut RgbaImage, settings: &FilmSimulationSettings) {
  let profile = film_profile(settings.stock);
  let strength = settings.film_strength.clamp(0.0, 1.5);
  apply_stock_tone_model(image, profile, strength);
  apply_split_toning(image, settings, profile, strength);
  apply_halation(image, settings, profile, strength);
  apply_film_grain(image, settings, profile, strength);
}

fn apply_stock_tone_model(image: &mut RgbaImage, profile: FilmProfile, strength: f32) {
  let sat_mult = 1.0 + (profile.base_saturation - 1.0) * strength;
  let contrast = profile.contrast_bias * strength;
  let toe = profile.toe * strength;
  let shoulder = profile.shoulder * strength;
  let mono = profile.monochrome_strength * strength;

  image.as_mut().par_chunks_mut(4).for_each(|pixel| {
    let mut r = pixel[0] as f32 / 255.0;
    let mut g = pixel[1] as f32 / 255.0;
    let mut b = pixel[2] as f32 / 255.0;

    r = ((r - 0.5) * (1.0 + contrast)) + 0.5;
    g = ((g - 0.5) * (1.0 + contrast)) + 0.5;
    b = ((b - 0.5) * (1.0 + contrast)) + 0.5;

    r = tone_curve(r, toe, shoulder);
    g = tone_curve(g, toe, shoulder);
    b = tone_curve(b, toe, shoulder);

    let mr = r * profile.channel_mix[0][0] + g * profile.channel_mix[0][1] + b * profile.channel_mix[0][2];
    let mg = r * profile.channel_mix[1][0] + g * profile.channel_mix[1][1] + b * profile.channel_mix[1][2];
    let mb = r * profile.channel_mix[2][0] + g * profile.channel_mix[2][1] + b * profile.channel_mix[2][2];

    let luma = (0.2126 * mr) + (0.7152 * mg) + (0.0722 * mb);
    let sr = luma + (mr - luma) * sat_mult;
    let sg = luma + (mg - luma) * sat_mult;
    let sb = luma + (mb - luma) * sat_mult;

    let mono_r = luma;
    let mono_g = luma;
    let mono_b = luma;

    r = mix(sr, mono_r, mono);
    g = mix(sg, mono_g, mono);
    b = mix(sb, mono_b, mono);

    pixel[0] = to_byte(r);
    pixel[1] = to_byte(g);
    pixel[2] = to_byte(b);
  });
}

/// Sobel gradient magnitude of the highlight field at (x, y), normalised to 0..=1.
/// High values mark bright contours; flat highlight areas return near 0.
fn highlight_edge_strength(field: &[f32], w: usize, h: usize, x: usize, y: usize) -> f32 {
  if x == 0 || y == 0 || x + 1 >= w || y + 1 >= h {
    return 0.0;
  }
  let at = |dx: isize, dy: isize| -> f32 {
    let sx = (x as isize + dx) as usize;
    let sy = (y as isize + dy) as usize;
    field[sy * w + sx]
  };
  let gx = (at(1, -1) + 2.0 * at(1, 0) + at(1, 1)) - (at(-1, -1) + 2.0 * at(-1, 0) + at(-1, 1));
  let gy = (at(-1, 1) + 2.0 * at(0, 1) + at(1, 1)) - (at(-1, -1) + 2.0 * at(0, -1) + at(1, -1));
  // Max Sobel magnitude for a 0..1 field is about 4√2; scale so a hard edge reads near 1.
  ((gx * gx + gy * gy).sqrt() / 2.0).clamp(0.0, 1.0)
}

fn apply_halation(
  image: &mut RgbaImage,
  settings: &FilmSimulationSettings,
  profile: FilmProfile,
  strength: f32,
) {
  let amount = settings.halation_amount.clamp(0.0, 1.0) * strength;
  if amount <= 0.0 {
    return;
  }

  let radius = 1_u32 + (settings.halation_radius.clamp(0.0, 1.0) * 14.0).round() as u32;
  let warmth = settings.halation_warmth.clamp(0.0, 1.0);

  let source = image.clone();
  let width = source.width();
  let height = source.height();
  let w = width as usize;
  let h_len = height as usize;
  let sigma = (radius as f32 * 0.6).max(1.0);
  let inv_two_sigma_sq = 1.0 / (2.0 * sigma * sigma);

  // The gaussian weight exp(-(dx²+dy²)/2σ²) factors into exp(-dx²/2σ²)·exp(-dy²/2σ²),
  // so the 2D blur runs as a horizontal pass followed by a vertical pass. Same result,
  // O(radius) per pixel instead of O(radius²).
  let highlight_field: Vec<f32> = source
    .as_raw()
    .chunks_exact(4)
    .map(|p| {
      let l = ((0.2126 * p[0] as f32 / 255.0) + (0.7152 * p[1] as f32 / 255.0) + (0.0722 * p[2] as f32 / 255.0)).clamp(0.0, 1.0);
      ((l - 0.58) / 0.42).clamp(0.0, 1.0)
    })
    .collect();

  let mut horizontal_sum = vec![0.0_f32; w * h_len];
  let mut horizontal_weight = vec![0.0_f32; w * h_len];
  for y in 0..h_len {
    for x in 0..w {
      let x0 = x.saturating_sub(radius as usize);
      let x1 = (x + radius as usize).min(w - 1);
      let mut accum = 0.0_f32;
      let mut weight_sum = 0.0_f32;
      for sx in x0..=x1 {
        let dx = sx as f32 - x as f32;
        let weight = (-dx * dx * inv_two_sigma_sq).exp();
        accum += highlight_field[y * w + sx] * weight;
        weight_sum += weight;
      }
      horizontal_sum[y * w + x] = accum;
      horizontal_weight[y * w + x] = weight_sum;
    }
  }

  let mut vertical_sum = vec![0.0_f32; w * h_len];
  let mut vertical_weight = vec![0.0_f32; w * h_len];
  for y in 0..h_len {
    let y0 = y.saturating_sub(radius as usize);
    let y1 = (y + radius as usize).min(h_len - 1);
    for x in 0..w {
      let mut accum = 0.0_f32;
      let mut weight_sum = 0.0_f32;
      for sy in y0..=y1 {
        let dy = sy as f32 - y as f32;
        let weight = (-dy * dy * inv_two_sigma_sq).exp();
        accum += horizontal_sum[sy * w + x] * weight;
        weight_sum += horizontal_weight[sy * w + x] * weight;
      }
      vertical_sum[y * w + x] = accum;
      vertical_weight[y * w + x] = weight_sum;
    }
  }

  for y in 0..height {
    for x in 0..width {
      let src = source.get_pixel(x, y);
      let base_r = src[0] as f32 / 255.0;
      let base_g = src[1] as f32 / 255.0;
      let base_b = src[2] as f32 / 255.0;
      let base_luma = ((0.2126 * base_r) + (0.7152 * base_g) + (0.0722 * base_b)).clamp(0.0, 1.0);
      let source_highlight = ((base_luma - 0.66) / 0.34).clamp(0.0, 1.0);

      let idx = y as usize * w + x as usize;
      let accum = vertical_sum[idx];
      let weight_sum = vertical_weight[idx];

      if weight_sum <= 0.0 {
        continue;
      }

      let halo_field = (accum / weight_sum).clamp(0.0, 1.0);
      // Halation is light spilling out of bright areas, so it scales with how bright the pixel
      // is. Mid-tones and shadows get almost none (floor 0.15 keeps highlight-free patches alive).
      // B.2: weight by highlight-edge strength so the halo follows bright contours.
      let edge = highlight_edge_strength(&highlight_field, w, h_len, x as usize, y as usize);
      let halo = halo_field * source_highlight.max(0.15) * (0.35 + 0.65 * edge) * amount * 2.2;
      if halo <= 0.0 {
        continue;
      }

      let red_boost = profile.halation_red * (0.6 + warmth * 0.6);
      let green_boost = profile.halation_green * (0.5 + warmth * 0.35);
      let blue_boost = profile.halation_blue * (0.45 + (1.0 - warmth) * 0.2);

      let dst = image.get_pixel_mut(x, y);
      let dr = dst[0] as f32 / 255.0;
      let dg = dst[1] as f32 / 255.0;
      let db = dst[2] as f32 / 255.0;

      dst[0] = to_byte((dr + halo * red_boost * 0.46).clamp(0.0, 1.0));
      dst[1] = to_byte((dg + halo * green_boost * 0.31).clamp(0.0, 1.0));
      dst[2] = to_byte((db + halo * blue_boost * 0.18).clamp(0.0, 1.0));
    }
  }
}

fn apply_split_toning(
  image: &mut RgbaImage,
  settings: &FilmSimulationSettings,
  profile: FilmProfile,
  strength: f32,
) {
  let split_balance = (profile.split_balance + settings.split_balance).clamp(-1.0, 1.0);
  let split_shadows = (profile.split_shadows + settings.split_shadows).clamp(0.0, 1.0);
  let split_highlights = (profile.split_highlights + settings.split_highlights).clamp(0.0, 1.0);
  let tint_shift = (profile.tint_shift + settings.tint_shift).clamp(-1.0, 1.0) * 0.12 * strength;

  image.as_mut().par_chunks_mut(4).for_each(|pixel| {
    let mut r = pixel[0] as f32 / 255.0;
    let mut g = pixel[1] as f32 / 255.0;
    let mut b = pixel[2] as f32 / 255.0;

    g += tint_shift;
    r -= tint_shift * 0.45;
    b -= tint_shift * 0.45;

    let tone_luma = ((0.2126 * r) + (0.7152 * g) + (0.0722 * b)).clamp(0.0, 1.0);
    let shadows_weight = ((0.62 - (tone_luma + split_balance * 0.22)) / 0.62).clamp(0.0, 1.0);
    let highlights_weight = (((tone_luma - 0.38) + split_balance * 0.22) / 0.62).clamp(0.0, 1.0);

    let shadow_mix = split_shadows * shadows_weight * profile.shadow_strength * strength;
    let highlight_mix = split_highlights * highlights_weight * profile.highlight_strength * strength;

    r = mix(r, profile.shadow_tint[0], shadow_mix);
    g = mix(g, profile.shadow_tint[1], shadow_mix);
    b = mix(b, profile.shadow_tint[2], shadow_mix);

    r = mix(r, profile.highlight_tint[0], highlight_mix);
    g = mix(g, profile.highlight_tint[1], highlight_mix);
    b = mix(b, profile.highlight_tint[2], highlight_mix);

    pixel[0] = to_byte(r);
    pixel[1] = to_byte(g);
    pixel[2] = to_byte(b);
  });
}

/// Nominal ISO of a stock, or None when the stock has no ISO (neutral/custom).
fn stock_iso(stock: FilmStock) -> Option<u32> {
  match stock {
    FilmStock::Portra400 | FilmStock::Portra400Over | FilmStock::Agfa400 => Some(400),
    FilmStock::IlfordHp5 | FilmStock::IlfordHp5_400 => Some(400),
    FilmStock::IlfordHp5_800 => Some(800),
    FilmStock::IlfordHp5_1600 => Some(1600),
    FilmStock::None | FilmStock::Custom => None,
  }
}

/// Grain intensity and size multipliers per ISO. Faster film is grainier and coarser.
/// Neutral/custom stocks keep 1.0 so their output is unchanged.
fn iso_grain_curve(stock: FilmStock) -> (f32, f32) {
  match stock_iso(stock) {
    None => (1.0, 1.0),
    Some(iso) => {
      // log2 steps from ISO 400: 400 -> 0, 800 -> 1, 1600 -> 2.
      let stops = (iso as f32 / 400.0).log2().max(0.0);
      // Size is not scaled by ISO: the stock presets already set grainSize per ISO, and
      // scaling it again pushed ISO 1600 past a coarse, blocky grain.
      (1.0 + 0.22 * stops, 1.0)
    }
  }
}

fn apply_film_grain(
  image: &mut RgbaImage,
  settings: &FilmSimulationSettings,
  profile: FilmProfile,
  strength: f32,
) {
  let (iso_intensity, _iso_size) = iso_grain_curve(settings.stock);
  let amount = settings.grain_amount.clamp(0.0, 1.0) * strength * iso_intensity;
  if amount <= 0.0 {
    return;
  }

  let width = image.width() as usize;
  let height = image.height() as usize;

  // Grain size: user grainSize plus the stock bias, mapped to a grain radius in pixels. The radius
  // is scaled by the image diagonal against a 1400 px reference, so preview and export match.
  let size = (settings.grain_size.clamp(0.0, 1.0) * 0.7 + profile.grain_size_bias * 0.3).clamp(0.0, 1.0);
  let diag_scale = ((width * width + height * height) as f32).sqrt() / 1400.0;
  let mean_radius = ((0.15 + size * 0.45) * diag_scale).max(0.25);

  let model = grain::GrainModel {
    mean_radius,
    radius_std: mean_radius * (0.25 + 0.5 * settings.grain_clump.clamp(0.0, 1.0)),
    sigma_filter: mean_radius * 0.7,
    monte_carlo: 24,
    seed: stock_grain_seed(settings.stock),
  };

  // Luminance drives the Poisson density. Render coverage on luma, then apply it to all channels.
  let gray: Vec<f32> = image
    .as_raw()
    .chunks_exact(4)
    .map(|p| (0.2126 * p[0] as f32 + 0.7152 * p[1] as f32 + 0.0722 * p[2] as f32) / 255.0)
    .collect();

  let coverage = grain::grain_coverage(&gray, width, height, &model);

  // Coverage is 0..1 per pixel. Centre it so grain darkens and lightens rather than only adding.
  let depth = amount * 0.35;
  image
    .as_mut()
    .chunks_exact_mut(4)
    .zip(coverage.iter())
    .for_each(|(dst, &c)| {
      let delta = (c - 0.5) * depth * 255.0;
      dst[0] = (dst[0] as f32 + delta).clamp(0.0, 255.0) as u8;
      dst[1] = (dst[1] as f32 + delta).clamp(0.0, 255.0) as u8;
      dst[2] = (dst[2] as f32 + delta).clamp(0.0, 255.0) as u8;
    });
}

/// Fixed seed per stock so each look is reproducible between preview and export.
fn stock_grain_seed(stock: FilmStock) -> u32 {
  match stock {
    FilmStock::Portra400 | FilmStock::Portra400Over => 0x2A7B,
    FilmStock::Agfa400 => 0x5C13,
    FilmStock::IlfordHp5 | FilmStock::IlfordHp5_400 => 0x9E41,
    FilmStock::IlfordHp5_800 => 0xC3A5,
    FilmStock::IlfordHp5_1600 => 0x7F08,
    FilmStock::None | FilmStock::Custom => 0x1D2E,
  }
}

/// Fixed seed per stock so each look is reproducible between preview and export.

/// Fixed seed per stock so each look is reproducible between preview and export.


fn apply_layers(image: &mut RgbaImage, layers: &[Layer]) {
  let mut image_layer_cache: HashMap<String, RgbaImage> = HashMap::new();

  for layer in layers {
    if !layer.enabled || layer.opacity <= 0.0 {
      continue;
    }

    let opacity = layer.opacity.clamp(0.0, 1.0);
    let intensity = layer.intensity.clamp(0.0, 1.0);
    let image_overlay = if layer.kind == "image" {
      if let Some(image_path) = layer.image_path.as_ref() {
        let entry = image_layer_cache.entry(image_path.clone()).or_insert_with(|| {
          load_layer_image(image_path, image.width(), image.height())
            .unwrap_or_else(|_| RgbaImage::new(image.width(), image.height()))
        });
        Some(entry)
      } else {
        None
      }
    } else {
      None
    };

    let over_color = [
      layer.color[0] as f32 / 255.0,
      layer.color[1] as f32 / 255.0,
      layer.color[2] as f32 / 255.0,
    ];

    for (x, y, pixel) in image.enumerate_pixels_mut() {
      let base = [
        pixel[0] as f32 / 255.0,
        pixel[1] as f32 / 255.0,
        pixel[2] as f32 / 255.0,
      ];

      let over = if let Some(ref overlay) = image_overlay {
        let overlay_pixel = overlay.get_pixel(x, y);
        [
          overlay_pixel[0] as f32 / 255.0,
          overlay_pixel[1] as f32 / 255.0,
          overlay_pixel[2] as f32 / 255.0,
        ]
      } else {
        over_color
      };

      let blended = blend(base, over, layer.blend_mode.as_str(), intensity);
      let out_opacity = opacity * intensity;

      pixel[0] = to_byte(mix(base[0], blended[0], out_opacity));
      pixel[1] = to_byte(mix(base[1], blended[1], out_opacity));
      pixel[2] = to_byte(mix(base[2], blended[2], out_opacity));
    }
  }
}

fn load_layer_image(path: &str, width: u32, height: u32) -> Result<RgbaImage, String> {
  let image = image::open(path).map_err(|err| format!("Failed to open layer image '{}': {err}", path))?;
  Ok(
    image
      .resize_exact(width.max(1), height.max(1), FilterType::Triangle)
      .to_rgba8(),
  )
}

fn blend(base: [f32; 3], over: [f32; 3], mode: &str, intensity: f32) -> [f32; 3] {
  let mut out = [0.0; 3];
  for i in 0..3 {
    out[i] = match mode {
      "multiply" => base[i] * over[i],
      "screen" => 1.0 - (1.0 - base[i]) * (1.0 - over[i]),
      "overlay" => {
        if base[i] < 0.5 {
          2.0 * base[i] * over[i]
        } else {
          1.0 - 2.0 * (1.0 - base[i]) * (1.0 - over[i])
        }
      }
      "soft_light" => {
        if over[i] < 0.5 {
          base[i] - (1.0 - 2.0 * over[i]) * base[i] * (1.0 - base[i])
        } else {
          let d = if base[i] < 0.25 {
            ((16.0 * base[i] - 12.0) * base[i] + 4.0) * base[i]
          } else {
            base[i].sqrt()
          };
          base[i] + (2.0 * over[i] - 1.0) * (d - base[i])
        }
      }
      "hard_light" => {
        if over[i] < 0.5 {
          2.0 * base[i] * over[i]
        } else {
          1.0 - 2.0 * (1.0 - base[i]) * (1.0 - over[i])
        }
      }
      "color_dodge" => {
        if over[i] >= 1.0 {
          1.0
        } else {
          (base[i] / (1.0 - over[i])).min(1.0)
        }
      }
      _ => over[i],
    };
    out[i] = mix(base[i], out[i], intensity);
  }
  out
}




fn mix(a: f32, b: f32, t: f32) -> f32 {
  a + (b - a) * t.clamp(0.0, 1.0)
}

fn tone_curve(value: f32, toe: f32, shoulder: f32) -> f32 {
  let x = value.clamp(0.0, 1.0);
  let toe_lift = toe * (1.0 - x) * (1.0 - x) * 0.35;
  let shoulder_compress = shoulder * x * x * 0.35;
  (x + toe_lift - shoulder_compress).clamp(0.0, 1.0)
}

fn to_byte(value: f32) -> u8 {
  (value.clamp(0.0, 1.0) * 255.0).round() as u8
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![default_state, render_preview, export_image])
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}

#[cfg(test)]
mod grain_iso_curve_tests {
  use super::*;

  #[test]
  fn grain_intensity_increases_with_iso() {
    let (i400, _) = iso_grain_curve(FilmStock::IlfordHp5_400);
    let (i800, _) = iso_grain_curve(FilmStock::IlfordHp5_800);
    let (i1600, _) = iso_grain_curve(FilmStock::IlfordHp5_1600);
    assert!(i400 < i800 && i800 < i1600, "intensity should rise with ISO: {i400} {i800} {i1600}");
  }

  #[test]
  fn iso_400_is_the_baseline() {
    assert_eq!(iso_grain_curve(FilmStock::IlfordHp5_400), (1.0, 1.0));
    assert_eq!(iso_grain_curve(FilmStock::Portra400), (1.0, 1.0));
  }

  #[test]
  fn iso_scales_intensity_but_not_size() {
    let (i1600, s1600) = iso_grain_curve(FilmStock::IlfordHp5_1600);
    assert!(i1600 > 1.0, "intensity should rise at ISO 1600");
    assert_eq!(s1600, 1.0, "size is set by grainSize per preset, not by ISO");
  }

  #[test]
  fn stocks_without_iso_are_unchanged() {
    assert_eq!(iso_grain_curve(FilmStock::None), (1.0, 1.0));
    assert_eq!(iso_grain_curve(FilmStock::Custom), (1.0, 1.0));
  }
}

#[cfg(test)]
mod halation_edge_tests {
  use super::*;

  #[test]
  fn flat_field_has_no_edge() {
    let field = vec![0.8_f32; 9 * 9];
    assert_eq!(highlight_edge_strength(&field, 9, 9, 4, 4), 0.0);
  }

  #[test]
  fn hard_vertical_edge_reads_strong() {
    // Left half dark, right half bright: a vertical contour through the middle column.
    let (w, h) = (9, 9);
    let field: Vec<f32> = (0..w * h).map(|i| if i % w >= 5 { 1.0 } else { 0.0 }).collect();
    let edge = highlight_edge_strength(&field, w, h, 4, 4);
    assert!(edge > 0.9, "hard edge should read near 1, got {edge}");
  }

  #[test]
  fn border_pixels_are_zero() {
    let field = vec![1.0_f32; 4 * 4];
    assert_eq!(highlight_edge_strength(&field, 4, 4, 0, 2), 0.0);
  }
}

#[cfg(test)]
mod command_error_shape {
  use super::*;

  #[test]
  fn serializes_as_code_and_message() {
    let err = CommandError::new("PREVIEW_CACHE_LOCKED", "Preview cache lock poisoned");
    let json = serde_json::to_value(&err).expect("serialize");
    assert_eq!(json["code"], "PREVIEW_CACHE_LOCKED");
    assert_eq!(json["message"], "Preview cache lock poisoned");
  }

  #[test]
  fn string_errors_become_internal_code() {
    let err: CommandError = String::from("boom").into();
    let json = serde_json::to_value(&err).expect("serialize");
    assert_eq!(json["code"], "INTERNAL");
    assert_eq!(json["message"], "boom");
  }
}
