import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { extractHintsFromImageBitmap } from './src/logic/extractHintsFromImage';

interface HintExtractionRequestPayload {
  base64Image?: unknown;
  mimeType?: unknown;
}

function isHintExtractionRequest(url: string | undefined, method: string): boolean {
  if (method !== 'POST' || !url) {
    return false;
  }

  const pathname = url.split('?')[0] ?? '';
  return pathname === '/api/extract-hints';
}

async function readJsonBody(
  request: NodeJS.ReadableStream,
): Promise<HintExtractionRequestPayload> {
  const chunks: Uint8Array[] = [];

  for await (const chunk of request) {
    if (typeof chunk === 'string') {
      chunks.push(Buffer.from(chunk));
      continue;
    }

    chunks.push(chunk);
  }

  const rawBody = Buffer.concat(chunks).toString('utf8');
  if (!rawBody) {
    return {};
  }

  return JSON.parse(rawBody) as HintExtractionRequestPayload;
}

function sendJson(
  response: import('node:http').ServerResponse,
  statusCode: number,
  payload: unknown,
): void {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(payload));
}

async function handleHintExtractionRequest(
  request: import('node:http').IncomingMessage,
  response: import('node:http').ServerResponse,
): Promise<void> {
  try {
    const payload = await readJsonBody(request);
    const base64Image =
      typeof payload.base64Image === 'string' ? payload.base64Image : '';
    const mimeType =
      typeof payload.mimeType === 'string' && payload.mimeType
        ? payload.mimeType
        : 'image/png';

    if (!base64Image) {
      sendJson(response, 400, {
        error: 'Missing base64Image in request body.',
      });
      return;
    }

    const imageBytes = Uint8Array.from(Buffer.from(base64Image, 'base64'));
    const extracted = await extractHintsFromImageBitmap(
      new Blob([imageBytes], { type: mimeType }),
    );

    sendJson(response, 200, extracted);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Failed to extract hints from image.';

    sendJson(response, 500, { error: message });
  }
}

function copilotHintExtractionPlugin(): Plugin {
  return {
    name: 'copilot-hint-extraction-api',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        if (!isHintExtractionRequest(request.url, request.method ?? 'GET')) {
          next();
          return;
        }

        await handleHintExtractionRequest(request, response);
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use(async (request, response, next) => {
        if (!isHintExtractionRequest(request.url, request.method ?? 'GET')) {
          next();
          return;
        }

        await handleHintExtractionRequest(request, response);
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  base: '/voltorb-flip/',
  plugins: [react(), copilotHintExtractionPlugin()],
});
