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

const HINT_PAIR_COUNT = 5;
const DEFAULT_BROWSER_EXTRACTION_API_URL = '/api/extract-hints';

declare const __VOLTORB_FLIP_API_KEY__: string | undefined;

interface ExtractionRequestPayload {
  base64Image: string;
  mimeType: string;
}

interface BrowserExtractionApiResponse {
  rowHintValues?: unknown;
  colHintValues?: unknown;
  error?: unknown;
}

function createEmptyHintValues(): ExtractedHintValues {
  return {
    rowHintValues: Array.from({ length: HINT_PAIR_COUNT }, (): HintValuePair => [
      '0',
      '0',
    ]),
    colHintValues: Array.from({ length: HINT_PAIR_COUNT }, (): HintValuePair => [
      '0',
      '0',
    ]),
  };
}

function getBrowserExtractionApiUrl(): string {
  if (typeof document !== 'undefined') {
    const meta = document.querySelector(
      'meta[name="hint-extraction-api-url"]',
    ) as HTMLMetaElement | null;
    const value = meta?.content?.trim();
    if (value) {
      return value;
    }
  }

  return DEFAULT_BROWSER_EXTRACTION_API_URL;
}

function isBrowserRuntime(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function toByteArray(data: Uint8Array | Uint8ClampedArray): Uint8Array {
  return data instanceof Uint8Array
    ? data
    : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
}

function encodeBase64(bytes: Uint8Array): string {
  const maybeBufferGlobal = globalThis as typeof globalThis & {
    Buffer?: {
      from(data: Uint8Array): {
        toString(encoding: 'base64'): string;
      };
    };
  };

  if (maybeBufferGlobal.Buffer) {
    return maybeBufferGlobal.Buffer.from(bytes).toString('base64');
  }

  const alphabet =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let output = '';

  for (let index = 0; index < bytes.length; index += 3) {
    const byte1 = bytes[index] ?? 0;
    const byte2 = bytes[index + 1] ?? 0;
    const byte3 = bytes[index + 2] ?? 0;
    const chunk = (byte1 << 16) | (byte2 << 8) | byte3;

    output += alphabet[(chunk >> 18) & 63];
    output += alphabet[(chunk >> 12) & 63];
    output += index + 1 < bytes.length ? alphabet[(chunk >> 6) & 63] : '=';
    output += index + 2 < bytes.length ? alphabet[chunk & 63] : '=';
  }

  return output;
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return encodeBase64(bytes);
}

function createBmpBlobFromImageData(image: ImageDataLike): Blob {
  const width = image.width;
  const height = image.height;
  const rgba = toByteArray(image.data);
  const pixelDataSize = width * height * 4;
  const fileHeaderSize = 14;
  const dibHeaderSize = 40;
  const totalSize = fileHeaderSize + dibHeaderSize + pixelDataSize;
  const bytes = new Uint8Array(totalSize);
  const view = new DataView(bytes.buffer);

  bytes[0] = 0x42;
  bytes[1] = 0x4d;
  view.setUint32(2, totalSize, true);
  view.setUint32(10, fileHeaderSize + dibHeaderSize, true);
  view.setUint32(14, dibHeaderSize, true);
  view.setInt32(18, width, true);
  view.setInt32(22, -height, true);
  view.setUint16(26, 1, true);
  view.setUint16(28, 32, true);
  view.setUint32(30, 0, true);
  view.setUint32(34, pixelDataSize, true);
  view.setInt32(38, 2835, true);
  view.setInt32(42, 2835, true);

  let targetOffset = fileHeaderSize + dibHeaderSize;

  for (let sourceOffset = 0; sourceOffset < rgba.length; sourceOffset += 4) {
    bytes[targetOffset] = rgba[sourceOffset + 2] ?? 0;
    bytes[targetOffset + 1] = rgba[sourceOffset + 1] ?? 0;
    bytes[targetOffset + 2] = rgba[sourceOffset] ?? 0;
    bytes[targetOffset + 3] = rgba[sourceOffset + 3] ?? 255;
    targetOffset += 4;
  }

  return new Blob([bytes], { type: 'image/bmp' });
}

function extractJsonObject(rawText: string): string {
  const trimmed = rawText.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return trimmed;
  }

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const firstBraceIndex = trimmed.indexOf('{');
  const lastBraceIndex = trimmed.lastIndexOf('}');
  if (firstBraceIndex >= 0 && lastBraceIndex > firstBraceIndex) {
    return trimmed.slice(firstBraceIndex, lastBraceIndex + 1);
  }

  throw new Error('Hint extraction API did not return a JSON object.');
}

function normalizeHintValue(value: unknown, maximum: number): string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const clampedNumber = Math.min(Math.max(Math.round(value), 0), maximum);
    return String(clampedNumber);
  }

  if (typeof value === 'string') {
    const digitMatch = value.match(/\d+/);
    if (digitMatch) {
      const parsed = Number(digitMatch[0]);
      if (Number.isFinite(parsed)) {
        const clampedNumber = Math.min(Math.max(parsed, 0), maximum);
        return String(clampedNumber);
      }
    }
  }

  return '0';
}

function normalizeHintPairs(rawPairs: unknown): HintValuePair[] {
  const pairs = Array.isArray(rawPairs) ? rawPairs : [];

  return Array.from({ length: HINT_PAIR_COUNT }, (_, index): HintValuePair => {
    const currentPair = pairs[index];
    const currentArray = Array.isArray(currentPair) ? currentPair : [];
    return [
      normalizeHintValue(currentArray[0], 15),
      normalizeHintValue(currentArray[1], 5),
    ];
  });
}

function parseExtractedHintValues(
  rawPayload: string | BrowserExtractionApiResponse,
): ExtractedHintValues {
  const parsedPayload =
    typeof rawPayload === 'string'
      ? (JSON.parse(extractJsonObject(rawPayload)) as BrowserExtractionApiResponse)
      : rawPayload;

  return {
    rowHintValues: normalizeHintPairs(parsedPayload.rowHintValues),
    colHintValues: normalizeHintPairs(parsedPayload.colHintValues),
  };
}

async function requestHintsViaBrowserApi(blob: Blob): Promise<ExtractedHintValues> {
  const apiUrl = getBrowserExtractionApiUrl();
  const apiKey = __VOLTORB_FLIP_API_KEY__;

  if (
    apiUrl === DEFAULT_BROWSER_EXTRACTION_API_URL &&
    typeof window !== 'undefined' &&
    window.location.hostname.endsWith('github.io')
  ) {
    throw new Error(
      'Screenshot hint extraction is not available on the GitHub Pages deployment. ' +
        'Set <meta name="hint-extraction-api-url" content="..."> in index.html to your backend API.',
    );
  }

  const payload: ExtractionRequestPayload = {
    base64Image: await blobToBase64(blob),
    mimeType: blob.type || 'image/png',
  };

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(typeof apiKey === 'string' && apiKey.trim()
        ? { 'x-api-key': apiKey.trim() }
        : {}),
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let errorMessage = `Hint extraction request failed with status ${response.status}.`;

    try {
      const errorPayload = (await response.json()) as BrowserExtractionApiResponse;
      if (typeof errorPayload.error === 'string' && errorPayload.error) {
        errorMessage = errorPayload.error;
      }
    } catch {
      if (response.status === 404) {
        errorMessage =
          'Hint extraction API was not found. Set <meta name="hint-extraction-api-url" content="..."> in index.html to your backend API.';
      }
    }

    throw new Error(errorMessage);
  }

  const data = (await response.json()) as BrowserExtractionApiResponse;
  return parseExtractedHintValues(data);
}

export function extractHintsFromImageData(
  image: ImageDataLike,
): Promise<ExtractedHintValues> {
  if (image.width <= 0 || image.height <= 0 || image.data.length === 0) {
    return Promise.resolve(createEmptyHintValues());
  }

  const bitmapBlob = createBmpBlobFromImageData(image);
  return extractHintsFromImageBitmap(bitmapBlob);
}

export async function extractHintsFromImageBitmap(
  blob: Blob,
): Promise<ExtractedHintValues> {
  if (blob.size === 0) {
    return createEmptyHintValues();
  }

  if (isBrowserRuntime()) {
    return requestHintsViaBrowserApi(blob);
  }

  throw new Error(
    'Hint extraction is only supported in the browser via a configured API endpoint.',
  );
}
