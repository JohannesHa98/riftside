/**
 * Draws the small icons from `app/icon.png`, which is the master artwork.
 *
 * Run it with `node scripts/make-icons.mjs` whenever that file changes. It
 * writes `app/favicon.ico` (16/32/48, for anything still asking for
 * /favicon.ico) and `app/apple-icon.png` (the iOS home-screen icon). Next
 * picks all three up by filename; nothing imports them.
 *
 * The mark is a neon square, blue side and red side. Thin bright lines on
 * black are exactly what a plain downscale ruins: averaging a one-pixel line
 * across a twenty-pixel box leaves a grey smudge. So the averaging happens in
 * linear light and each size is exposed back up afterwards — the smaller the
 * icon, the more of a boost it needs to still read as neon.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { deflateSync, inflateSync } from "node:zlib";

/** Exposure per size, chosen by looking at them rather than by formula. */
const BOOST = { 16: 4, 32: 2.4, 48: 1.9, 180: 1.15 };

function decode(buffer) {
  let offset = 8;
  const idat = [];
  let width = 0;
  let height = 0;
  let channels = 0;

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);

    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      channels = data[9] === 6 ? 4 : data[9] === 2 ? 3 : 0;
      if (channels === 0 || data[8] !== 8) {
        throw new Error("The master must be an 8-bit RGB or RGBA PNG.");
      }
    } else if (type === "IDAT") {
      idat.push(data);
    }

    offset += 12 + length;
  }

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pixels = Buffer.alloc(width * height * 4);
  let prior = Buffer.alloc(stride);

  for (let row = 0; row < height; row += 1) {
    const filter = raw[row * (stride + 1)];
    const line = Buffer.from(
      raw.subarray(row * (stride + 1) + 1, (row + 1) * (stride + 1)),
    );

    // Undo the row's filter: every byte is stored relative to its neighbours.
    for (let i = 0; i < stride; i += 1) {
      const a = i >= channels ? line[i - channels] : 0;
      const b = prior[i];
      const c = i >= channels ? prior[i - channels] : 0;
      let value = line[i];

      if (filter === 1) value += a;
      else if (filter === 2) value += b;
      else if (filter === 3) value += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        value += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }

      line[i] = value & 0xff;
    }

    for (let column = 0; column < width; column += 1) {
      const from = column * channels;
      const to = (row * width + column) * 4;
      pixels[to] = line[from];
      pixels[to + 1] = line[from + 1];
      pixels[to + 2] = line[from + 2];
      pixels[to + 3] = channels === 4 ? line[from + 3] : 255;
    }

    prior = line;
  }

  return { width, height, pixels };
}

const toLinear = (value) => (value / 255) ** 2.2;
const toSrgb = (value) =>
  Math.round(Math.min(1, Math.max(0, value)) ** (1 / 2.2) * 255);

/** Box downscale of the square master, averaged in linear light. */
function resize(master, size) {
  const boost = BOOST[size] ?? 1;
  const out = Buffer.alloc(size * size * 4);
  const scale = master.width / size;

  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let alpha = 0;
      let samples = 0;

      // At least one source pixel per target pixel, however the edges land.
      const top = Math.floor(row * scale);
      const left = Math.floor(column * scale);
      const bottom = Math.max(Math.floor((row + 1) * scale), top + 1);
      const right = Math.max(Math.floor((column + 1) * scale), left + 1);

      for (let y = top; y < bottom; y += 1) {
        for (let x = left; x < right; x += 1) {
          const i =
            (Math.min(y, master.height - 1) * master.width +
              Math.min(x, master.width - 1)) *
            4;
          r += toLinear(master.pixels[i]);
          g += toLinear(master.pixels[i + 1]);
          b += toLinear(master.pixels[i + 2]);
          alpha += master.pixels[i + 3];
          samples += 1;
        }
      }

      const offset = (row * size + column) * 4;
      out[offset] = toSrgb((r / samples) * boost);
      out[offset + 1] = toSrgb((g / samples) * boost);
      out[offset + 2] = toSrgb((b / samples) * boost);
      out[offset + 3] = Math.round(alpha / samples);
    }
  }

  return out;
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

/** A plain 8-bit RGBA PNG. The project carries no image library. */
function encode(size, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // colour type: RGBA

  // Each row carries a filter byte; 0 means the bytes are stored as they are.
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let row = 0; row < size; row += 1) {
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
function ico(images, sizes) {
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

const folder = process.argv[2] ?? "app";
const master = decode(readFileSync(`${folder}/icon.png`));
if (master.width !== master.height) {
  throw new Error(`${folder}/icon.png must be square.`);
}

const SIZES = [16, 32, 48];

writeFileSync(
  `${folder}/favicon.ico`,
  ico(
    SIZES.map((size) => encode(size, resize(master, size))),
    SIZES,
  ),
);
writeFileSync(`${folder}/apple-icon.png`, encode(180, resize(master, 180)));
console.log(`Wrote ${folder}/favicon.ico and ${folder}/apple-icon.png`);
