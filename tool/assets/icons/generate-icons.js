/**
 * TechPulse Icon Generator - Node.js Script
 * ==========================================
 * Generates PNG icons at 16x16, 48x48, and 128x128 from the SVG source.
 *
 * Usage:
 *   Option A (with 'canvas' and 'sharp' packages):
 *     npm install canvas sharp
 *     node generate-icons.js
 *
 *   Option B (with just 'sharp' - recommended, easier install):
 *     npm install sharp
 *     node generate-icons.js
 *
 * Output: icon16.png, icon48.png, icon128.png in the same directory.
 */

const fs = require('fs');
const path = require('path');

const SIZES = [16, 48, 128];
const ICONS_DIR = __dirname;
const SVG_PATH = path.join(ICONS_DIR, 'icon.svg');

// ─── Approach: Use 'sharp' (most reliable cross-platform) ───────────────
async function generateWithSharp() {
  let sharp;
  try {
    sharp = require('sharp');
  } catch {
    console.error(
      'Error: "sharp" package not found.\n' +
      'Install it with: npm install sharp\n' +
      'Then re-run this script.'
    );
    process.exit(1);
  }

  const svgBuffer = fs.readFileSync(SVG_PATH);

  for (const size of SIZES) {
    const outputPath = path.join(ICONS_DIR, `icon${size}.png`);

    await sharp(svgBuffer)
      .resize(size, size, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toFile(outputPath);

    console.log(`  ✓ Generated ${outputPath}  (${size}×${size})`);
  }
}

// ─── Fallback: Pure Node.js minimal PNG generator (no dependencies) ─────
// Creates a simple gradient rounded-square + bolt shape using raw pixel math.
function generatePurePNG() {
  console.log('  Using built-in PNG generator (no external packages)...\n');

  for (const size of SIZES) {
    const pixels = renderIcon(size);
    const pngData = encodePNG(size, size, pixels);
    const outputPath = path.join(ICONS_DIR, `icon${size}.png`);
    fs.writeFileSync(outputPath, pngData);
    console.log(`  ✓ Generated ${outputPath}  (${size}×${size})`);
  }
}

/**
 * Render the TechPulse icon to an RGBA pixel buffer.
 */
function renderIcon(size) {
  const buf = Buffer.alloc(size * size * 4, 0); // RGBA
  const s = size; // shorthand
  const cornerR = Math.round(s * 0.22); // rounded corner radius
  const pad = Math.round(s * 0.03);     // padding from edge

  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const idx = (y * s + x) * 4;

      // Normalized coordinates 0..1
      const nx = x / (s - 1);
      const ny = y / (s - 1);

      // ── Rounded square background ──
      if (inRoundedRect(x, y, pad, pad, s - 2 * pad, s - 2 * pad, cornerR)) {
        // Gradient: #4F46E5 (top-left) → #06B6D4 (bottom-right)
        const t = (nx + ny) / 2;
        const r = lerp(0x4F, 0x06, t);
        const g = lerp(0x46, 0xB6, t);
        const b = lerp(0xE5, 0xD4, t);

        buf[idx]     = Math.round(r);
        buf[idx + 1] = Math.round(g);
        buf[idx + 2] = Math.round(b);
        buf[idx + 3] = 255;

        // ── Lightning bolt (white) ──
        if (inBolt(nx, ny)) {
          buf[idx]     = 255;
          buf[idx + 1] = 255;
          buf[idx + 2] = 255;
          buf[idx + 3] = 255;
        }
      }
    }
  }
  return buf;
}

/** Check if point is inside a rounded rectangle */
function inRoundedRect(px, py, rx, ry, rw, rh, cr) {
  if (px < rx || px >= rx + rw || py < ry || py >= ry + rh) return false;
  // Check corners
  const corners = [
    [rx + cr, ry + cr],
    [rx + rw - cr, ry + cr],
    [rx + cr, ry + rh - cr],
    [rx + rw - cr, ry + rh - cr],
  ];
  for (const [cx, cy] of corners) {
    const inCornerZone =
      (px < rx + cr || px >= rx + rw - cr) &&
      (py < ry + cr || py >= ry + rh - cr);
    if (inCornerZone) {
      const dx = px - cx;
      const dy = py - cy;
      if (dx * dx + dy * dy > cr * cr) return false;
    }
  }
  return true;
}

/** Check if normalized point is inside the lightning bolt shape */
function inBolt(nx, ny) {
  // Lightning bolt polygon (normalized 0..1 coords), matching the SVG
  // Upper triangle: (0.5625, 0.125) → (0.328, 0.531) → (0.625, 0.531)
  // Lower triangle: (0.453, 0.531) → (0.375, 0.875) → (0.6875, 0.4375) → (0.531, 0.4375)
  return pointInPolygon(nx, ny, [
    // The bolt as one polygon path
    [0.5625, 0.125],   // top
    [0.328, 0.531],    // left middle
    [0.453, 0.531],    // inner left
    [0.375, 0.875],    // bottom point
    [0.6875, 0.4375],  // right middle
    [0.531, 0.4375],   // inner right
  ]);
}

/** Ray-casting point-in-polygon test */
function pointInPolygon(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function lerp(a, b, t) {
  return a + (b - a) * Math.max(0, Math.min(1, t));
}

/**
 * Encode RGBA pixel buffer into a minimal valid PNG file.
 * Implements PNG spec with IHDR, IDAT (zlib), IEND chunks.
 */
function encodePNG(w, h, rgbaBuffer) {
  const zlib = require('zlib');

  // PNG signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // Raw image data with filter byte (0 = None) per row
  const rawRows = [];
  for (let y = 0; y < h; y++) {
    rawRows.push(Buffer.from([0])); // filter: none
    rawRows.push(rgbaBuffer.slice(y * w * 4, (y + 1) * w * 4));
  }
  const rawData = Buffer.concat(rawRows);
  const compressed = zlib.deflateSync(rawData);

  // Build chunks
  const chunks = [
    signature,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', compressed),
    makeChunk('IEND', Buffer.alloc(0)),
  ];

  return Buffer.concat(chunks);
}

function makeChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);

  const crcData = Buffer.concat([typeBuffer, data]);
  const crc = crc32(crcData);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc >>> 0, 0);

  return Buffer.concat([len, typeBuffer, data, crcBuf]);
}

/** CRC-32 for PNG chunks */
function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// ─── Main ─────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n🔷 TechPulse Icon Generator\n');

  // Try sharp first (best quality from SVG), fall back to pure Node
  try {
    require.resolve('sharp');
    console.log('  Using sharp for high-quality SVG → PNG conversion...\n');
    await generateWithSharp();
  } catch {
    console.log('  "sharp" not installed — falling back to built-in renderer.');
    generatePurePNG();
  }

  console.log('\n✅ Done! Icons saved to:', ICONS_DIR, '\n');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
