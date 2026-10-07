const sanitizeHtml = require('sanitize-html');

const allowedTags = ['svg', 'g', 'path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'ellipse', 'title', 'desc', 'defs', 'clippath'];
const allowedAttributes = {
  svg: ['xmlns', 'viewbox', 'width', 'height', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin'],
  g: ['fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'transform'],
  path: ['d', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'fill-rule', 'clip-rule', 'transform'],
  circle: ['cx', 'cy', 'r', 'fill', 'stroke', 'stroke-width'],
  rect: ['x', 'y', 'width', 'height', 'rx', 'ry', 'fill', 'stroke', 'stroke-width'],
  line: ['x1', 'y1', 'x2', 'y2', 'stroke', 'stroke-width', 'stroke-linecap'],
  polyline: ['points', 'fill', 'stroke', 'stroke-width'],
  polygon: ['points', 'fill', 'stroke', 'stroke-width'],
  ellipse: ['cx', 'cy', 'rx', 'ry', 'fill', 'stroke', 'stroke-width'],
  clippath: ['id'],
};

function sanitizeSvg(source) {
  const sanitized = sanitizeHtml(source, { allowedTags, allowedAttributes, allowedSchemes: [] })
    .replace(/\bviewbox=/gi, 'viewBox=');
  return /^\s*<svg(?:\s|>)/i.test(sanitized) ? sanitized : null;
}

module.exports = { sanitizeSvg };