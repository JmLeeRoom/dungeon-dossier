import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { z } from 'zod';

import { AssetManifestSchema } from '../../src/ui/core/assetManifest';

/**
 * The workbench writes real PNGs into the repository, so every check that keeps
 * the game bootable lives here rather than in the browser. The client computes
 * a target path; the server never trusts it.
 */

export const MAX_BODY_BYTES = 64 * 1024 * 1024;
const MAX_DATA_URL_CHARS = MAX_BODY_BYTES;
const MAX_FILES = 256;
/** Same ceiling `tools/palette-check` enforces, duplicated as a constant so a
 * save cannot land a PNG that immediately reds the palette gate. */
export const MAX_OPAQUE_RGBA_COLOURS = 16;

/** Folders a save may write into: the category map's values, never a listing of
 * `assets/` (which also holds fonts, bgm and sfx). */
export const ASSET_WRITE_DIRECTORIES: readonly string[] = Object.freeze([
  'bg',
  'cards',
  'dead',
  'evidence',
  'fg',
  'portraits',
  'ui',
]);

/** The only fallback image every missing asset resolves to. */
export const PROTECTED_ASSET_PATH = 'ui/placeholder_missing_fallback.png';

export const ASSET_MANIFEST_FILE_NAME = 'asset_manifest.json';

const ASSET_RELATIVE_PATH = /^[a-z]+\/[^/\\]+\.png$/u;
const PNG_DATA_URL = /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/u;

export const WorkbenchSaveFileSchema = z.strictObject({
  path: z.string().regex(ASSET_RELATIVE_PATH),
  dataUrl: z.string().regex(PNG_DATA_URL).max(MAX_DATA_URL_CHARS),
});

export const WorkbenchSaveRequestSchema = z.strictObject({
  manifest: AssetManifestSchema,
  files: z.array(WorkbenchSaveFileSchema).max(MAX_FILES),
  manifestOnly: z.boolean().optional(),
});
export type WorkbenchSaveRequest = z.infer<typeof WorkbenchSaveRequestSchema>;

export type WorkbenchSaveErrorCode =
  | 'E_METHOD'
  | 'E_REMOTE'
  | 'E_BODY_TOO_LARGE'
  | 'E_JSON'
  | 'E_SCHEMA'
  | 'E_DUPLICATE'
  | 'E_FLAT_WRITE'
  | 'E_DIR'
  | 'E_PROTECTED'
  | 'E_PATH'
  | 'E_FILENAME'
  | 'E_DATA_URL'
  | 'E_NOT_PNG'
  | 'E_PALETTE'
  | 'E_WRITE';

export interface WorkbenchSaveFailure {
  readonly path: string;
  readonly code: WorkbenchSaveErrorCode;
  readonly message: string;
}

export interface WorkbenchSaveSuccessBody {
  readonly ok: true;
  readonly assetsRoot: string;
  readonly savedFiles: readonly string[];
  readonly skippedFiles: readonly string[];
  readonly message: string;
}

export interface WorkbenchSaveErrorBody {
  readonly ok: false;
  readonly code: WorkbenchSaveErrorCode;
  readonly message: string;
  readonly failures?: readonly WorkbenchSaveFailure[];
}

export interface WorkbenchSaveResult {
  readonly status: number;
  readonly body: WorkbenchSaveSuccessBody | WorkbenchSaveErrorBody;
}

export interface WorkbenchSaveOptions {
  readonly assetsRoot: string;
  /** Shown in the response so the planner knows which tree was touched. */
  readonly assetsRootLabel?: string;
}

function failure(
  status: number,
  code: WorkbenchSaveErrorCode,
  message: string,
  failures?: readonly WorkbenchSaveFailure[],
): WorkbenchSaveResult {
  return {
    status,
    body: { ok: false, code, message, ...(failures === undefined ? {} : { failures }) },
  };
}

/** Windows paths reach the planner as `/`-separated, like every other tool here. */
function toPosix(value: string): string {
  return value.replaceAll('\\', '/');
}

interface PreparedFile {
  readonly relativePath: string;
  readonly absolutePath: string;
  readonly bytes: Buffer;
}

function decodePngDataUrl(dataUrl: string): Buffer | undefined {
  const comma = dataUrl.indexOf(',');
  if (comma < 0) return undefined;
  try {
    return Buffer.from(dataUrl.slice(comma + 1), 'base64');
  } catch {
    return undefined;
  }
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function isPngBuffer(bytes: Buffer): boolean {
  // Signature plus an IHDR chunk header is the same depth the workbench's own
  // dimension reader uses; anything shorter cannot describe an image.
  return (
    bytes.length >= 24 &&
    bytes.subarray(0, 8).equals(PNG_SIGNATURE) &&
    bytes.subarray(12, 16).toString('ascii') === 'IHDR'
  );
}

/**
 * Counts distinct fully-opaque RGBA colours, matching `tools/palette-check`.
 * Decoding is deferred to `pngjs`, the same dependency the palette gate uses.
 */
async function countOpaqueColours(bytes: Buffer): Promise<number> {
  const { PNG } = await import('pngjs');
  const png = PNG.sync.read(bytes);
  const colours = new Set<number>();
  for (let index = 0; index < png.data.length; index += 4) {
    const alpha = png.data[index + 3] ?? 0;
    if (alpha === 0) continue;
    colours.add(
      ((png.data[index] ?? 0) << 24) |
        ((png.data[index + 1] ?? 0) << 16) |
        ((png.data[index + 2] ?? 0) << 8) |
        alpha,
    );
  }
  return colours.size;
}

/** Rejects anything the runtime registry could not key, plus path escapes. */
export function resolveAssetTarget(
  assetsRoot: string,
  relativePath: string,
): { readonly absolutePath: string } | WorkbenchSaveFailure {
  const posix = toPosix(relativePath);
  if (!posix.includes('/')) {
    return {
      path: posix,
      code: 'E_FLAT_WRITE',
      message:
        'assets/ 루트에는 PNG를 저장할 수 없습니다. (레지스트리 키 충돌로 게임이 부팅되지 않습니다)',
    };
  }
  const segments = posix.split('/');
  const directory = segments[0];
  const fileName = segments.at(-1);
  if (directory === undefined || fileName === undefined || segments.length !== 2) {
    return { path: posix, code: 'E_PATH', message: 'assets/ 밖으로 나가는 경로입니다.' };
  }
  if (!ASSET_WRITE_DIRECTORIES.includes(directory)) {
    return {
      path: posix,
      code: 'E_DIR',
      message: `허용되지 않은 폴더입니다: ${directory} (허용: ${ASSET_WRITE_DIRECTORIES.join(', ')})`,
    };
  }
  if (posix === PROTECTED_ASSET_PATH) {
    return {
      path: posix,
      code: 'E_PROTECTED',
      message: '누락 에셋 대체 이미지는 덮어쓸 수 없습니다.',
    };
  }
  // Mirrors parseAssetFilename: a two-segment name would throw at the next boot
  // even though the folder is legal.
  const stem = fileName.slice(0, -'.png'.length);
  if (stem.split('_').length < 3) {
    return {
      path: posix,
      code: 'E_FILENAME',
      message: `파일명은 카테고리_이름_상태.png 형식이어야 합니다: ${fileName}`,
    };
  }
  const absolutePath = path.resolve(assetsRoot, directory, fileName);
  const relative = path.relative(path.resolve(assetsRoot), absolutePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return { path: posix, code: 'E_PATH', message: 'assets/ 밖으로 나가는 경로입니다.' };
  }
  return { absolutePath };
}

function isFailure(
  value: { readonly absolutePath: string } | WorkbenchSaveFailure,
): value is WorkbenchSaveFailure {
  return 'code' in value;
}

async function sameBytesOnDisk(absolutePath: string, bytes: Buffer): Promise<boolean> {
  try {
    return (await readFile(absolutePath)).equals(bytes);
  } catch {
    return false;
  }
}

/** Write to a sibling temp file then rename, so a reader never sees a partial PNG. */
async function writeAtomic(absolutePath: string, bytes: Buffer | string): Promise<void> {
  await mkdir(path.dirname(absolutePath), { recursive: true });
  const temporaryPath = `${absolutePath}.tmp-${String(process.pid)}`;
  try {
    await writeFile(temporaryPath, bytes);
    await rename(temporaryPath, absolutePath);
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
}

export async function handleWorkbenchSave(
  input: unknown,
  options: WorkbenchSaveOptions,
): Promise<WorkbenchSaveResult> {
  const parsed = WorkbenchSaveRequestSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const where = first === undefined ? '' : first.path.join('.');
    return failure(400, 'E_SCHEMA', `요청 스키마가 올바르지 않습니다: ${where}`);
  }
  const request = parsed.data;
  const assetsRootLabel = options.assetsRootLabel ?? toPosix(options.assetsRoot);

  const seen = new Set<string>();
  for (const file of request.files) {
    if (seen.has(file.path)) {
      return failure(400, 'E_DUPLICATE', `같은 경로가 중복 요청되었습니다: ${file.path}`);
    }
    seen.add(file.path);
  }

  // Validate everything before touching disk: a half-applied save would leave
  // assets/ in a state only git could untangle.
  const failures: WorkbenchSaveFailure[] = [];
  const prepared: PreparedFile[] = [];
  for (const file of request.files) {
    const target = resolveAssetTarget(options.assetsRoot, file.path);
    if (isFailure(target)) {
      failures.push(target);
      continue;
    }
    const bytes = decodePngDataUrl(file.dataUrl);
    if (bytes === undefined || bytes.length === 0) {
      failures.push({
        path: file.path,
        code: 'E_DATA_URL',
        message: `PNG data URL이 아닙니다: ${file.path}`,
      });
      continue;
    }
    if (!isPngBuffer(bytes)) {
      failures.push({
        path: file.path,
        code: 'E_NOT_PNG',
        message: `PNG 헤더를 읽지 못했습니다: ${file.path}`,
      });
      continue;
    }
    let opaqueColours: number;
    try {
      opaqueColours = await countOpaqueColours(bytes);
    } catch {
      failures.push({
        path: file.path,
        code: 'E_NOT_PNG',
        message: `PNG를 디코딩하지 못했습니다: ${file.path}`,
      });
      continue;
    }
    if (opaqueColours > MAX_OPAQUE_RGBA_COLOURS) {
      failures.push({
        path: file.path,
        code: 'E_PALETTE',
        message: `${file.path}: 불투명 색상이 ${String(opaqueColours)}개입니다. 최대 ${String(MAX_OPAQUE_RGBA_COLOURS)}개까지만 저장할 수 있습니다.`,
      });
      continue;
    }
    prepared.push({ relativePath: file.path, absolutePath: target.absolutePath, bytes });
  }

  if (failures.length > 0) {
    const first = failures[0];
    if (first === undefined) throw new Error('unreachable: non-empty failures');
    return failure(400, first.code, first.message, failures);
  }

  const savedFiles: string[] = [];
  const skippedFiles: string[] = [];
  try {
    for (const file of prepared) {
      // The workbench always sends all 16 slots, so skipping identical bytes is
      // what keeps git diffs and Vite reloads honest.
      if (await sameBytesOnDisk(file.absolutePath, file.bytes)) {
        skippedFiles.push(file.relativePath);
        continue;
      }
      await writeAtomic(file.absolutePath, file.bytes);
      savedFiles.push(file.relativePath);
    }

    if (request.manifestOnly !== true) {
      const manifestPath = path.resolve(options.assetsRoot, ASSET_MANIFEST_FILE_NAME);
      const serialized = `${JSON.stringify(request.manifest, null, 2)}\n`;
      if (await sameBytesOnDisk(manifestPath, Buffer.from(serialized, 'utf8'))) {
        skippedFiles.push(ASSET_MANIFEST_FILE_NAME);
      } else {
        await writeAtomic(manifestPath, serialized);
        savedFiles.push(ASSET_MANIFEST_FILE_NAME);
      }
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return failure(500, 'E_WRITE', `디스크에 쓰지 못했습니다: ${reason}`);
  }

  savedFiles.sort((left, right) => left.localeCompare(right));
  skippedFiles.sort((left, right) => left.localeCompare(right));
  const message =
    skippedFiles.length === 0
      ? `${String(savedFiles.length)}개 파일을 ${assetsRootLabel}/ 에 저장했습니다.`
      : `${String(savedFiles.length)}개 파일을 ${assetsRootLabel}/ 에 저장했습니다. (변경 없음 ${String(skippedFiles.length)}개 건너뜀)`;

  return {
    status: 200,
    body: { ok: true, assetsRoot: assetsRootLabel, savedFiles, skippedFiles, message },
  };
}
