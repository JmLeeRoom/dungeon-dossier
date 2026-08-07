import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { buildAssetRegistry } from '../../src/ui/core/assetRegistry';
import {
  ASSET_CATEGORY_DIRECTORIES,
  ASSET_WRITE_DIRECTORIES,
  PROTECTED_ASSET_PATH,
  assetTargetPath,
  CANONICAL_SLOTS,
  collectWorkbenchSaveRequest,
  createInitialWorkbenchState,
  describeSaveError,
  formatSaveSuccess,
  stageSlotFileName,
  withActiveCharacter,
  withStageSlotImage,
  type WorkbenchState,
} from '../../workbench/model.mts';

/** Smallest structurally valid PNG data URL; content is irrelevant here. */
const PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function withEveryStageSlotFilled(): WorkbenchState {
  let state = createInitialWorkbenchState();
  for (const definition of CANONICAL_SLOTS) {
    state = withStageSlotImage(state, definition.id, {
      dataUrl: PNG_DATA_URL,
      originalName: definition.downloadName,
    });
  }
  return state;
}

describe('assetTargetPath', () => {
  it('routes every authored category into its folder', () => {
    expect(assetTargetPath('배경_심문실_시안.png')).toBe('bg/배경_심문실_시안.png');
    expect(assetTargetPath('전경_책상_기본.png')).toBe('fg/전경_책상_기본.png');
    expect(assetTargetPath('portrait_하피_base.png')).toBe('portraits/portrait_하피_base.png');
    expect(assetTargetPath('card_기본_템플릿.png')).toBe('cards/card_기본_템플릿.png');
    expect(assetTargetPath('ev_사건_증거1.png')).toBe('evidence/ev_사건_증거1.png');
    expect(assetTargetPath('아이콘_평정심_기본.png')).toBe('ui/아이콘_평정심_기본.png');
    expect(assetTargetPath('placeholder_missing_fallback.png')).toBe(PROTECTED_ASSET_PATH);
    expect(assetTargetPath('dead_과로_기본.png')).toBe('dead/dead_과로_기본.png');
  });

  it('refuses anything the runtime registry could not key', () => {
    // Unknown category: there is no folder to route it to.
    expect(assetTargetPath('nope_이름_상태.png')).toBeUndefined();
    // Fewer than three segments would throw in parseAssetFilename on next boot.
    expect(assetTargetPath('두분절.png')).toBeUndefined();
    expect(assetTargetPath('배경_심문실.png')).toBeUndefined();
    expect(assetTargetPath('배경_심문실_시안.jpg')).toBeUndefined();
    expect(assetTargetPath('배경_심문실_시안')).toBeUndefined();
  });

  it('exposes only the folders the category map names', () => {
    expect(ASSET_WRITE_DIRECTORIES).toEqual([
      'bg', 'cards', 'dead', 'evidence', 'fg', 'portraits', 'ui',
    ]);
    // fonts/bgm/sfx exist on disk but are not PNG targets.
    expect(ASSET_WRITE_DIRECTORIES).not.toContain('fonts');
    expect(ASSET_WRITE_DIRECTORIES).not.toContain('bgm');
    expect(ASSET_WRITE_DIRECTORIES).not.toContain('sfx');
  });
});

describe('category map drift', () => {
  it('matches the placeholder generator category to directory pairs', () => {
    const config = JSON.parse(
      readFileSync(
        new URL('../../tools/placeholder/placeholders.json', import.meta.url),
        'utf8',
      ),
    ) as { assets: readonly { category?: string; directory?: string }[] };

    const fromConfig = new Map<string, string>();
    for (const asset of config.assets) {
      if (asset.category === undefined || asset.directory === undefined) continue;
      fromConfig.set(asset.category, asset.directory);
    }
    expect(Object.fromEntries([...fromConfig].sort())).toEqual(
      Object.fromEntries(Object.entries(ASSET_CATEGORY_DIRECTORIES).sort()),
    );
  });
});

describe('collectWorkbenchSaveRequest', () => {
  it('sends nothing when no slot holds an image', () => {
    const request = collectWorkbenchSaveRequest(createInitialWorkbenchState());
    expect(request.files).toEqual([]);
    // The manifest is still assembled: placement is a planning artefact that
    // stands on its own even with no pixels attached.
    expect(request.manifest.schema_version).toBe('3.0');
  });

  it('collects only filled slots, deduplicated and path-sorted', () => {
    const request = collectWorkbenchSaveRequest(withEveryStageSlotFilled());

    expect(request.files.length).toBeGreaterThan(0);
    const paths = request.files.map((file) => file.path);
    expect([...paths].sort((a, b) => a.localeCompare(b))).toEqual(paths);
    expect(new Set(paths).size).toBe(paths.length);
    for (const file of request.files) {
      expect(file.dataUrl).toBe(PNG_DATA_URL);
      expect(file.path).toMatch(/^[a-z]+\/.+\.png$/u);
    }
  });

  it('names a bound portrait slot after the active character', () => {
    // A bound slot stores its PNG per character, so the switch has to happen
    // before the drop or the image lands on the previous character.
    let bound = withActiveCharacter(createInitialWorkbenchState(), '하피');
    bound = withStageSlotImage(bound, 'suspect-base', {
      dataUrl: PNG_DATA_URL,
      originalName: 'portrait_하피_base.png',
    });
    expect(stageSlotFileName(bound, 'suspect-base')).toBe('portrait_하피_base.png');

    const request = collectWorkbenchSaveRequest(bound);
    expect(request.files.map((file) => file.path)).toContain(
      'portraits/portrait_하피_base.png',
    );
  });

  it('never offers the missing-asset fallback for overwrite', () => {
    const request = collectWorkbenchSaveRequest(withEveryStageSlotFilled());
    expect(request.files.map((file) => file.path)).not.toContain(PROTECTED_ASSET_PATH);
  });
});

describe('registry safety of every produced path', () => {
  it('adds no duplicate slot key to the checked-in asset set', () => {
    const request = collectWorkbenchSaveRequest(withEveryStageSlotFilled());
    // Model the glob the way the runtime does: existing files plus the ones a
    // save would create. A flat write would collide here exactly as it would
    // at boot.
    const entries: Record<string, string> = {};
    for (const file of request.files) {
      entries[`../../../assets/${file.path}`] = `/${file.path}`;
    }
    expect(() => buildAssetRegistry(entries)).not.toThrow();

    const registry = buildAssetRegistry(entries);
    expect(registry.size).toBe(request.files.length);
  });

  it('would throw if a file were written flat, proving the routing matters', () => {
    // Same filename at the root and under its folder: identical derived key.
    expect(() =>
      buildAssetRegistry({
        '../../../assets/배경_심문실_시안.png': '/a.png',
        '../../../assets/bg/배경_심문실_시안.png': '/b.png',
      }),
    ).toThrow(/Duplicate asset slot/u);
  });
});

describe('status copy', () => {
  it('reports the real saved count and never claims the game updated', () => {
    const message = formatSaveSuccess({
      assetsRoot: 'dungeon-dossier/assets',
      savedFiles: ['bg/배경_심문실_시안.png', 'cards/card_기본_템플릿.png'],
      skippedFiles: [],
    });
    expect(message).toContain('2개');
    expect(message).toContain('dungeon-dossier/assets/');
    expect(message).toContain('게임 탭은 새로고침해야 반영됩니다');
    expect(message).not.toContain('게임에 반영');
  });

  it('mentions skipped files only when there are some', () => {
    const none = formatSaveSuccess({
      assetsRoot: 'assets',
      savedFiles: ['bg/a_b_c.png'],
      skippedFiles: [],
    });
    expect(none).not.toContain('건너뛰');

    const some = formatSaveSuccess({
      assetsRoot: 'assets',
      savedFiles: ['bg/a_b_c.png'],
      skippedFiles: ['cards/card_기본_템플릿.png', 'ui/아이콘_평정심_기본.png'],
    });
    expect(some).toContain('2개는 변경이 없어 건너뛰었습니다');
  });

  it('describes an error without leaking a non-error value', () => {
    expect(describeSaveError(new Error('디스크에 쓰지 못했습니다'))).toBe(
      '디스크에 쓰지 못했습니다',
    );
    expect(describeSaveError('네트워크 끊김')).toBe('네트워크 끊김');
    expect(describeSaveError({ weird: true })).toBe('알 수 없는 오류');
  });
});
