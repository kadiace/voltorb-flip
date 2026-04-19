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

declare global {
  interface Window {
    __VOLTORB_FLIP_CONFIG__?: {
      hintExtractionApiUrl?: string;
      copilotModel?: string;
    };
  }
}

const HINT_PAIR_COUNT = 5;
const DEFAULT_COPILOT_MODEL = 'gpt-4.1';
const DEFAULT_BROWSER_EXTRACTION_API_URL = '/api/extract-hints';
const COPILOT_PROMPT = `
You are extracting Voltorb Flip hint numbers from a single screenshot.

Read only the 5 row hint pairs on the left side of the board and the 5 column hint pairs on the top side of the board.
Each hint pair is [sum, voltorbCount].

Return JSON only with this exact shape:
{
  "rowHintValues": [["", ""], ["", ""], ["", ""], ["", ""], ["", ""]],
  "colHintValues": [["", ""], ["", ""], ["", ""], ["", ""], ["", ""]]
}

Rules:
- Return strings, not numbers.
- rowHintValues must contain exactly 5 pairs.
- colHintValues must contain exactly 5 pairs.
- Valid sum values are 0 through 15.
- Valid voltorbCount values are 0 through 5.
- Do not include markdown fences or any explanation.
`.trim();

interface ExtractionRequestPayload {
  base64Image: string;
  mimeType: string;
  model: string;
  prompt: string;
}

interface BrowserExtractionApiResponse {
  rowHintValues?: unknown;
  colHintValues?: unknown;
  raw?: unknown;
  error?: unknown;
}

interface CopilotModelInfo {
  id: string;
  capabilities: {
    supports: {
      vision: boolean;
    };
  };
}

interface CopilotSdkSession {
  sendAndWait(options: {
    prompt: string;
    attachments: Array<
      | {
          type: 'blob';
          data: string;
          mimeType: string;
          displayName?: string;
        }
      | {
          type: 'file';
          path: string;
          displayName?: string;
        }
    >;
  }): Promise<
    | {
        data: {
          content: string;
        };
      }
    | undefined
  >;
  disconnect(): Promise<void>;
}

interface CopilotSdkClient {
  start(): Promise<void>;
  stop(): Promise<unknown>;
  listModels(): Promise<CopilotModelInfo[]>;
  createSession(options: {
    model: string;
    onPermissionRequest: () => { kind: 'approved' };
  }): Promise<CopilotSdkSession>;
}

interface CopilotSdkClientConstructor {
  new (options: {
    cliUrl?: string;
    githubToken?: string;
    useLoggedInUser?: boolean;
  }): CopilotSdkClient;
}

interface CopilotSdkModule {
  CopilotClient: CopilotSdkClientConstructor;
  approveAll(): { kind: 'approved' };
}

interface NodeFsPromisesModule {
  mkdtemp(prefix: string): Promise<string>;
  writeFile(path: string, data: Uint8Array): Promise<void>;
  rm(
    path: string,
    options: { recursive?: boolean; force?: boolean },
  ): Promise<void>;
}

interface NodeOsModule {
  tmpdir(): string;
}

interface NodePathModule {
  join(...paths: string[]): string;
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

function getWindowConfig(): Window['__VOLTORB_FLIP_CONFIG__'] | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }

  return window.__VOLTORB_FLIP_CONFIG__;
}

function getProcessEnvValue(name: string): string | undefined {
  const maybeProcess = globalThis as typeof globalThis & {
    process?: {
      env?: Record<string, string | undefined>;
    };
  };

  return maybeProcess.process?.env?.[name];
}

function getCopilotModel(): string {
  return (
    getProcessEnvValue('VOLTORB_FLIP_COPILOT_MODEL') ??
    getWindowConfig()?.copilotModel ??
    DEFAULT_COPILOT_MODEL
  );
}

function getBrowserExtractionApiUrl(): string {
  return (
    getWindowConfig()?.hintExtractionApiUrl ??
    DEFAULT_BROWSER_EXTRACTION_API_URL
  );
}

function isBrowserRuntime(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function hasDirectCopilotRuntime(): boolean {
  return !isBrowserRuntime();
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

  throw new Error('Copilot did not return a JSON object for hint extraction.');
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

function parseExtractedHintValues(rawPayload: string | BrowserExtractionApiResponse) {
  const parsedPayload =
    typeof rawPayload === 'string'
      ? (JSON.parse(extractJsonObject(rawPayload)) as BrowserExtractionApiResponse)
      : rawPayload;

  return {
    rowHintValues: normalizeHintPairs(parsedPayload.rowHintValues),
    colHintValues: normalizeHintPairs(parsedPayload.colHintValues),
  } satisfies ExtractedHintValues;
}

async function requestHintsViaBrowserApi(
  blob: Blob,
): Promise<ExtractedHintValues> {
  const payload: ExtractionRequestPayload = {
    base64Image: await blobToBase64(blob),
    mimeType: blob.type || 'image/png',
    model: getCopilotModel(),
    prompt: COPILOT_PROMPT,
  };

  const response = await fetch(getBrowserExtractionApiUrl(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
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
          'Hint extraction API was not found. Run the app through Vite dev/preview with the local API enabled, or configure a custom hintExtractionApiUrl.';
      }
    }

    throw new Error(
      errorMessage,
    );
  }

  const data = (await response.json()) as BrowserExtractionApiResponse;
  if (typeof data.raw === 'string') {
    return parseExtractedHintValues(data.raw);
  }

  return parseExtractedHintValues(data);
}

async function loadCopilotSdk(): Promise<CopilotSdkModule> {
  const moduleName = '@github/copilot-sdk';
  return import(/* @vite-ignore */ moduleName) as Promise<CopilotSdkModule>;
}

async function createTemporaryImageFile(blob: Blob): Promise<{
  filePath: string;
  cleanup: () => Promise<void>;
}> {
  const fsModuleName = 'node:fs/promises';
  const osModuleName = 'node:os';
  const pathModuleName = 'node:path';
  const fsModule = (await import(
    /* @vite-ignore */ fsModuleName
  )) as NodeFsPromisesModule;
  const osModule = (await import(
    /* @vite-ignore */ osModuleName
  )) as NodeOsModule;
  const pathModule = (await import(
    /* @vite-ignore */ pathModuleName
  )) as NodePathModule;
  const tempDirectory = await fsModule.mkdtemp(
    pathModule.join(osModule.tmpdir(), 'voltorb-flip-'),
  );
  const fileExtension = blob.type === 'image/bmp' ? 'bmp' : 'png';
  const filePath = pathModule.join(tempDirectory, `hint-upload.${fileExtension}`);
  const bytes = new Uint8Array(await blob.arrayBuffer());

  await fsModule.writeFile(filePath, bytes);

  return {
    filePath,
    cleanup: async () => {
      await fsModule.rm(tempDirectory, { recursive: true, force: true });
    },
  };
}

async function requestHintsViaCopilotSdk(
  blob: Blob,
): Promise<ExtractedHintValues> {
  const sdk = await loadCopilotSdk();
  const { CopilotClient, approveAll } = sdk;
  const clientOptions: {
    cliUrl?: string;
    githubToken?: string;
    useLoggedInUser?: boolean;
  } = {};

  const cliUrl = getProcessEnvValue('COPILOT_CLI_URL');
  if (cliUrl) {
    clientOptions.cliUrl = cliUrl;
  }

  const githubToken = getProcessEnvValue('GITHUB_TOKEN');
  if (githubToken) {
    clientOptions.githubToken = githubToken;
    clientOptions.useLoggedInUser = false;
  }

  const client = new CopilotClient(clientOptions);
  await client.start();

  try {
    const requestedModel = getCopilotModel();
    const availableModels = await client.listModels();
    const selectedModel =
      availableModels.find((model) => model.id === requestedModel) ?? null;

    if (!selectedModel) {
      throw new Error(
        `Copilot model "${requestedModel}" is not available in this environment.`,
      );
    }

    if (!selectedModel.capabilities.supports.vision) {
      throw new Error(
        `Copilot model "${requestedModel}" does not support image input.`,
      );
    }

    const session = await client.createSession({
      model: selectedModel.id,
      onPermissionRequest: approveAll,
    });

    try {
      const temporaryImageFile = await createTemporaryImageFile(blob);

      try {
        const response = await session.sendAndWait({
          prompt: COPILOT_PROMPT,
          attachments: [
            {
              type: 'file',
              path: temporaryImageFile.filePath,
              displayName: 'voltorb-flip-hints-image',
            },
          ],
        });

        const responseText = response?.data.content?.trim();
        if (!responseText) {
          throw new Error('Copilot returned an empty response for hint extraction.');
        }

        return parseExtractedHintValues(responseText);
      } finally {
        await temporaryImageFile.cleanup();
      }
    } finally {
      await session.disconnect();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Copilot hint extraction failed. ${message} ` +
        'In the browser, expose a POST /api/extract-hints endpoint. ' +
        'In Node, configure Copilot CLI auth or set GITHUB_TOKEN.',
    );
  } finally {
    await client.stop();
  }
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

  if (!hasDirectCopilotRuntime()) {
    throw new Error('No supported runtime is available for hint extraction.');
  }

  return requestHintsViaCopilotSdk(blob);
}
