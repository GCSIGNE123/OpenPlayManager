// Generates every PWA/favicon placeholder asset from scratch — no
// image-processing dependency needed. Draws the same CONNECT.PH-inspired
// mark as public/favicon.svg (a navy field, an open orange ring evoking the
// logo's "C", and a small orange connector dot at center) directly into a
// raw RGBA buffer, and hand-encodes it as PNG (zlib for IDAT, a small
// CRC32 table for chunk checksums) or ICO (a thin container around the
// same PNG bytes — modern browsers/OSes accept PNG-in-ICO).
//
// Run with: node scripts/generate-pwa-icons.mjs
// Re-run any time the brand colors change (keep this in sync with
// styles.js's --color-primary/--color-secondary and favicon.svg).
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "..", "public");

const NAVY = [0x16, 0x35, 0x5e]; // --color-primary
const ORANGE = [0xf7, 0x94, 0x1d]; // --color-secondary

// ring geometry as fractions of the canvas, matching favicon.svg's 64x64
// viewBox (r=20, stroke-width=9) — kept as fractions so every size below
// shares one definition. The gap is expressed directly in raster terms
// (a 60° opening centered at 0°/"3 o'clock") rather than trying to
// replicate SVG's stroke-dasharray coordinate system pixel-for-pixel; it's
// the same visual motif, not a literal re-render of the SVG.
const RING_OUTER_R_FRACTION = (20 + 9 / 2) / 64;
const RING_INNER_R_FRACTION = (20 - 9 / 2) / 64;
const CENTER_DOT_R_FRACTION = 5.5 / 64;
const GAP_HALF_WIDTH_DEG = 30;

function drawIcon(size) {
  const pixels = new Uint8Array(size * size * 4);
  const cx = size / 2;
  const cy = size / 2;
  const outerR = size * RING_OUTER_R_FRACTION;
  const innerR = size * RING_INNER_R_FRACTION;
  const dotR = size * CENTER_DOT_R_FRACTION;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let color = NAVY;

      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= dotR) {
        color = ORANGE;
      } else if (dist >= innerR && dist <= outerR) {
        const angleDeg = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
        const inGap = angleDeg <= GAP_HALF_WIDTH_DEG || angleDeg >= 360 - GAP_HALF_WIDTH_DEG;
        if (!inGap) color = ORANGE;
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

// ICO container: a 6-byte header, one 16-byte directory entry per image,
// then each image's raw PNG bytes back to back. Every modern browser/OS
// accepts PNG-format entries (no need for the older uncompressed-BMP form).
function encodeIco(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: 1 = icon
  header.writeUInt16LE(entries.length, 4);

  const dirEntries = [];
  const imageBuffers = [];
  let offset = 6 + entries.length * 16;

  for (const { size, png } of entries) {
    const dir = Buffer.alloc(16);
    dir[0] = size >= 256 ? 0 : size; // 0 means 256 in ICO's width/height byte
    dir[1] = size >= 256 ? 0 : size;
    dir[2] = 0; // color palette
    dir[3] = 0; // reserved
    dir.writeUInt16LE(1, 4); // color planes
    dir.writeUInt16LE(32, 6); // bits per pixel
    dir.writeUInt32LE(png.length, 8);
    dir.writeUInt32LE(offset, 12);
    dirEntries.push(dir);
    imageBuffers.push(png);
    offset += png.length;
  }

  return Buffer.concat([header, ...dirEntries, ...imageBuffers]);
}

function generatePng(size, filename) {
  const png = encodePng(drawIcon(size), size);
  writeFileSync(path.join(publicDir, filename), png);
  console.log(`wrote ${filename} (${size}x${size}, ${png.length} bytes)`);
  return png;
}

generatePng(192, "icon-192.png");
generatePng(512, "icon-512.png");
generatePng(180, "apple-touch-icon.png");
const png16 = generatePng(16, "favicon-16x16.png");
const png32 = generatePng(32, "favicon-32x32.png");

const ico = encodeIco([
  { size: 16, png: png16 },
  { size: 32, png: png32 },
]);
writeFileSync(path.join(publicDir, "favicon.ico"), ico);
console.log(`wrote favicon.ico (16x16 + 32x32, ${ico.length} bytes)`);
