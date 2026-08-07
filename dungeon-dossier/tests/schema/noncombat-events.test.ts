import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  CanvassEventSchema,
  CollectEvidenceEventSchema,
  CURRENT_SAVE_VERSION,
  EnhanceCardEventSchema,
  NonCombatEventSchema,
  RunEffectSchema,
  RunEventCostSchema,
  SaveSchema,
  UnsupportedSaveVersionError,
  migrateSave,
  type NonCombatEventDefinition,
  type SaveData,
} from '../../src/content-io/schemas';

const BASE = {
  event_id: 'event_sample',
  node: 'run-node-1',
  title_key: 'event.sample.title',
  description_key: 'event.sample.description',
} as const;

function enhanceEvent(): unknown {
  return {
    ...BASE,
    pattern: 'D',
    fallback_gains: [{ type: 'ADJUST_RESOURCE', resource: 'dp', delta: 2 }],
    options: [
      {
        option_id: 'option_sharpen',
        label_key: 'event.sample.option.sharpen',
        costs: { dp: 3 },
        eligible_intents: ['CONTRADICT'],
        tuning: { cp_delta: -1, composure_damage_delta: 2 },
        effects: [{ type: 'SET_FLAG', target: 'F-12', value: true }],
      },
      {
        option_id: 'option_soften',
        label_key: 'event.sample.option.soften',
        autoplay_priority: 100,
        tuning: { coercion_delta: -2 },
      },
    ],
  };
}

function canvassEvent(): unknown {
  return {
    ...BASE,
    pattern: 'E',
    attempt_limit: 2,
    per_attempt_costs: { stress: 4 },
    topics: [
      {
        topic_id: 'topic_alibi',
        label_key: 'event.sample.topic.alibi',
        reveal_key: 'event.sample.topic.alibi.reveal',
        effects: [{ type: 'GRANT_EVIDENCE', target: 'ev_sample_note' }],
      },
      {
        topic_id: 'topic_ledger',
        label_key: 'event.sample.topic.ledger',
        reveal_key: 'event.sample.topic.ledger.reveal',
        effects: [{ type: 'OPEN_ROUTE', target: 'route_sample' }],
      },
    ],
  };
}

function collectEvent(): unknown {
  return {
    ...BASE,
    pattern: 'F',
    attempt_limit: 1,
    per_attempt_costs: { stress: 2, trust: 1 },
    targets: [
      {
        target_id: 'target_desk',
        label_key: 'event.sample.target.desk',
        evidence_id: 'ev_sample_receipt',
        grade: 'C',
        effects: [{ type: 'UPGRADE_EVIDENCE', target: 'ev_sample_receipt', to: 'B' }],
      },
      {
        target_id: 'target_locker',
        label_key: 'event.sample.target.locker',
        evidence_id: 'ev_sample_key',
        grade: 'A',
      },
    ],
  };
}

describe('non-combat event schemas D/E/F', () => {
  it('round-trips every new pattern through the discriminated union', () => {
    for (const authored of [enhanceEvent(), canvassEvent(), collectEvent()]) {
      const parsed = NonCombatEventSchema.parse(authored);
      expect(NonCombatEventSchema.parse(parsed)).toEqual(parsed);
    }
  });

  it('keeps the union exhaustive over all six authored patterns', () => {
    expect(
      NonCombatEventSchema.options.map((option) => option.shape.pattern.value),
    ).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
    expectTypeOf<NonCombatEventDefinition['pattern']>().toEqualTypeOf<
      'A' | 'B' | 'C' | 'D' | 'E' | 'F'
    >();
  });

  it('applies authored defaults instead of leaving optional D fields undefined', () => {
    const parsed = EnhanceCardEventSchema.parse(enhanceEvent());
    const [, soften] = parsed.options;
    if (soften === undefined) throw new Error('Expected the second D option.');
    expect(soften.eligible_intents).toEqual([]);
    expect(soften.effects).toEqual([]);
    expect(parsed.options[0]?.autoplay_priority).toBe(0);
  });

  it('rejects unknown keys on every new pattern', () => {
    for (const [schema, authored] of [
      [EnhanceCardEventSchema, enhanceEvent()],
      [CanvassEventSchema, canvassEvent()],
      [CollectEvidenceEventSchema, collectEvent()],
    ] as const) {
      expect(
        schema.safeParse({ ...(authored as object), sets_flags: { 'F-01': true } })
          .success,
      ).toBe(false);
    }
    expect(
      RunEffectSchema.safeParse({
        type: 'GRANT_EVIDENCE',
        target: 'ev_sample_note',
        parameters: {},
      }).success,
    ).toBe(false);
  });

  it('enforces the authored minimum sizes for options, topics, and targets', () => {
    const single = enhanceEvent() as { options: unknown[]; fallback_gains: unknown[] };
    expect(
      EnhanceCardEventSchema.safeParse({ ...single, options: single.options.slice(0, 1) })
        .success,
    ).toBe(false);
    expect(
      EnhanceCardEventSchema.safeParse({ ...single, fallback_gains: [] }).success,
    ).toBe(false);

    const canvass = canvassEvent() as { topics: { effects: unknown[] }[] };
    expect(
      CanvassEventSchema.safeParse({ ...canvass, topics: canvass.topics.slice(0, 1) })
        .success,
    ).toBe(false);
    expect(
      CanvassEventSchema.safeParse({
        ...canvass,
        topics: canvass.topics.map((topic) => ({ ...topic, effects: [] })),
      }).success,
    ).toBe(false);

    const collect = collectEvent() as { targets: unknown[]; attempt_limit: number };
    expect(
      CollectEvidenceEventSchema.safeParse({
        ...collect,
        targets: collect.targets.slice(0, 1),
      }).success,
    ).toBe(false);
    expect(
      CollectEvidenceEventSchema.safeParse({ ...collect, attempt_limit: 0 }).success,
    ).toBe(false);
  });

  it('rejects no-op tuning and out-of-range card deltas', () => {
    const authored = enhanceEvent() as { options: { tuning: unknown }[] };
    const noop = {
      ...authored,
      options: authored.options.map((option) => ({ ...option, tuning: { cp_delta: 0 } })),
    };
    expect(EnhanceCardEventSchema.safeParse(noop).success).toBe(false);

    const fractionalCp = {
      ...authored,
      options: authored.options.map((option) => ({ ...option, tuning: { cp_delta: 1.5 } })),
    };
    expect(EnhanceCardEventSchema.safeParse(fractionalCp).success).toBe(false);

    const overflow = {
      ...authored,
      options: authored.options.map((option) => ({
        ...option,
        tuning: { coercion_delta: 10_001 },
      })),
    };
    expect(EnhanceCardEventSchema.safeParse(overflow).success).toBe(false);
  });

  it('narrows run costs and run effects to the resources a run actually owns', () => {
    expect(RunEventCostSchema.safeParse({ stress: 2 }).success).toBe(true);
    expect(RunEventCostSchema.safeParse({ cp: 2 }).success).toBe(false);
    expect(RunEventCostSchema.safeParse({ stress: 0 }).success).toBe(false);
    expect(RunEventCostSchema.safeParse({ stress: -1 }).success).toBe(false);

    expect(
      RunEffectSchema.safeParse({ type: 'ADJUST_RESOURCE', resource: 'cp', delta: 1 })
        .success,
    ).toBe(false);
    expect(
      RunEffectSchema.safeParse({ type: 'ADJUST_RESOURCE', resource: 'dp', delta: 0 })
        .success,
    ).toBe(false);
    expect(RunEffectSchema.safeParse({ type: 'UPGRADE_EVIDENCE', target: 'ev_x' }).success)
      .toBe(false);
    expect(
      RunEffectSchema.safeParse({ type: 'SET_FLAG', target: 'F-01', value: { on: true } })
        .success,
    ).toBe(false);
    expect(RunEffectSchema.safeParse({ type: 'DRAW_CARDS', target: 'card_x' }).success)
      .toBe(false);
  });
});

function saveWithRun(): SaveData {
  return {
    save_version: CURRENT_SAVE_VERSION,
    case_id: 'case_sample',
    content_version: '1.0',
    run_seed: 7,
    claims: [],
    evidence: [],
    deck: {
      draw_pile: [],
      hand: [],
      discard_pile: [],
      exhaust_pile: [],
      locked_cards: {},
    },
    flags: {},
    resources: { cp: 0, stress: 90, dp: 4, composure: 0, coercion: 0, trust: 1, turn: 0 },
    encounter: null,
    used_routes: [],
    acquired_relics: [],
    acquired_enhancements: [],
    run: {
      node_index: 1,
      reward_seed_stream: 12,
      false_confessions: 0,
      completed_node_ids: ['run-node-1'],
      pending_reward_ids: [],
      claimed_reward_ids: [],
      acquired_evidence_ids: ['ev_sample_receipt'],
      grade_history: [],
      outcome_history: [],
      card_tuning: {
        card_press: { cp_delta: -1, composure_damage_delta: 2, coercion_delta: -0.5 },
      },
      canvassed_topic_ids: ['topic_alibi'],
      evidence_grade_by_id: { ev_sample_receipt: 'B' },
      open_route_ids: ['route_sample'],
      retry_count: 2,
      terminal: false,
    },
  };
}

const V2_RUN_FIELDS = [
  'card_tuning',
  'canvassed_topic_ids',
  'evidence_grade_by_id',
  'open_route_ids',
  'retry_count',
] as const;

function withoutKeys(
  source: Readonly<Record<string, unknown>>,
  omitted: readonly string[],
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(source).filter(([key]) => !omitted.includes(key)),
  );
}

describe('save schema v2', () => {
  it('round-trips the pattern D/E/F run fields', () => {
    const save = saveWithRun();
    expect(SaveSchema.parse(save)).toEqual(save);
    expect(migrateSave(save)).toEqual(save);
  });

  it('rejects tuning outside the authored accumulation bound', () => {
    const save = saveWithRun();
    if (save.run === undefined) throw new Error('Fixture must carry a run boundary.');
    expect(
      SaveSchema.safeParse({
        ...save,
        run: {
          ...save.run,
          card_tuning: {
            card_press: {
              cp_delta: 10_001,
              composure_damage_delta: 0,
              coercion_delta: 0,
            },
          },
        },
      }).success,
    ).toBe(false);
    expect(
      SaveSchema.safeParse({
        ...save,
        run: {
          ...save.run,
          card_tuning: {
            card_press: { cp_delta: 0.5, composure_damage_delta: 0, coercion_delta: 0 },
          },
        },
      }).success,
    ).toBe(false);
    expect(
      SaveSchema.safeParse({ ...save, run: { ...save.run, retry_count: -1 } }).success,
    ).toBe(false);
  });

  it('migrates a v1 run boundary to explicit empty v2 defaults', () => {
    const save = saveWithRun();
    if (save.run === undefined) throw new Error('Fixture must carry a run boundary.');
    const legacyRun = withoutKeys(save.run, V2_RUN_FIELDS);
    const legacy = { ...save, save_version: 1, run: legacyRun };

    const migrated = migrateSave(legacy);
    expect(migrated.save_version).toBe(CURRENT_SAVE_VERSION);
    expect(migrated.run).toEqual({
      ...legacyRun,
      card_tuning: {},
      canvassed_topic_ids: [],
      evidence_grade_by_id: {},
      open_route_ids: [],
      retry_count: 0,
    });
  });

  it('migrates a v1 save that predates the run layer without inventing a boundary', () => {
    const envelope = withoutKeys(saveWithRun(), ['run']);
    const migrated = migrateSave({ ...envelope, save_version: 1 });
    expect(migrated.run).toBeUndefined();
    expect(migrated.save_version).toBe(CURRENT_SAVE_VERSION);
  });

  it('refuses versions it has no migration for', () => {
    expect(() => migrateSave({ ...saveWithRun(), save_version: 3 })).toThrow(
      UnsupportedSaveVersionError,
    );
  });
});
