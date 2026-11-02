#!/usr/bin/env node
// One-shot: generate a simple square icon PNG (zlib-compressed, no deps) used by `pnpm tauri icon`.
const zlib = require('zlib');
const fs = require('fs');

const S = 1024;
// Dark rounded square bg (#1e2430) with accent border and "CC-ish" two bars.
const px = Buffer.alloc(4 * S * S);
function dist(x, y, cx, cy) { return Math.hypot(x - cx, y - cy); }
for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4;
    // rounded-square mask
    const m = 88; // margin
    const r = 200;
    const inSquare = x > m && x < S - m && y > m && y < S - m &&
      (dist(Math.max(m + r - Math.min(x, S - m) + r, x), 0, 0, 0) || true);
    // cheap rounded mask via corner circles
    const cx = Math.min(Math.max(x, m + r), S - m - r);
    const cy = Math.min(Math.max(y, m + r), S - m - r);
    const inside = dist(x, y, cx, cy) <= r;
    let R = 30, G = 36, B = 48, A = 0;
    if (inside) {
      A = 255; R = 30; G = 36; B = 48;
      // inner border ring
      const d = dist(x, y, cx, cy);
      if (d > r - 22) { R = 10; G = 250, B = 180; }
      // "CC": two arcs drawn as circles cut by inner circles
      const cc = (ox) => {
        const bx = S / 2 + ox, by = S / 2;
        const rad = 170, t = 46;
        const dd = dist(x, y, bx, by);
        // arc: ring minus wedge on right side
        if (Math.abs(dd - rad) < t) {
          const ang = Math.atan2(y - by, x - bx);
          if (Math.abs(ang) > 0.55) return true;
        }
        return false;
      };
      if (cc(-150) || cc(150)) { R = 10, G = 250, B = 180; }
    }
    px[i] = R; px[i + 1] = G; px[i + 2] = B; px[i + 3] = A;
  }
}
// PNG encode: signature + IHDR + IDAT(filter 0 rows) + IEND
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crcTable = [];
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c; }
  let crc = 0xffffffff;
  for (const b of body) crc = crcTable[(crc ^ b) & 0xff] ^ (crc >>> 8);
  const crcBuf = Buffer.alloc(4); crcBuf.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([len, body, crcBuf]);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4);
ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
const raw = Buffer.alloc(S * (S * 4 + 1));
for (let y = 0; y < S; y++) {
  raw[y * (S * 4 + 1)] = 0;
  px.copy(raw, y * (S * 4 + 1) + 1, y * S * 4, (y + 1) * S * 4);
}
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw)),
  chunk('IEND', Buffer.alloc(0)),
]);
fs.writeFileSync(process.argv[2] || 'icon.png', png);
console.log('icon written:', process.argv[2] || 'icon.png', png.length, 'bytes');
