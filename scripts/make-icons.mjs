/**
 * Draws the site icon at the sizes a browser asks for.
 *
 * The mark is the Rift seen from above: one square, split corner to corner by
 * the river, blue side at the bottom left and red side at the top right —
 * which is the whole job of the site in one shape.
 *
 * `app/icon.svg` is the same drawing by hand and is what modern browsers use;
 * this script exists for the raster sizes that cannot be SVG (`favicon.ico`
 * for the odd client that still fetches it, and the iOS home-screen icon).
 * Run it with `node scripts/make-icons.mjs` after changing either.
 */

import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

// Straight from the dark theme's tokens in app/globals.css.
const SURFACE = [10, 13, 19];
const BLUE = [75, 139, 245];
const RED = [242, 97, 92];
const GOLD = [200, 170, 110];

/** Fractions of the icon's width, so every size is the same drawing. */
const CORNER = 0.22;
/** Half the river's width, and of the gold running down the middle of it. */
const RIVER = 0.075;
const SEAM = 0.03;
/** Samples per pixel per side; what gives the edges their antialiasing. */
const SUPERSAMPLE = 4;

function roundedSquareCovers(x, y, corner) {
  // Distance into the nearest corner's box, clamped to it.
  const dx = Math.max(corner - x, x - (1 - corner), 0);
  const dy = Math.max(corner - y, y - (1 - corner), 0);
  if (dx === 0 || dy === 0) return x >= 0 && x <= 1 && y >= 0 && y <= 1;
  return dx * dx + dy * dy <= corner * corner;
}

/** The colour of one sample point, or null where the icon is transparent. */
function sample(x, y, corner) {
  if (!roundedSquareCovers(x, y, corner)) return null;

  // The river runs from the top left corner to the bottom right one, which
  // leaves the bottom left half blue and the top right half red. The gold
  // down the middle of it is the one the wordmark uses.
  const side = (y - x) / Math.SQRT2;
  if (Math.abs(side) <= SEAM) return GOLD;
  if (Math.abs(side) <= RIVER) return SURFACE;
  return side > 0 ? BLUE : RED;
}

function render(size, corner = CORNER) {
  const pixels = Buffer.alloc(size * size * 4);
  const step = 1 / (size * SUPERSAMPLE);

  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let alpha = 0;

      for (let sy = 0; sy < SUPERSAMPLE; sy += 1) {
        for (let sx = 0; sx < SUPERSAMPLE; sx += 1) {
          const x = (column * SUPERSAMPLE + sx + 0.5) * step;
          const y = (row * SUPERSAMPLE + sy + 0.5) * step;
          const colour = sample(x, y, corner);
          if (colour === null) continue;

          r += colour[0];
          g += colour[1];
          b += colour[2];
          alpha += 1;
        }
      }

      const offset = (row * size + column) * 4;
      if (alpha === 0) continue;

      // Averaged over the samples that landed inside, then faded by how many
      // did — so the edge is antialiased rather than stepped.
      const total = SUPERSAMPLE * SUPERSAMPLE;
      pixels[offset] = Math.round(r / alpha);
      pixels[offset + 1] = Math.round(g / alpha);
      pixels[offset + 2] = Math.round(b / alpha);
      pixels[offset + 3] = Math.round((alpha / total) * 255);
    }
  }

  return pixels;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function crc32(buffer) {
  let value = 0xffffffff;
  for (const byte of buffer) {
    value = CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  }
  return (value ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** A plain 8-bit RGBA PNG. No dependency does this for us at build time. */
function png(size, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // colour type: RGBA

  // Each row carries a filter byte; 0 means the bytes are stored as they are.
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let row = 0; row < size; row += 1) {
    raw[row * (size * 4 + 1)] = 0;
    pixels.copy(raw, row * (size * 4 + 1) + 1, row * size * 4, (row + 1) * size * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** An .ico is a directory of images; since Vista each may be a whole PNG. */
function ico(sizes) {
  const images = sizes.map((size) => png(size, render(size)));

  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(sizes.length, 4);

  let offset = 6 + sizes.length * 16;
  const entries = sizes.map((size, index) => {
    const entry = Buffer.alloc(16);
    entry[0] = size >= 256 ? 0 : size;
    entry[1] = size >= 256 ? 0 : size;
    entry[2] = 0; // colours in palette
    entry[3] = 0; // reserved
    entry.writeUInt16LE(1, 4); // colour planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(images[index].length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += images[index].length;
    return entry;
  });

  return Buffer.concat([header, ...entries, ...images]);
}

const target = process.argv[2] ?? "app";

writeFileSync(`${target}/favicon.ico`, ico([16, 32, 48]));
// Square: iOS rounds the home-screen icon itself, and fills anything
// transparent with black while it is at it.
writeFileSync(`${target}/apple-icon.png`, png(180, render(180, 0)));
console.log(`Wrote ${target}/favicon.ico and ${target}/apple-icon.png`);
