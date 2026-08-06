import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import {
  exportJsonSchemas,
  JSON_SCHEMA_MANIFEST,
} from '../../tools/schema-export';

const writesProjectSchemas = process.env.npm_lifecycle_event === 'schema:export';
const temporaryDirectory = writesProjectSchemas
  ? undefined
  : await mkdtemp(resolve(tmpdir(), 'dungeon-dossier-schemas-'));
const outputDirectory = temporaryDirectory ?? resolve(process.cwd(), 'schemas');

afterAll(async () => {
  if (temporaryDirectory !== undefined) {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

describe('JSON Schema export', () => {
  it('exports the complete draft 2020-12 manifest from Zod', async () => {
    const paths = await exportJsonSchemas(outputDirectory);
    expect(paths.map((path) => path.split(/[\\/]/u).at(-1))).toEqual(
      JSON_SCHEMA_MANIFEST,
    );
    expect(JSON_SCHEMA_MANIFEST).toHaveLength(12);

    for (const fileName of JSON_SCHEMA_MANIFEST) {
      const document = JSON.parse(
        await readFile(resolve(outputDirectory, fileName), 'utf8'),
      ) as Record<string, unknown>;
      expect(document.$schema).toBe(
        'https://json-schema.org/draft/2020-12/schema',
      );
      expect(document.$id).toBe(`./${fileName}`);
    }
  });

  it('keeps checked-in editor schemas synchronized with the Zod source', async () => {
    await exportJsonSchemas(outputDirectory);
    const projectSchemaDirectory = resolve(process.cwd(), 'schemas');

    for (const fileName of JSON_SCHEMA_MANIFEST) {
      const generated = await readFile(resolve(outputDirectory, fileName), 'utf8');
      const checkedIn = await readFile(resolve(projectSchemaDirectory, fileName), 'utf8');
      expect(checkedIn).toBe(generated);
    }
  });
});
