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

interface Point {
  x: number;
  y: number;
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

interface DigitReadResult {
  digit: number;
  score: number;
  inkRatio: number;
}

interface DigitCandidate {
  digit: number;
  score: number;
}

interface HintPairCandidate {
  sum: number;
  voltorb: number;
  score: number;
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

const DIGIT_BITMAP_5X7: Record<number, string[]> = {
  0: ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  1: ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  2: ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  3: ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  4: ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  5: ['11111', '10000', '10000', '11110', '00001', '00001', '11110'],
  6: ['01110', '10000', '10000', '11110', '10001', '10001', '01110'],
  7: ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  8: ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  9: ['01110', '10001', '10001', '01111', '00001', '00001', '01110'],
};

const DIGIT_TEMPLATE_WIDTH = 18;
const DIGIT_TEMPLATE_HEIGHT = 26;

const DIGIT_TEMPLATES: Record<number, BinaryRegion> = Object.fromEntries(
  Object.entries(DIGIT_BITMAP_5X7).map(([digitText, rows]) => {
    const sourceHeight = rows.length;
    const sourceWidth = rows[0].length;
    const sourcePixels = new Uint8Array(sourceWidth * sourceHeight);

    for (let y = 0; y < sourceHeight; y++) {
      const row = rows[y];
      for (let x = 0; x < sourceWidth; x++) {
        sourcePixels[y * sourceWidth + x] = row[x] === '1' ? 1 : 0;
      }
    }

    const template = resizeBinaryNearest(
      { width: sourceWidth, height: sourceHeight, pixels: sourcePixels },
      DIGIT_TEMPLATE_WIDTH,
      DIGIT_TEMPLATE_HEIGHT,
    );

    return [Number(digitText), template];
  }),
) as Record<number, BinaryRegion>;

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

interface ComponentWithCenter extends ComponentBox {
  cx: number;
  cy: number;
}

function orangeMask(image: ImageDataLike): BinaryRegion {
  const pixels = new Uint8Array(image.width * image.height);
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const [r, g, b] = getRgb(image, x, y);
      const isOrange =
        r >= 150 &&
        g >= 70 &&
        g <= 220 &&
        b <= 150 &&
        r - g >= 22 &&
        r - b >= 28;
      pixels[y * image.width + x] = isOrange ? 1 : 0;
    }
  }
  return { width: image.width, height: image.height, pixels };
}

function detectOrangeComponents(image: ImageDataLike): ComponentWithCenter[] {
  const mask = orangeMask(image);
  const components = connectedComponents(mask);
  const minArea = Math.max(
    12,
    Math.floor(image.width * image.height * 0.00005),
  );
  const maxArea = Math.max(100, Math.floor(image.width * image.height * 0.03));

  const out: ComponentWithCenter[] = [];
  for (const comp of components) {
    const width = comp.x2 - comp.x1 + 1;
    const height = comp.y2 - comp.y1 + 1;
    const aspect = width / Math.max(1, height);

    if (comp.area < minArea || comp.area > maxArea) {
      continue;
    }
    if (width < 3 || height < 3) {
      continue;
    }
    if (aspect < 0.35 || aspect > 2.2) {
      continue;
    }

    out.push({
      ...comp,
      cx: (comp.x1 + comp.x2) / 2,
      cy: (comp.y1 + comp.y2) / 2,
    });
  }

  return out;
}

function selectLineGroupByAxis(
  components: ComponentWithCenter[],
  axis: 'x' | 'y',
): ComponentWithCenter[] {
  if (components.length < 5) {
    return [];
  }

  const sizeMedian =
    [...components]
      .map((comp) => Math.max(comp.x2 - comp.x1 + 1, comp.y2 - comp.y1 + 1))
      .sort((a, b) => a - b)[Math.floor(components.length / 2)] ?? 8;
  const tolerance = Math.max(5, Math.floor(sizeMedian * 0.9));

  let best: ComponentWithCenter[] = [];
  let bestAxisMean = Number.NEGATIVE_INFINITY;

  for (const seed of components) {
    const seedValue = axis === 'x' ? seed.cx : seed.cy;
    const group = components.filter((comp) => {
      const value = axis === 'x' ? comp.cx : comp.cy;
      return Math.abs(value - seedValue) <= tolerance;
    });

    if (group.length < 5) {
      continue;
    }

    const axisMean =
      group.reduce((acc, comp) => acc + (axis === 'x' ? comp.cx : comp.cy), 0) /
      group.length;

    if (
      group.length > best.length ||
      (group.length === best.length && axisMean > bestAxisMean)
    ) {
      best = group;
      bestAxisMean = axisMean;
    }
  }

  if (best.length === 0) {
    return [];
  }

  best.sort((a, b) => (axis === 'x' ? a.cy - b.cy : a.cx - b.cx));
  const deduped: ComponentWithCenter[] = [];
  const secondaryTolerance = Math.max(5, Math.floor(sizeMedian * 0.7));

  for (const comp of best) {
    const last = deduped[deduped.length - 1];
    if (!last) {
      deduped.push(comp);
      continue;
    }
    const sep =
      axis === 'x' ? Math.abs(comp.cy - last.cy) : Math.abs(comp.cx - last.cx);
    if (sep > secondaryTolerance) {
      deduped.push(comp);
    }
  }

  return deduped.slice(0, 5);
}

function buildHintRectsFromIcons(image: ImageDataLike): {
  rowHintRects: Rect[];
  colHintRects: Rect[];
} | null {
  const components = detectOrangeComponents(image);
  if (components.length < 10) {
    return null;
  }

  const rightIcons = selectLineGroupByAxis(components, 'x');
  const bottomIcons = selectLineGroupByAxis(components, 'y');
  if (rightIcons.length < 5 || bottomIcons.length < 5) {
    return null;
  }

  const rowHintRects = rightIcons
    .sort((a, b) => a.cy - b.cy)
    .slice(0, 5)
    .map((icon) => {
      const w = icon.x2 - icon.x1 + 1;
      const h = icon.y2 - icon.y1 + 1;
      return toNormalizedRect(image, {
        x: icon.x1 - w * 0.2,
        y: icon.y1 - h * 1.32,
        width: w * 2.8,
        height: h * 2.35,
      });
    });

  const colHintRects = bottomIcons
    .sort((a, b) => a.cx - b.cx)
    .slice(0, 5)
    .map((icon) => {
      const w = icon.x2 - icon.x1 + 1;
      const h = icon.y2 - icon.y1 + 1;
      return toNormalizedRect(image, {
        x: icon.x1 - w * 0.32,
        y: icon.y1 - h * 1.32,
        width: w * 2.8,
        height: h * 2.35,
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
  const darkThresholds = [35, 45, 55, 65, 75, 90, 105, 120, 135];
  const brightThresholds = [155, 170, 185, 200, 215, 230, 240];

  let bestGeometry: GridGeometry | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const mode of ['dark', 'bright'] as const) {
    const thresholds = mode === 'dark' ? darkThresholds : brightThresholds;
    for (const threshold of thresholds) {
      const xProfile = new Array(image.width).fill(0);
      const yProfile = new Array(image.height).fill(0);

      for (let y = 0; y < image.height; y++) {
        for (let x = 0; x < image.width; x++) {
          const lum = getLuminance(image, x, y);
          const isHit = mode === 'dark' ? lum <= threshold : lum >= threshold;
          if (!isHit) {
            continue;
          }
          xProfile[x] += 1;
          yProfile[y] += 1;
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
      const brightBoost = mode === 'bright' ? 1.08 : 1;
      const score = lineScore * brightBoost + sizeScore * 18;

      if (score > bestScore) {
        bestScore = score;
        bestGeometry = geometry;
      }
    }
  }

  return bestGeometry;
}

function selectHintRects(image: ImageDataLike): {
  rowHintRects: Rect[];
  colHintRects: Rect[];
} {
  const iconRects = buildHintRectsFromIcons(image);
  if (iconRects) {
    return iconRects;
  }

  const geometry = detectGridGeometry(image);
  if (geometry) {
    return buildHintRectsFromGrid(image, geometry);
  }
  return {
    rowHintRects: DEFAULT_ROW_HINT_RECTS,
    colHintRects: DEFAULT_COL_HINT_RECTS,
  };
}

function solveLinearSystem8x8(A: number[][], b: number[]): number[] | null {
  const n = 8;
  const M = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(M[row][col]) > Math.abs(M[pivot][col])) {
        pivot = row;
      }
    }
    if (Math.abs(M[pivot][col]) < 1e-9) {
      return null;
    }
    if (pivot !== col) {
      const tmp = M[col];
      M[col] = M[pivot];
      M[pivot] = tmp;
    }

    const div = M[col][col];
    for (let j = col; j <= n; j++) {
      M[col][j] /= div;
    }

    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = M[row][col];
      if (factor === 0) continue;
      for (let j = col; j <= n; j++) {
        M[row][j] -= factor * M[col][j];
      }
    }
  }

  return M.map((row) => row[n]);
}

function computeHomography(src: Point[], dst: Point[]): number[] | null {
  if (src.length !== 4 || dst.length !== 4) {
    return null;
  }

  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const x = src[i].x;
    const y = src[i].y;
    const u = dst[i].x;
    const v = dst[i].y;

    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }

  const h = solveLinearSystem8x8(A, b);
  if (!h) {
    return null;
  }

  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}

function invert3x3(m: number[]): number[] | null {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const D = -(b * i - c * h);
  const E = a * i - c * g;
  const F = -(a * h - b * g);
  const G = b * f - c * e;
  const H = -(a * f - c * d);
  const I = a * e - b * d;

  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-9) {
    return null;
  }

  const invDet = 1 / det;
  return [
    A * invDet,
    D * invDet,
    G * invDet,
    B * invDet,
    E * invDet,
    H * invDet,
    C * invDet,
    F * invDet,
    I * invDet,
  ];
}

function applyHomographyPoint(m: number[], x: number, y: number): Point {
  const tx = m[0] * x + m[1] * y + m[2];
  const ty = m[3] * x + m[4] * y + m[5];
  const tw = m[6] * x + m[7] * y + m[8];
  const w = Math.abs(tw) < 1e-9 ? 1e-9 : tw;
  return { x: tx / w, y: ty / w };
}

function sampleBilinearRGBA(
  image: ImageDataLike,
  x: number,
  y: number,
): number[] {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = x0 + 1;
  const y1 = y0 + 1;

  if (x0 < 0 || y0 < 0 || x1 >= image.width || y1 >= image.height) {
    return [0, 0, 0, 0];
  }

  const fx = x - x0;
  const fy = y - y0;

  const idx00 = (y0 * image.width + x0) * 4;
  const idx10 = (y0 * image.width + x1) * 4;
  const idx01 = (y1 * image.width + x0) * 4;
  const idx11 = (y1 * image.width + x1) * 4;

  const out = [0, 0, 0, 0];
  for (let c = 0; c < 4; c++) {
    const v00 = image.data[idx00 + c];
    const v10 = image.data[idx10 + c];
    const v01 = image.data[idx01 + c];
    const v11 = image.data[idx11 + c];

    const v0 = v00 * (1 - fx) + v10 * fx;
    const v1 = v01 * (1 - fx) + v11 * fx;
    out[c] = v0 * (1 - fy) + v1 * fy;
  }

  return out;
}

interface CanonicalBoardImage {
  image: ImageDataLike;
  rowHintRects: Rect[];
  colHintRects: Rect[];
}

function normalizeToCanonicalBoard(
  image: ImageDataLike,
): CanonicalBoardImage | null {
  const geometry = detectGridGeometry(image);
  if (!geometry) {
    return null;
  }

  const srcCorners: Point[] = [
    { x: geometry.xLines[0], y: geometry.yLines[0] },
    { x: geometry.xLines[5], y: geometry.yLines[0] },
    { x: geometry.xLines[5], y: geometry.yLines[5] },
    { x: geometry.xLines[0], y: geometry.yLines[5] },
  ];

  const cell = 88;
  const leftPad = Math.floor(cell * 0.26);
  const topPad = Math.floor(cell * 0.26);
  const rightPad = Math.floor(cell * 1.56);
  const bottomPad = Math.floor(cell * 1.38);
  const boardSize = cell * 5;

  const outWidth = leftPad + boardSize + rightPad;
  const outHeight = topPad + boardSize + bottomPad;

  const dstCorners: Point[] = [
    { x: leftPad, y: topPad },
    { x: leftPad + boardSize, y: topPad },
    { x: leftPad + boardSize, y: topPad + boardSize },
    { x: leftPad, y: topPad + boardSize },
  ];

  const H = computeHomography(srcCorners, dstCorners);
  if (!H) {
    return null;
  }
  const Hinv = invert3x3(H);
  if (!Hinv) {
    return null;
  }

  const data = new Uint8ClampedArray(outWidth * outHeight * 4);
  for (let y = 0; y < outHeight; y++) {
    for (let x = 0; x < outWidth; x++) {
      const src = applyHomographyPoint(Hinv, x, y);
      const rgba = sampleBilinearRGBA(image, src.x, src.y);
      const idx = (y * outWidth + x) * 4;
      data[idx] = Math.round(rgba[0]);
      data[idx + 1] = Math.round(rgba[1]);
      data[idx + 2] = Math.round(rgba[2]);
      data[idx + 3] = Math.round(rgba[3]);
    }
  }

  const canonical: ImageDataLike = {
    width: outWidth,
    height: outHeight,
    data,
  };

  const boardX = leftPad;
  const boardY = topPad;

  const rowHintRects = [0, 1, 2, 3, 4].map((row) =>
    toNormalizedRect(canonical, {
      x: boardX + boardSize + cell * 0.24,
      y: boardY + row * cell + cell * 0.06,
      width: cell * 0.82,
      height: cell * 0.88,
    }),
  );

  const colHintRects = [0, 1, 2, 3, 4].map((col) =>
    toNormalizedRect(canonical, {
      x: boardX + col * cell + cell * 0.08,
      y: boardY + boardSize + cell * 0.22,
      width: cell * 0.84,
      height: cell * 0.82,
    }),
  );

  return {
    image: canonical,
    rowHintRects,
    colHintRects,
  };
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

function dilateBinary(binary: BinaryRegion, iterations: number): BinaryRegion {
  let current = binary;
  for (let iter = 0; iter < iterations; iter++) {
    const next = new Uint8Array(current.width * current.height);
    for (let y = 0; y < current.height; y++) {
      for (let x = 0; x < current.width; x++) {
        let on = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (
              nx < 0 ||
              ny < 0 ||
              nx >= current.width ||
              ny >= current.height
            ) {
              continue;
            }
            if (current.pixels[ny * current.width + nx] === 1) {
              on = 1;
            }
          }
        }
        next[y * current.width + x] = on;
      }
    }
    current = { width: current.width, height: current.height, pixels: next };
  }
  return current;
}

function erodeBinary(binary: BinaryRegion, iterations: number): BinaryRegion {
  let current = binary;
  for (let iter = 0; iter < iterations; iter++) {
    const next = new Uint8Array(current.width * current.height);
    for (let y = 0; y < current.height; y++) {
      for (let x = 0; x < current.width; x++) {
        let on = 1;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (
              nx < 0 ||
              ny < 0 ||
              nx >= current.width ||
              ny >= current.height ||
              current.pixels[ny * current.width + nx] === 0
            ) {
              on = 0;
            }
          }
        }
        next[y * current.width + x] = on;
      }
    }
    current = { width: current.width, height: current.height, pixels: next };
  }
  return current;
}

function denoiseInk(binary: BinaryRegion): BinaryRegion {
  const closed = erodeBinary(dilateBinary(binary, 1), 1);
  return dilateBinary(closed, 1);
}

interface ComponentBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  area: number;
  touchesBorder: boolean;
}

function connectedComponents(binary: BinaryRegion): ComponentBox[] {
  const visited = new Uint8Array(binary.width * binary.height);
  const components: ComponentBox[] = [];
  const queue: number[] = [];

  for (let y = 0; y < binary.height; y++) {
    for (let x = 0; x < binary.width; x++) {
      const startIdx = y * binary.width + x;
      if (binary.pixels[startIdx] === 0 || visited[startIdx] === 1) {
        continue;
      }

      let x1 = x;
      let y1 = y;
      let x2 = x;
      let y2 = y;
      let area = 0;
      let touchesBorder =
        x === 0 || y === 0 || x === binary.width - 1 || y === binary.height - 1;

      visited[startIdx] = 1;
      queue.length = 0;
      queue.push(startIdx);

      for (let cursor = 0; cursor < queue.length; cursor++) {
        const idx = queue[cursor];
        const cx = idx % binary.width;
        const cy = Math.floor(idx / binary.width);
        area += 1;

        if (cx < x1) x1 = cx;
        if (cy < y1) y1 = cy;
        if (cx > x2) x2 = cx;
        if (cy > y2) y2 = cy;
        if (
          cx === 0 ||
          cy === 0 ||
          cx === binary.width - 1 ||
          cy === binary.height - 1
        ) {
          touchesBorder = true;
        }

        const neighbors = [
          [cx - 1, cy],
          [cx + 1, cy],
          [cx, cy - 1],
          [cx, cy + 1],
          [cx - 1, cy - 1],
          [cx + 1, cy - 1],
          [cx - 1, cy + 1],
          [cx + 1, cy + 1],
        ];
        for (const [nx, ny] of neighbors) {
          if (nx < 0 || ny < 0 || nx >= binary.width || ny >= binary.height) {
            continue;
          }
          const nIdx = ny * binary.width + nx;
          if (binary.pixels[nIdx] === 1 && visited[nIdx] === 0) {
            visited[nIdx] = 1;
            queue.push(nIdx);
          }
        }
      }

      components.push({ x1, y1, x2, y2, area, touchesBorder });
    }
  }

  return components;
}

function keepLikelyDigitComponents(binary: BinaryRegion): BinaryRegion {
  const components = connectedComponents(binary);
  const minArea = Math.max(4, Math.floor(binary.width * binary.height * 0.002));
  const maxArea = Math.max(20, Math.floor(binary.width * binary.height * 0.45));
  const out = new Uint8Array(binary.width * binary.height);

  for (const comp of components) {
    const width = comp.x2 - comp.x1 + 1;
    const height = comp.y2 - comp.y1 + 1;
    const aspect = width / Math.max(1, height);

    if (comp.area < minArea || comp.area > maxArea) {
      continue;
    }
    if (comp.touchesBorder && comp.area > maxArea * 0.28) {
      continue;
    }
    if (aspect < 0.08 || aspect > 1.6) {
      continue;
    }

    for (let y = comp.y1; y <= comp.y2; y++) {
      for (let x = comp.x1; x <= comp.x2; x++) {
        const idx = y * binary.width + x;
        if (binary.pixels[idx] === 1) {
          out[idx] = 1;
        }
      }
    }
  }

  return { width: binary.width, height: binary.height, pixels: out };
}

function buildDigitInkMask(image: ImageDataLike, rect: Rect): BinaryRegion {
  const gray = getGrayRegion(image, rect);
  const darkByQuantile = binaryFromGray(gray, 'dark');
  const low = quantile(gray.values, 0.08);
  const mid = quantile(gray.values, 0.4);
  const threshold = low + (mid - low) * 0.52;

  const pixels = new Uint8Array(gray.values.length);
  for (let i = 0; i < gray.values.length; i++) {
    const strictDark = gray.values[i] <= threshold ? 1 : 0;
    pixels[i] = strictDark | darkByQuantile.pixels[i];
  }

  const rough = { width: gray.width, height: gray.height, pixels };
  const cleaned = denoiseInk(rough);
  return keepLikelyDigitComponents(cleaned);
}

function tightCropBinary(binary: BinaryRegion): BinaryRegion {
  let x1 = binary.width;
  let y1 = binary.height;
  let x2 = -1;
  let y2 = -1;

  for (let y = 0; y < binary.height; y++) {
    for (let x = 0; x < binary.width; x++) {
      if (binary.pixels[y * binary.width + x] === 0) {
        continue;
      }
      if (x < x1) x1 = x;
      if (x > x2) x2 = x;
      if (y < y1) y1 = y;
      if (y > y2) y2 = y;
    }
  }

  if (x2 < x1 || y2 < y1) {
    return binary;
  }

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

function resizeBinaryNearest(
  binary: BinaryRegion,
  targetWidth: number,
  targetHeight: number,
): BinaryRegion {
  const pixels = new Uint8Array(targetWidth * targetHeight);
  for (let y = 0; y < targetHeight; y++) {
    const srcY = Math.min(
      binary.height - 1,
      Math.floor(((y + 0.5) * binary.height) / targetHeight),
    );
    for (let x = 0; x < targetWidth; x++) {
      const srcX = Math.min(
        binary.width - 1,
        Math.floor(((x + 0.5) * binary.width) / targetWidth),
      );
      pixels[y * targetWidth + x] = binary.pixels[srcY * binary.width + srcX];
    }
  }
  return { width: targetWidth, height: targetHeight, pixels };
}

function normalizeDigitToTemplate(binary: BinaryRegion): BinaryRegion {
  const tight = tightCropBinary(binary);
  const padX = Math.max(1, Math.floor(DIGIT_TEMPLATE_WIDTH * 0.12));
  const padY = Math.max(1, Math.floor(DIGIT_TEMPLATE_HEIGHT * 0.1));
  const contentW = Math.max(1, DIGIT_TEMPLATE_WIDTH - padX * 2);
  const contentH = Math.max(1, DIGIT_TEMPLATE_HEIGHT - padY * 2);

  const scale = Math.min(contentW / tight.width, contentH / tight.height);
  const scaledW = Math.max(1, Math.round(tight.width * scale));
  const scaledH = Math.max(1, Math.round(tight.height * scale));
  const resized = resizeBinaryNearest(tight, scaledW, scaledH);

  const canvas = new Uint8Array(DIGIT_TEMPLATE_WIDTH * DIGIT_TEMPLATE_HEIGHT);
  const ox = Math.floor((DIGIT_TEMPLATE_WIDTH - scaledW) / 2);
  const oy = Math.floor((DIGIT_TEMPLATE_HEIGHT - scaledH) / 2);

  for (let y = 0; y < scaledH; y++) {
    for (let x = 0; x < scaledW; x++) {
      canvas[(oy + y) * DIGIT_TEMPLATE_WIDTH + (ox + x)] =
        resized.pixels[y * scaledW + x];
    }
  }

  return {
    width: DIGIT_TEMPLATE_WIDTH,
    height: DIGIT_TEMPLATE_HEIGHT,
    pixels: canvas,
  };
}

function countHoles(binary: BinaryRegion): number {
  const visited = new Uint8Array(binary.width * binary.height);
  const queue: number[] = [];

  for (let x = 0; x < binary.width; x++) {
    for (const y of [0, binary.height - 1]) {
      const idx = y * binary.width + x;
      if (binary.pixels[idx] === 0 && visited[idx] === 0) {
        visited[idx] = 1;
        queue.push(idx);
      }
    }
  }
  for (let y = 0; y < binary.height; y++) {
    for (const x of [0, binary.width - 1]) {
      const idx = y * binary.width + x;
      if (binary.pixels[idx] === 0 && visited[idx] === 0) {
        visited[idx] = 1;
        queue.push(idx);
      }
    }
  }

  let cursor = 0;
  while (cursor < queue.length) {
    const idx = queue[cursor++];
    const x = idx % binary.width;
    const y = Math.floor(idx / binary.width);
    const neighbors = [
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1],
    ];
    for (const [nx, ny] of neighbors) {
      if (nx < 0 || ny < 0 || nx >= binary.width || ny >= binary.height) {
        continue;
      }
      const nIdx = ny * binary.width + nx;
      if (binary.pixels[nIdx] === 0 && visited[nIdx] === 0) {
        visited[nIdx] = 1;
        queue.push(nIdx);
      }
    }
  }

  let holes = 0;
  for (let y = 1; y < binary.height - 1; y++) {
    for (let x = 1; x < binary.width - 1; x++) {
      const idx = y * binary.width + x;
      if (binary.pixels[idx] === 1 || visited[idx] === 1) {
        continue;
      }

      holes += 1;
      visited[idx] = 1;
      queue.length = 0;
      queue.push(idx);
      cursor = 0;
      while (cursor < queue.length) {
        const cell = queue[cursor++];
        const cx = cell % binary.width;
        const cy = Math.floor(cell / binary.width);
        const neighbors = [
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
          if (binary.pixels[nIdx] === 0 && visited[nIdx] === 0) {
            visited[nIdx] = 1;
            queue.push(nIdx);
          }
        }
      }
    }
  }

  return holes;
}

function templateMismatch(a: BinaryRegion, b: BinaryRegion): number {
  let mismatches = 0;
  const total = Math.min(a.pixels.length, b.pixels.length);
  for (let i = 0; i < total; i++) {
    if (a.pixels[i] !== b.pixels[i]) {
      mismatches += 1;
    }
  }
  return total === 0 ? 1 : mismatches / total;
}

function shiftedMismatch(
  sample: BinaryRegion,
  template: BinaryRegion,
  dx: number,
  dy: number,
): number {
  let mismatches = 0;
  let total = 0;
  for (let y = 0; y < sample.height; y++) {
    const ty = y + dy;
    if (ty < 0 || ty >= template.height) {
      continue;
    }
    for (let x = 0; x < sample.width; x++) {
      const tx = x + dx;
      if (tx < 0 || tx >= template.width) {
        continue;
      }
      total += 1;
      if (
        sample.pixels[y * sample.width + x] !==
        template.pixels[ty * template.width + tx]
      ) {
        mismatches += 1;
      }
    }
  }

  return total === 0 ? 1 : mismatches / total;
}

const SEVEN_SEGMENT_PATTERNS: Record<
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

function regionDensity(
  binary: BinaryRegion,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const sx1 = Math.max(0, Math.floor(x1 * binary.width));
  const sy1 = Math.max(0, Math.floor(y1 * binary.height));
  const sx2 = Math.min(binary.width, Math.ceil(x2 * binary.width));
  const sy2 = Math.min(binary.height, Math.ceil(y2 * binary.height));

  let total = 0;
  let ink = 0;
  for (let y = sy1; y < sy2; y++) {
    for (let x = sx1; x < sx2; x++) {
      total += 1;
      ink += binary.pixels[y * binary.width + x];
    }
  }

  return total === 0 ? 0 : ink / total;
}

function sevenSegmentScore(normalized: BinaryRegion, digit: number): number {
  const expected = SEVEN_SEGMENT_PATTERNS[digit];
  if (!expected) {
    return 1;
  }

  const densities = [
    regionDensity(normalized, 0.22, 0.03, 0.78, 0.18),
    regionDensity(normalized, 0.08, 0.16, 0.34, 0.46),
    regionDensity(normalized, 0.66, 0.16, 0.92, 0.46),
    regionDensity(normalized, 0.22, 0.44, 0.78, 0.6),
    regionDensity(normalized, 0.08, 0.56, 0.34, 0.9),
    regionDensity(normalized, 0.66, 0.56, 0.92, 0.9),
    regionDensity(normalized, 0.22, 0.84, 0.78, 0.98),
  ];

  let penalty = 0;
  for (let i = 0; i < densities.length; i++) {
    const target = expected[i] === 1 ? 0.2 : 0.02;
    penalty += Math.abs(densities[i] - target);
  }

  return penalty / densities.length;
}

function getDigitCandidates(binary: BinaryRegion): DigitCandidate[] {
  const normalized = normalizeDigitToTemplate(binary);
  const sampleHoles = countHoles(normalized);
  const candidates: DigitCandidate[] = [];

  for (const [digitText, template] of Object.entries(DIGIT_TEMPLATES)) {
    const digit = Number(digitText);
    let templateScore = templateMismatch(normalized, template);
    for (const dy of [-1, 0, 1]) {
      for (const dx of [-1, 0, 1]) {
        const shifted = shiftedMismatch(normalized, template, dx, dy);
        if (shifted < templateScore) {
          templateScore = shifted;
        }
      }
    }

    const templateHoles = countHoles(template);
    const holePenalty = Math.abs(sampleHoles - templateHoles) * 0.05;
    const segmentPenalty = sevenSegmentScore(normalized, digit);
    const score = templateScore * 0.5 + segmentPenalty * 0.45 + holePenalty;
    candidates.push({ digit, score });
  }

  candidates.sort((a, b) => a.score - b.score);
  return candidates;
}

function scoreSevenSegmentDigit(binary: BinaryRegion): {
  digit: number;
  score: number;
} {
  const best = getDigitCandidates(binary)[0] ?? { digit: 0, score: 1 };
  return { digit: best.digit, score: best.score };
}

function cropBinaryByZone(
  binary: BinaryRegion,
  zone: { x1: number; y1: number; x2: number; y2: number },
): BinaryRegion {
  const x1 = Math.max(0, Math.floor(zone.x1 * binary.width));
  const y1 = Math.max(0, Math.floor(zone.y1 * binary.height));
  const x2 = Math.min(binary.width, Math.ceil(zone.x2 * binary.width));
  const y2 = Math.min(binary.height, Math.ceil(zone.y2 * binary.height));
  const width = Math.max(1, x2 - x1);
  const height = Math.max(1, y2 - y1);
  const pixels = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      pixels[y * width + x] = binary.pixels[(y1 + y) * binary.width + (x1 + x)];
    }
  }
  return { width, height, pixels };
}

function splitDigitRuns(
  binary: BinaryRegion,
): Array<{ x1: number; x2: number }> {
  const colInk = new Array(binary.width).fill(0);
  for (let y = 0; y < binary.height; y++) {
    for (let x = 0; x < binary.width; x++) {
      colInk[x] += binary.pixels[y * binary.width + x];
    }
  }

  const minInk = Math.max(1, Math.floor(binary.height * 0.06));
  const runs: Array<{ x1: number; x2: number }> = [];
  let x = 0;
  while (x < binary.width) {
    while (x < binary.width && colInk[x] < minInk) {
      x += 1;
    }
    if (x >= binary.width) break;
    const x1 = x;
    while (x < binary.width && colInk[x] >= minInk) {
      x += 1;
    }
    const x2 = x - 1;
    if (x2 - x1 + 1 >= 2) {
      runs.push({ x1, x2 });
    }
  }

  const merged: Array<{ x1: number; x2: number }> = [];
  for (const run of runs) {
    const prev = merged[merged.length - 1];
    if (prev && run.x1 - prev.x2 <= 2) {
      prev.x2 = run.x2;
    } else {
      merged.push({ ...run });
    }
  }
  return merged;
}

function cropRun(
  binary: BinaryRegion,
  run: { x1: number; x2: number },
): BinaryRegion {
  let y1 = binary.height;
  let y2 = -1;
  for (let y = 0; y < binary.height; y++) {
    for (let x = run.x1; x <= run.x2; x++) {
      if (binary.pixels[y * binary.width + x] === 1) {
        if (y < y1) y1 = y;
        if (y > y2) y2 = y;
      }
    }
  }
  if (y2 < y1) {
    return { width: 1, height: 1, pixels: new Uint8Array([0]) };
  }

  const width = run.x2 - run.x1 + 1;
  const height = y2 - y1 + 1;
  const pixels = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      pixels[y * width + x] =
        binary.pixels[(y1 + y) * binary.width + (run.x1 + x)];
    }
  }
  return { width, height, pixels };
}

function recognizeDigitCandidatesWithAllowed(
  binary: BinaryRegion,
  allowedDigits: number[],
  limit: number,
): DigitCandidate[] {
  return getDigitCandidates(binary)
    .filter((candidate) => allowedDigits.includes(candidate.digit))
    .slice(0, Math.max(1, limit));
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

function parseHintPairCandidates(
  image: ImageDataLike,
  hintRect: Rect,
): HintPairCandidate[] {
  const ink = buildDigitInkMask(image, hintRect);

  const sumZone = cropBinaryByZone(ink, {
    x1: 0.38,
    y1: 0.04,
    x2: 0.97,
    y2: 0.5,
  });
  const sumRuns = splitDigitRuns(sumZone).sort((a, b) => a.x1 - b.x1);
  const sumCandidates: DigitCandidate[] = [];
  if (sumRuns.length >= 2) {
    const bestTwo = sumRuns
      .map((run) => ({
        run,
        area: (run.x2 - run.x1 + 1) * sumZone.height,
      }))
      .sort((a, b) => b.area - a.area)
      .slice(0, 2)
      .map((entry) => entry.run)
      .sort((a, b) => a.x1 - b.x1);

    const firstOptions = recognizeDigitCandidatesWithAllowed(
      cropRun(sumZone, bestTwo[0]),
      [0, 1],
      2,
    );
    const secondOptions = recognizeDigitCandidatesWithAllowed(
      cropRun(sumZone, bestTwo[1]),
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
      3,
    );

    for (const first of firstOptions) {
      for (const second of secondOptions) {
        const value = first.digit * 10 + second.digit;
        if (value <= 15) {
          sumCandidates.push({
            digit: value,
            score: first.score + second.score,
          });
        }
      }
    }

    for (const second of secondOptions) {
      sumCandidates.push({ digit: second.digit, score: second.score + 0.08 });
    }
  } else if (sumRuns.length === 1) {
    sumCandidates.push(
      ...recognizeDigitCandidatesWithAllowed(
        cropRun(sumZone, sumRuns[0]),
        [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
        3,
      ),
    );
  } else {
    const fallbackSumRect = subRect(hintRect, {
      x: 0.5,
      y: 0.06,
      width: 0.35,
      height: 0.44,
    });
    const fallback = fallbackDigitFromRect(image, fallbackSumRect);
    sumCandidates.push({ digit: fallback.digit, score: fallback.score + 0.2 });
  }

  const filteredSumCandidates = sumCandidates
    .filter((candidate) => candidate.digit >= 0 && candidate.digit <= 15)
    .sort((a, b) => a.score - b.score)
    .slice(0, 4);

  const voltorbZone = cropBinaryByZone(ink, {
    x1: 0.72,
    y1: 0.52,
    x2: 0.98,
    y2: 0.98,
  });
  const voltRuns = splitDigitRuns(voltorbZone);
  const voltorbCandidates: DigitCandidate[] = [];
  if (voltRuns.length > 0) {
    const targetRun = voltRuns.sort((a, b) => b.x2 - b.x1 - (a.x2 - a.x1))[0];
    voltorbCandidates.push(
      ...recognizeDigitCandidatesWithAllowed(
        cropRun(voltorbZone, targetRun),
        [0, 1, 2, 3, 4, 5],
        3,
      ),
    );
  } else {
    const fallbackVoltRect = subRect(hintRect, {
      x: 0.62,
      y: 0.58,
      width: 0.3,
      height: 0.32,
    });
    const fallback = fallbackDigitFromRect(image, fallbackVoltRect);
    voltorbCandidates.push({
      digit: Math.max(0, Math.min(5, fallback.digit)),
      score: fallback.score + 0.2,
    });
  }

  const filteredVoltorbCandidates = voltorbCandidates
    .filter((candidate) => candidate.digit >= 0 && candidate.digit <= 5)
    .sort((a, b) => a.score - b.score)
    .slice(0, 3);

  const pairCandidates: HintPairCandidate[] = [];
  for (const sum of filteredSumCandidates) {
    for (const volt of filteredVoltorbCandidates) {
      pairCandidates.push({
        sum: sum.digit,
        voltorb: volt.digit,
        score: sum.score + volt.score,
      });
    }
  }

  if (pairCandidates.length === 0) {
    return [{ sum: 0, voltorb: 0, score: 10 }];
  }

  pairCandidates.sort((a, b) => a.score - b.score);
  return pairCandidates.slice(0, 6);
}

function chooseBestConsistentHints(
  rowCandidates: HintPairCandidate[][],
  colCandidates: HintPairCandidate[][],
): { row: HintPairCandidate[]; col: HintPairCandidate[] } {
  type Combo = {
    picks: HintPairCandidate[];
    sumTotal: number;
    voltorbTotal: number;
    score: number;
  };

  function enumerate(candidates: HintPairCandidate[][]): Combo[] {
    const out: Combo[] = [];
    function dfs(
      index: number,
      picks: HintPairCandidate[],
      sumTotal: number,
      voltorbTotal: number,
      score: number,
    ) {
      if (index === candidates.length) {
        out.push({ picks: [...picks], sumTotal, voltorbTotal, score });
        return;
      }

      for (const candidate of candidates[index]) {
        picks.push(candidate);
        dfs(
          index + 1,
          picks,
          sumTotal + candidate.sum,
          voltorbTotal + candidate.voltorb,
          score + candidate.score,
        );
        picks.pop();
      }
    }

    dfs(0, [], 0, 0, 0);
    return out;
  }

  const rowCombos = enumerate(rowCandidates.map((c) => c.slice(0, 3)));
  const colCombos = enumerate(colCandidates.map((c) => c.slice(0, 3)));

  let best: {
    row: HintPairCandidate[];
    col: HintPairCandidate[];
    score: number;
  } | null = null;

  for (const rowCombo of rowCombos) {
    for (const colCombo of colCombos) {
      const totalPenalty =
        Math.abs(rowCombo.sumTotal - colCombo.sumTotal) * 0.35 +
        Math.abs(rowCombo.voltorbTotal - colCombo.voltorbTotal) * 0.8;
      const score = rowCombo.score + colCombo.score + totalPenalty;
      if (!best || score < best.score) {
        best = { row: rowCombo.picks, col: colCombo.picks, score };
      }
    }
  }

  if (best) {
    return { row: best.row, col: best.col };
  }

  return {
    row: rowCandidates.map((c) => c[0] ?? { sum: 0, voltorb: 0, score: 10 }),
    col: colCandidates.map((c) => c[0] ?? { sum: 0, voltorb: 0, score: 10 }),
  };
}

export function extractHintsFromImageData(
  image: ImageDataLike,
): ExtractedHintValues {
  const canonical = normalizeToCanonicalBoard(image);
  const workingImage = canonical?.image ?? image;
  const hintRects = canonical
    ? {
        rowHintRects: canonical.rowHintRects,
        colHintRects: canonical.colHintRects,
      }
    : selectHintRects(image);

  const rowCandidateLists = hintRects.rowHintRects.map((rect) =>
    parseHintPairCandidates(workingImage, rect),
  );
  const colCandidateLists = hintRects.colHintRects.map((rect) =>
    parseHintPairCandidates(workingImage, rect),
  );

  const best = chooseBestConsistentHints(rowCandidateLists, colCandidateLists);

  const rowHintValues = best.row.map(
    (pair): HintValuePair => [String(pair.sum), String(pair.voltorb)],
  );
  const colHintValues = best.col.map(
    (pair): HintValuePair => [String(pair.sum), String(pair.voltorb)],
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
