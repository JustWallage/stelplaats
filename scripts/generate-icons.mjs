// Generates the PWA icon set from public/icon.png using only Node built-ins
// (no native image deps). Run after replacing the source icon:
//   node scripts/generate-icons.mjs
// Emits public/icon-192.png, icon-512.png, icon-maskable-512.png, icon-32.png.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync, inflateSync } from "node:zlib";

const publicDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public");

const crcTable = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = ~0;
  for (const byte of buf) {
    c = (c >>> 8) ^ crcTable[(c ^ byte) & 0xff];
  }
  return ~c >>> 0;
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

// Decode an 8-bit RGB/RGBA non-interlaced PNG to { width, height, rgba }.
function decodePng(buf) {
  let pos = 8;
  let width = 0;
  let height = 0;
  let colorType = 6;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      colorType = data[9];
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    pos += 12 + len;
  }
  const channels = colorType === 2 ? 3 : 4;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const rgba = new Uint8ClampedArray(width * height * 4);
  const prev = new Uint8Array(stride);
  const cur = new Uint8Array(stride);
  let rp = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[rp++];
    for (let x = 0; x < stride; x++) {
      const rawByte = raw[rp++];
      const a = x >= channels ? cur[x - channels] : 0;
      const b = prev[x];
      const c = x >= channels ? prev[x - channels] : 0;
      let val = rawByte;
      if (filter === 1) val += a;
      else if (filter === 2) val += b;
      else if (filter === 3) val += (a + b) >> 1;
      else if (filter === 4) val += paeth(a, b, c);
      cur[x] = val & 0xff;
    }
    for (let x = 0; x < width; x++) {
      const s = x * channels;
      const d = (y * width + x) * 4;
      rgba[d] = cur[s];
      rgba[d + 1] = cur[s + 1];
      rgba[d + 2] = cur[s + 2];
      rgba[d + 3] = channels === 4 ? cur[s + 3] : 255;
    }
    prev.set(cur);
  }
  return { width, height, rgba };
}

// Bilinear resize over premultiplied alpha (avoids dark halos on the rounded
// transparent corners), writing the result into a w*h*4 buffer at the offset.
function resizeInto(src, dst, dw, ox, oy, tw, th) {
  for (let y = 0; y < th; y++) {
    const sy = ((y + 0.5) * src.height) / th - 0.5;
    const y0 = Math.max(0, Math.floor(sy));
    const y1 = Math.min(src.height - 1, y0 + 1);
    const fy = Math.min(1, Math.max(0, sy - y0));
    for (let x = 0; x < tw; x++) {
      const sx = ((x + 0.5) * src.width) / tw - 0.5;
      const x0 = Math.max(0, Math.floor(sx));
      const x1 = Math.min(src.width - 1, x0 + 1);
      const fx = Math.min(1, Math.max(0, sx - x0));
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      const corners = [
        [x0, y0, (1 - fx) * (1 - fy)],
        [x1, y0, fx * (1 - fy)],
        [x0, y1, (1 - fx) * fy],
        [x1, y1, fx * fy],
      ];
      for (const [cx, cy, w] of corners) {
        const s = (cy * src.width + cx) * 4;
        const sa = src.rgba[s + 3] / 255;
        r += src.rgba[s] * sa * w;
        g += src.rgba[s + 1] * sa * w;
        b += src.rgba[s + 2] * sa * w;
        a += src.rgba[s + 3] * w;
      }
      const d = ((oy + y) * dw + (ox + x)) * 4;
      const alpha = a / 255;
      dst[d] = alpha > 0 ? r / alpha : 0;
      dst[d + 1] = alpha > 0 ? g / alpha : 0;
      dst[d + 2] = alpha > 0 ? b / alpha : 0;
      dst[d + 3] = a;
    }
  }
}

function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    for (let x = 0; x < stride; x++) {
      raw[y * (stride + 1) + 1 + x] = rgba[y * stride + x];
    }
  }
  const chunk = (type, data) => {
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0);
    out.write(type, 4, "ascii");
    data.copy(out, 8);
    out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// The most common fully-opaque colour — the terracotta wall — used to back the
// maskable variant so platform cropping never reveals a transparent corner.
function dominantColor(src) {
  const counts = new Map();
  for (let i = 0; i < src.rgba.length; i += 4) {
    if (src.rgba[i + 3] < 250) continue;
    const key =
      ((src.rgba[i] >> 4) << 8) |
      ((src.rgba[i + 1] >> 4) << 4) |
      (src.rgba[i + 2] >> 4);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let best = 0;
  let bestKey = 0;
  for (const [key, n] of counts) {
    if (n > best) {
      best = n;
      bestKey = key;
    }
  }
  return [
    ((bestKey >> 8) & 0xf) * 17,
    ((bestKey >> 4) & 0xf) * 17,
    (bestKey & 0xf) * 17,
  ];
}

function plain(src, size) {
  const dst = new Uint8ClampedArray(size * size * 4);
  resizeInto(src, dst, size, 0, 0, size, size);
  writeFileSync(
    join(publicDir, `icon-${size}.png`),
    encodePng(size, size, dst),
  );
}

function maskable(src, size) {
  const [r, g, b] = dominantColor(src);
  const dst = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < dst.length; i += 4) {
    dst[i] = r;
    dst[i + 1] = g;
    dst[i + 2] = b;
    dst[i + 3] = 255;
  }
  const inner = Math.round(size * 0.8);
  const offset = Math.round((size - inner) / 2);
  resizeInto(src, dst, size, offset, offset, inner, inner);
  writeFileSync(
    join(publicDir, "icon-maskable-512.png"),
    encodePng(size, size, dst),
  );
}

const source = decodePng(readFileSync(join(publicDir, "icon.png")));
plain(source, 512);
plain(source, 192);
plain(source, 32);
maskable(source, 512);
console.log("Generated icon-32/192/512 + icon-maskable-512 from icon.png");
