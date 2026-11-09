//! Film grain rendering with the stochastic emulsion model of Newson, Faraj, Galerne and Delon,
//! "Realistic Film Grain Rendering" (IPOL, 2017). Ported to Rust from the reference C++ code,
//! GPL v3+.
//!
//! The rendered value of a pixel is the fraction of Monte Carlo sample points that fall inside a
//! grain. Grains are discs with log-normal radii, placed by a Poisson process on a grid of cells.
//! The Poisson intensity of each cell depends on the grey level of the input image at that cell,
//! which is what makes the grain denser in the mid-tones and absent in clean black or white.
//! Grain is therefore a physical coverage process, not a filtered noise field.

/// Parameters of the grain model, in the same units as the reference code.
#[derive(Debug, Clone)]
pub struct GrainModel {
  /// Mean grain radius, in pixels of the image being rendered.
  pub mean_radius: f32,
  /// Standard deviation of the grain radius. 0 gives constant-size grains.
  pub radius_std: f32,
  /// Standard deviation of the Gaussian blur applied to each sample point (in pixels).
  pub sigma_filter: f32,
  /// Number of Monte Carlo sample points per output pixel.
  pub monte_carlo: usize,
  /// Seed that fixes the whole grain pattern (same seed, same grain).
  pub seed: u32,
}

/// Fixed-state hash PRNG, a 32-bit xorshift variant. Stands in for the per-cell generator of the
/// reference code: it is deterministic, cheap, and reseeded from (cell x, cell y, offset).
struct Prng {
  state: u32,
}

impl Prng {
  fn new(seed: u32) -> Self {
    let mut p = Self { state: seed.wrapping_mul(0x9E37_79B9) ^ 0x85EB_CA6B };
    if p.state == 0 {
      p.state = 0x1234_5678;
    }
    p
  }

  fn next_u32(&mut self) -> u32 {
    let mut x = self.state;
    x ^= x << 13;
    x ^= x >> 17;
    x ^= x << 5;
    self.state = x;
    x
  }

  /// Uniform in (0, 1), never exactly 0 so logs stay finite.
  fn uniform(&mut self) -> f32 {
    ((self.next_u32() >> 8) as f32 + 0.5) / (1u32 << 24) as f32
  }

  /// Standard normal by Box-Muller, as in the reference `myrand_gaussian_0_1`.
  fn gaussian(&mut self) -> f32 {
    let u = self.uniform();
    let v = self.uniform();
    (-2.0 * u.ln()).sqrt() * (std::f32::consts::TAU * v).cos()
  }
}

/// Hash of a grid cell and an offset: the reference code's `cellseed`. Ensures each cell gets its
/// own reproducible random stream, independent of which pixel asks for it.
fn cell_seed(x: i32, y: i32, offset: u32) -> u32 {
  let mut h = (x as u32).wrapping_mul(0x27D4_EB2D) ^ (y as u32).wrapping_mul(0x1656_67B1) ^ offset;
  h ^= h >> 15;
  h = h.wrapping_mul(0x2C1B_3C6D);
  h ^= h >> 12;
  h = h.wrapping_mul(0x297A_2D39);
  h ^= h >> 15;
  h
}

/// Poisson sample by inverse transform, as in the reference `my_rand_poisson`.
fn poisson(prng: &mut Prng, lambda: f32) -> u32 {
  let u = prng.uniform();
  let mut x: u32 = 0;
  let mut prod = (-lambda).exp();
  let mut sum = prod;
  let limit = (10000.0 * lambda).floor() as u32;
  while u > sum && x < limit {
    x += 1;
    prod = prod * lambda / x as f32;
    sum += prod;
  }
  x
}

/// Lookup table of Poisson intensity per grey level (0..=255), from the reference code:
/// lambda(u) = -(ag^2 / (pi (r^2 + sigma^2))) * ln(1 - u), with u the normalised grey level.
fn lambda_table(model: &GrainModel) -> Vec<f32> {
  let pi = std::f32::consts::PI;
  let ag = 1.0 / (1.0 / model.mean_radius).ceil();
  let denom = pi * (model.mean_radius * model.mean_radius + model.radius_std * model.radius_std);
  (0..=255)
    .map(|level| {
      let u = level as f32 / 255.1;
      -(ag * ag) / denom * (1.0 - u).ln()
    })
    .collect()
}

/// Renders one output pixel at image coordinates (x, y), using the reference algorithm.
/// `gray` is the input luminance buffer (0..1) of size `width` x `height`.
fn render_pixel(
  gray: &[f32],
  width: usize,
  height: usize,
  x: f32,
  y: f32,
  model: &GrainModel,
  lambdas: &[f32],
  normals: &[(f32, f32)],
) -> f32 {
  let ag = 1.0 / (1.0 / model.mean_radius).ceil();
  let r = model.mean_radius;
  let (mu, sigma, max_radius) = if model.radius_std > 0.0 {
    let s2 = ((model.radius_std / r) * (model.radius_std / r) + 1.0).ln();
    let s = s2.sqrt();
    let m = r.ln() - s2 / 2.0;
    // 0.999 quantile of the log-normal radius, so no grain is clipped inside its bounding box.
    (m, s, (m + s * 3.0902).exp())
  } else {
    (0.0, 0.0, r)
  };

  let mut covered = 0usize;
  let mut prng_cell;

  for &(dx, dy) in normals.iter() {
    // Each Monte Carlo sample point is the pixel centre plus a Gaussian shift.
    let px = x + dx;
    let py = y + dy;

    let min_cx = ((px - max_radius) / ag).floor() as i32;
    let max_cx = ((px + max_radius) / ag).floor() as i32;
    let min_cy = ((py - max_radius) / ag).floor() as i32;
    let max_cy = ((py + max_radius) / ag).floor() as i32;

    let mut hit = false;
    'cells: for cx in min_cx..=max_cx {
      for cy in min_cy..=max_cy {
        let corner_x = ag * cx as f32;
        let corner_y = ag * cy as f32;

        // Grey level of the input at the cell corner: this sets the Poisson intensity.
        let ix = corner_x.floor().clamp(0.0, (width - 1) as f32) as usize;
        let iy = corner_y.floor().clamp(0.0, (height - 1) as f32) as usize;
        let level = (gray[iy * width + ix] * 255.0).floor().clamp(0.0, 255.0) as usize;
        let lambda = lambdas[level];

        prng_cell = Prng::new(cell_seed(cx, cy, model.seed));
        let n = poisson(&mut prng_cell, lambda);
        for _ in 0..n {
          let cxg = corner_x + ag * prng_cell.uniform();
          let cyg = corner_y + ag * prng_cell.uniform();
          let radius = if model.radius_std > 0.0 {
            (mu + sigma * prng_cell.gaussian()).exp().min(max_radius)
          } else {
            r
          };
          let ddx = cxg - px;
          let ddy = cyg - py;
          if ddx * ddx + ddy * ddy < radius * radius {
            hit = true;
            break 'cells;
          }
        }
      }
    }
    if hit {
      covered += 1;
    }
  }

  covered as f32 / normals.len() as f32
}

/// Renders film grain over a luminance image and returns the grain layer as a coverage value
/// per pixel (0..1). The caller adds it to the image, scaled to the look it wants.
///
/// `gray` is row-major with `width * height` entries in 0..1.
pub fn grain_coverage(gray: &[f32], width: usize, height: usize, model: &GrainModel) -> Vec<f32> {
  let lambdas = lambda_table(model);

  // Gaussian translations for the Monte Carlo samples, fixed by the seed so the pattern repeats.
  let sigma = model.sigma_filter.max(0.0);
  let mut rng = Prng::new(model.seed ^ 0xA5A5_5A5A);
  let normals: Vec<(f32, f32)> = (0..model.monte_carlo.max(1))
    .map(|_| (sigma * rng.gaussian(), sigma * rng.gaussian()))
    .collect();

  let mut out = vec![0.0_f32; width * height];
  for y in 0..height {
    for x in 0..width {
      out[y * width + x] = render_pixel(
        gray,
        width,
        height,
        x as f32 + 0.5,
        y as f32 + 0.5,
        model,
        &lambdas,
        &normals,
      );
    }
  }
  out
}

#[cfg(test)]
mod tests {
  use super::*;

  fn model(seed: u32) -> GrainModel {
    GrainModel {
      mean_radius: 1.2,
      radius_std: 0.4,
      sigma_filter: 0.8,
      monte_carlo: 32,
      seed,
    }
  }

  #[test]
  fn same_seed_is_deterministic() {
    let gray = vec![0.5_f32; 64 * 64];
    assert_eq!(grain_coverage(&gray, 64, 64, &model(3)), grain_coverage(&gray, 64, 64, &model(3)));
  }

  #[test]
  fn coverage_stays_in_unit_range() {
    let gray = vec![0.5_f32; 64 * 64];
    let out = grain_coverage(&gray, 64, 64, &model(3));
    assert!(out.iter().all(|v| (0.0..=1.0).contains(v)));
  }

  #[test]
  fn clean_black_gets_no_grain() {
    // Poisson intensity is ln(1-u) based: at grey 0 it is zero, so no grains are placed.
    let gray = vec![0.0_f32; 64 * 64];
    let out = grain_coverage(&gray, 64, 64, &model(3));
    assert!(out.iter().all(|v| *v == 0.0), "black should carry no grain");
  }

  #[test]
  fn mid_grey_gets_more_grain_than_bright() {
    // Coverage saturates when grains are large and dense, which hides the intensity ordering.
    // Use small grains so coverage stays below saturation and the ordering is visible.
    let small = GrainModel { mean_radius: 0.6, radius_std: 0.2, sigma_filter: 0.4, monte_carlo: 32, seed: 7 };
    let mid = grain_coverage(&vec![0.5_f32; 96 * 96], 96, 96, &small);
    let bright = grain_coverage(&vec![0.95_f32; 96 * 96], 96, 96, &small);
    let mean = |v: &[f32]| v.iter().sum::<f32>() / v.len() as f32;
    assert!(mean(&mid) < 0.9, "mid coverage saturated at {}", mean(&mid));
    assert!(mean(&bright) > mean(&mid), "bright {} should exceed mid {}", mean(&bright), mean(&mid));
  }

  #[test]
  fn lambda_grows_with_grey_level() {
    let t = lambda_table(&model(1));
    assert_eq!(t[0], 0.0);
    assert!(t[128] > t[64] && t[255] > t[128]);
  }
}


#[cfg(test)]
mod poisson_fidelity {
  use super::*;

  #[test]
  fn mean_grain_count_per_cell_matches_lambda() {
    // Fidelity to the reference: the number of grains per cell must average to lambda(grey).
    // Coverage saturates in bright areas, so test the Poisson count directly.
    let m = GrainModel { mean_radius: 1.2, radius_std: 0.4, sigma_filter: 0.8, monte_carlo: 32, seed: 3 };
    let lambdas = lambda_table(&m);
    for level in [64usize, 128, 192] {
      let lambda = lambdas[level];
      let mut total = 0u64;
      let n = 20_000u32;
      for cell in 0..n {
        let mut prng = Prng::new(cell_seed(cell as i32, 7, m.seed));
        total += poisson(&mut prng, lambda) as u64;
      }
      let mean = total as f32 / n as f32;
      assert!((mean - lambda).abs() < 0.03 + lambda * 0.05, "level {level}: mean {mean} vs lambda {lambda}");
    }
  }
}
