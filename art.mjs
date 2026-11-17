const DAY_MS = 86400000;
const series = ['orbital_geometry', 'flow_fields', 'constructivist', 'topographic', 'strata', 'organic_growth'];
const palettes = {
  poster: ['#f1e6cb', '#172b37', '#c83c32', '#e6af35', '#256981'],
  coast: ['#e8eadb', '#163d43', '#146b77', '#e9bd4d', '#cb5748'],
  orchard: ['#f0e9d4', '#2c392d', '#3f694d', '#de9d2e', '#a93830'],
  ink: ['#ffffff', '#111111', '#3e3e3e', '#aaaaaa', '#636363'],
};
const automaticPalettes = ['poster', 'coast', 'orchard'];
export const orientations = { landscape: [2560, 1440], portrait: [1440, 2560] };

function hash(value) {
  let result = 2166136261;
  for (const character of value) {
    result = Math.imul(result ^ character.codePointAt(0), 16777619);
  }
  return result >>> 0;
}

function randomSource(seed) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), state | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

function localDay(now, zone) {
  let formatter;
  const options = { year: 'numeric', month: 'numeric', day: 'numeric' };
  try {
    formatter = new Intl.DateTimeFormat('en-CA', { ...options, timeZone: zone || 'UTC' });
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    formatter = new Intl.DateTimeFormat('en-CA', { ...options, timeZone: 'UTC' });
  }
  const parts = Object.fromEntries(formatter.formatToParts(now).map(({ type, value }) => [type, Number(value)]));
  return Date.UTC(parts.year, parts.month - 1, parts.day) / DAY_MS;
}

export function selectArtwork(query, now = new Date()) {
  const day = localDay(now, query.get('zone'));
  const weekly = query.get('cadence') === 'weekly';
  const weekNumber = Math.floor((day + 3) / 7);
  const period = weekly ? weekNumber : day;
  const editionDay = weekly ? weekNumber * 7 - 3 : day;
  const date = new Date(editionDay * DAY_MS).toISOString().slice(0, 10);
  const variant = hash(query.get('seed')?.trim().slice(0, 64) || 'gallery').toString(16);
  const offset = Number.parseInt(variant, 16);
  const requestedStyle = query.get('style');
  const requestedPalette = query.get('palette');
  return {
    date, variant,
    style: series.includes(requestedStyle) ? requestedStyle : series[(period + offset) % series.length],
    palette: Object.hasOwn(palettes, requestedPalette)
      ? requestedPalette : automaticPalettes[(Math.floor(period / automaticPalettes.length) + offset) % automaticPalettes.length],
    density: query.get('density') === 'layered' ? 'layered' : 'balanced',
  };
}

export function artworkKey({ date, style, palette, density, variant }) {
  return `v1-${date}-${style}-${palette}-${density}-${variant}`;
}

export function parseArtworkKey(key) {
  const match = /^v1-(\d{4}-\d{2}-\d{2})-([a-z_]+)-([a-z]+)-(balanced|layered)-([a-f0-9]{1,8})$/.exec(key);
  if (!match) return null;
  const [, date, style, palette, density, variant] = match;
  const timestamp = Date.parse(date);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== date ||
      !series.includes(style) || !Object.hasOwn(palettes, palette)) return null;
  return { date, style, palette, density, variant };
}

const rounded = value => Number(value.toFixed(2));
const point = (x, y) => `${rounded(x)} ${rounded(y)}`;
const rect = (x, y, width, height, fill) =>
  `<rect x="${rounded(x)}" y="${rounded(y)}" width="${rounded(width)}" height="${rounded(height)}" fill="${fill}"/>`;
const circle = (x, y, radius, fill) =>
  `<circle cx="${rounded(x)}" cy="${rounded(y)}" r="${rounded(radius)}" fill="${fill}"/>`;
const path = (data, fill) => `<path d="${data}" fill="${fill}"/>`;

function orbital({ w, h, unit, colors, random, layered }) {
  const [paper, dark, red, gold, blue] = colors;
  const tall = h > w;
  const flip = random() < 0.5;
  const anchor = tall ? (flip ? 0.43 : 0.59) : (flip ? 0.37 : 0.65);
  const cx = w * (tall ? anchor : 0.5 + (anchor - 0.5) * 0.9);
  const cy = h * (tall ? 0.49 : 0.51);
  const radius = unit * (0.40 + random() * 0.05);
  const shapes = [
    rect(tall ? 0 : w * (flip ? 0.55 : 0.08), tall ? h * 0.16 : h * 0.19,
      tall ? w : w * 0.37, h * (tall ? 0.65 : 0.62), blue),
    circle(cx, cy, radius, dark),
    circle(cx, cy, radius * 0.69, paper),
    circle(cx, cy, radius * 0.48, red),
  ];
  const angle = random() * Math.PI * 2;
  const cutLength = 2 * radius * 1.27;
  const rotated = rect(cx - cutLength / 2, cy - unit * 0.036, cutLength, unit * 0.072, gold);
  shapes.push(`<g transform="rotate(${rounded(angle * 180 / Math.PI)} ${rounded(cx)} ${rounded(cy)})">${rotated}</g>`);
  for (let i = 0; i < (layered ? 5 : 3); i++) {
    const phase = angle + Math.PI * 2 * (i + 0.32) / (layered ? 5 : 3);
    const distance = radius * (1.11 + random() * 0.16);
    shapes.push(circle(cx + Math.cos(phase) * distance, cy + Math.sin(phase) * distance,
      radius * (0.055 + random() * 0.06), i % 2 ? gold : red));
  }
  return shapes.join('');
}

function constructivist({ w, h, unit, colors, random, layered }) {
  const [paper, dark, red, gold, blue] = colors;
  const tall = h > w;
  const cell = unit * (0.126 + random() * 0.031);
  const x = w * (tall ? 0.105 : 0.14);
  const y = h * (tall ? 0.16 : 0.17);
  const cols = tall ? 5 : 8;
  const rows = tall ? 8 : 5;
  const colorsForTiles = [dark, red, gold, blue];
  const shapes = [
    rect(w * 0.49, h * 0.11, w * 0.39, h * 0.78, gold),
    circle(w * (0.63 + random() * 0.1), h * 0.40, unit * 0.23, red),
  ];
  for (let col = 0; col < cols; col++) {
    for (let row = 0; row < rows; row++) {
      const draw = random();
      if (draw < (layered ? 0.29 : 0.47)) continue;
      const left = x + col * cell;
      const top = y + row * cell;
      const color = colorsForTiles[Math.floor(random() * colorsForTiles.length)];
      const gap = cell * 0.06;
      shapes.push(draw > 0.78
        ? path(`M${point(left, top + gap)} H${rounded(left + cell - gap)} L${point(left, top + cell - gap)} Z`, color)
        : rect(left, top, cell - gap, draw < 0.62 ? cell * 0.46 : cell - gap, color));
    }
  }
  shapes.push(rect(x, h * 0.78, Math.min(w - x, unit * 0.64), unit * 0.10, dark));
  shapes.push(rect(x, h * 0.81, Math.min(w - x, unit * 0.47), unit * 0.022, paper));
  const art = shapes.join('');
  return random() < 0.45 ? `<g transform="translate(${w} 0) scale(-1 1)">${art}</g>` : art;
}

function strata({ w, h, unit, colors, random, layered }) {
  const [paper, dark, red, gold, blue] = colors;
  const peak = w * (0.27 + random() * 0.44);
  const shapes = [
    rect(w * 0.06, 0, w * (0.13 + random() * 0.23), h, gold),
    circle(peak, h * (0.22 + random() * 0.1), unit * (0.10 + random() * 0.06), red),
  ];
  const stack = layered ? [dark, blue, paper, red, gold, blue, dark] : [dark, blue, paper, red, dark];
  const rise = (random() - 0.46) * h * 0.52;
  for (const [i, color] of stack.entries()) {
    const baseline = h * (0.39 + i * (0.47 / (stack.length - 1)));
    const jitter = (random() - 0.5) * h * 0.055;
    const contour = `M${point(0, baseline + rise)} Q${point(w * 0.21, baseline - h * 0.10 + jitter)} ${point(peak, baseline + jitter)} T${point(w, baseline - rise)} V${h} H0 Z`;
    shapes.push(path(contour, color));
  }
  return shapes.join('');
}

function flowFields({ w, h, unit, colors, random, layered }) {
  const [, dark, accent, highlight, secondary] = colors;
  const tall = h > w;
  const length = Math.max(w, h);
  const pitch = unit * 0.058;
  const lanes = layered ? 16 : 12;
  const direction = random() < 0.5 ? -1 : 1;
  const bend = unit * (0.22 + random() * 0.11) * direction;
  const focus = length * (0.42 + random() * 0.16);
  const paths = [];

  for (let lane = 0; lane < lanes; lane++) {
    const fraction = lane / (lanes - 1) - 0.5;
    const y = unit * 0.52 + (lane - (lanes - 1) / 2) * pitch;
    const center = unit * 0.49 + fraction * unit * 0.48;
    const end = y - bend * 0.68;
    const data = `M${point(-pitch, y + bend)} C${point(length * 0.19, y + bend)} ${point(focus - length * 0.2, center)} ${point(focus, center)} S${point(length * 0.83, end)} ${point(length + pitch, end)}`;
    const color = lane === Math.floor(lanes * 0.38) ? accent
      : lane === Math.floor(lanes * 0.65) ? highlight : fraction < 0 ? secondary : dark;
    const weight = color === accent || color === highlight ? pitch * 0.64 : pitch * (layered ? 0.24 : 0.20);
    paths.push(`<path d="${data}" fill="none" stroke="${color}" stroke-width="${rounded(weight)}"/>`);
  }

  const drawing = paths.join('');
  return tall ? `<g transform="translate(${w} 0) rotate(90)">${drawing}</g>` : drawing;
}

function topographic({ w, h, unit, colors, random, layered }) {
  const [paper, dark, accent, highlight, secondary] = colors;
  const phase = random() * 2 * Math.PI;
  const focusX = w * (0.38 + random() * 0.24);
  const focusY = h * (0.37 + random() * 0.26);
  const ratio = 0.89 + random() * 0.16;
  const count = layered ? 13 : 10;
  const contours = [];

  for (let level = count; level >= 1; level--) {
    const radial = unit * (0.052 + level * (layered ? 0.044 : 0.054));
    const offset = (1 - level / count) * radial * 0.28;
    const points = [];
    for (let sample = 0; sample < 144; sample++) {
      const angle = sample / 144 * 2 * Math.PI;
      const displacement = 1 + 0.16 * Math.sin(3 * angle + phase) +
        0.09 * Math.cos(5 * angle - phase) + 0.11 * Math.sin(2 * angle + phase);
      points.push(point(focusX + Math.cos(phase) * offset + Math.cos(angle) * radial * displacement * ratio,
        focusY + Math.sin(phase) * offset + Math.sin(angle) * radial * displacement));
    }
    const data = `M${points.join(' L')} Z`;
    const fill = level === 1 ? accent : level === 3 ? highlight : level === count - 4 ? secondary : paper;
    contours.push(`<path d="${data}" fill="${fill}" stroke="${dark}" stroke-width="${rounded(unit * 0.004)}" stroke-linejoin="round"/>`);
  }
  return contours.join('');
}

function organicGrowth({ w, h, unit, colors, random, layered }) {
  const [paper, dark, accent, highlight, secondary] = colors;
  const tall = h > w;
  const curveSign = random() < 0.5 ? -1 : 1;
  const lean = w * (tall ? 0.14 : 0.26) * curveSign;
  const spread = unit * (tall ? 0.23 : 0.31);
  const stemPoint = t => [w * 0.5 + (t - 0.5) * lean + Math.sin(t * Math.PI) * lean * 0.35,
    h * (0.90 - 0.75 * t)];
  const stem = Array.from({length: 25}, (_, i) => point(...stemPoint(i / 24)));
  const leaves = [`<path d="M${stem.join(' L')}" fill="none" stroke="${dark}" stroke-width="${rounded(unit * 0.012)}" stroke-linecap="round"/>`];
  const count = layered ? 13 : 9;

  for (let i = 0; i < count; i++) {
    const t = 0.13 + i / count * 0.80;
    const [x, y] = stemPoint(t);
    const direction = (i % 2 === 0 ? 1 : -1) * curveSign;
    const reach = spread * (0.65 + 0.35 * Math.sin(t * Math.PI)) * (0.87 + random() * 0.20);
    const rise = unit * (0.09 + random() * 0.065);
    const tipX = x + reach * direction;
    const tipY = y - rise;
    const outer = point(x + reach * direction * 0.27, y - rise * 1.37);
    const inner = point(x + reach * direction * 0.68, y + rise * 0.22);
    const blade = `M${point(x, y)} Q${outer} ${point(tipX, tipY)} Q${inner} ${point(x, y)} Z`;
    leaves.push(path(blade, [secondary, dark, accent, secondary, highlight][i % 5]));
    if (layered || i % 3 === 0) {
      const vein = `M${point(x, y)} Q${point(x + reach * direction * 0.56, y - rise * 0.28)} ${point(tipX, tipY)}`;
      leaves.push(`<path d="${vein}" fill="none" stroke="${paper}" stroke-width="${rounded(unit * 0.0024)}"/>`);
    }
  }
  const [tipX, tipY] = stemPoint(1);
  leaves.push(circle(tipX, tipY, unit * 0.031, accent));
  return leaves.join('');
}

const renderers = {
  orbital_geometry: orbital,
  constructivist,
  strata,
  flow_fields: flowFields,
  topographic,
  organic_growth: organicGrowth,
};

export function renderSvg(artwork, orientation) {
  const [w, h] = orientations[orientation];
  const colors = palettes[artwork.palette];
  const random = randomSource(hash(artworkKey(artwork)));
  const composition = renderers[artwork.style]({
    w, h, colors, random, unit: Math.min(w, h), layered: artwork.density === 'layered',
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${rect(0, 0, w, h, colors[0])}${composition}</svg>`;
}
