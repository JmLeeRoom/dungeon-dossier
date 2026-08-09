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
import { SUSPECT_ASSET_SETS } from '../../src/app/uiAssetBindings';
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

  it('generates 12 bases, 24 transparent state sheets, and 12 manifests deterministically', async () => {
    await runPlaceholder(temporaryDirectory, ['--config', CONFIG_PATH]);
    const generatedDirectory = path.join(temporaryDirectory, 'portraits');
    const files = await readdir(generatedDirectory);
    const baseFiles = files.filter((file) => file.endsWith('_base.png')).sort();
    const statePartFiles = files
      .filter((file) => file.endsWith('_upset.png') || file.endsWith('_lose.png'))
      .sort();
    const manifests = files.filter((file) => file.endsWith('.state-parts.json')).sort();
    expect(baseFiles).toHaveLength(12);
    expect(statePartFiles).toHaveLength(24);
    expect(manifests).toHaveLength(12);

    const firstBytes = new Map<string, Buffer>();
    for (const name of PORTRAIT_NAMES) {
      const baseName = `portrait_${name}_base.png`;
      const manifestName = `portrait_${name}.state-parts.json`;
      const baseBytes = await readFile(path.join(generatedDirectory, baseName));
      const manifestBytes = await readFile(path.join(generatedDirectory, manifestName));
      firstBytes.set(baseName, baseBytes);
      firstBytes.set(manifestName, manifestBytes);

      const base = PNG.sync.read(baseBytes);
      expect({ width: base.width, height: base.height }).toEqual({
        width: 512,
        height: 512,
      });
      expect(pixelSummary(base).colours).toBeLessThanOrEqual(16);

      for (const state of ['upset', 'lose'] as const) {
        const partsName = `portrait_${name}_${state}.png`;
        const partsBytes = await readFile(path.join(generatedDirectory, partsName));
        firstBytes.set(partsName, partsBytes);
        const parts = PNG.sync.read(partsBytes);
        expect({ width: parts.width, height: parts.height }).toEqual({
          width: 512,
          height: 512,
        });
        const partsSummary = pixelSummary(parts);
        expect(partsSummary.colours).toBeLessThanOrEqual(16);
        expect(partsSummary.transparent).toBeGreaterThan(0);
        expect(partsSummary.visible).toBeGreaterThan(0);
      }

      expect(JSON.parse(manifestBytes.toString('utf8'))).toEqual({
        schema_version: '2.0',
        base: {
          slot: 'suspect-base',
          image: baseName,
          width: 512,
          height: 512,
        },
        state_parts: [
          {
            state: 'upset',
            slot: 'suspect-state-parts',
            image: `portrait_${name}_upset.png`,
            origin: 'suspect-base',
            x: 0,
            y: 0,
            width: 512,
            height: 512,
          },
          {
            state: 'lose',
            slot: 'suspect-state-parts',
            image: `portrait_${name}_lose.png`,
            origin: 'suspect-base',
            x: 0,
            y: 0,
            width: 512,
            height: 512,
          },
        ],
      });
      expect(manifestBytes.toString('utf8').endsWith('\n')).toBe(true);
    }

    await runPlaceholder(temporaryDirectory, ['--config', CONFIG_PATH, '--force']);
    for (const [file, expected] of firstBytes) {
      expect(await readFile(path.join(generatedDirectory, file)), file).toEqual(expected);
    }

    const manifestPath = path.join(
      generatedDirectory,
      'portrait_타락한_용사.state-parts.json',
    );
    const canonicalManifest = firstBytes.get('portrait_타락한_용사.state-parts.json');
    if (canonicalManifest === undefined) throw new Error('Missing canonical manifest bytes.');
    const sentinel = Buffer.from('do-not-overwrite-manifest');
    await writeFile(manifestPath, sentinel);
    const skipped = await runPlaceholder(temporaryDirectory, ['--config', CONFIG_PATH]);
    expect(skipped.stderr).toContain('Skipped existing');
    expect(await readFile(manifestPath)).toEqual(sentinel);
    await runPlaceholder(temporaryDirectory, ['--config', CONFIG_PATH, '--force']);
    expect(await readFile(manifestPath)).toEqual(canonicalManifest);
  }, 30_000);

  it('rejects an orphan state sheet and preserves underscored multiword names', async () => {
    const orphanDirectory = path.join(temporaryDirectory, 'orphan');
    let orphanStderr = '';
    try {
      await runPlaceholder(orphanDirectory, [
        '--category',
        'portrait',
        '--name',
        '없는_용의자',
        '--state',
        'upset',
        '--width',
        '512',
        '--height',
        '512',
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
          'portrait_김_인턴.state-parts.json',
        ),
        'utf8',
      ),
    ) as {
      base: { image: string };
      state_parts: readonly { state: string; image: string; x: number; y: number }[];
    };
    expect(manifest.base.image).toBe('portrait_김_인턴_base.png');
    expect(manifest.state_parts.map((part) => part.state)).toEqual(['upset', 'lose']);
    expect(manifest.state_parts[0]).toMatchObject({
      image: 'portrait_김_인턴_upset.png',
      x: 0,
      y: 0,
    });
  });

  it('builds the 37 generated portrait keys and the 20 imported idle sheets side by side', async () => {
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
    const generatedKeys = [
      ...PORTRAIT_NAMES.flatMap((name) => [
        `portrait/${name}/base`,
        `portrait/${name}/upset`,
        `portrait/${name}/lose`,
      ]),
      'portrait/김_인턴/used',
    ];
    // Approved art lands beside the generated set rather than overwriting it:
    // only four suspects have an approved alias, so the rest still need their
    // placeholder to exist.
    const importedKeys = [
      ...['bensi', 'goblin', 'kimyongsa', 'minota', 'mulkung', 'succuba'].flatMap((name) => [
        `idle/${name}/base`,
        `idle/${name}/upset`,
        `idle/${name}/lose`,
      ]),
      'idle/coffee/base',
      'idle/coffee/used',
    ];

    expect([...registry.keys()].sort()).toEqual([...generatedKeys, ...importedKeys].sort());
    expect(generatedKeys).toHaveLength(37);
    expect(importedKeys).toHaveLength(20);
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
      const assetSet = model.suspectAssetSet;
      if (assetSet === undefined) throw new Error(`Missing suspect art for ${encounterId}.`);
      const approved = SUSPECT_ASSET_SETS[portraitName];
      if (approved === undefined) {
        // No approved art: the generated overlay sheets stay, unchanged.
        expect(assetSet).toEqual({
          base: `portrait/${portraitName}/base`,
          upset: `portrait/${portraitName}/upset`,
          lose: `portrait/${portraitName}/lose`,
          stateMode: 'overlay',
        });
      } else {
        // Approved art is whole-frame, so a state swap replaces rather than
        // stacks a second character on top of the first.
        expect(assetSet).toEqual(approved);
        expect(assetSet.stateMode).toBe('replace');
      }
      expect(model.partnerBaseAssetKey).toBe('idle/coffee/base');
      expect(model.partnerUsedAssetKey).toBe('idle/coffee/used');
      const keys = [
        assetSet.base,
        assetSet.upset,
        assetSet.lose,
        model.partnerBaseAssetKey,
        model.partnerUsedAssetKey,
      ];
      for (const key of keys) {
        if (key === undefined) throw new Error(`Missing portrait asset keys for ${encounterId}.`);
        expect(registry.has(key), key).toBe(true);
      }
    }
  });
});
