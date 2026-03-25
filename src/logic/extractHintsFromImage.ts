export type HintValuePair = [string, string];

export interface ExtractedHintValues {
  rowHintValues: HintValuePair[];
  colHintValues: HintValuePair[];
}

export interface ImageDataLike {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array;
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const ROW_HINT_RECTS: Rect[] = [0, 1, 2, 3, 4].map((row) => ({
  x: 0.858,
  y: 0.126 + row * 0.127,
  width: 0.128,
  height: 0.105,
}));

const COL_HINT_RECTS: Rect[] = [0, 1, 2, 3, 4].map((col) => ({
  x: 0.104 + col * 0.158,
  y: 0.797,
  width: 0.128,
  height: 0.105,
}));

const DIGIT_SEGMENTS: Record<
  number,
  [number, number, number, number, number, number, number]
> = {
  0: [1, 1, 1, 0, 1, 1, 1],
  1: [0, 0, 1, 0, 0, 1, 0],
  2: [1, 0, 1, 1, 1, 0, 1],
  3: [1, 0, 1, 1, 0, 1, 1],
  4: [0, 1, 1, 1, 0, 1, 0],
  5: [1, 1, 0, 1, 0, 1, 1],
  6: [1, 1, 0, 1, 1, 1, 1],
  7: [1, 0, 1, 0, 0, 1, 0],
  8: [1, 1, 1, 1, 1, 1, 1],
  9: [1, 1, 1, 1, 0, 1, 1],
};

function clampRect(image: ImageDataLike, rect: Rect): Rect {
  const x = Math.max(0, Math.floor(rect.x * image.width));
  const y = Math.max(0, Math.floor(rect.y * image.height));
  const maxW = Math.max(1, image.width - x);
  const maxH = Math.max(1, image.height - y);
  const width = Math.max(
    1,
    Math.min(maxW, Math.floor(rect.width * image.width)),
  );
  const height = Math.max(
    1,
    Math.min(maxH, Math.floor(rect.height * image.height)),
  );
  return { x, y, width, height };
}

function getLuminance(image: ImageDataLike, x: number, y: number): number {
  const idx = (y * image.width + x) * 4;
  const r = image.data[idx];
  const g = image.data[idx + 1];
  const b = image.data[idx + 2];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function sampleRectBinary(
  image: ImageDataLike,
  rect: Rect,
): { width: number; height: number; pixels: Uint8Array } {
  const region = clampRect(image, rect);
  const pixels = new Uint8Array(region.width * region.height);

  let min = 255;
  let max = 0;
  const luminances = new Float32Array(region.width * region.height);
  let ptr = 0;

  for (let y = 0; y < region.height; y++) {
    for (let x = 0; x < region.width; x++) {
      const lum = getLuminance(image, region.x + x, region.y + y);
      luminances[ptr] = lum;
      min = Math.min(min, lum);
      max = Math.max(max, lum);
      ptr += 1;
    }
  }

  const threshold = min + (max - min) * 0.58;
  for (let i = 0; i < luminances.length; i++) {
    pixels[i] = luminances[i] >= threshold ? 1 : 0;
  }

  return { width: region.width, height: region.height, pixels };
}

function fillRatio(
  binary: { width: number; height: number; pixels: Uint8Array },
  rect: { x1: number; y1: number; x2: number; y2: number },
): number {
  const x1 = Math.max(0, Math.floor(rect.x1 * binary.width));
  const y1 = Math.max(0, Math.floor(rect.y1 * binary.height));
  const x2 = Math.min(binary.width, Math.ceil(rect.x2 * binary.width));
  const y2 = Math.min(binary.height, Math.ceil(rect.y2 * binary.height));

  let total = 0;
  let on = 0;
  for (let y = y1; y < y2; y++) {
    for (let x = x1; x < x2; x++) {
      total += 1;
      on += binary.pixels[y * binary.width + x];
    }
  }

  return total === 0 ? 0 : on / total;
}

function readSevenSegmentDigit(binary: {
  width: number;
  height: number;
  pixels: Uint8Array;
}): number {
  const segments: [number, number, number, number, number, number, number] = [
    fillRatio(binary, { x1: 0.2, y1: 0.04, x2: 0.8, y2: 0.19 }) > 0.24 ? 1 : 0,
    fillRatio(binary, { x1: 0.03, y1: 0.16, x2: 0.31, y2: 0.5 }) > 0.2 ? 1 : 0,
    fillRatio(binary, { x1: 0.69, y1: 0.16, x2: 0.97, y2: 0.5 }) > 0.2 ? 1 : 0,
    fillRatio(binary, { x1: 0.2, y1: 0.43, x2: 0.8, y2: 0.6 }) > 0.24 ? 1 : 0,
    fillRatio(binary, { x1: 0.03, y1: 0.52, x2: 0.31, y2: 0.86 }) > 0.2 ? 1 : 0,
    fillRatio(binary, { x1: 0.69, y1: 0.52, x2: 0.97, y2: 0.86 }) > 0.2 ? 1 : 0,
    fillRatio(binary, { x1: 0.2, y1: 0.82, x2: 0.8, y2: 0.98 }) > 0.2 ? 1 : 0,
  ];

  let bestDigit = 0;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const [digitText, target] of Object.entries(DIGIT_SEGMENTS)) {
    const digit = Number(digitText);
    let score = 0;
    for (let i = 0; i < 7; i++) {
      score += Math.abs(segments[i] - target[i]);
    }

    if (score < bestScore) {
      bestScore = score;
      bestDigit = digit;
    }
  }

  return bestDigit;
}

function parseHintPair(image: ImageDataLike, hintRect: Rect): HintValuePair {
  const hintPx = clampRect(image, hintRect);

  const sumBand: Rect = {
    x: hintPx.x / image.width,
    y: (hintPx.y + Math.floor(hintPx.height * 0.06)) / image.height,
    width: hintPx.width / image.width,
    height: Math.floor(hintPx.height * 0.46) / image.height,
  };

  const sumLeft: Rect = {
    x: sumBand.x + sumBand.width * 0.09,
    y: sumBand.y,
    width: sumBand.width * 0.36,
    height: sumBand.height,
  };

  const sumRight: Rect = {
    x: sumBand.x + sumBand.width * 0.51,
    y: sumBand.y,
    width: sumBand.width * 0.36,
    height: sumBand.height,
  };

  const voltRect: Rect = {
    x: hintPx.x / image.width + (hintPx.width / image.width) * 0.63,
    y: (hintPx.y + Math.floor(hintPx.height * 0.57)) / image.height,
    width: (hintPx.width / image.width) * 0.3,
    height: (hintPx.height / image.height) * 0.35,
  };

  const leftDigit = readSevenSegmentDigit(sampleRectBinary(image, sumLeft));
  const rightDigit = readSevenSegmentDigit(sampleRectBinary(image, sumRight));
  const voltDigit = readSevenSegmentDigit(sampleRectBinary(image, voltRect));

  const sum = Number(`${leftDigit}${rightDigit}`).toString();
  return [sum, String(voltDigit)];
}

export function extractHintsFromImageData(
  image: ImageDataLike,
): ExtractedHintValues {
  const rowHintValues = ROW_HINT_RECTS.map((rect) =>
    parseHintPair(image, rect),
  );
  const colHintValues = COL_HINT_RECTS.map((rect) =>
    parseHintPair(image, rect),
  );

  const result = { rowHintValues, colHintValues };
  return result;
}

export async function extractHintsFromImageBitmap(
  blob: Blob,
): Promise<ExtractedHintValues> {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    throw new Error('Canvas 2D context is unavailable in this browser.');
  }

  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return extractHintsFromImageData(imageData);
}
