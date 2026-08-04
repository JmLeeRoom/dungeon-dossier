import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { PNG } from 'pngjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createEncounterSession } from '../../src/app/createEncounterSession';
import {
  BalanceSchema,
  CardsSchema,
  CaseSchema,
  type BalanceDefinition,
  type CardsDefinition,
  type CaseDefinition,
} from '../../src/engine/domain';
import { buildAssetRegistry } from '../../src/ui/core/assetRegistry';

const execFileAsync = promisify(execFile);
const PROJECT_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const TOOL_PATH = fileURLToPath(
  new URL('../../tools/placeholder/index.mjs', import.meta.url),
);
const CONFIG_PATH = fileURLToPath(
  new URL('../../tools/placeholder/placeholders.json', import.meta.url),
);
const PORTRAIT_DIRECTORY = fileURLToPath(
  new URL('../../assets/portraits/', import.meta.url),
);

const PORTRAIT_NAMES = [
  '물컹이',
  '하피',
  '미노타우로스',
  '고블린',
  '오크',
  '드워프',
  '사이클롭스',
  '서큐버스',
  '타락한_용사',
  '김태훈',
  '김_인턴',
  '켄타우로스',
] as const;

const ENCOUNTER_PORTRAITS = new Map<string, string>([
  ['enc_tutorial_slime', '물컹이'],
  ['enc_tutorial_harpy', '하피'],
  ['enc_tutorial_minotaur', '미노타우로스'],
  ['enc_ep001_goblin', '고블린'],
  ['enc_ep001_orc', '오크'],
  ['enc_ep001_succubus', '서큐버스'],
  ['enc_ep004_dwarf', '드워프'],
  ['enc_ep004_cyclops', '사이클롭스'],
  ['enc_ep004_fallen_hero', '타락한_용사'],
]);

interface PixelSummary {
  readonly colours: number;
  readonly transparent: number;
  readonly visible: number;
}

function pixelSummary(png: PNG): PixelSummary {
  const colours = new Set<string>();
  let transparent = 0;
  let visible = 0;
  for (let offset = 0; offset < png.data.length; offset += 4) {
    const rgba = [
      png.data[offset],
      png.data[offset + 1],
      png.data[offset + 2],
      png.data[offset + 3],
    ];
    colours.add(rgba.join(','));
    if (rgba[3] === 0) transparent += 1;
    else visible += 1;
  }
  return { colours: colours.size, transparent, visible };
}

function execErrorStderr(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'stderr' in error &&
    typeof error.stderr === 'string'
  ) {
    return error.stderr;
  }
  throw error;
}

async function runPlaceholder(
  outputDirectory: string,
  extraArguments: readonly string[],
) {
  return execFileAsync(
    process.execPath,
    [TOOL_PATH, '--output', outputDirectory, ...extraArguments],
    { cwd: PROJECT_ROOT, encoding: 'utf8' },
  );
}

async function loadJson(relativePath: string): Promise<unknown> {
  return JSON.parse(
    await readFile(new URL(`../../content/${relativePath}`, import.meta.url), 'utf8'),
  ) as unknown;
}

describe('portrait placeholder catalog', () => {
  let temporaryDirectory = '';
  let cases: readonly CaseDefinition[];
  let cards: CardsDefinition;
  let balance: BalanceDefinition;

  beforeAll(async () => {
    temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'dossier-portraits-test-'));
    const [tutorial, ep001, ep004, loadedCards, loadedBalance] = await Promise.all([
      loadJson('cases/tutorial/case.json'),
      loadJson('cases/ep001/case.json'),
      loadJson('cases/ep004/case.json'),
      loadJson('common/cards.json'),
      loadJson('common/balance.json'),
    ]);
    cases = [tutorial, ep001, ep004].map((definition) =>
      CaseSchema.parse(definition),
    );
    cards = CardsSchema.parse(loadedCards);
    balance = BalanceSchema.parse(loadedBalance);
  });

  afterAll(async () => {
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  it('generates 12 bases, 12 transparent parts sheets, and 12 manifests deterministically', async () => {
    await runPlaceholder(temporaryDirectory, ['--config', CONFIG_PATH]);
    const generatedDirectory = path.join(temporaryDirectory, 'portraits');
    const files = await readdir(generatedDirectory);
    const baseFiles = files.filter((file) => file.endsWith('_base.png')).sort();
    const partsFiles = files.filter((file) => file.endsWith('_parts.png')).sort();
    const manifests = files.filter((file) => file.endsWith('.parts.json')).sort();
    expect(baseFiles).toHaveLength(12);
    expect(partsFiles).toHaveLength(12);
    expect(manifests).toHaveLength(12);

    const firstBytes = new Map<string, Buffer>();
    for (const name of PORTRAIT_NAMES) {
      const baseName = `portrait_${name}_base.png`;
      const partsName = `portrait_${name}_parts.png`;
      const manifestName = `portrait_${name}.parts.json`;
      const baseBytes = await readFile(path.join(generatedDirectory, baseName));
      const partsBytes = await readFile(path.join(generatedDirectory, partsName));
      const manifestBytes = await readFile(path.join(generatedDirectory, manifestName));
      firstBytes.set(baseName, baseBytes);
      firstBytes.set(partsName, partsBytes);
      firstBytes.set(manifestName, manifestBytes);

      const base = PNG.sync.read(baseBytes);
      const parts = PNG.sync.read(partsBytes);
      expect({ width: base.width, height: base.height }).toEqual({
        width: 196,
        height: 216,
      });
      expect({ width: parts.width, height: parts.height }).toEqual({
        width: 96,
        height: 40,
      });
      const baseSummary = pixelSummary(base);
      const partsSummary = pixelSummary(parts);
      expect(baseSummary.colours).toBeLessThanOrEqual(16);
      expect(partsSummary.colours).toBeLessThanOrEqual(16);
      expect(partsSummary.transparent).toBeGreaterThan(0);
      expect(partsSummary.visible).toBeGreaterThan(0);

      expect(JSON.parse(manifestBytes.toString('utf8'))).toEqual({
        schema_version: '1.0',
        base: {
          slot: 'portrait-base',
          image: baseName,
        },
        parts: {
          slot: 'portrait-parts',
          image: partsName,
          origin: 'portrait-base',
          x: 50,
          y: 44,
          width: 96,
          height: 40,
          stage_x: 272,
          stage_y: 84,
        },
      });
      expect(manifestBytes.toString('utf8').endsWith('\n')).toBe(true);
    }

    await runPlaceholder(temporaryDirectory, ['--config', CONFIG_PATH, '--force']);
    for (const [file, expected] of firstBytes) {
      expect(await readFile(path.join(generatedDirectory, file)), file).toEqual(expected);
    }

    const manifestPath = path.join(
      generatedDirectory,
      'portrait_타락한_용사.parts.json',
    );
    const canonicalManifest = firstBytes.get('portrait_타락한_용사.parts.json');
    if (canonicalManifest === undefined) throw new Error('Missing canonical manifest bytes.');
    const sentinel = Buffer.from('do-not-overwrite-manifest');
    await writeFile(manifestPath, sentinel);
    const skipped = await runPlaceholder(temporaryDirectory, ['--config', CONFIG_PATH]);
    expect(skipped.stderr).toContain('Skipped existing');
    expect(await readFile(manifestPath)).toEqual(sentinel);
    await runPlaceholder(temporaryDirectory, ['--config', CONFIG_PATH, '--force']);
    expect(await readFile(manifestPath)).toEqual(canonicalManifest);
  }, 30_000);

  it('rejects an orphan parts sheet and preserves underscored multiword names', async () => {
    const orphanDirectory = path.join(temporaryDirectory, 'orphan');
    let orphanStderr = '';
    try {
      await runPlaceholder(orphanDirectory, [
        '--category',
        'portrait',
        '--name',
        '없는_용의자',
        '--state',
        'parts',
        '--width',
        '96',
        '--height',
        '40',
      ]);
    } catch (error) {
      orphanStderr = execErrorStderr(error);
    }
    expect(orphanStderr).toContain('requires same-name base');

    const manifest = JSON.parse(
      await readFile(
        path.join(
          temporaryDirectory,
          'portraits',
          'portrait_김_인턴.parts.json',
        ),
        'utf8',
      ),
    ) as { base: { image: string }; parts: { image: string; x: number; y: number } };
    expect(manifest.base.image).toBe('portrait_김_인턴_base.png');
    expect(manifest.parts).toMatchObject({
      image: 'portrait_김_인턴_parts.png',
      x: 50,
      y: 44,
    });
  });

  it('builds exactly the 24 checked-in runtime portrait keys', async () => {
    const files = (await readdir(PORTRAIT_DIRECTORY))
      .filter((file) => file.endsWith('.png'))
      .sort();
    const registry = buildAssetRegistry(
      Object.fromEntries(
        files.map((file) => [
          `/assets/portraits/${file}`,
          `/generated/${file}`,
        ]),
      ),
    );
    const expectedKeys = PORTRAIT_NAMES.flatMap((name) => [
      `portrait/${name}/base`,
      `portrait/${name}/parts`,
    ]).sort();

    expect([...registry.keys()].sort()).toEqual(expectedKeys);
  });

  it('maps all nine encounter races to real portrait slots and the intern partner', async () => {
    const registry = buildAssetRegistry(
      Object.fromEntries(
        (await readdir(PORTRAIT_DIRECTORY))
          .filter((file) => file.endsWith('.png'))
          .map((file) => [`/assets/portraits/${file}`, `/generated/${file}`]),
      ),
    );

    for (const [encounterId, portraitName] of ENCOUNTER_PORTRAITS) {
      const definition = cases.find((candidate) =>
        candidate.encounters.some((encounter) => encounter.encounter_id === encounterId),
      );
      if (definition === undefined) throw new Error(`Missing case for ${encounterId}.`);
      const session = await createEncounterSession({
        encounterId,
        caseRepository: { load: async () => definition },
        cardRepository: { load: async () => cards },
        balanceRepository: { reload: async () => balance },
      });
      const model = session.currentModel();
      expect(model.portraitBaseAssetKey).toBe(`portrait/${portraitName}/base`);
      expect(model.portraitPartsAssetKey).toBe(`portrait/${portraitName}/parts`);
      expect(model.partnerAssetKey).toBe('portrait/김_인턴/base');
      const { portraitBaseAssetKey, portraitPartsAssetKey, partnerAssetKey } = model;
      if (
        portraitBaseAssetKey === undefined ||
        portraitPartsAssetKey === undefined ||
        partnerAssetKey === undefined
      ) {
        throw new Error(`Missing portrait asset keys for ${encounterId}.`);
      }
      expect(registry.has(portraitBaseAssetKey)).toBe(true);
      expect(registry.has(portraitPartsAssetKey)).toBe(true);
      expect(registry.has(partnerAssetKey)).toBe(true);
    }
  });
});
