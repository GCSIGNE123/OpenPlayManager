// Generates the PWA placeholder icons (public/icon-192.png, icon-512.png,
// apple-touch-icon.png) from scratch — no image-processing dependency
// needed. Draws the same pickleball motif as public/favicon.svg (a ball
// circle + 6 dots on a court-green background) directly into a raw RGBA
// buffer and hand-encodes it as a PNG (zlib for IDAT, a small CRC32 table
// for chunk checksums — the only two pieces the PNG format actually needs
// beyond raw bytes).
//
// Run with: node scripts/generate-pwa-icons.mjs
// Re-run any time the brand colors in favicon.svg change.
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "..", "public");

const COURT_GREEN = [0x1f, 0x5c, 0x43]; // --court
const BALL_YELLOW = [0xd4, 0xe1, 0x57]; // --ball

// same dot layout as favicon.svg's 64x64 viewBox, expressed as fractions of
// the canvas so it scales cleanly to any icon size
const DOT_FRACTIONS = [
  [22 / 64, 20 / 64],
  [40 / 64, 18 / 64],
  [46 / 64, 32 / 64],
  [40 / 64, 46 / 64],
  [22 / 64, 44 / 64],
  [16 / 64, 32 / 64],
];

function drawIcon(size) {
  const pixels = new Uint8Array(size * size * 4);
  const cx = size / 2;
  const cy = size / 2;
  const ballRadius = size * (22 / 64);
  const dotRadius = size * (3 / 64);
  const dots = DOT_FRACTIONS.map(([fx, fy]) => [fx * size, fy * size]);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let color = COURT_GREEN;

      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      if (dx * dx + dy * dy <= ballRadius * ballRadius) {
        color = BALL_YELLOW;
      }
      for (const [dcx, dcy] of dots) {
        const ddx = x + 0.5 - dcx;
        const ddy = y + 0.5 - dcy;
        if (ddx * ddx + ddy * ddy <= dotRadius * dotRadius) {
          color = COURT_GREEN;
        }
      }

      const i = (y * size + x) * 4;
      pixels[i] = color[0];
      pixels[i + 1] = color[1];
      pixels[i + 2] = color[2];
      pixels[i + 3] = 255;
    }
  }
  return pixels;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function encodePng(pixels, size) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0);
  ihdrData.writeUInt32BE(size, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 6; // color type: RGBA
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace
  const ihdr = chunk("IHDR", ihdrData);

  // one filter-type-0 (None) byte per scanline, then that row's raw RGBA
  const raw = Buffer.alloc(size * (1 + size * 4));
  for (let y = 0; y < size; y++) {
    const rowStart = y * (1 + size * 4);
    raw[rowStart] = 0;
    const px = pixels.subarray(y * size * 4, (y + 1) * size * 4);
    Buffer.from(px.buffer, px.byteOffset, px.byteLength).copy(raw, rowStart + 1);
  }
  const idat = chunk("IDAT", deflateSync(raw));

  const iend = chunk("IEND", Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

function generate(size, filename) {
  const pixels = drawIcon(size);
  const png = encodePng(pixels, size);
  const outPath = path.join(publicDir, filename);
  writeFileSync(outPath, png);
  console.log(`wrote ${filename} (${size}x${size}, ${png.length} bytes)`);
}

generate(192, "icon-192.png");
generate(512, "icon-512.png");
generate(180, "apple-touch-icon.png");
