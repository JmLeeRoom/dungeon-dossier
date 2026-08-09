import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { PNG } from 'pngjs';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  handleWorkbenchSave,
  ASSET_MANIFEST_FILE_NAME,
  MAX_OPAQUE_RGBA_COLOURS,
  PROTECTED_ASSET_PATH,
  type WorkbenchSaveErrorBody,
  type WorkbenchSaveResult,
  type WorkbenchSaveSuccessBody,
} from '../../tools/workbench-save/handler';
import {
  isLoopbackHost,
  isSameOriginFetch,
  respondToWorkbenchSave,
  type SaveRequestLike,
} from '../../tools/workbench-save/index';
import {
  buildShippingAssetManifest,
  createInitialWorkbenchState,
} from '../../workbench/model.mts';

let root = '';

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'dossier-workbench-save-'));
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

/** Builds a PNG with a controlled number of distinct opaque colours. */
function pngDataUrl(colourCount: number): string {
  const png = new PNG({ width: colourCount, height: 1 });
  for (let index = 0; index < colourCount; index += 1) {
    const offset = index * 4;
    png.data[offset] = index * 7 + 1;
    png.data[offset + 1] = index * 13 + 2;
    png.data[offset + 2] = index * 29 + 3;
    png.data[offset + 3] = 255;
  }
  return `data:image/png;base64,${PNG.sync.write(png).toString('base64')}`;
}

const SMALL_PNG = pngDataUrl(4);
const OTHER_PNG = pngDataUrl(5);
const MANIFEST = buildShippingAssetManifest(createInitialWorkbenchState());

function request(files: readonly { path: string; dataUrl: string }[]): unknown {
  return { manifest: MANIFEST, files };
}

function success(result: WorkbenchSaveResult): WorkbenchSaveSuccessBody {
  if (!result.body.ok) throw new Error(`expected success, got ${result.body.code}`);
  return result.body;
}

function error(result: WorkbenchSaveResult): WorkbenchSaveErrorBody {
  if (result.body.ok) throw new Error('expected failure');
  return result.body;
}

async function freshRoot(name: string): Promise<string> {
  const directory = path.join(root, name);
  await rm(directory, { recursive: true, force: true });
  return directory;
}

async function listFiles(directory: string): Promise<readonly string[]> {
  const entries = await readdir(directory, { withFileTypes: true, recursive: true }).catch(
    () => [],
  );
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(directory, path.join(entry.parentPath, entry.name)))
    .map((value) => value.replaceAll('\\', '/'))
    .sort();
}

describe('handleWorkbenchSave · happy path', () => {
  it('writes routed PNGs and the manifest, creating folders as needed', async () => {
    const assetsRoot = await freshRoot('happy');
    const result = await handleWorkbenchSave(
      request([
        { path: 'bg/배경_심문실_시안.png', dataUrl: SMALL_PNG },
        { path: 'portraits/portrait_하피_base.png', dataUrl: OTHER_PNG },
      ]),
      { assetsRoot, assetsRootLabel: 'assets' },
    );

    const body = success(result);
    expect(result.status).toBe(200);
    expect(body.savedFiles).toEqual([
      ASSET_MANIFEST_FILE_NAME,
      'bg/배경_심문실_시안.png',
      'portraits/portrait_하피_base.png',
    ]);
    expect(body.skippedFiles).toEqual([]);

    // Bytes must round-trip exactly; a re-encode would change the art.
    const written = await readFile(path.join(assetsRoot, 'bg/배경_심문실_시안.png'));
    expect(written.equals(Buffer.from(SMALL_PNG.split(',')[1] ?? '', 'base64'))).toBe(true);

    const manifest = await readFile(
      path.join(assetsRoot, ASSET_MANIFEST_FILE_NAME),
      'utf8',
    );
    expect(manifest.endsWith('\n')).toBe(true);
    expect(JSON.parse(manifest)).toEqual(MANIFEST);
  });

  it('reports every saved path with forward slashes', async () => {
    const assetsRoot = await freshRoot('separators');
    const body = success(
      await handleWorkbenchSave(
        request([{ path: 'cards/card_기본_템플릿.png', dataUrl: SMALL_PNG }]),
        { assetsRoot },
      ),
    );
    for (const saved of body.savedFiles) expect(saved).not.toContain('\\');
  });

  it('honours manifestOnly by leaving the manifest alone', async () => {
    const assetsRoot = await freshRoot('manifest-only');
    await handleWorkbenchSave(
      { manifest: MANIFEST, files: [{ path: 'bg/배경_심문실_시안.png', dataUrl: SMALL_PNG }], manifestOnly: true },
      { assetsRoot },
    );
    expect(await listFiles(assetsRoot)).toEqual(['bg/배경_심문실_시안.png']);
  });
});

describe('handleWorkbenchSave · idempotence', () => {
  it('skips identical bytes and leaves mtime untouched', async () => {
    const assetsRoot = await freshRoot('idempotent');
    const payload = request([{ path: 'bg/배경_심문실_시안.png', dataUrl: SMALL_PNG }]);

    const first = success(await handleWorkbenchSave(payload, { assetsRoot }));
    expect(first.savedFiles).toHaveLength(2);

    const target = path.join(assetsRoot, 'bg/배경_심문실_시안.png');
    const before = await stat(target);

    const second = success(await handleWorkbenchSave(payload, { assetsRoot }));
    expect(second.savedFiles).toEqual([]);
    expect(second.skippedFiles).toEqual([
      ASSET_MANIFEST_FILE_NAME,
      'bg/배경_심문실_시안.png',
    ]);
    expect(second.message).toContain('건너뜀');

    const after = await stat(target);
    expect(after.mtimeMs).toBe(before.mtimeMs);
  });
});

describe('handleWorkbenchSave · atomicity', () => {
  it('writes nothing at all when one file fails validation', async () => {
    const assetsRoot = await freshRoot('atomic');
    const result = await handleWorkbenchSave(
      request([
        { path: 'bg/배경_심문실_시안.png', dataUrl: SMALL_PNG },
        { path: 'cards/card_기본_템플릿.png', dataUrl: pngDataUrl(MAX_OPAQUE_RGBA_COLOURS + 40) },
        { path: 'evidence/ev_사건_증거1.png', dataUrl: OTHER_PNG },
      ]),
      { assetsRoot },
    );

    expect(result.status).toBe(400);
    const body = error(result);
    expect(body.code).toBe('E_PALETTE');
    expect(body.failures).toHaveLength(1);
    expect(body.failures?.[0]?.path).toBe('cards/card_기본_템플릿.png');
    // The two valid files must not have landed.
    expect(await listFiles(assetsRoot)).toEqual([]);
  });

  it('rejects a full-colour PNG before the palette gate ever sees it', async () => {
    const assetsRoot = await freshRoot('palette');
    const body = error(
      await handleWorkbenchSave(
        request([{ path: 'bg/배경_심문실_시안.png', dataUrl: pngDataUrl(200) }]),
        { assetsRoot },
      ),
    );
    expect(body.code).toBe('E_PALETTE');
    expect(body.message).toContain('불투명 색상이 200개');
    expect(await listFiles(assetsRoot)).toEqual([]);
  });
});

describe('handleWorkbenchSave · path defence matrix', () => {
  const cases: readonly { readonly label: string; readonly path: string; readonly code: string }[] = [
    { label: 'traversal', path: '../../etc/passwd.png', code: 'E_SCHEMA' },
    { label: 'absolute', path: '/abs/bg_a_b.png', code: 'E_SCHEMA' },
    { label: 'nested traversal', path: 'bg/../../x_a_b.png', code: 'E_SCHEMA' },
    { label: 'flat write', path: '배경_심문실_시안.png', code: 'E_SCHEMA' },
    { label: 'unlisted folder', path: 'nope/bg_a_b.png', code: 'E_DIR' },
    { label: 'not a png', path: 'bg/배경_심문실_시안.jpg', code: 'E_SCHEMA' },
    { label: 'two segments', path: 'bg/두분절.png', code: 'E_FILENAME' },
  ];

  it.each(cases)('rejects $label and writes nothing', async ({ path: relative, code }) => {
    const assetsRoot = await freshRoot(`defence-${code}-${relative.length.toString()}`);
    const result = await handleWorkbenchSave(
      request([{ path: relative, dataUrl: SMALL_PNG }]),
      { assetsRoot },
    );
    expect(result.status).toBe(400);
    expect(error(result).code).toBe(code);
    expect(await listFiles(assetsRoot)).toEqual([]);
    // Nothing may appear beside the temp root either.
    expect(await listFiles(root)).not.toContain('passwd.png');
  });

  it('rejects a duplicated path rather than silently keeping the last one', async () => {
    const assetsRoot = await freshRoot('duplicate');
    const body = error(
      await handleWorkbenchSave(
        request([
          { path: 'bg/배경_심문실_시안.png', dataUrl: SMALL_PNG },
          { path: 'bg/배경_심문실_시안.png', dataUrl: OTHER_PNG },
        ]),
        { assetsRoot },
      ),
    );
    expect(body.code).toBe('E_DUPLICATE');
    expect(await listFiles(assetsRoot)).toEqual([]);
  });

  it('rejects a catalogued basename routed to the wrong directory', async () => {
    const assetsRoot = await freshRoot('catalog-path');
    const body = error(
      await handleWorkbenchSave(
        request([{ path: 'bg/ui_card_base.png', dataUrl: SMALL_PNG }]),
        { assetsRoot },
      ),
    );
    expect(body.code).toBe('E_CATALOG_PATH');
    expect(body.message).toContain('cards/ui_card_base.png');
    expect(await listFiles(assetsRoot)).toEqual([]);
  });

  it('rejects an otherwise valid filename that has no catalog identity', async () => {
    const assetsRoot = await freshRoot('catalog-unknown');
    const body = error(
      await handleWorkbenchSave(
        request([{ path: 'bg/nope_asset_state.png', dataUrl: SMALL_PNG }]),
        { assetsRoot },
      ),
    );
    expect(body.code).toBe('E_CATALOG');
    expect(await listFiles(assetsRoot)).toEqual([]);
  });

  it('refuses to overwrite the missing-asset fallback', async () => {
    const assetsRoot = await freshRoot('protected');
    const body = error(
      await handleWorkbenchSave(
        request([{ path: PROTECTED_ASSET_PATH, dataUrl: SMALL_PNG }]),
        { assetsRoot },
      ),
    );
    expect(body.code).toBe('E_PROTECTED');
    expect(await listFiles(assetsRoot)).toEqual([]);
  });

  it('rejects bytes that are not a PNG', async () => {
    const assetsRoot = await freshRoot('not-png');
    const body = error(
      await handleWorkbenchSave(
        request([
          {
            path: 'bg/배경_심문실_시안.png',
            dataUrl: `data:image/png;base64,${Buffer.from('nope not a png at all').toString('base64')}`,
          },
        ]),
        { assetsRoot },
      ),
    );
    expect(body.code).toBe('E_NOT_PNG');
    expect(await listFiles(assetsRoot)).toEqual([]);
  });

  it('rejects a manifest image basename that has no catalog entry', async () => {
    const assetsRoot = await freshRoot('manifest-catalog');
    const background = MANIFEST.slots['bg-room'];
    if (background === undefined) throw new Error('canonical bg-room slot is missing');
    const manifest = {
      ...MANIFEST,
      slots: {
        ...MANIFEST.slots,
        'bg-room': { ...background, image: 'bg_missing_unknown.png' },
      },
    };
    const body = error(
      await handleWorkbenchSave({ manifest, files: [] }, { assetsRoot }),
    );
    expect(body.code).toBe('E_MANIFEST');
    expect(body.message).toContain('bg-room');
    expect(await listFiles(assetsRoot)).toEqual([]);
  });

  it('refuses altered bytes at an importer-owned production path', async () => {
    const assetsRoot = await freshRoot('production-art');
    const body = error(
      await handleWorkbenchSave(
        request([{ path: 'cards/ui_card_base.png', dataUrl: SMALL_PNG }]),
        { assetsRoot },
      ),
    );

    expect(body.code).toBe('E_PRODUCTION_ART');
    expect(await listFiles(assetsRoot)).toEqual([]);
  });
});

describe('handleWorkbenchSave · canonical manifest topology', () => {
  const background = MANIFEST.slots['bg-room'];
  if (background === undefined) throw new Error('canonical bg-room slot is missing');
  const missingSlots = Object.fromEntries(
    Object.entries(MANIFEST.slots).filter(([id]) => id !== 'bg-room'),
  );
  const cases = [
    {
      label: 'missing slot',
      manifest: { ...MANIFEST, slots: missingSlots },
    },
    {
      label: 'extra slot',
      manifest: {
        ...MANIFEST,
        slots: { ...MANIFEST.slots, unexpected: background },
      },
    },
    {
      label: 'null production image',
      manifest: {
        ...MANIFEST,
        slots: {
          ...MANIFEST.slots,
          'bg-room': { ...background, image: null },
        },
      },
    },
    {
      label: 'wrong dimension id',
      manifest: {
        ...MANIFEST,
        slots: {
          ...MANIFEST.slots,
          'bg-room': { ...background, dimension: 'event_bg_1280x800' as const },
        },
      },
    },
    {
      label: 'unlocked production slot',
      manifest: {
        ...MANIFEST,
        slots: {
          ...MANIFEST.slots,
          'bg-room': { ...background, isLocked: false },
        },
      },
    },
  ] as const;

  it.each(cases)('rejects $label before writing any file', async ({ label, manifest }) => {
    const assetsRoot = await freshRoot(`manifest-topology-${label.replaceAll(' ', '-')}`);
    const body = error(await handleWorkbenchSave({ manifest, files: [] }, { assetsRoot }));

    expect(body.code).toBe('E_MANIFEST');
    expect(await listFiles(assetsRoot)).toEqual([]);
  });
});

describe('middleware adapter', () => {
  function requestDouble(
    overrides: Partial<{
      method: string;
      headers: Record<string, string>;
      body: string;
    }> = {},
  ): SaveRequestLike {
    const body = overrides.body ?? JSON.stringify(request([]));
    const listeners = new Map<string, (payload?: unknown) => void>();
    return {
      method: overrides.method ?? 'POST',
      headers: overrides.headers ?? { host: '127.0.0.1:5173', 'sec-fetch-site': 'same-origin' },
      on(event: 'data' | 'end' | 'error', listener: never) {
        listeners.set(event, listener);
        if (event === 'error') {
          // Node registers data/end/error in that order; emit once all three
          // are attached so no chunk is delivered to a missing listener.
          queueMicrotask(() => {
            listeners.get('data')?.(Buffer.from(body, 'utf8'));
            listeners.get('end')?.();
          });
        }
        return this;
      },
      destroy: vi.fn(),
    };
  }

  it('answers 405 to anything but POST', async () => {
    const result = await respondToWorkbenchSave(
      requestDouble({ method: 'GET' }),
      root,
      'assets',
    );
    expect(result.status).toBe(405);
    expect(error(result).code).toBe('E_METHOD');
  });

  it('answers 403 to a non-loopback host', async () => {
    const result = await respondToWorkbenchSave(
      requestDouble({ headers: { host: '192.168.0.7:5173' } }),
      root,
      'assets',
    );
    expect(result.status).toBe(403);
    expect(error(result).code).toBe('E_REMOTE');
  });

  it('answers 403 to a cross-site POST', async () => {
    const result = await respondToWorkbenchSave(
      requestDouble({ headers: { host: 'localhost:5173', 'sec-fetch-site': 'cross-site' } }),
      root,
      'assets',
    );
    expect(result.status).toBe(403);
    expect(error(result).code).toBe('E_REMOTE');
  });

  it('answers 400 to a body that is not JSON', async () => {
    const result = await respondToWorkbenchSave(
      requestDouble({ body: '{not json' }),
      root,
      'assets',
    );
    expect(result.status).toBe(400);
    expect(error(result).code).toBe('E_JSON');
  });

  it('classifies hosts and fetch sites the way the guard needs', () => {
    expect(isLoopbackHost('localhost:5173')).toBe(true);
    expect(isLoopbackHost('127.0.0.1')).toBe(true);
    expect(isLoopbackHost('[::1]:5173')).toBe(true);
    expect(isLoopbackHost('192.168.0.7:5173')).toBe(false);
    expect(isLoopbackHost('evil.example.com')).toBe(false);
    expect(isLoopbackHost(undefined)).toBe(false);

    expect(isSameOriginFetch('same-origin')).toBe(true);
    expect(isSameOriginFetch(undefined)).toBe(true);
    expect(isSameOriginFetch('cross-site')).toBe(false);
    expect(isSameOriginFetch('same-site')).toBe(false);
  });
});

describe('write failure', () => {
  it('reports E_WRITE instead of throwing when the target is unwritable', async () => {
    const assetsRoot = await freshRoot('unwritable');
    // A file where a folder must go makes mkdir fail deterministically.
    await writeFile(path.join(root, 'unwritable'), 'blocker', 'utf8');
    const result = await handleWorkbenchSave(
      request([{ path: 'bg/배경_심문실_시안.png', dataUrl: SMALL_PNG }]),
      { assetsRoot },
    );
    expect(result.status).toBe(500);
    expect(error(result).code).toBe('E_WRITE');
    await rm(path.join(root, 'unwritable'), { force: true });
  });
});
