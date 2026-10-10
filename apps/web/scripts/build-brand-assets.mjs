/**
 * Rebuilds every brand asset from the originals in `KnowledgeBase/Brand` (M00-F02, spec D18).
 *
 *   pnpm --filter @domus/web brand:build
 *
 * - The emblem is the official vector master, used as-is (SVGO only rewrites the path data at 3-decimal
 *   precision; the script checks the optimized render against the original pixel by pixel).
 * - The wordmark exists only as a raster ("Logotipo Merged Domus.png": emblem + "omus"). The emblem part is the
 *   vector master; "omus" is traced from the raster (potrace on a 6x upscaled, smoothed crop) and placed in the
 *   emblem's coordinate system using the position and scale of the "D" in the raster.
 * - Icons, favicons and PWA icons are rendered from the same geometry.
 *
 * The outputs are committed; run this only when the source brand files change.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import potrace from 'potrace';
import sharp from 'sharp';
import { optimize } from 'svgo';

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = resolve(WEB, '..', '..');
const BRAND = resolve(ROOT, 'KnowledgeBase', 'Brand');
const INK = '#1d1d1f';
const PAPER = '#f5f5f7';

const out = (...segments) => {
  const path = resolve(WEB, ...segments);
  mkdirSync(dirname(path), { recursive: true });
  return path;
};

// --- Emblem (vector master) -------------------------------------------------------------------------------------

const masterSvg = readFileSync(
  resolve(BRAND, 'Vector', 'domus-emblem.svg'),
  'utf8',
);
const masterPath = /<path d="([^"]+)"/.exec(masterSvg)?.[1];
const masterTranslate = /matrix\(1,0,0,1,(-?[\d.]+),(-?[\d.]+)\)/.exec(
  masterSvg,
);
if (!masterPath || !masterTranslate)
  throw new Error('Unexpected emblem master structure');
const [shiftX, shiftY] = [Number(masterTranslate[1]), Number(masterTranslate[2])];

/** Rewrites every absolute coordinate of a path made of M/L/C/Z with `map(x, y)`. */
function mapPath(d, map, digits = 3) {
  const round = (value) => Number(value.toFixed(digits));
  return d.replace(/([MLCZ])([^MLCZ]*)/g, (_, command, args) => {
    const numbers = args.match(/-?\d*\.?\d+(?:e-?\d+)?/gi)?.map(Number) ?? [];
    const pairs = [];
    for (let i = 0; i < numbers.length; i += 2)
      pairs.push(map(numbers[i], numbers[i + 1]).map(round).join(' '));
    return command + pairs.join(' ');
  });
}

// Emblem in its own coordinates (the master's group transform applied), origin at the emblem's top-left corner.
const emblemD = mapPath(masterPath, (x, y) => [x + shiftX, y + shiftY]);
// Exact bounds of the path (the master's own viewBox starts at 0,0 and clips about one unit at the left edge).
const EMBLEM_BOX = { x: -1.076, y: 0.2, width: 441, height: 407 };

const wrap = (box, body, fill) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box.x} ${box.y} ${box.width} ${box.height}" fill="${fill}">${body}</svg>`;

function optimized(svg) {
  return optimize(svg, {
    multipass: true,
    plugins: ['preset-default'],
    floatPrecision: 3,
  }).data;
}

async function render(svg, width, background) {
  return sharp(Buffer.from(svg), { density: 300 })
    .resize({ width })
    .flatten(background ? { background } : false)
    .png()
    .toBuffer();
}

/** Mean absolute pixel difference (0-255) between two same-size renders. */
async function difference(a, b) {
  const [first, second] = await Promise.all(
    [a, b].map((png) =>
      sharp(png).flatten({ background: '#ffffff' }).raw().toBuffer(),
    ),
  );
  let sum = 0;
  for (let i = 0; i < first.length; i++) sum += Math.abs(first[i] - second[i]);
  return sum / first.length;
}

const emblemSvg = (fill) =>
  optimized(
    wrap(EMBLEM_BOX, `<path d="${emblemD}" fill-rule="evenodd"/>`, fill),
  );
const emblemInk = emblemSvg(INK);
// Compare on the exact bounds, so the master's 1-unit clip at the edge does not count as drift.
const masterExact = wrap(
  EMBLEM_BOX,
  `<path d="${emblemD}" fill-rule="evenodd"/>`,
  INK,
);
const emblemDrift = await difference(
  await render(masterExact, 1100),
  await render(emblemInk, 1100),
);
if (emblemDrift > 0.05)
  throw new Error(`Optimized emblem drifted from the master (${emblemDrift})`);

// --- Wordmark ("omus" traced from the raster) -------------------------------------------------------------------

const RASTER = resolve(BRAND, 'Logotipo Merged Domus.png');
const CROP = { left: 534, top: 440, width: 670, height: 230 }; // "omus" only; the D ends at x = 528
const TRACE_SCALE = 6;
// Position of the raster's "D" (measured on the thresholded raster): left, top, width in pixels.
const D_RASTER = { left: 268, top: 406, width: 261 };
const scale = D_RASTER.width / EMBLEM_BOX.width; // raster px per emblem unit

const binary = await sharp(RASTER)
  .extract(CROP)
  .grayscale()
  .resize({ width: CROP.width * TRACE_SCALE, kernel: 'lanczos3' })
  .blur(2.2)
  .threshold(128)
  .png()
  .toBuffer();
const traced = await new Promise((resolveTrace, reject) =>
  potrace.trace(
    binary,
    {
      turdSize: 200,
      alphaMax: 1,
      optCurve: true,
      optTolerance: 0.4,
      threshold: 128,
      blackOnWhite: true,
    },
    (error, svg) => (error ? reject(error) : resolveTrace(svg)),
  ),
);
const tracedD = /<path d="([^"]+)"/.exec(traced)?.[1];
if (!tracedD) throw new Error('potrace returned no path');

// traced pixel -> raster pixel -> emblem units.
const omusD = mapPath(
  tracedD.replaceAll(',', ' '),
  (x, y) => [
    EMBLEM_BOX.x + (CROP.left + x / TRACE_SCALE - D_RASTER.left) / scale,
    EMBLEM_BOX.y + (CROP.top + y / TRACE_SCALE - D_RASTER.top) / scale,
  ],
  2,
);

// Right edge of the raster's "s" (measured): 1184 px inclusive.
const WORDMARK_BOX = {
  x: EMBLEM_BOX.x,
  y: EMBLEM_BOX.y,
  width: Math.ceil((1185 - D_RASTER.left) / scale),
  height: EMBLEM_BOX.height,
};
const wordmarkSvg = (fill) =>
  optimized(
    wrap(
      WORDMARK_BOX,
      `<path d="${emblemD}" fill-rule="evenodd"/><path d="${omusD}" fill-rule="evenodd"/>`,
      fill,
    ),
  );

// --- Files -------------------------------------------------------------------------------------------------------

const pathData = (svg) => [...svg.matchAll(/\sd="([^"]+)"/g)].map((m) => m[1]);
const wordmarkInk = wordmarkSvg(INK);
writeFileSync(out('public', 'brand', 'domus-emblem.svg'), emblemInk);
writeFileSync(
  out('public', 'brand', 'domus-emblem-light.svg'),
  emblemSvg(PAPER),
);
writeFileSync(out('public', 'brand', 'domus-logo.svg'), wordmarkInk);
writeFileSync(
  out('public', 'brand', 'domus-logo-light.svg'),
  wordmarkSvg(PAPER),
);

writeFileSync(
  out('src', 'components', 'brand', 'brand-paths.ts'),
  `// Generated by scripts/build-brand-assets.mjs from KnowledgeBase/Brand. Do not edit by hand.
export const EMBLEM_VIEW_BOX = '${EMBLEM_BOX.x} ${EMBLEM_BOX.y} ${EMBLEM_BOX.width} ${EMBLEM_BOX.height}';
export const LOGO_VIEW_BOX = '${WORDMARK_BOX.x} ${WORDMARK_BOX.y} ${WORDMARK_BOX.width} ${WORDMARK_BOX.height}';

/** Official emblem (the "D" with the open door). */
export const EMBLEM_PATH =
  '${pathData(emblemInk).join('')}';

/** Emblem plus the traced "omus", in one path, in the ${WORDMARK_BOX.width}x${WORDMARK_BOX.height} logo box. */
export const LOGO_PATH =
  '${pathData(wordmarkInk).join('')}';
`,
);

// Icons: the emblem centered on a square, `inset` being the share of the side kept free around it.
function iconSvg({ size, inset, background, fill }) {
  const box = size * (1 - 2 * inset);
  const k = Math.min(box / EMBLEM_BOX.width, box / EMBLEM_BOX.height);
  const x = (size - EMBLEM_BOX.width * k) / 2 - EMBLEM_BOX.x * k;
  const y = (size - EMBLEM_BOX.height * k) / 2 - EMBLEM_BOX.y * k;
  const backdrop = background
    ? `<rect width="${size}" height="${size}" fill="${background}"/>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">${backdrop}<path transform="translate(${x} ${y}) scale(${k})" d="${emblemD}" fill="${fill}" fill-rule="evenodd"/></svg>`;
}

// Browser tab icon: ink on transparent, light ink in dark mode (tabs are dark there).
writeFileSync(
  out('src', 'app', 'icon.svg'),
  optimized(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${EMBLEM_BOX.x} ${EMBLEM_BOX.y} ${EMBLEM_BOX.width} ${EMBLEM_BOX.height}"><style>path{fill:${INK}}@media (prefers-color-scheme:dark){path{fill:${PAPER}}}</style><path d="${emblemD}" fill-rule="evenodd"/></svg>`,
  ),
);
const png = async (file, svg, size) =>
  writeFileSync(
    file,
    await sharp(Buffer.from(svg), { density: 600 })
      .resize(size, size)
      .png()
      .toBuffer(),
  );
await png(
  out('src', 'app', 'icon.png'),
  iconSvg({ size: 96, inset: 0.06, fill: INK, background: '#ffffff' }),
  96,
);
await png(
  out('src', 'app', 'apple-icon.png'),
  iconSvg({ size: 180, inset: 0.2, fill: INK, background: '#ffffff' }),
  180,
);
await png(
  out('public', 'icons', 'icon-192.png'),
  iconSvg({ size: 192, inset: 0.18, fill: INK, background: '#ffffff' }),
  192,
);
await png(
  out('public', 'icons', 'icon-512.png'),
  iconSvg({ size: 512, inset: 0.18, fill: INK, background: '#ffffff' }),
  512,
);
// Maskable: the emblem stays inside the central 60 % (the OS may crop the rest into a circle or squircle).
await png(
  out('public', 'icons', 'icon-maskable-512.png'),
  iconSvg({ size: 512, inset: 0.2, fill: PAPER, background: INK }),
  512,
);

// favicon.ico: PNG-compressed 16, 32 and 48 px images in an ICO container.
const sizes = [16, 32, 48];
const images = await Promise.all(
  sizes.map((size) =>
    sharp(
      Buffer.from(iconSvg({ size, inset: 0.04, fill: INK, background: '#ffffff' })),
      { density: 600 },
    )
      .resize(size, size)
      .png()
      .toBuffer(),
  ),
);
const header = Buffer.alloc(6 + 16 * images.length);
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(images.length, 4);
let offset = header.length;
images.forEach((image, index) => {
  const entry = 6 + index * 16;
  header.writeUInt8(sizes[index], entry); // width
  header.writeUInt8(sizes[index], entry + 1); // height
  header.writeUInt16LE(1, entry + 4); // color planes
  header.writeUInt16LE(32, entry + 6); // bits per pixel
  header.writeUInt32LE(image.length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += image.length;
});
writeFileSync(out('src', 'app', 'favicon.ico'), Buffer.concat([header, ...images]));

// --- Comparison image: original raster | rebuilt SVG | difference ---------------------------------------------------

const PANEL = { width: 1100 };
const scaleUp = PANEL.width / (1185 - D_RASTER.left + 40); // keep a margin of 20 px each side
const region = {
  left: D_RASTER.left - 20,
  top: D_RASTER.top - 20,
  width: 1185 - D_RASTER.left + 40,
  height: 241 + 40,
};
const original = await sharp(RASTER)
  .extract(region)
  .resize({ width: PANEL.width, kernel: 'lanczos3' })
  .grayscale()
  .raw()
  .toBuffer({ resolveWithObject: true });
const margin = 20 / scale; // emblem units
const rebuilt = await sharp(
  Buffer.from(
    wrap(
      {
        x: WORDMARK_BOX.x - margin,
        y: WORDMARK_BOX.y - margin,
        width: WORDMARK_BOX.width + 2 * margin,
        height: WORDMARK_BOX.height + 2 * margin,
      },
      `<rect x="${WORDMARK_BOX.x - margin}" y="${WORDMARK_BOX.y - margin}" width="${WORDMARK_BOX.width + 2 * margin}" height="${WORDMARK_BOX.height + 2 * margin}" fill="#fff"/><path d="${emblemD}" fill="${INK}"/><path d="${omusD}" fill="${INK}" fill-rule="evenodd"/>`,
      INK,
    ),
  ),
  { density: 300 },
)
  .resize({ width: PANEL.width, height: original.info.height, fit: 'fill' })
  .grayscale()
  .raw()
  .toBuffer();
const diff = Buffer.alloc(original.data.length * 3);
let differing = 0;
for (let i = 0; i < original.data.length; i++) {
  const a = original.data[i] < 128;
  const b = rebuilt[i] < 128;
  if (a !== b) differing++;
  // grey where both are ink, red where only the raster has ink, blue where only the SVG has ink.
  const [r, g, bl] =
    a && b ? [60, 60, 60] : a ? [220, 40, 40] : b ? [40, 90, 220] : [255, 255, 255];
  diff[i * 3] = r;
  diff[i * 3 + 1] = g;
  diff[i * 3 + 2] = bl;
}
const inkPixels = original.data.filter((v) => v < 128).length;
const toPng = (buffer, channels) =>
  sharp(buffer, {
    raw: { width: PANEL.width, height: original.info.height, channels },
  })
    .png()
    .toBuffer();
const panelHeight = original.info.height;
const gap = 16;
const comparison = await sharp({
  create: {
    width: PANEL.width,
    height: panelHeight * 3 + gap * 2,
    channels: 3,
    background: '#d6d6d6',
  },
})
  .composite([
    { input: await toPng(original.data, 1), top: 0, left: 0 },
    { input: await toPng(rebuilt, 1), top: panelHeight + gap, left: 0 },
    { input: await toPng(diff, 3), top: (panelHeight + gap) * 2, left: 0 },
  ])
  .png()
  .toBuffer();
const comparisonPath = resolve(ROOT, 'docs', 'screenshots', 'h1', 'brand-wordmark-comparison.png');
mkdirSync(dirname(comparisonPath), { recursive: true });
writeFileSync(comparisonPath, comparison);

console.log(
  JSON.stringify(
    {
      emblemDrift,
      logoBox: WORDMARK_BOX,
      logoPathBytes: wordmarkInk.length,
      scaleUp,
      mismatchedPixels: differing,
      mismatchShare: Number((differing / inkPixels).toFixed(4)),
    },
    null,
    2,
  ),
);
