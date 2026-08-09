import { describe, expect, it } from 'vitest';
import {
  validateCaseTier2AndTier3,
  type RunOrder,
} from '../../src/content-io/ContentSemanticValidator';
import { CaseSchema, type CaseDefinition } from '../../src/engine/domain';

const FIXTURE_PATH = 'cases/frontier/case.json';
const FRONTIER_CODE = 'PROOF_PATH_NOT_YET_ACQUIRABLE';

const SUSPECT_ID = 'ent_frontier_suspect';
const FIRST_NODE = 'node_frontier_first';
const SECOND_NODE = 'node_frontier_second';
const THIRD_NODE = 'node_frontier_third';
const EVENT_NODE = 'node_frontier_sweep';
const OFF_STRIP_NODE = 'node_frontier_offstrip';
const LATE_ROUTE = 'route_frontier_late';
const GATE_FLAG = 'F_frontier_gate';

type AcquireMethod = 'STARTING' | 'INQUIRY' | 'FLAG_HOOK' | 'EVENT_RESULT';

interface EvidenceSpec {
  readonly id: string;
  readonly node: string;
  readonly method: AcquireMethod;
}

interface RuleSpec {
  readonly claimId: string;
  readonly sets: readonly (readonly string[])[];
}

interface CaseSpec {
  readonly evidence: readonly EvidenceSpec[];
  readonly claims: readonly string[];
  readonly rules: readonly RuleSpec[];
  readonly encounters: readonly unknown[];
  readonly events?: readonly unknown[];
  readonly routes?: readonly unknown[];
}

function evidenceEntry(spec: EvidenceSpec): unknown {
  return {
    evidence_id: spec.id,
    title_key: `frontier.${spec.id}.title`,
    acquire: { node: spec.node, method: spec.method },
    source_category: 'DOCUMENT',
    independence: { source_id: `src_${spec.id}`, group: 'DOCUMENT', derived_from: null },
    grade: { initial: 'A', upgrades: [] },
    observations: [
      {
        predicate: 'records',
        summary_key: `frontier.${spec.id}.summary`,
        scopes: ['IDENTITY'],
        detail: {},
        confidence: 0.9,
      },
    ],
    not_proven_keys: [`frontier.${spec.id}.not_proven`],
  };
}

const ROUND_FACETS = ['WHO', 'WHEN', 'WHERE', 'WHAT', 'HOW', 'WHY'] as const;

function roundClaimIds(claimId: string): readonly string[] {
  return ROUND_FACETS.map((facet) =>
    facet === 'WHO' ? claimId : `${claimId}_${facet.toLowerCase()}`,
  );
}

function claimEntry(claimId: string, facet: (typeof ROUND_FACETS)[number]): unknown {
  return {
    claim_id: claimId,
    speaker: SUSPECT_ID,
    facet,
    canonical_meaning: 'the suspect denies being present',
    predicate: 'denies',
    initial: { commitment: 'ASSERTED', presentation: 'NORMAL' },
    is_required: true,
    truth: { relation: 'CONTRADICTED_BY_WORLD', contradicting_events: [] },
  };
}

function ruleEntry(spec: RuleSpec): unknown {
  return {
    rule_id: `rule_${spec.claimId}`,
    target_claim_id: spec.claimId,
    direction: 'CONTRADICT',
    requirements: {
      required_scopes: ['IDENTITY'],
      minimum_confidence: 0.5,
      minimum_independent_sources: 1,
    },
    guaranteed_evidence_sets: spec.sets,
  };
}

function encounterEntry(encounterId: string, nodeId: string, claimId: string): unknown {
  return {
    encounter_id: encounterId,
    target_entity: SUSPECT_ID,
    resources: {
      composure_max: 10,
      cp_per_turn: 3,
      cp_max: 9,
      coercion_limit: 5,
      shields_per_round: 2,
    },
    rounds: [{
      round_id: `round_${encounterId}`,
      statement_claims: roundClaimIds(claimId),
      shields: [
        { claim_id: claimId, durability: 1 },
        { claim_id: `${claimId}_why`, durability: 1 },
      ],
    }],
    flow_nodes: [
      {
        node_id: nodeId,
        enter_conditions: [],
        reveal_claim_ids: [],
        revise_claim_ids: [],
        open_route_ids: [],
        activate_modifiers: [],
        deactivate_modifiers: [],
        reaction_key: `frontier.${encounterId}.reaction`,
        resource_delta: {},
        is_terminal: true,
      },
    ],
    modifiers: [],
    objectives: {
      required: [
        { objective_id: `obj_${encounterId}`, type: 'REFUTE_CLAIM', claim_id: claimId },
      ],
      optional: [],
      state_conditions: { composure_min: 0, composure_max: 10 },
    },
    outcomes: [
      {
        outcome_id: `outcome_${encounterId}`,
        grade: 'BEST_RESOLUTION',
        priority: 1,
        conditions: [{ type: 'ALL_REQUIRED_OBJECTIVES' }],
      },
    ],
  };
}

/** Pattern C carries arbitrary effects, so one shape covers every propagation case. */
function eventEntry(eventId: string, effects: readonly unknown[]): unknown {
  return {
    event_id: eventId,
    node: EVENT_NODE,
    title_key: `frontier.${eventId}.title`,
    description_key: `frontier.${eventId}.description`,
    pattern: 'C',
    spots: [{ spot_id: `spot_${eventId}`, label_key: `frontier.${eventId}.spot`, effects }],
    attempt_limit: 1,
    per_attempt_costs: { cp: 1 },
  };
}

function lateRouteEntry(): unknown {
  return {
    route_id: LATE_ROUTE,
    target_slot: 'clm_frontier_second',
    slot_label_key: 'frontier.route.late',
    facet: 'WHO',
    allowed_intents: ['QUERY'],
    // Never a root: only an explicit OPEN_ROUTE effect can put this on the map.
    preconditions: [{ type: 'EVIDENCE_OWNED', evidence_id: 'ev_frontier_routed' }],
    reveals: ['clm_frontier_second'],
    unlocks_routes: [],
    creates_commitment: false,
    coercion_risk: 0,
    composure_delta: 0,
    single_use: true,
  };
}

function buildCase(spec: CaseSpec): CaseDefinition {
  return CaseSchema.parse({
    schema_version: '1.0',
    case_id: 'case_frontier',
    metadata: { title: 'Frontier fixture', act: 1, estimated_turns: 3 },
    entities: [
      {
        entity_id: SUSPECT_ID,
        type: 'PERSON',
        role: 'SUSPECT',
        display_name_key: 'frontier.suspect',
        attributes: {},
      },
    ],
    events: [
      {
        event_id: 'evt_frontier_world',
        time: { from: 1, to: 2 },
        participants: [SUSPECT_ID],
        action: 'entered the vault',
      },
    ],
    inquiry_routes: spec.routes ?? [],
    evidence: spec.evidence.map(evidenceEntry),
    proof_rules: spec.rules.map(ruleEntry),
    encounters: spec.encounters,
    events_noncombat: spec.events ?? [],
    flag_hooks: [],
    dialogue: {
      speaker_profiles: {},
      statements: {},
      reactions: {},
      confession: { full: ['내가 했다.'], coerced: ['그렇다고 해두자.'] },
    },
    claims: spec.claims.flatMap((claimId) =>
      ROUND_FACETS.map((facet) =>
        claimEntry(
          facet === 'WHO' ? claimId : `${claimId}_${facet.toLowerCase()}`,
          facet,
        ),
      ),
    ),
  });
}

function runOrderOf(...refs: readonly string[]): RunOrder {
  return { nodes: refs.map((ref) => ({ ref })) };
}

function frontierMessages(
  caseDefinition: CaseDefinition,
  runOrder?: RunOrder,
): readonly string[] {
  return validateCaseTier2AndTier3(
    caseDefinition,
    FIXTURE_PATH,
    runOrder === undefined ? {} : { runOrder },
  )
    .filter((problem) => problem.message.includes(FRONTIER_CODE))
    .map((problem) => problem.message);
}

/** Two encounters wired so both proof rules read the same single evidence set. */
function twoStopCase(
  evidence: EvidenceSpec,
  events: readonly unknown[] = [],
  routes: readonly unknown[] = [],
): CaseDefinition {
  return buildCase({
    evidence: [evidence],
    claims: ['clm_frontier_first', 'clm_frontier_second'],
    rules: [
      { claimId: 'clm_frontier_first', sets: [[evidence.id]] },
      { claimId: 'clm_frontier_second', sets: [[evidence.id]] },
    ],
    encounters: [
      encounterEntry('enc_frontier_first', FIRST_NODE, 'clm_frontier_first'),
      encounterEntry('enc_frontier_second', SECOND_NODE, 'clm_frontier_second'),
    ],
    events,
    routes,
  });
}

describe('node-ordered acquisition frontier', () => {
  it('rejects a proof path fed by evidence acquired at a later run node', () => {
    const fixture = twoStopCase({
      id: 'ev_frontier_late',
      node: SECOND_NODE,
      method: 'STARTING',
    });
    const messages = frontierMessages(
      fixture,
      runOrderOf('enc_frontier_first', 'enc_frontier_second'),
    );

    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('encounters.0.objectives.required.0');
    expect(messages[0]).toContain('clm_frontier_first');
    expect(messages[0]).toContain('ev_frontier_late');
    expect(messages[0]).toContain('run node 1');
  });

  it('keeps the whole-case approximation when no run order is supplied', () => {
    const fixture = twoStopCase({
      id: 'ev_frontier_late',
      node: SECOND_NODE,
      method: 'STARTING',
    });

    expect(frontierMessages(fixture)).toEqual([]);
  });

  it('accepts a proof path fed by evidence acquired at the encounter itself', () => {
    const fixture = twoStopCase({
      id: 'ev_frontier_early',
      node: FIRST_NODE,
      method: 'STARTING',
    });

    expect(
      frontierMessages(fixture, runOrderOf('enc_frontier_first', 'enc_frontier_second')),
    ).toEqual([]);
  });

  it('propagates an earlier event GRANT_EVIDENCE forward but not backward', () => {
    const evidence: EvidenceSpec = {
      id: 'ev_frontier_granted',
      node: OFF_STRIP_NODE,
      method: 'EVENT_RESULT',
    };
    const grantingEvent = eventEntry('event_frontier_grant', [
      { type: 'GRANT_EVIDENCE', target: evidence.id },
    ]);
    const inertEvent = eventEntry('event_frontier_grant', [
      { type: 'ADJUST_RESOURCE', resource: 'dp', delta: 1 },
    ]);
    const order = runOrderOf('enc_frontier_first', 'event_frontier_grant', 'enc_frontier_second');

    const granted = frontierMessages(twoStopCase(evidence, [grantingEvent]), order);
    expect(granted).toHaveLength(1);
    expect(granted[0]).toContain('encounters.0.objectives.required.0');
    expect(granted[0]).toContain('run node 1');

    // Without the grant the evidence is unreachable outright, which stays a
    // NO_SOLVABLE_PATH finding rather than an ordering finding.
    expect(frontierMessages(twoStopCase(evidence, [inertEvent]), order)).toEqual([]);
  });

  it('propagates an earlier event OPEN_ROUTE forward but not backward', () => {
    const evidence: EvidenceSpec = {
      id: 'ev_frontier_routed',
      node: LATE_ROUTE,
      method: 'INQUIRY',
    };
    const openingEvent = eventEntry('event_frontier_open', [
      { type: 'OPEN_ROUTE', target: LATE_ROUTE },
    ]);
    const inertEvent = eventEntry('event_frontier_open', [
      { type: 'ADJUST_RESOURCE', resource: 'dp', delta: 1 },
    ]);
    const routes = [lateRouteEntry()];
    const order = runOrderOf('enc_frontier_first', 'event_frontier_open', 'enc_frontier_second');

    const opened = frontierMessages(twoStopCase(evidence, [openingEvent], routes), order);
    expect(opened).toHaveLength(1);
    expect(opened[0]).toContain('encounters.0.objectives.required.0');
    expect(opened[0]).toContain('ev_frontier_routed');

    expect(frontierMessages(twoStopCase(evidence, [inertEvent], routes), order)).toEqual([]);
  });

  it('propagates an earlier event SET_FLAG forward but not backward', () => {
    const evidence: EvidenceSpec = {
      id: 'ev_frontier_flagged',
      node: GATE_FLAG,
      method: 'FLAG_HOOK',
    };
    const settingEvent = eventEntry('event_frontier_flag', [
      { type: 'SET_FLAG', target: GATE_FLAG, value: true },
    ]);
    const inertEvent = eventEntry('event_frontier_flag', [
      { type: 'ADJUST_RESOURCE', resource: 'dp', delta: 1 },
    ]);
    const order = runOrderOf('enc_frontier_first', 'event_frontier_flag', 'enc_frontier_second');

    const flagged = frontierMessages(twoStopCase(evidence, [settingEvent]), order);
    expect(flagged).toHaveLength(1);
    expect(flagged[0]).toContain('encounters.0.objectives.required.0');
    expect(flagged[0]).toContain('ev_frontier_flagged');

    expect(frontierMessages(twoStopCase(evidence, [inertEvent]), order)).toEqual([]);
  });

  it('judges each encounter at its own position when the case supplies several', () => {
    const fixture = buildCase({
      evidence: [
        { id: 'ev_frontier_a', node: FIRST_NODE, method: 'STARTING' },
        { id: 'ev_frontier_b', node: SECOND_NODE, method: 'STARTING' },
        { id: 'ev_frontier_c', node: THIRD_NODE, method: 'STARTING' },
      ],
      claims: ['clm_frontier_first', 'clm_frontier_second', 'clm_frontier_third'],
      rules: [
        { claimId: 'clm_frontier_first', sets: [['ev_frontier_c']] },
        { claimId: 'clm_frontier_second', sets: [['ev_frontier_c']] },
        { claimId: 'clm_frontier_third', sets: [['ev_frontier_a', 'ev_frontier_b', 'ev_frontier_c']] },
      ],
      encounters: [
        encounterEntry('enc_frontier_first', FIRST_NODE, 'clm_frontier_first'),
        encounterEntry('enc_frontier_second', SECOND_NODE, 'clm_frontier_second'),
        encounterEntry('enc_frontier_third', THIRD_NODE, 'clm_frontier_third'),
      ],
      events: [eventEntry('event_frontier_pause', [
        { type: 'ADJUST_RESOURCE', resource: 'dp', delta: 1 },
      ])],
    });
    const messages = frontierMessages(
      fixture,
      runOrderOf(
        'enc_frontier_first',
        'event_frontier_pause',
        'enc_frontier_second',
        'enc_frontier_third',
      ),
    );

    expect(messages).toHaveLength(2);
    expect(messages[0]).toContain('encounters.0.objectives.required.0');
    expect(messages[0]).toContain('run node 1');
    expect(messages[1]).toContain('encounters.1.objectives.required.0');
    expect(messages[1]).toContain('run node 3');
  });

  it('accepts a required claim whose alternate set is already acquirable', () => {
    const fixture = buildCase({
      evidence: [
        { id: 'ev_frontier_a', node: FIRST_NODE, method: 'STARTING' },
        { id: 'ev_frontier_b', node: SECOND_NODE, method: 'STARTING' },
      ],
      claims: ['clm_frontier_first', 'clm_frontier_second'],
      rules: [
        { claimId: 'clm_frontier_first', sets: [['ev_frontier_b'], ['ev_frontier_a']] },
        { claimId: 'clm_frontier_second', sets: [['ev_frontier_b']] },
      ],
      encounters: [
        encounterEntry('enc_frontier_first', FIRST_NODE, 'clm_frontier_first'),
        encounterEntry('enc_frontier_second', SECOND_NODE, 'clm_frontier_second'),
      ],
    });

    expect(
      frontierMessages(fixture, runOrderOf('enc_frontier_first', 'enc_frontier_second')),
    ).toEqual([]);
  });

  it('ignores strip nodes that belong to another case', () => {
    const fixture = twoStopCase({
      id: 'ev_frontier_late',
      node: SECOND_NODE,
      method: 'STARTING',
    });

    expect(
      frontierMessages(
        fixture,
        runOrderOf('enc_other_case_boss', 'enc_frontier_first', 'enc_frontier_second'),
      ),
    ).toHaveLength(1);
  });
});
