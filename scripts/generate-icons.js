'use strict';

/**
 * Draws the extension icon from one vector description, then writes
 * icons/icon.svg and a PNG at each target size. Every PNG is rasterized
 * at that exact pixel size (4× supersampled), not scaled from a smaller file.
 * The 16px toolbar icon uses the same colors with a pixel-aligned “A”,
 * because a uniform scale of the 128px drawing closes the letter.
 *
 * Brand: blue rounded tile, white speech bubble, blue “A”, amber arrow.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const VIEW = 128;
const BLUE = [15, 108, 189, 255];
const WHITE = [255, 255, 255, 255];
const INK = [11, 74, 130, 255];
const AMBER = [255, 180, 64, 255];

const SIZES = [16, 32, 48, 128, 300];

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

function hex(color) {
  return '#' + color.slice(0, 3).map(function (n) {
    return n.toString(16).padStart(2, '0');
  }).join('').toUpperCase();
}

function thickSegment(x1, y1, x2, y2, width) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * (width / 2);
  const ny = (dx / len) * (width / 2);
  return [
    [x1 + nx, y1 + ny],
    [x2 + nx, y2 + ny],
    [x2 - nx, y2 - ny],
    [x1 - nx, y1 - ny]
  ];
}

function buildShapes() {
  const shapes = [];
  function add(shape) {
    shapes.push(shape);
  }

  add({
    type: 'roundRect',
    x: 4, y: 4, w: 120, h: 120, r: 28,
    fill: BLUE
  });
  add({ type: 'ellipse', cx: 54, cy: 56, rx: 36, ry: 30, fill: WHITE });
  add({
    type: 'polygon',
    points: [[26, 78], [48, 68], [34, 106]],
    fill: WHITE
  });

  const letter = 15;
  [
    [54, 32, 36, 80],
    [54, 32, 72, 80],
    [41, 62, 67, 62]
  ].forEach(function (seg) {
    add({
      type: 'polygon',
      points: thickSegment(seg[0], seg[1], seg[2], seg[3], letter),
      fill: BLUE
    });
    add({ type: 'circle', cx: seg[0], cy: seg[1], r: letter / 2, fill: BLUE });
    add({ type: 'circle', cx: seg[2], cy: seg[3], r: letter / 2, fill: BLUE });
  });

  add({ type: 'circle', cx: 98, cy: 96, r: 20, fill: AMBER });
  add({
    type: 'polygon',
    points: [
      [112, 96],
      [100, 86],
      [100, 92],
      [84, 92],
      [84, 100],
      [100, 100],
      [100, 106]
    ],
    fill: INK
  });
  return shapes;
}

// 16px toolbar slot. Same mark, but the tail is omitted and the strokes
// are sized in a 16-unit grid so they stay a couple of pixels wide.
function buildCompactShapes() {
  const shapes = [];
  function add(shape) {
    shapes.push(shape);
  }
  function px(x, y, fill) {
    add({ type: 'rect', x: x, y: y, w: 1, h: 1, fill: fill });
  }
  add({ type: 'roundRect', x: 0.5, y: 0.5, w: 15, h: 15, r: 3.4, fill: BLUE });
  add({ type: 'ellipse', cx: 6.5, cy: 6.6, rx: 4.7, ry: 4.35, fill: WHITE });
  // Pixel-aligned “A” so the 16px slot stays sharp.
  px(6, 3, BLUE);
  [5, 7].forEach(function (x) { px(x, 4, BLUE); });
  [4, 8].forEach(function (x) { px(x, 5, BLUE); });
  [4, 5, 6, 7, 8].forEach(function (x) { px(x, 6, BLUE); });
  [4, 8].forEach(function (x) { px(x, 7, BLUE); });
  [4, 8].forEach(function (x) { px(x, 8, BLUE); });
  [4, 8].forEach(function (x) { px(x, 9, BLUE); });
  add({ type: 'circle', cx: 12.35, cy: 12.35, r: 2.85, fill: AMBER });
  add({
    type: 'polygon',
    points: [
      [13.85, 12.35],
      [11.35, 10.7],
      [11.85, 12.35],
      [11.35, 14.0]
    ],
    fill: INK
  });
  return shapes;
}

function pointsAttr(points) {
  return points.map(function (p) {
    return trim(p[0]) + ',' + trim(p[1]);
  }).join(' ');
}

function trim(n) {
  return String(Math.round(n * 100) / 100);
}

function toSvg(shapes) {
  const body = shapes.map(function (shape) {
    const fill = hex(shape.fill);
    if (shape.type === 'roundRect') {
      return '<rect x="' + shape.x + '" y="' + shape.y + '" width="' + shape.w + '" height="' + shape.h + '" rx="' + shape.r + '" fill="' + fill + '"/>';
    }
    if (shape.type === 'ellipse') {
      return '<ellipse cx="' + shape.cx + '" cy="' + shape.cy + '" rx="' + shape.rx + '" ry="' + shape.ry + '" fill="' + fill + '"/>';
    }
    if (shape.type === 'circle') {
      return '<circle cx="' + trim(shape.cx) + '" cy="' + trim(shape.cy) + '" r="' + trim(shape.r) + '" fill="' + fill + '"/>';
    }
    return '<polygon points="' + pointsAttr(shape.points) + '" fill="' + fill + '"/>';
  }).join('\n  ');
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + VIEW + ' ' + VIEW + '" width="' + VIEW + '" height="' + VIEW + '">',
    '  ' + body,
    '</svg>',
    ''
  ].join('\n');
}

function insideRoundRect(px, py, left, top, right, bottom, radius) {
  if (px < left || py < top || px > right || py > bottom) return false;
  const cx = px < left + radius ? left + radius : px > right - radius ? right - radius : px;
  const cy = py < top + radius ? top + radius : py > bottom - radius ? bottom - radius : py;
  const dx = px - cx;
  const dy = py - cy;
  return dx * dx + dy * dy <= radius * radius;
}

function insidePolygon(x, y, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const xi = points[i][0];
    const yi = points[i][1];
    const xj = points[j][0];
    const yj = points[j][1];
    const cross = (yi > y) !== (yj > y);
    if (cross && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function hit(shape, x, y) {
  if (shape.type === 'roundRect') {
    return insideRoundRect(x, y, shape.x, shape.y, shape.x + shape.w, shape.y + shape.h, shape.r);
  }
  if (shape.type === 'ellipse') {
    const dx = (x - shape.cx) / shape.rx;
    const dy = (y - shape.cy) / shape.ry;
    return dx * dx + dy * dy <= 1;
  }
  if (shape.type === 'circle') {
    const dx = x - shape.cx;
    const dy = y - shape.cy;
    return dx * dx + dy * dy <= shape.r * shape.r;
  }
  if (shape.type === 'rect') {
    return x >= shape.x && y >= shape.y && x < shape.x + shape.w && y < shape.y + shape.h;
  }
  return insidePolygon(x, y, shape.points);
}

function sample(shapes, x, y) {
  let color = [0, 0, 0, 0];
  for (let i = 0; i < shapes.length; i += 1) {
    if (hit(shapes[i], x, y)) color = shapes[i].fill;
  }
  return color;
}

function encodePNG(size, shapes, view) {
  const samples = 4;
  const stride = size * 4 + 1;
  const raw = Buffer.alloc(stride * size);
  const scale = view / size;
  for (let y = 0; y < size; y += 1) {
    raw[y * stride] = 0;
    for (let x = 0; x < size; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < samples; sy += 1) {
        for (let sx = 0; sx < samples; sx += 1) {
          const gx = (x + (sx + 0.5) / samples) * scale;
          const gy = (y + (sy + 0.5) / samples) * scale;
          const color = sample(shapes, gx, gy);
          const ca = color[3] / 255;
          r += color[0] * ca;
          g += color[1] * ca;
          b += color[2] * ca;
          a += ca;
        }
      }
      const count = samples * samples;
      const alpha = a / count;
      const i = y * stride + 1 + x * 4;
      if (alpha > 0) {
        raw[i] = Math.round(r / a);
        raw[i + 1] = Math.round(g / a);
        raw[i + 2] = Math.round(b / a);
      }
      raw[i + 3] = Math.round(alpha * 255);
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

function main() {
  const dir = path.join(__dirname, '..', 'icons');
  fs.mkdirSync(dir, { recursive: true });
  const shapes = buildShapes();
  const svgPath = path.join(dir, 'icon.svg');
  fs.writeFileSync(svgPath, toSvg(shapes));
  process.stdout.write('wrote ' + svgPath + '\n');
  SIZES.forEach(function (size) {
    const file = path.join(dir, 'icon' + size + '.png');
    const drawing = size <= 16 ? buildCompactShapes() : shapes;
    const view = size <= 16 ? 16 : VIEW;
    fs.writeFileSync(file, encodePNG(size, drawing, view));
    process.stdout.write('wrote ' + file + '\n');
  });
}

main();
