'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i += 1) {
    c ^= buf[i];
    for (let k = 0; k < 8; k += 1) {
      c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData), 0);
  return Buffer.concat([length, typeAndData, crc]);
}

function encodePNG(size, pixelAt) {
  const stride = size * 4 + 1;
  const raw = Buffer.alloc(stride * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * stride] = 0;
    for (let x = 0; x < size; x += 1) {
      const [r, g, b, a] = pixelAt(x, y, size);
      const i = y * stride + 1 + x * 4;
      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
      raw[i + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

function insideRoundRect(px, py, left, top, right, bottom, radius) {
  if (px < left || px > right || py < top || py > bottom) return false;
  const cx = px < left + radius ? left + radius : px > right - radius ? right - radius : px;
  const cy = py < top + radius ? top + radius : py > bottom - radius ? bottom - radius : py;
  if (cx === px && cy === py) return true;
  const dx = px - cx;
  const dy = py - cy;
  return dx * dx + dy * dy <= radius * radius;
}

function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = dx * dx + dy * dy;
  if (len === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / len;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function iconPixel(x, y, size) {
  const px = (x + 0.5) / size;
  const py = (y + 0.5) / size;
  const blue = [15, 108, 189, 255];
  const white = [255, 255, 255, 255];
  const ink = [11, 74, 130, 255];
  const amber = [255, 180, 64, 255];
  if (!insideRoundRect(px, py, 0.04, 0.04, 0.96, 0.96, 0.22)) return [0, 0, 0, 0];

  const inBubble =
    ((px - 0.46) ** 2) / (0.30 ** 2) + ((py - 0.44) ** 2) / (0.26 ** 2) <= 1;
  const inTail =
    px >= 0.28 && px <= 0.46 && py >= 0.58 && py <= 0.74 &&
    (py - 0.58) <= (0.46 - px) * 1.15;

  const stroke = Math.max(0.055, 1.35 / size);
  const leftLeg = distToSegment(px, py, 0.38, 0.60, 0.48, 0.30) <= stroke;
  const rightLeg = distToSegment(px, py, 0.58, 0.60, 0.48, 0.30) <= stroke;
  const crossbar = distToSegment(px, py, 0.41, 0.50, 0.55, 0.50) <= stroke * 0.85;
  const letter = leftLeg || rightLeg || crossbar;

  const dot = ((px - 0.74) ** 2) + ((py - 0.70) ** 2) <= (0.11 ** 2);
  const arrow =
    distToSegment(px, py, 0.68, 0.70, 0.80, 0.70) <= Math.max(0.03, 0.9 / size) ||
    distToSegment(px, py, 0.75, 0.64, 0.81, 0.70) <= Math.max(0.03, 0.9 / size) ||
    distToSegment(px, py, 0.75, 0.76, 0.81, 0.70) <= Math.max(0.03, 0.9 / size);

  if (dot) return arrow ? ink : amber;
  if (inBubble || inTail) return letter ? blue : white;
  return blue;
}

function main() {
  const dir = path.join(__dirname, '..', 'icons');
  fs.mkdirSync(dir, { recursive: true });
  [16, 32, 48, 128].forEach(function (size) {
    const png = encodePNG(size, iconPixel);
    const file = path.join(dir, 'icon' + size + '.png');
    fs.writeFileSync(file, png);
    process.stdout.write('wrote ' + file + '\n');
  });
}

main();
