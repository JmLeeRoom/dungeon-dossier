import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { PNG } from 'pngjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const PROJECT_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const TOOL_PATH = fileURLToPath(
  new URL('../../tools/placeholder/index.mjs', import.meta.url),
);
const CONFIG_PATH = fileURLToPath(
  new URL('../../tools/placeholder/placeholders.json', import.meta.url),
);

function visibleColourCount(png: PNG): number {
  const colours = new Set<string>();
  for (let offset = 0; offset < png.data.length; offset += 4) {
    const alpha = png.data[offset + 3];
    if (alpha === 0) continue;
    colours.add(
      `${png.data[offset]},${png.data[offset + 1]},${png.data[offset + 2]},${alpha}`,
    );
  }
  return colours.size;
}

async function runPlaceholder(
  outputDirectory: string,
  extraArguments: readonly string[],
): Promise<Readonly<{ stdout: string; stderr: string }>> {
  return execFileAsync(
    process.execPath,
    [TOOL_PATH, '--output', outputDirectory, ...extraArguments],
    { cwd: PROJECT_ROOT, encoding: 'utf8' },
  );
}

describe('tools/placeholder CLI', () => {
  let temporaryDirectory = '';

  beforeEach(async () => {
    temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'dossier-placeholder-test-'));
  });

  afterEach(async () => {
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  it('generates deterministic named dimensions with no more than sixteen colours', async () => {
    const argumentsList = [
      '--category',
      'placeholder',
      '--name',
      'fixture',
      '--state',
      'fallback',
      '--width',
      '37',
      '--height',
      '41',
      '--label',
      'TEST 01',
      '--theme',
      'cyan',
    ] as const;
    const filePath = path.join(
      temporaryDirectory,
      'placeholder_fixture_fallback.png',
    );

    await runPlaceholder(temporaryDirectory, argumentsList);
    const firstBytes = await readFile(filePath);
    const firstPng = PNG.sync.read(firstBytes);
    expect({ width: firstPng.width, height: firstPng.height }).toEqual({
      width: 37,
      height: 41,
    });
    expect(visibleColourCount(firstPng)).toBeLessThanOrEqual(16);

    const sentinel = Buffer.from('do-not-overwrite');
    await writeFile(filePath, sentinel);
    const skipped = await runPlaceholder(temporaryDirectory, argumentsList);
    expect(await readFile(filePath)).toEqual(sentinel);
    expect(skipped.stderr).toContain('Skipped existing');

    await runPlaceholder(temporaryDirectory, [...argumentsList, '--force']);
    const forcedBytes = await readFile(filePath);
    expect(PNG.sync.read(forcedBytes)).toMatchObject({ width: 37, height: 41 });
    expect(forcedBytes).toEqual(firstBytes);
  });

  it('uses the checked-in config to create the runtime fallback and representative variants', async () => {
    await runPlaceholder(temporaryDirectory, ['--config', CONFIG_PATH]);

    const expected = [
      ['ui/placeholder_missing_fallback.png', 64, 64],
      ['bg/배경_심문실_시안.png', 1280, 800],
      ['bg/배경_심문실_세피아.png', 1280, 800],
      ['bg/배경_심문실_마젠타.png', 1280, 800],
      ['fg/전경_책상_기본.png', 1280, 236],
      ['portraits/portrait_물컹이_base.png', 512, 512],
      ['portraits/portrait_하피_base.png', 512, 512],
      ['portraits/portrait_미노타우로스_base.png', 512, 512],
      ['cards/card_기본_템플릿.png', 640, 725],
      ['cards/card_질문_일러.png', 256, 256],
      ['evidence/ev_사건_증거1.png', 128, 128],
      ['ui/아이콘_평정심_기본.png', 32, 32],
      ['ui/아이콘_강압_기본.png', 32, 32],
    ] as const;

    for (const [relativePath, width, height] of expected) {
      const png = PNG.sync.read(
        await readFile(path.join(temporaryDirectory, relativePath)),
      );
      expect(
        {
          width: png.width,
          height: png.height,
          colours: visibleColourCount(png),
        },
        relativePath,
      ).toEqual({ width, height, colours: 8 });
    }
  });
});
