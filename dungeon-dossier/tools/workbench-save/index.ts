import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Plugin } from 'vite';

import {
  handleWorkbenchSave,
  MAX_BODY_BYTES,
  type WorkbenchSaveResult,
} from './handler';

export const WORKBENCH_SAVE_ENDPOINT = '/api/workbench/save';

const PROJECT_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const DEFAULT_ASSETS_ROOT = path.join(PROJECT_ROOT, 'assets');

/** Minimal shape of what connect hands the middleware. */
export interface SaveRequestLike {
  readonly method?: string | undefined;
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
  on(event: 'data', listener: (chunk: Buffer) => void): unknown;
  on(event: 'end', listener: () => void): unknown;
  on(event: 'error', listener: (error: Error) => void): unknown;
  destroy(): unknown;
}

export interface SaveResponseLike {
  statusCode: number;
  setHeader(name: string, value: string): unknown;
  end(chunk?: string): unknown;
}

function headerValue(
  headers: SaveRequestLike['headers'],
  name: string,
): string | undefined {
  const raw = headers[name];
  if (raw === undefined) return undefined;
  return Array.isArray(raw) ? raw[0] : raw;
}

/**
 * The dev server binds with `host: true`, so this endpoint is reachable from the
 * LAN. Arbitrary file writes must stay on the developer's own machine.
 */
export function isLoopbackHost(host: string | undefined): boolean {
  if (host === undefined) return false;
  const withoutPort = host.startsWith('[')
    ? host.slice(0, host.indexOf(']') + 1)
    : (host.split(':')[0] ?? '');
  const normalized = withoutPort.toLowerCase();
  return (
    normalized === 'localhost' ||
    normalized === '127.0.0.1' ||
    normalized === '[::1]' ||
    normalized === '::1'
  );
}

/** A cross-site POST cannot set this to same-origin, which is the CSRF guard. */
export function isSameOriginFetch(site: string | undefined): boolean {
  return site === undefined || site === 'same-origin' || site === 'none';
}

export async function readJsonBody(
  request: SaveRequestLike,
  maxBytes: number,
): Promise<{ readonly ok: true; readonly value: unknown } | WorkbenchSaveResult> {
  const chunks: Buffer[] = [];
  let received = 0;
  let tooLarge = false;

  await new Promise<void>((resolve) => {
    request.on('data', (chunk: Buffer) => {
      if (tooLarge) return;
      received += chunk.length;
      if (received > maxBytes) {
        tooLarge = true;
        // Stop draining a body that can never be accepted.
        request.destroy();
        resolve();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => { resolve(); });
    request.on('error', () => { resolve(); });
  });

  if (tooLarge) {
    return {
      status: 413,
      body: {
        ok: false,
        code: 'E_BODY_TOO_LARGE',
        message: '저장 용량이 64MB를 넘습니다. 슬롯을 나눠 저장해 주세요.',
      },
    };
  }
  try {
    return { ok: true, value: JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown };
  } catch {
    return {
      status: 400,
      body: { ok: false, code: 'E_JSON', message: '요청 형식을 읽지 못했습니다.' },
    };
  }
}

export async function respondToWorkbenchSave(
  request: SaveRequestLike,
  assetsRoot: string,
  assetsRootLabel: string,
): Promise<WorkbenchSaveResult> {
  if (request.method !== 'POST') {
    return {
      status: 405,
      body: { ok: false, code: 'E_METHOD', message: 'POST 요청만 지원합니다.' },
    };
  }
  if (!isLoopbackHost(headerValue(request.headers, 'host'))) {
    return {
      status: 403,
      body: {
        ok: false,
        code: 'E_REMOTE',
        message: '로컬 개발 서버에서만 저장할 수 있습니다.',
      },
    };
  }
  if (!isSameOriginFetch(headerValue(request.headers, 'sec-fetch-site'))) {
    return {
      status: 403,
      body: { ok: false, code: 'E_REMOTE', message: '동일 출처 요청만 허용합니다.' },
    };
  }
  const body = await readJsonBody(request, MAX_BODY_BYTES);
  if ('status' in body) return body;
  return handleWorkbenchSave(body.value, { assetsRoot, assetsRootLabel });
}

export interface SaveWorkbenchAssetsOptions {
  readonly assetsRoot?: string;
  readonly assetsRootLabel?: string;
}

/**
 * Dev-server only: `apply: 'serve'` keeps every byte of this out of `dist/`.
 */
export function saveWorkbenchAssetsPlugin(
  options: SaveWorkbenchAssetsOptions = {},
): Plugin {
  const assetsRoot = options.assetsRoot ?? DEFAULT_ASSETS_ROOT;
  const assetsRootLabel = options.assetsRootLabel ?? 'dungeon-dossier/assets';
  return {
    name: 'save-workbench-assets',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(WORKBENCH_SAVE_ENDPOINT, (request, response, next) => {
        void respondToWorkbenchSave(
          request as unknown as SaveRequestLike,
          assetsRoot,
          assetsRootLabel,
        )
          .then((result) => {
            const target = response as unknown as SaveResponseLike;
            target.statusCode = result.status;
            target.setHeader('content-type', 'application/json; charset=utf-8');
            target.end(JSON.stringify(result.body));
          })
          .catch((error: unknown) => { next(error); });
      });
    },
  };
}
