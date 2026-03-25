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

interface GridGeometry {
  xLines: number[];
  yLines: number[];
}

interface GrayRegion {
  width: number;
  height: number;
  values: Float32Array;
}

interface BinaryRegion {
  width: number;
  height: number;
  pixels: Uint8Array;
}

interface Component {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  area: number;
}

interface DigitReadResult {
  digit: number;
  score: number;
  inkRatio: number;
}

const DEFAULT_ROW_HINT_RECTS: Rect[] = [0, 1, 2, 3, 4].map((row) => ({
  x: 0.858,
  y: 0.126 + row * 0.127,
  width: 0.128,
  height: 0.105,
}));

const DEFAULT_COL_HINT_RECTS: Rect[] = [0, 1, 2, 3, 4].map((col) => ({
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

function getRgb(
  image: ImageDataLike,
  x: number,
  y: number,
): [number, number, number] {
  const idx = (y * image.width + x) * 4;
  return [image.data[idx], image.data[idx + 1], image.data[idx + 2]];
}

function toNormalizedRect(image: ImageDataLike, rect: Rect): Rect {
  return {
    x: rect.x / image.width,
    y: rect.y / image.height,
    width: rect.width / image.width,
    height: rect.height / image.height,
  };
}

function subRect(base: Rect, rel: Rect): Rect {
  return {
    x: base.x + base.width * rel.x,
    y: base.y + base.height * rel.y,
    width: base.width * rel.width,
    height: base.height * rel.height,
  };
}

function quantile(values: Float32Array, q: number): number {
  const sorted = Array.from(values).sort((a, b) => a - b);
  if (sorted.length === 0) {
    return 0;
  }
  const idx = Math.max(
    0,
    Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * q)),
  );
  return sorted[idx];
}

function movingAverage(values: number[], radius: number): number[] {
  const windowRadius = Math.max(1, radius);
  const out = new Array(values.length).fill(0);
  const prefix = new Array(values.length + 1).fill(0);

  for (let i = 0; i < values.length; i++) {
    prefix[i + 1] = prefix[i] + values[i];
  }

  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - windowRadius);
    const end = Math.min(values.length - 1, i + windowRadius);
    const sum = prefix[end + 1] - prefix[start];
    out[i] = sum / (end - start + 1);
  }

  return out;
}

function detectLineCandidates(
  profile: number[],
  axisLength: number,
): { position: number; value: number }[] {
  const smoothed = movingAverage(
    profile,
    Math.max(1, Math.floor(axisLength * 0.004)),
  );
  const sorted = [...smoothed].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length * 0.5)] ?? 0;
  const high = sorted[Math.floor(sorted.length * 0.9)] ?? 0;
  const threshold = median + (high - median) * 0.4;

  const candidates: { position: number; value: number }[] = [];
  for (let i = 1; i < smoothed.length - 1; i++) {
    const here = smoothed[i];
    if (here < threshold) {
      continue;
    }
    if (here >= smoothed[i - 1] && here >= smoothed[i + 1]) {
      candidates.push({ position: i, value: here });
    }
  }

  candidates.sort((a, b) => b.value - a.value);
  return candidates.slice(0, 140);
}

function selectBestSixLines(
  profile: number[],
  axisLength: number,
  candidates: { position: number; value: number }[],
): number[] | null {
  if (candidates.length < 6) {
    return null;
  }

  const byPosition = [...candidates].sort((a, b) => a.position - b.position);
  const positions = byPosition.map((candidate) => candidate.position);
  const minStep = axisLength * 0.03;
  const maxStep = axisLength * 0.35;

  let bestScore = Number.NEGATIVE_INFINITY;
  let best: number[] | null = null;

  for (let i = 0; i < positions.length; i++) {
    for (let j = i + 1; j < positions.length; j++) {
      const start = positions[i];
      const end = positions[j];
      const step = (end - start) / 5;
      if (step < minStep || step > maxStep) {
        continue;
      }

      const tolerance = Math.max(2, step * 0.24);
      const chosen: number[] = [];
      let score = 0;
      let valid = true;

      for (let k = 0; k < 6; k++) {
        const target = start + step * k;
        let nearestIndex = 0;
        let nearestDist = Number.POSITIVE_INFINITY;
        for (let idx = 0; idx < positions.length; idx++) {
          const dist = Math.abs(positions[idx] - target);
          if (dist < nearestDist) {
            nearestDist = dist;
            nearestIndex = idx;
          }
        }

        if (nearestDist > tolerance) {
          valid = false;
          break;
        }

        const nearest = positions[nearestIndex];
        chosen.push(nearest);
        score += profile[nearest] - nearestDist * 2;
      }

      if (!valid) {
        continue;
      }

      chosen.sort((a, b) => a - b);
      const deduped = chosen.filter(
        (value, idx) => idx === 0 || value !== chosen[idx - 1],
      );
      if (deduped.length !== 6) {
        continue;
      }

      const gaps = [
        deduped[1] - deduped[0],
        deduped[2] - deduped[1],
        deduped[3] - deduped[2],
        deduped[4] - deduped[3],
        deduped[5] - deduped[4],
      ];
      const meanGap = gaps.reduce((acc, value) => acc + value, 0) / gaps.length;
      const variance =
        gaps.reduce(
          (acc, value) => acc + (value - meanGap) * (value - meanGap),
          0,
        ) / gaps.length;
      score -= variance * 0.12;

      if (score > bestScore) {
        bestScore = score;
        best = deduped;
      }
    }
  }

  return best;
}

function buildHintRectsFromGrid(
  image: ImageDataLike,
  geometry: GridGeometry,
): {
  rowHintRects: Rect[];
  colHintRects: Rect[];
} {
  const xLines = geometry.xLines;
  const yLines = geometry.yLines;
  const cellWidth = (xLines[5] - xLines[0]) / 5;
  const cellHeight = (yLines[5] - yLines[0]) / 5;

  const rowHintRects = [0, 1, 2, 3, 4].map((row) => {
    const x = xLines[5] + cellWidth * 0.24;
    const y = yLines[row] + cellHeight * 0.06;
    return toNormalizedRect(image, {
      x,
      y,
      width: cellWidth * 0.82,
      height: cellHeight * 0.88,
    });
  });

  const colHintRects = [0, 1, 2, 3, 4].map((col) => {
    const x = xLines[col] + cellWidth * 0.08;
    const y = yLines[5] + cellHeight * 0.22;
    return toNormalizedRect(image, {
      x,
      y,
      width: cellWidth * 0.84,
      height: cellHeight * 0.82,
    });
  });

  return { rowHintRects, colHintRects };
}

function geometryFitsHintLayout(
  image: ImageDataLike,
  geometry: GridGeometry,
): boolean {
  const xLines = geometry.xLines;
  const yLines = geometry.yLines;
  const cellWidth = (xLines[5] - xLines[0]) / 5;
  const cellHeight = (yLines[5] - yLines[0]) / 5;

  if (cellWidth < 5 || cellHeight < 5) {
    return false;
  }

  const rowX = xLines[5] + cellWidth * 0.24;
  const rowW = cellWidth * 0.82;
  const rowYTop = yLines[0] + cellHeight * 0.06;
  const rowYBottom = yLines[4] + cellHeight * 0.06 + cellHeight * 0.88;

  const colXLeft = xLines[0] + cellWidth * 0.08;
  const colXRight = xLines[4] + cellWidth * 0.08 + cellWidth * 0.84;
  const colY = yLines[5] + cellHeight * 0.22;
  const colH = cellHeight * 0.82;

  return (
    rowX >= 0 &&
    rowX + rowW <= image.width &&
    rowYTop >= 0 &&
    rowYBottom <= image.height &&
    colXLeft >= 0 &&
    colXRight <= image.width &&
    colY >= 0 &&
    colY + colH <= image.height
  );
}

function detectGridGeometry(image: ImageDataLike): GridGeometry | null {
  const thresholds = [35, 45, 55, 65, 75, 90, 105, 120, 135];

  let bestGeometry: GridGeometry | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const threshold of thresholds) {
    const xProfile = new Array(image.width).fill(0);
    const yProfile = new Array(image.height).fill(0);

    for (let y = 0; y < image.height; y++) {
      for (let x = 0; x < image.width; x++) {
        if (getLuminance(image, x, y) <= threshold) {
          xProfile[x] += 1;
          yProfile[y] += 1;
        }
      }
    }

    const xCandidates = detectLineCandidates(xProfile, image.width);
    const yCandidates = detectLineCandidates(yProfile, image.height);
    const xLines = selectBestSixLines(xProfile, image.width, xCandidates);
    const yLines = selectBestSixLines(yProfile, image.height, yCandidates);

    if (!xLines || !yLines) {
      continue;
    }

    const geometry = { xLines, yLines };
    if (!geometryFitsHintLayout(image, geometry)) {
      continue;
    }

    const gridWidth = xLines[5] - xLines[0];
    const gridHeight = yLines[5] - yLines[0];
    const sizeScore = Math.sqrt(Math.max(1, gridWidth * gridHeight));
    const lineScore =
      xLines.reduce((acc, x) => acc + xProfile[x], 0) +
      yLines.reduce((acc, y) => acc + yProfile[y], 0);
    const score = lineScore + sizeScore * 18;

    if (score > bestScore) {
      bestScore = score;
      bestGeometry = geometry;
    }
  }

  return bestGeometry;
}

function binaryInkRatio(binary: BinaryRegion, zone: Rect): number {
  return fillRatio(binary, {
    x1: zone.x,
    y1: zone.y,
    x2: zone.x + zone.width,
    y2: zone.y + zone.height,
  });
}

function scoreHintRectStructure(image: ImageDataLike, rect: Rect): number {
  const gray = getGrayRegion(image, rect);
  const dark = binaryFromGray(gray, 'dark');

  const topDigits = binaryInkRatio(dark, {
    x: 0.1,
    y: 0.06,
    width: 0.8,
    height: 0.5,
  });
  const bottomDigit = binaryInkRatio(dark, {
    x: 0.58,
    y: 0.55,
    width: 0.35,
    height: 0.4,
  });
  const border =
    binaryInkRatio(dark, { x: 0, y: 0, width: 1, height: 0.08 }) +
    binaryInkRatio(dark, { x: 0, y: 0.92, width: 1, height: 0.08 }) +
    binaryInkRatio(dark, { x: 0, y: 0, width: 0.08, height: 1 }) +
    binaryInkRatio(dark, { x: 0.92, y: 0, width: 0.08, height: 1 });
  const center = binaryInkRatio(dark, {
    x: 0.12,
    y: 0.12,
    width: 0.76,
    height: 0.76,
  });
  const total =
    dark.pixels.reduce((acc, p) => acc + p, 0) /
    Math.max(1, dark.pixels.length);

  const borderContrast = border * 0.25 - center;
  const densityPenalty = Math.abs(total - 0.22);
  return (
    topDigits * 1.8 + bottomDigit * 1.4 + borderContrast * 1.8 - densityPenalty
  );
}

function scoreHintStrip(image: ImageDataLike, rects: Rect[]): number {
  return rects.reduce(
    (acc, rect) => acc + scoreHintRectStructure(image, rect),
    0,
  );
}

function clampNormalizedRect(rect: Rect): Rect {
  const x = Math.max(0, Math.min(0.98, rect.x));
  const y = Math.max(0, Math.min(0.98, rect.y));
  const width = Math.max(0.01, Math.min(1 - x, rect.width));
  const height = Math.max(0.01, Math.min(1 - y, rect.height));
  return { x, y, width, height };
}

function refineHintRect(image: ImageDataLike, seed: Rect): Rect {
  const dxOptions = [-0.1, -0.06, -0.03, 0, 0.03, 0.06, 0.1];
  const dyOptions = [-0.1, -0.06, -0.03, 0, 0.03, 0.06, 0.1];
  const scaleOptions = [0.92, 0.98, 1, 1.04, 1.1];

  let best = seed;
  let bestScore = scoreHintRectStructure(image, seed);

  for (const sx of scaleOptions) {
    for (const sy of scaleOptions) {
      const width = seed.width * sx;
      const height = seed.height * sy;
      const widthDelta = width - seed.width;
      const heightDelta = height - seed.height;

      for (const dx of dxOptions) {
        for (const dy of dyOptions) {
          const candidate = clampNormalizedRect({
            x: seed.x + dx * seed.width - widthDelta * 0.5,
            y: seed.y + dy * seed.height - heightDelta * 0.5,
            width,
            height,
          });
          const score = scoreHintRectStructure(image, candidate);
          if (score > bestScore) {
            best = candidate;
            bestScore = score;
          }
        }
      }
    }
  }

  return best;
}

function refineHintStrip(image: ImageDataLike, seed: Rect[]): Rect[] {
  return seed.map((rect) => refineHintRect(image, rect));
}

function selectHintRects(image: ImageDataLike): {
  rowHintRects: Rect[];
  colHintRects: Rect[];
} {
  const geometry = detectGridGeometry(image);
  const geometryRects = geometry
    ? buildHintRectsFromGrid(image, geometry)
    : null;

  const seedCandidates = [
    {
      rowHintRects: DEFAULT_ROW_HINT_RECTS,
      colHintRects: DEFAULT_COL_HINT_RECTS,
    },
    geometryRects,
  ].filter(
    (value): value is { rowHintRects: Rect[]; colHintRects: Rect[] } =>
      value !== null,
  );

  let best = seedCandidates[0];
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const candidate of seedCandidates) {
    const rowHintRects = refineHintStrip(image, candidate.rowHintRects);
    const colHintRects = refineHintStrip(image, candidate.colHintRects);
    const score =
      scoreHintStrip(image, rowHintRects) +
      scoreHintStrip(image, colHintRects) * 1.05;
    if (score > bestScore) {
      bestScore = score;
      best = { rowHintRects, colHintRects };
    }
  }

  return best;
}

function getGrayRegion(image: ImageDataLike, rect: Rect): GrayRegion {
  const region = clampRect(image, rect);
  const values = new Float32Array(region.width * region.height);

  let ptr = 0;
  for (let y = 0; y < region.height; y++) {
    for (let x = 0; x < region.width; x++) {
      values[ptr] = getLuminance(image, region.x + x, region.y + y);
      ptr += 1;
    }
  }

  return {
    width: region.width,
    height: region.height,
    values,
  };
}

function binaryFromGray(
  gray: GrayRegion,
  mode: 'dark' | 'bright',
): BinaryRegion {
  const low = quantile(gray.values, 0.22);
  const high = quantile(gray.values, 0.78);
  const threshold = mode === 'dark' ? low : high;
  const pixels = new Uint8Array(gray.values.length);

  for (let i = 0; i < gray.values.length; i++) {
    if (mode === 'dark') {
      pixels[i] = gray.values[i] <= threshold ? 1 : 0;
    } else {
      pixels[i] = gray.values[i] >= threshold ? 1 : 0;
    }
  }

  return {
    width: gray.width,
    height: gray.height,
    pixels,
  };
}

function binaryFromColorDistance(
  image: ImageDataLike,
  rect: Rect,
): BinaryRegion {
  const region = clampRect(image, rect);
  const border: [number, number, number][] = [];

  for (let x = 0; x < region.width; x++) {
    border.push(getRgb(image, region.x + x, region.y));
    border.push(getRgb(image, region.x + x, region.y + region.height - 1));
  }
  for (let y = 1; y < region.height - 1; y++) {
    border.push(getRgb(image, region.x, region.y + y));
    border.push(getRgb(image, region.x + region.width - 1, region.y + y));
  }

  let bgR = 0;
  let bgG = 0;
  let bgB = 0;
  for (const [r, g, b] of border) {
    bgR += r;
    bgG += g;
    bgB += b;
  }
  const denom = Math.max(1, border.length);
  bgR /= denom;
  bgG /= denom;
  bgB /= denom;

  const distances = new Float32Array(region.width * region.height);
  let ptr = 0;
  for (let y = 0; y < region.height; y++) {
    for (let x = 0; x < region.width; x++) {
      const [r, g, b] = getRgb(image, region.x + x, region.y + y);
      const dr = r - bgR;
      const dg = g - bgG;
      const db = b - bgB;
      distances[ptr] = Math.sqrt(dr * dr + dg * dg + db * db);
      ptr += 1;
    }
  }

  const threshold = quantile(distances, 0.76);
  const pixels = new Uint8Array(distances.length);
  for (let i = 0; i < distances.length; i++) {
    pixels[i] = distances[i] >= threshold ? 1 : 0;
  }

  return {
    width: region.width,
    height: region.height,
    pixels,
  };
}

function findConnectedComponents(binary: BinaryRegion): Component[] {
  const visited = new Uint8Array(binary.width * binary.height);
  const components: Component[] = [];

  for (let y = 0; y < binary.height; y++) {
    for (let x = 0; x < binary.width; x++) {
      const startIdx = y * binary.width + x;
      if (visited[startIdx] === 1 || binary.pixels[startIdx] === 0) {
        continue;
      }

      visited[startIdx] = 1;
      const stack: [number, number][] = [[x, y]];
      let area = 0;
      let x1 = x;
      let y1 = y;
      let x2 = x;
      let y2 = y;

      while (stack.length > 0) {
        const [cx, cy] = stack.pop() as [number, number];
        area += 1;
        if (cx < x1) x1 = cx;
        if (cx > x2) x2 = cx;
        if (cy < y1) y1 = cy;
        if (cy > y2) y2 = cy;

        const neighbors: [number, number][] = [
          [cx - 1, cy],
          [cx + 1, cy],
          [cx, cy - 1],
          [cx, cy + 1],
        ];

        for (const [nx, ny] of neighbors) {
          if (nx < 0 || ny < 0 || nx >= binary.width || ny >= binary.height) {
            continue;
          }
          const nIdx = ny * binary.width + nx;
          if (visited[nIdx] === 1 || binary.pixels[nIdx] === 0) {
            continue;
          }
          visited[nIdx] = 1;
          stack.push([nx, ny]);
        }
      }

      components.push({ x1, y1, x2, y2, area });
    }
  }

  return components;
}

function cropBinary(
  binary: BinaryRegion,
  component: Component,
  padRatio = 0.12,
): BinaryRegion {
  const compWidth = component.x2 - component.x1 + 1;
  const compHeight = component.y2 - component.y1 + 1;
  const padX = Math.max(1, Math.floor(compWidth * padRatio));
  const padY = Math.max(1, Math.floor(compHeight * padRatio));
  const x1 = Math.max(0, component.x1 - padX);
  const y1 = Math.max(0, component.y1 - padY);
  const x2 = Math.min(binary.width - 1, component.x2 + padX);
  const y2 = Math.min(binary.height - 1, component.y2 + padY);

  const width = x2 - x1 + 1;
  const height = y2 - y1 + 1;
  const pixels = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      pixels[y * width + x] = binary.pixels[(y1 + y) * binary.width + (x1 + x)];
    }
  }

  return { width, height, pixels };
}

function fillRatio(
  binary: BinaryRegion,
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

function scoreSevenSegmentDigit(binary: BinaryRegion): {
  digit: number;
  score: number;
} {
  const segmentRatios: [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ] = [
    fillRatio(binary, { x1: 0.18, y1: 0.04, x2: 0.82, y2: 0.18 }),
    fillRatio(binary, { x1: 0.04, y1: 0.12, x2: 0.31, y2: 0.47 }),
    fillRatio(binary, { x1: 0.69, y1: 0.12, x2: 0.96, y2: 0.47 }),
    fillRatio(binary, { x1: 0.18, y1: 0.41, x2: 0.82, y2: 0.6 }),
    fillRatio(binary, { x1: 0.04, y1: 0.52, x2: 0.31, y2: 0.88 }),
    fillRatio(binary, { x1: 0.69, y1: 0.52, x2: 0.96, y2: 0.88 }),
    fillRatio(binary, { x1: 0.18, y1: 0.82, x2: 0.82, y2: 0.98 }),
  ];

  const aspect = binary.width / Math.max(1, binary.height);
  const centerFill = fillRatio(binary, {
    x1: 0.34,
    y1: 0.37,
    x2: 0.66,
    y2: 0.67,
  });

  let bestDigit = 0;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const [digitText, target] of Object.entries(DIGIT_SEGMENTS)) {
    const digit = Number(digitText);
    let score = 0;
    for (let i = 0; i < 7; i++) {
      score += target[i] === 1 ? 1 - segmentRatios[i] : segmentRatios[i];
    }

    if (digit === 1) {
      score += Math.max(0, aspect - 0.62) * 2.5;
    }
    if (digit === 0) {
      score += centerFill * 1.2;
    }
    if (digit === 8) {
      score += Math.max(0, 0.18 - centerFill) * 1.2;
    }

    if (score < bestScore) {
      bestScore = score;
      bestDigit = digit;
    }
  }

  return { digit: bestDigit, score: bestScore };
}

function digitFromComponent(
  binary: BinaryRegion,
  component: Component,
): DigitReadResult {
  const cropped = cropBinary(binary, component);
  const ink = cropped.pixels.reduce((acc, p) => acc + p, 0);
  const total = Math.max(1, cropped.width * cropped.height);
  const inkRatio = ink / total;
  const score = scoreSevenSegmentDigit(cropped);
  return {
    digit: score.digit,
    score: score.score,
    inkRatio,
  };
}

function componentCenterX(component: Component): number {
  return (component.x1 + component.x2) * 0.5;
}

function componentCenterY(component: Component): number {
  return (component.y1 + component.y2) * 0.5;
}

function splitWideComponent(
  binary: BinaryRegion,
  component: Component,
): Component[] {
  const width = component.x2 - component.x1 + 1;
  const height = component.y2 - component.y1 + 1;
  if (width / Math.max(1, height) < 0.95) {
    return [component];
  }

  const profile = new Array(width).fill(0);
  for (let y = component.y1; y <= component.y2; y++) {
    for (let x = component.x1; x <= component.x2; x++) {
      profile[x - component.x1] += binary.pixels[y * binary.width + x];
    }
  }

  const start = Math.floor(width * 0.25);
  const end = Math.ceil(width * 0.75);
  let valleyIndex = -1;
  let valleyValue = Number.POSITIVE_INFINITY;
  for (let i = start; i < end; i++) {
    if (profile[i] < valleyValue) {
      valleyValue = profile[i];
      valleyIndex = i;
    }
  }

  if (valleyIndex < 0) {
    return [component];
  }
  const maxCol = Math.max(...profile);
  if (valleyValue > maxCol * 0.46) {
    return [component];
  }

  const splitX = component.x1 + valleyIndex;
  if (splitX <= component.x1 + 1 || splitX >= component.x2 - 1) {
    return [component];
  }

  const left: Component = {
    x1: component.x1,
    y1: component.y1,
    x2: splitX - 1,
    y2: component.y2,
    area: 0,
  };
  const right: Component = {
    x1: splitX + 1,
    y1: component.y1,
    x2: component.x2,
    y2: component.y2,
    area: 0,
  };

  for (let y = component.y1; y <= component.y2; y++) {
    for (let x = component.x1; x <= component.x2; x++) {
      const p = binary.pixels[y * binary.width + x];
      if (p === 0) {
        continue;
      }
      if (x <= left.x2) {
        left.area += 1;
      } else if (x >= right.x1) {
        right.area += 1;
      }
    }
  }

  const out: Component[] = [];
  if (left.area > 0) {
    out.push(left);
  }
  if (right.area > 0) {
    out.push(right);
  }
  return out.length >= 2 ? out : [component];
}

function detectDigitComponentsInZone(
  binary: BinaryRegion,
  zone: { x1: number; y1: number; x2: number; y2: number },
): Component[] {
  const all = findConnectedComponents(binary);
  const minArea = (binary.width * binary.height) / 500;
  const maxArea = (binary.width * binary.height) / 3;
  const components: Component[] = [];

  for (const component of all) {
    if (component.area < minArea || component.area > maxArea) {
      continue;
    }

    const cx = componentCenterX(component) / binary.width;
    const cy = componentCenterY(component) / binary.height;
    if (cx < zone.x1 || cx > zone.x2 || cy < zone.y1 || cy > zone.y2) {
      continue;
    }

    const width = component.x2 - component.x1 + 1;
    const height = component.y2 - component.y1 + 1;
    const aspect = width / Math.max(1, height);
    if (aspect < 0.18 || aspect > 1.5) {
      continue;
    }

    components.push(...splitWideComponent(binary, component));
  }

  return components;
}

function fallbackDigitFromRect(
  image: ImageDataLike,
  rect: Rect,
): DigitReadResult {
  const binary = binaryFromColorDistance(image, rect);
  const score = scoreSevenSegmentDigit(binary);
  const ink = binary.pixels.reduce((acc, p) => acc + p, 0);
  const total = Math.max(1, binary.width * binary.height);
  return {
    digit: score.digit,
    score: score.score,
    inkRatio: ink / total,
  };
}

function parseHintPair(image: ImageDataLike, hintRect: Rect): HintValuePair {
  const gray = getGrayRegion(image, hintRect);
  const dark = binaryFromGray(gray, 'dark');
  const dist = binaryFromColorDistance(image, hintRect);
  const mergedPixels = new Uint8Array(dark.pixels.length);
  for (let i = 0; i < mergedPixels.length; i++) {
    mergedPixels[i] = dark.pixels[i] | dist.pixels[i];
  }
  const ink = {
    width: dark.width,
    height: dark.height,
    pixels: mergedPixels,
  };

  const sumComponents = detectDigitComponentsInZone(ink, {
    x1: 0.06,
    y1: 0.04,
    x2: 0.94,
    y2: 0.58,
  }).sort((a, b) => a.x1 - b.x1);

  const sumDigitComponents = sumComponents.slice(-2);
  const sumDigits = sumDigitComponents
    .map((component) => digitFromComponent(ink, component))
    .filter((result) => result.inkRatio >= 0.015 && result.score < 6.4)
    .map((result) => result.digit);

  let sumText = '0';
  if (sumDigits.length >= 2) {
    const value = Number(`${sumDigits[0]}${sumDigits[1]}`);
    sumText = String(value);
  } else if (sumDigits.length === 1) {
    sumText = String(sumDigits[0]);
  } else {
    const fallbackSumRect = subRect(hintRect, {
      x: 0.5,
      y: 0.06,
      width: 0.35,
      height: 0.44,
    });
    sumText = String(fallbackDigitFromRect(image, fallbackSumRect).digit);
  }

  const voltorbCandidates = detectDigitComponentsInZone(ink, {
    x1: 0.5,
    y1: 0.56,
    x2: 0.96,
    y2: 0.98,
  }).sort((a, b) => b.area - a.area);

  let voltorbText = '0';
  if (voltorbCandidates.length > 0) {
    const read = digitFromComponent(ink, voltorbCandidates[0]);
    voltorbText = String(read.digit);
  } else {
    const fallbackVoltRect = subRect(hintRect, {
      x: 0.62,
      y: 0.58,
      width: 0.3,
      height: 0.32,
    });
    voltorbText = String(fallbackDigitFromRect(image, fallbackVoltRect).digit);
  }

  return [sumText, voltorbText];
}

export function extractHintsFromImageData(
  image: ImageDataLike,
): ExtractedHintValues {
  const hintRects = selectHintRects(image);

  const rowHintValues = hintRects.rowHintRects.map((rect) =>
    parseHintPair(image, rect),
  );
  const colHintValues = hintRects.colHintRects.map((rect) =>
    parseHintPair(image, rect),
  );

  return { rowHintValues, colHintValues };
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
