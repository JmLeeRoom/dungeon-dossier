import { z } from 'zod';
import { describe, expect, it, vi } from 'vitest';
import {
  ContentValidationError,
  SchemaValidator,
  applyValidationPolicy,
  type InvalidValidationReport,
} from '../../src/content-io/SchemaValidator';
import { ValidatedRuntimeJsonRepository } from '../../src/content-io/RuntimeJsonRepository';

const MinimalCaseSchema = z
  .object({
    case_id: z.string(),
    entities: z.array(z.unknown()),
    events: z.array(z.unknown()),
    claims: z.array(z.unknown()),
    inquiry_routes: z.array(z.unknown()),
    evidence: z.array(z.unknown()),
    proof_rules: z.array(z.unknown()),
    encounters: z.array(z.unknown()),
    events_noncombat: z.array(z.unknown()),
    dialogue: z.record(z.string(), z.unknown()),
  })
  .passthrough();

function validCase(): z.infer<typeof MinimalCaseSchema> {
  return {
    case_id: 'runtime-case',
    entities: [{ entity_id: 'runtime-entity' }],
    events: [{ event_id: 'runtime-event' }],
    claims: [
      {
        claim_id: 'runtime-claim',
        speaker: 'runtime-entity',
        initial: { commitment: 'ASSERTED', presentation: 'NORMAL' },
        truth: {
          relation: 'CONTRADICTED_BY_WORLD',
          contradicting_events: ['runtime-event'],
        },
      },
    ],
    inquiry_routes: [],
    evidence: [
      {
        evidence_id: 'runtime-evidence',
        acquire: { node: 'runtime-node' },
      },
    ],
    proof_rules: [
      {
        rule_id: 'runtime-rule',
        target_claim_id: 'runtime-claim',
        guaranteed_evidence_sets: [['runtime-evidence']],
        known_insufficient_sets: [],
      },
    ],
    encounters: [
      {
        encounter_id: 'runtime-encounter',
        target_entity: 'runtime-entity',
        rounds: [
          {
            round_id: 'runtime-round',
            statement_claims: ['runtime-claim'],
          },
        ],
        flow_nodes: [{ node_id: 'runtime-node' }],
        modifiers: [],
        reaction_key: 'runtime-reaction',
      },
    ],
    events_noncombat: [],
    dialogue: {
      statements: {
        'runtime-claim': { fallback: ['A pre-authored statement.'] },
      },
      reactions: {
        'runtime-reaction': ['A pre-authored reaction.'],
      },
    },
  };
}

describe('SchemaValidator Tier-1', () => {
  it('accepts a schema-valid case with resolved IDs and fallback lines', () => {
    const report = new SchemaValidator().validateCase(
      MinimalCaseSchema,
      validCase(),
      'case.json',
    );

    expect(report.valid).toBe(true);
  });

  it('reports dangling IDs, permanent locks, and missing fallback lines', () => {
    const candidate = validCase();
    candidate.proof_rules = [
      {
        rule_id: 'runtime-rule',
        target_claim_id: 'missing-claim',
        guaranteed_evidence_sets: [['missing-evidence']],
      },
    ];
    candidate.claims = [
      {
        ...(candidate.claims[0] as Record<string, unknown>),
        initial: { commitment: 'ASSERTED', presentation: 'LOCKED' },
        lock: { locked_at_start: true, unlock_conditions: [] },
      },
    ];
    candidate.dialogue = {
      statements: { 'runtime-claim': { fallback: [] } },
      reactions: { 'runtime-reaction': [] },
    };

    const report = new SchemaValidator().validateCase(
      MinimalCaseSchema,
      candidate,
      'case.json',
    );

    expect(report.valid).toBe(false);
    if (report.valid) throw new Error('Expected an invalid report.');
    expect(report.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        'UNRESOLVED_REFERENCE',
        'LOCK_WITHOUT_UNLOCK',
        'MISSING_FALLBACK',
      ]),
    );
  });

  it('requires an explicit common-catalogue registry for external IDs', () => {
    const candidate = validCase();
    candidate.claims = [
      {
        ...(candidate.claims[0] as Record<string, unknown>),
        initial: { commitment: 'ASSERTED', presentation: 'LOCKED' },
        lock: {
          locked_at_start: true,
          unlock_conditions: [
            { type: 'PARTNER_SKILL', skill_id: 'runtime-skill' },
          ],
        },
      },
    ];
    const validator = new SchemaValidator();

    const withoutCatalogue = validator.validateCase(
      MinimalCaseSchema,
      candidate,
      'case.json',
    );
    expect(withoutCatalogue.valid).toBe(false);

    const withCatalogue = validator.validateCase(
      MinimalCaseSchema,
      candidate,
      'case.json',
      { externalIds: new Set(['runtime-skill']) },
    );
    expect(withCatalogue.valid).toBe(true);
  });
});

describe('validation policy and fetch boundary', () => {
  const ValueSchema = z.object({ value: z.number() });

  it('throws a report-bearing error in development mode', () => {
    const report = new SchemaValidator().validate(ValueSchema, { value: 'bad' }, 'value.json');
    expect(() => applyValidationPolicy(report, 'development')).toThrow(ContentValidationError);
  });

  it('skips and reports invalid content in release mode', async () => {
    const reporter = vi.fn<(report: InvalidValidationReport) => void>();
    const fetcher = vi.fn(async () =>
      new Response(JSON.stringify({ value: 'bad' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const repository = new ValidatedRuntimeJsonRepository(ValueSchema, {
      fetcher,
      mode: 'release',
      reporter,
    });

    await expect(repository.load('/content/value.json')).resolves.toBeUndefined();
    expect(reporter).toHaveBeenCalledOnce();
  });

  it('never lets a refinement bypass schema validation', async () => {
    const reporter = vi.fn<(report: InvalidValidationReport) => void>();
    const refine = vi.fn((data: { value: number }, source: string) => ({
      valid: true as const,
      source,
      issues: [],
      data,
    }));
    const repository = new ValidatedRuntimeJsonRepository(ValueSchema, {
      fetcher: async () => new Response(JSON.stringify({ value: 'bad' })),
      mode: 'release',
      reporter,
    });

    await expect(repository.load('/content/value.json', refine)).resolves.toBeUndefined();
    expect(refine).not.toHaveBeenCalled();
    expect(reporter).toHaveBeenCalledOnce();
  });

  it('turns refinement exceptions into a release skip report', async () => {
    const reporter = vi.fn<(report: InvalidValidationReport) => void>();
    const repository = new ValidatedRuntimeJsonRepository(ValueSchema, {
      fetcher: async () => new Response(JSON.stringify({ value: 1 })),
      mode: 'release',
      reporter,
    });

    await expect(
      repository.load('/content/value.json', () => {
        throw new Error('Tier-1 exploded');
      }),
    ).resolves.toBeUndefined();
    expect(reporter).toHaveBeenCalledOnce();
    expect(reporter.mock.calls[0]?.[0].issues[0]?.code).toBe('CONTENT_LOAD_FAILED');
  });
});
