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
      contrast_bias: 0.12,
      toe: 0.20,
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
fn render_preview(request: RenderRequest) -> Result<RenderResponse, String> {
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
fn export_image(request: ExportRequest) -> Result<String, String> {
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

fn load_preview_source(path: &str, max_side: u32) -> Result<(RgbaImage, u32, u32), String> {
  let cache = PREVIEW_CACHE.get_or_init(|| Mutex::new(None));
  let mut guard = cache
    .lock()
    .map_err(|_| "Preview cache lock poisoned".to_string())?;

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

  apply_base_adjustments(&mut image, &base);
  apply_film_simulation(&mut image, &film);
  apply_layers(&mut image, layers);
  image
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

  for y in 0..height {
    let y0 = y.saturating_sub(radius);
    let y1 = (y + radius).min(height.saturating_sub(1));

    for x in 0..width {
      let src = source.get_pixel(x, y);
      let base_r = src[0] as f32 / 255.0;
      let base_g = src[1] as f32 / 255.0;
      let base_b = src[2] as f32 / 255.0;
      let base_luma = ((0.2126 * base_r) + (0.7152 * base_g) + (0.0722 * base_b)).clamp(0.0, 1.0);
      let source_highlight = ((base_luma - 0.66) / 0.34).clamp(0.0, 1.0);

      let x0 = x.saturating_sub(radius);
      let x1 = (x + radius).min(width.saturating_sub(1));
      let mut accum = 0.0_f32;
      let mut weight_sum = 0.0_f32;

      for sy in y0..=y1 {
        let dy = if sy > y { sy - y } else { y - sy };
        for sx in x0..=x1 {
          let dx = if sx > x { sx - x } else { x - sx };
          let dist = ((dx * dx + dy * dy) as f32).sqrt();
          let sigma = (radius as f32 * 0.6).max(1.0);
          let weight = (-dist * dist / (2.0 * sigma * sigma)).exp();

          let p = source.get_pixel(sx, sy);
          let pr = p[0] as f32 / 255.0;
          let pg = p[1] as f32 / 255.0;
          let pb = p[2] as f32 / 255.0;
          let l = ((0.2126 * pr) + (0.7152 * pg) + (0.0722 * pb)).clamp(0.0, 1.0);
          let h = ((l - 0.58) / 0.42).clamp(0.0, 1.0);

          accum += h * weight;
          weight_sum += weight;
        }
      }

      if weight_sum <= 0.0 {
        continue;
      }

      let halo_field = (accum / weight_sum).clamp(0.0, 1.0);
      let edge_glow = (halo_field - source_highlight * 0.58).max(0.0);
      let halo = edge_glow * amount * 1.65;
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

fn apply_film_grain(
  image: &mut RgbaImage,
  settings: &FilmSimulationSettings,
  profile: FilmProfile,
  strength: f32,
) {
  let grain_strength = settings.grain_amount.clamp(0.0, 1.0) * 0.14 * strength;
  if grain_strength <= 0.0 {
    return;
  }

  let grain_size_value = (settings.grain_size.clamp(0.0, 1.0) * 0.7 + profile.grain_size_bias * 0.3)
    .clamp(0.0, 1.0);

  let width_u32 = image.width().max(1);
  let width_usize = width_u32 as usize;
  let row_stride = width_usize * 4;

  let grain_frequency = 1.0 / (0.75 + grain_size_value * 4.0);

  let clump_scale_base = match settings.stock {
    FilmStock::Portra400 | FilmStock::Portra400Over => 0.34,
    FilmStock::IlfordHp5 | FilmStock::IlfordHp5_400 => 0.48,
    FilmStock::IlfordHp5_800 => 0.56,
    FilmStock::IlfordHp5_1600 => 0.62,
    FilmStock::None | FilmStock::Custom => 0.42,
  };
  let clump_scale = mix(clump_scale_base * 0.55, clump_scale_base * 1.45, settings.grain_clump);

  let blur_mix_base: f32 = match settings.stock {
    FilmStock::Portra400 | FilmStock::Portra400Over => 0.24,
    FilmStock::IlfordHp5 | FilmStock::IlfordHp5_400 => 0.16,
    FilmStock::IlfordHp5_800 => 0.12,
    FilmStock::IlfordHp5_1600 => 0.08,
    FilmStock::None | FilmStock::Custom => 0.18,
  };
  let blur_mix = mix(
    (blur_mix_base * 0.5_f32).clamp(0.0_f32, 0.8_f32),
    (blur_mix_base + 0.45_f32).clamp(0.0_f32, 0.95_f32),
    settings.grain_softness,
  );

  let chroma_scale = settings.grain_chroma.clamp(0.0, 1.0);

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

        let fx = x as f32 * grain_frequency;
        let fy = y as f32 * grain_frequency;

        let luma = ((0.2126 * r) + (0.7152 * g) + (0.0722 * b)).clamp(0.0, 1.0);
        let luma_profile = 1.0 - ((luma - 0.5).abs() * 1.4).clamp(0.0, 1.0);

        let clump_raw = value_noise2d(fx * 0.23 + 7.1, fy * 0.23 + 13.4, 97);
        let clump = ((clump_raw - 0.5) * 2.0).signum() * (clump_raw - 0.5).abs().powf(0.75);

        let micro = value_noise2d(fx + 11.2, fy + 19.8, 31) - 0.5;
        let mid = value_noise2d(fx * 0.65 + 3.4, fy * 0.65 + 9.7, 53) - 0.5;
        let grain_core = mix(micro, mid, 0.34);

        let blur_probe_a = value_noise2d(fx + 0.35, fy, 31) - 0.5;
        let blur_probe_b = value_noise2d(fx, fy + 0.35, 31) - 0.5;
        let micro_blur = mix(grain_core, (blur_probe_a + blur_probe_b) * 0.5, blur_mix);
        let grain_noise = (micro_blur * (0.78 + clump * clump_scale)).clamp(-1.0, 1.0);

        let gr = value_noise2d(fx + 17.1, fy + 5.6, 71) - 0.5;
        let gg = value_noise2d(fx + 23.7, fy + 9.1, 73) - 0.5;
        let gb = value_noise2d(fx + 29.3, fy + 13.8, 79) - 0.5;
        let chroma = profile.grain_chroma * chroma_scale;

        let channel_bias = [
          grain_noise + gr * chroma,
          grain_noise + gg * chroma * 0.8,
          grain_noise + gb * chroma * 1.1,
        ];

        let strength = grain_strength * (0.35 + luma_profile * 0.9);
        r += channel_bias[0] * strength;
        g += channel_bias[1] * strength;
        b += channel_bias[2] * strength;

        row[idx] = to_byte(r);
        row[idx + 1] = to_byte(g);
        row[idx + 2] = to_byte(b);
      }
    });
}

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

fn hash_noise(x: u32, y: u32) -> f32 {
  let mut n = x.wrapping_mul(374_761_393).wrapping_add(y.wrapping_mul(668_265_263));
  n = (n ^ (n >> 13)).wrapping_mul(1_274_126_177);
  ((n ^ (n >> 16)) & 0xffff) as f32 / 65535.0
}

fn smoothstep(t: f32) -> f32 {
  let x = t.clamp(0.0, 1.0);
  x * x * (3.0 - 2.0 * x)
}

fn value_noise2d(x: f32, y: f32, seed: u32) -> f32 {
  let x0 = x.floor() as i32;
  let y0 = y.floor() as i32;
  let tx = x - x0 as f32;
  let ty = y - y0 as f32;

  let x1 = x0.wrapping_add(1);
  let y1 = y0.wrapping_add(1);

  let h00 = hash_noise((x0 as u32) ^ seed, (y0 as u32).wrapping_add(seed));
  let h10 = hash_noise((x1 as u32) ^ seed, (y0 as u32).wrapping_add(seed));
  let h01 = hash_noise((x0 as u32) ^ seed, (y1 as u32).wrapping_add(seed));
  let h11 = hash_noise((x1 as u32) ^ seed, (y1 as u32).wrapping_add(seed));

  let sx = smoothstep(tx);
  let sy = smoothstep(ty);
  let nx0 = mix(h00, h10, sx);
  let nx1 = mix(h01, h11, sx);
  mix(nx0, nx1, sy)
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
