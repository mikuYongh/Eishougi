//! Image pixel-scrambling cipher (port of the "小番茄" / PicEncrypt algorithm).
//!
//! This scrambles image pixels along a Gilbert (Hilbert-like) space-filling curve so the result
//! looks like random noise, defeating automated content moderation that inspects thumbnails/previews.
//! The original can be perfectly recovered by running the same operation in reverse with the same
//! key. The algorithm is NOT cryptographic — its purpose is purely visual obfuscation.
//!
//! Reference: https://github.com/jiarandiana0307/PicEncrypt (TomatoScramble.java)

use image::{DynamicImage, GenericImageView, ImageBuffer, Rgba};
use std::path::Path;

/// Algorithm choice matching the PicEncrypt app.
#[derive(Debug, Clone, Copy)]
pub enum Algorithm {
    /// 小番茄 — Gilbert curve pixel permutation. Key range: (0, 1.618].
    Tomato,
    /// Row shuffle via logistic map. Key range: (0, 1).
    RowScramble,
}

impl Algorithm {
    pub fn from_str(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "tomato" | "小番茄" | "xiaofanqie" => Some(Algorithm::Tomato),
            "row" | "row_scramble" => Some(Algorithm::RowScramble),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum ProcessType {
    Encrypt,
    Decrypt,
}

/// Validate key ranges matching the original app's rules.
pub fn validate_key(algorithm: Algorithm, key: f64) -> Result<(), String> {
    match algorithm {
        Algorithm::Tomato => {
            if key > 0.0 && key <= 1.618 {
                Ok(())
            } else {
                Err("Tomato key must be in range (0, 1.618]".to_string())
            }
        }
        Algorithm::RowScramble => {
            if key > 0.0 && key < 1.0 {
                Ok(())
            } else {
                Err("Row scramble key must be in range (0, 1)".to_string())
            }
        }
    }
}

/// Process an image file: decode → scramble/unscramble pixels → encode to output path.
///
/// The output format is always PNG (lossless) so the round-trip is pixel-perfect — JPEG would
/// introduce artifacts that break the deterministic permutation on decrypt.
pub fn process_file(
    input: &Path,
    output: &Path,
    algorithm: Algorithm,
    process_type: ProcessType,
    key: f64,
) -> Result<(u32, u32), String> {
    validate_key(algorithm, key)?;

    let img = image::open(input).map_err(|e| format!("Failed to decode image: {}", e))?;
    let (w, h) = img.dimensions();

    // Work in RGBA8 for a uniform pixel layout regardless of input format (RGB, RGBA, palette…).
    let rgba: ImageBuffer<Rgba<u8>, Vec<u8>> = img.to_rgba8();
    // Flatten to u32 ARGB array — one u32 per pixel, matching the Java int[] pixels model so the
    // exact same permutation math applies. We store as [A,R,G,B] in the high→low bytes to mirror
    // Android's ARGB_8888 int encoding (the reference platform).
    let pixels: Vec<u32> = rgba
        .pixels()
        .map(|p| {
            let [r, g, b, a] = p.0;
            ((a as u32) << 24) | ((r as u32) << 16) | ((g as u32) << 8) | (b as u32)
        })
        .collect();

    let new_pixels = match algorithm {
        Algorithm::Tomato => tomato_process(&pixels, w, h, process_type, key),
        Algorithm::RowScramble => row_scramble_process(&pixels, w, h, process_type, key),
    };

    // Reconstruct an RGBA buffer from the permuted u32 pixels.
    let mut out_buf: ImageBuffer<Rgba<u8>, Vec<u8>> = ImageBuffer::new(w, h);
    for (i, px) in new_pixels.iter().enumerate() {
        let a = (*px >> 24) & 0xFF;
        let r = (*px >> 16) & 0xFF;
        let g = (*px >> 8) & 0xFF;
        let b = *px & 0xFF;
        out_buf.put_pixel(
            (i as u32) % w,
            (i as u32) / w,
            Rgba([r as u8, g as u8, b as u8, a as u8]),
        );
    }

    let dyn_img = DynamicImage::ImageRgba8(out_buf);
    dyn_img
        .save(output)
        .map_err(|e| format!("Failed to write output image: {}", e))?;

    Ok((w, h))
}

// ============================ Tomato (Gilbert curve) ============================

/// The "小番茄" algorithm:
/// 1. Generate a 2D Gilbert curve over the image, producing a position[] array that maps
///    curve-index → linear pixel index. This visits every pixel exactly once in a space-filling
///    order, so adjacent curve-positions correspond to spatially-nearby pixels.
/// 2. Split the curve at `offset = round(golden_ratio * pixel_count * key)`.
/// 3. Encrypt: newPixels[positions[i + offset]] = oldPixels[positions[i]] (wrap-around shift
///    along the curve). Decrypt reverses the assignment.
fn tomato_process(
    pixels: &[u32],
    width: u32,
    height: u32,
    process_type: ProcessType,
    key: f64,
) -> Vec<u32> {
    let w = width as i64;
    let h = height as i64;
    let pixel_count = (w * h) as usize;
    if pixel_count == 0 {
        return Vec::new();
    }

    let offset = (((5.0_f64.sqrt() - 1.0) / 2.0) * (pixel_count as f64) * key).round() as usize;
    let offset = offset.min(pixel_count);

    let mut positions = vec![0i64; pixel_count];
    if w >= h {
        gilbert2d(&mut positions, &mut 0usize, 0, 0, w, 0, 0, h, width);
    } else {
        gilbert2d(&mut positions, &mut 0usize, 0, 0, 0, h, w, 0, width);
    }

    let loop_position = pixel_count - offset;
    let mut new_pixels = vec![0u32; pixel_count];

    match process_type {
        ProcessType::Encrypt => {
            for i in 0..loop_position {
                new_pixels[positions[i + offset] as usize] = pixels[positions[i] as usize];
            }
            for i in loop_position..pixel_count {
                new_pixels[positions[i - loop_position] as usize] = pixels[positions[i] as usize];
            }
        }
        ProcessType::Decrypt => {
            for i in 0..loop_position {
                new_pixels[positions[i] as usize] = pixels[positions[i + offset] as usize];
            }
            for i in loop_position..pixel_count {
                new_pixels[positions[i] as usize] = pixels[positions[i - loop_position] as usize];
            }
        }
    }

    new_pixels
}

/// Recursively generate a 2D Gilbert curve. Fills `positions[*pos_index ..]` with linear pixel
/// indices (y * width + x) in the order the curve visits them.
///
/// Direct port of TomatoScramble.generate2d() — the recursive generalised Hilbert curve that
/// works for any rectangle (not just powers of two).
#[allow(clippy::too_many_arguments)]
fn gilbert2d(
    positions: &mut [i64],
    pos_index: &mut usize,
    mut x: i64,
    mut y: i64,
    ax: i64,
    ay: i64,
    bx: i64,
    by: i64,
    width: u32,
) {
    let w = (ax + ay).abs();
    let h = (bx + by).abs();
    let dax = ax.signum();
    let day = ay.signum();
    let dbx = bx.signum();
    let dby = by.signum();

    if h == 1 {
        for _ in 0..w {
            positions[*pos_index] = x + y * (width as i64);
            *pos_index += 1;
            x += dax;
            y += day;
        }
        return;
    }
    if w == 1 {
        for _ in 0..h {
            positions[*pos_index] = x + y * (width as i64);
            *pos_index += 1;
            x += dbx;
            y += dby;
        }
        return;
    }

    let mut ax2 = ax.div_euclid(2);
    let mut ay2 = ay.div_euclid(2);
    let mut bx2 = bx.div_euclid(2);
    let mut by2 = by.div_euclid(2);
    let w2 = (ax2 + ay2).abs();
    let h2 = (bx2 + by2).abs();

    if 2 * w > 3 * h {
        if (w2 & 1) == 1 && w > 2 {
            ax2 += dax;
            ay2 += day;
        }
        gilbert2d(positions, pos_index, x, y, ax2, ay2, bx, by, width);
        gilbert2d(
            positions,
            pos_index,
            x + ax2,
            y + ay2,
            ax - ax2,
            ay - ay2,
            bx,
            by,
            width,
        );
    } else {
        if (h2 & 1) == 1 && h > 2 {
            bx2 += dbx;
            by2 += dby;
        }
        gilbert2d(positions, pos_index, x, y, bx2, by2, ax2, ay2, width);
        gilbert2d(
            positions,
            pos_index,
            x + bx2,
            y + by2,
            ax,
            ay,
            bx - bx2,
            by - by2,
            width,
        );
        gilbert2d(
            positions,
            pos_index,
            x + (ax - dax) + (bx2 - dbx),
            y + (ay - day) + (by2 - dby),
            -bx2,
            -by2,
            -(ax - ax2),
            -(ay - ay2),
            width,
        );
    }
}

// ============================ Row scramble (logistic map) ============================

/// Per-row column shuffle driven by a logistic-map pseudo-random sequence.
/// Generates a deterministic permutation of column indices from x_{n+1} = r * x_n * (1 - x_n)
/// with r = 3.9999999, then shuffles each row's pixels by that permutation (or its inverse).
fn row_scramble_process(
    pixels: &[u32],
    width: u32,
    height: u32,
    process_type: ProcessType,
    key: f64,
) -> Vec<u32> {
    let w = width as usize;
    let h = height as usize;
    let pixel_count = w * h;
    if pixel_count == 0 {
        return Vec::new();
    }

    let perm = logistic_permutation(key, w);

    let mut new_pixels = vec![0u32; pixel_count];
    for row in 0..h {
        let base = row * w;
        match process_type {
            ProcessType::Encrypt => {
                for i in 0..w {
                    new_pixels[base + perm[i]] = pixels[base + i];
                }
            }
            ProcessType::Decrypt => {
                for i in 0..w {
                    new_pixels[base + i] = pixels[base + perm[i]];
                }
            }
        }
    }
    new_pixels
}

/// Logistic map → sorted → permutation indices. Matches BasePicEncryptScramble.generateLogistic +
/// getSortedPositions from the reference app.
fn logistic_permutation(x1: f64, n: usize) -> Vec<usize> {
    let mut arr: Vec<(f64, usize)> = Vec::with_capacity(n);
    let mut x = x1;
    arr.push((x, 0));
    for i in 1..n {
        x = 3.9999999 * x * (1.0 - x);
        arr.push((x, i));
    }
    arr.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap_or(std::cmp::Ordering::Equal));
    arr.into_iter().map(|(_, idx)| idx).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tomato_roundtrip() {
        // 4×4 image with known pixel values
        let w = 4;
        let h = 4;
        let pixels: Vec<u32> = (0..16).map(|i| 0xFF000000 | i as u32).collect();

        let encrypted = tomato_process(&pixels, w, h, ProcessType::Encrypt, 1.0);
        // Encrypted should differ from original (otherwise the scramble is a no-op)
        let differs = pixels.iter().zip(&encrypted).any(|(a, b)| a != b);
        assert!(differs, "encryption produced identical output");

        let decrypted = tomato_process(&encrypted, w, h, ProcessType::Decrypt, 1.0);
        assert_eq!(pixels, decrypted, "decrypt did not recover original");
    }

    #[test]
    fn test_row_scramble_roundtrip() {
        let w = 8;
        let h = 4;
        let pixels: Vec<u32> = (0..32).map(|i| 0xFF000000 | i as u32).collect();

        let encrypted = row_scramble_process(&pixels, w, h, ProcessType::Encrypt, 0.666);
        let differs = pixels.iter().zip(&encrypted).any(|(a, b)| a != b);
        assert!(differs, "row encryption produced identical output");

        let decrypted = row_scramble_process(&encrypted, w, h, ProcessType::Decrypt, 0.666);
        assert_eq!(pixels, decrypted, "row decrypt did not recover original");
    }

    #[test]
    fn test_key_validation() {
        assert!(validate_key(Algorithm::Tomato, 1.0).is_ok());
        assert!(validate_key(Algorithm::Tomato, 1.618).is_ok());
        assert!(validate_key(Algorithm::Tomato, 0.0).is_err());
        assert!(validate_key(Algorithm::Tomato, 2.0).is_err());

        assert!(validate_key(Algorithm::RowScramble, 0.5).is_ok());
        assert!(validate_key(Algorithm::RowScramble, 1.0).is_err());
        assert!(validate_key(Algorithm::RowScramble, 0.0).is_err());
    }
}
