'use strict';

/**
 * Rasterizes icons/icon.svg at each target pixel size.
 * PNGs are drawn from the vector, with 4× supersampling, not scaled
 * up from a smaller bitmap.
 *
 * Source: blue rounded tile, white T, amber circle with a right arrow.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SIZES = [16, 32, 48, 128, 300];
const ROOT = path.join(__dirname, '..');
const SVG_PATH = path.join(ROOT, 'icons', 'icon.svg');

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

function parseColor(value) {
  if (!value || value === 'none') return null;
  const hex = String(value).trim();
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
}

function attrs(tag) {
  const out = {};
  const re = /([:\w-]+)\s*=\s*"([^"]*)"/g;
  let match = re.exec(tag);
  while (match) {
    out[match[1]] = match[2];
    match = re.exec(tag);
  }
  return out;
}

function num(value, fallback) {
  if (value == null || value === '') return fallback;
  return Number(value);
}

function parsePath(d) {
  const tokens = String(d).match(/[MmHhVvLlZz]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) || [];
  const subpaths = [];
  let current = [];
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  let i = 0;

  function close() {
    if (current.length) subpaths.push(current);
    current = [];
  }

  while (i < tokens.length) {
    const cmd = tokens[i];
    if (cmd === 'M' || cmd === 'L') {
      if (cmd === 'M' && current.length) close();
      cx = parseFloat(tokens[i + 1]);
      cy = parseFloat(tokens[i + 2]);
      if (cmd === 'M') {
        sx = cx;
        sy = cy;
      }
      current.push([cx, cy]);
      i += 3;
    } else if (cmd === 'H') {
      cx = parseFloat(tokens[i + 1]);
      current.push([cx, cy]);
      i += 2;
    } else if (cmd === 'V') {
      cy = parseFloat(tokens[i + 1]);
      current.push([cx, cy]);
      i += 2;
    } else if (cmd === 'Z' || cmd === 'z') {
      current.push([sx, sy]);
      close();
      cx = sx;
      cy = sy;
      i += 1;
    } else {
      i += 1;
    }
  }
  if (current.length) close();
  return subpaths;
}

function loadShapes(svg) {
  const view = /viewBox="\s*0\s+0\s+([0-9.]+)\s+([0-9.]+)\s*"/.exec(svg);
  const viewSize = view ? Number(view[1]) : 256;
  const shapes = [];
  const tags = svg.match(/<(rect|circle|path)\b[^>]*\/?>/g) || [];
  tags.forEach(function (tag) {
    const a = attrs(tag);
    if (tag.startsWith('<rect')) {
      shapes.push({
        type: 'roundRect',
        x: num(a.x, 0),
        y: num(a.y, 0),
        w: num(a.width, 0),
        h: num(a.height, 0),
        r: num(a.rx, 0),
        fill: parseColor(a.fill)
      });
    } else if (tag.startsWith('<circle')) {
      shapes.push({
        type: 'circle',
        cx: num(a.cx, 0),
        cy: num(a.cy, 0),
        r: num(a.r, 0),
        fill: parseColor(a.fill),
        stroke: parseColor(a.stroke),
        strokeWidth: num(a['stroke-width'], 0)
      });
    } else if (tag.startsWith('<path')) {
      shapes.push({
        type: 'path',
        subpaths: parsePath(a.d || ''),
        fill: parseColor(a.fill)
      });
    }
  });
  return { viewSize: viewSize, shapes: shapes };
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
    if (((yi > y) !== (yj > y)) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function paint(shape, x, y, color) {
  if (shape.type === 'roundRect') {
    if (!shape.fill) return color;
    if (insideRoundRect(x, y, shape.x, shape.y, shape.x + shape.w, shape.y + shape.h, shape.r)) return shape.fill;
    return color;
  }
  if (shape.type === 'circle') {
    const dx = x - shape.cx;
    const dy = y - shape.cy;
    const dist = Math.hypot(dx, dy);
    if (shape.fill && dist <= shape.r) color = shape.fill;
    if (shape.stroke && shape.strokeWidth > 0) {
      const half = shape.strokeWidth / 2;
      if (dist >= shape.r - half && dist <= shape.r + half) color = shape.stroke;
    }
    return color;
  }
  if (shape.type === 'path' && shape.fill) {
    for (let i = 0; i < shape.subpaths.length; i += 1) {
      if (insidePolygon(x, y, shape.subpaths[i])) return shape.fill;
    }
  }
  return color;
}

function encodePNG(size, viewSize, shapes) {
  const samples = 4;
  const stride = size * 4 + 1;
  const raw = Buffer.alloc(stride * size);
  const scale = viewSize / size;
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
          let color = [0, 0, 0, 0];
          for (let i = 0; i < shapes.length; i += 1) color = paint(shapes[i], gx, gy, color);
          const ca = color[3] / 255;
          r += color[0] * ca;
          g += color[1] * ca;
          b += color[2] * ca;
          a += ca;
        }
      }
      const alpha = a / (samples * samples);
      const i = y * stride + 1 + x * 4;
      if (a > 0) {
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
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

function main() {
  const svg = fs.readFileSync(SVG_PATH, 'utf8');
  const drawing = loadShapes(svg);
  if (!drawing.shapes.length) throw new Error('icon.svg has no drawable shapes');
  const dir = path.dirname(SVG_PATH);
  SIZES.forEach(function (size) {
    const file = path.join(dir, 'icon' + size + '.png');
    fs.writeFileSync(file, encodePNG(size, drawing.viewSize, drawing.shapes));
    process.stdout.write('wrote ' + file + '\n');
  });
}

main();
