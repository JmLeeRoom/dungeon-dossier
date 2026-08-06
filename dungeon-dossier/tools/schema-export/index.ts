import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { z } from 'zod';

import {
  BalanceSchema,
  CardsSchema,
  CaseSchema,
  EnhancementsSchema,
  FlagsSchema,
  GradesSchema,
  JudgmentUiMapSchema,
  RelicsSchema,
  RewardsSchema,
  RunStripSchema,
  SaveSchema,
  StringsSchema,
} from '../../src/content-io/schemas';

export const JSON_SCHEMA_EXPORTS = [
  ['case.schema.json', CaseSchema],
  ['cards.schema.json', CardsSchema],
  ['balance.schema.json', BalanceSchema],
  ['flags.schema.json', FlagsSchema],
  ['enhancements.schema.json', EnhancementsSchema],
  ['relics.schema.json', RelicsSchema],
  ['rewards.schema.json', RewardsSchema],
  ['grades.schema.json', GradesSchema],
  ['judgment-ui-map.schema.json', JudgmentUiMapSchema],
  ['run-strip.schema.json', RunStripSchema],
  ['save.schema.json', SaveSchema],
  ['strings.schema.json', StringsSchema],
] as const;

export const JSON_SCHEMA_MANIFEST = JSON_SCHEMA_EXPORTS.map(([fileName]) => fileName);

export async function exportJsonSchemas(
  outputDirectory = resolve(process.cwd(), 'schemas'),
): Promise<readonly string[]> {
  await mkdir(outputDirectory, { recursive: true });

  const outputPaths: string[] = [];
  for (const [fileName, schema] of JSON_SCHEMA_EXPORTS) {
    const generated = z.toJSONSchema(schema, {
      target: 'draft-2020-12',
      reused: 'ref',
    });
    const document = {
      ...generated,
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      $id: `./${fileName}`,
    };
    const outputPath = resolve(outputDirectory, fileName);
    await writeFile(outputPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
    outputPaths.push(outputPath);
  }

  return outputPaths;
}
