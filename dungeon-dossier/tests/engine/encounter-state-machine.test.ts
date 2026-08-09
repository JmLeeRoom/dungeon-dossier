import { describe, expect, it } from 'vitest';
import {
  assertEightStepTurnMapping,
  createFreeReviewQueries,
  ENCOUNTER_EVENTS,
  ENCOUNTER_STATES,
  EncounterStateMachine,
  transitionEncounter,
  TURN_STATE_MAPPING,
  type EncounterEvent,
  type EncounterState,
} from '../../src/engine/encounter';

describe('EncounterStateMachine', () => {
  it('advances through the deterministic bootstrap path', () => {
    let state = transitionEncounter('ENCOUNTER_INIT', 'START');
    state = transitionEncounter(state, 'CONTENT_LOADED');
    state = transitionEncounter(state, 'VALIDATION_PASSED');
    state = transitionEncounter(state, 'TRUTH_BUILT');
    state = transitionEncounter(state, 'KNOWLEDGE_INITIALIZED');
    expect(state).toBe('ENTER_FLOW_NODE');
  });

  it('runs the complete implementation turn in canonical order', () => {
    const machine = new EncounterStateMachine('DEVELOPMENT');
    const events = [
      'START',
      'CONTENT_LOADED',
      'VALIDATION_PASSED',
      'TRUTH_BUILT',
      'KNOWLEDGE_INITIALIZED',
      'FLOW_NODE_ENTERED',
      'STATEMENT_RENDERED',
      'DTO_EMITTED',
      'TURN_READY',
      'BEGIN_ARGUMENT',
      'ARGUMENT_BUILT',
      'ACTION_SUBMITTED',
      'RESOLUTION_READY',
      'EFFECTS_APPLIED',
      'REACTION_RENDERED',
      'MODIFIERS_APPLIED',
      'TURN_SETTLED',
      'STAY_IN_FLOW',
      'OBJECTIVES_CHECKED',
      'CONTINUE',
    ] as const;
    const states = events.map((event) => machine.dispatch(event).state);

    expect(states).toEqual([
      'LOAD_CASE',
      'VALIDATE',
      'BUILD_TRUTH',
      'INIT_KNOWLEDGE',
      'ENTER_FLOW_NODE',
      'RENDER_STATEMENT',
      'EMIT_PUBLIC_DTO',
      'TURN_START',
      'FREE_REVIEW',
      'BUILD_ARGUMENT',
      'SUBMIT_ACTION',
      'RESOLVE',
      'APPLY_EFFECTS',
      'RENDER_REACTION',
      'RUN_MODIFIERS',
      'SETTLE_TURN',
      'CHECK_FLOW_TRANSITION',
      'CHECK_OBJECTIVES',
      'CHECK_OUTCOME',
      'TURN_START',
    ]);
  });

  it('throws for an undefined transition', () => {
    expect(() => transitionEncounter('FREE_REVIEW', 'CONTINUE')).toThrow(
      'Invalid encounter transition',
    );
  });

  it('skips development validation only in a trusted release', () => {
    const development = new EncounterStateMachine('DEVELOPMENT');
    development.dispatch('START');
    expect(development.dispatch('CONTENT_LOADED').state).toBe('VALIDATE');

    const release = new EncounterStateMachine('TRUSTED_RELEASE');
    release.dispatch('START');
    expect(release.dispatch('CONTENT_LOADED').state).toBe('BUILD_TRUTH');
  });

  it('maps the eight design steps onto every implementation turn state once', () => {
    expect(() => assertEightStepTurnMapping()).not.toThrow();
    expect(Object.keys(TURN_STATE_MAPPING)).toHaveLength(8);
  });

  it('places the v2 states in their designed eight-step groups', () => {
    expect(TURN_STATE_MAPPING.STATEMENT).toContain('PRESENT_PENDING_FLOW');
    expect(TURN_STATE_MAPPING.END_CHECK).toContain('SETTLE_TURN');
    expect(TURN_STATE_MAPPING.END_CHECK).toContain('AWAIT_SECURE_DECISION');
  });

  it('settles a submitted turn through SETTLE_TURN before flow and outcome', () => {
    let state = transitionEncounter('RUN_MODIFIERS', 'MODIFIERS_APPLIED');
    expect(state).toBe('SETTLE_TURN');
    state = transitionEncounter(state, 'TURN_SETTLED');
    expect(state).toBe('CHECK_FLOW_TRANSITION');
    state = transitionEncounter(state, 'FLOW_LOGIC_COMMITTED');
    expect(state).toBe('CHECK_OBJECTIVES');
    expect(transitionEncounter('CHECK_FLOW_TRANSITION', 'NO_FLOW')).toBe(
      'CHECK_OBJECTIVES',
    );
  });

  it('offers the secure decision as a stable checkpoint after CHECK_OUTCOME', () => {
    expect(transitionEncounter('CHECK_OUTCOME', 'OFFER_SECURE')).toBe(
      'AWAIT_SECURE_DECISION',
    );
    expect(transitionEncounter('AWAIT_SECURE_DECISION', 'SECURE_STATEMENT')).toBe(
      'ENCOUNTER_COMPLETE',
    );
    expect(transitionEncounter('AWAIT_SECURE_DECISION', 'DECLINE_NO_FLOW')).toBe(
      'TURN_START',
    );
    expect(transitionEncounter('AWAIT_SECURE_DECISION', 'DECLINE_WITH_FLOW')).toBe(
      'PRESENT_PENDING_FLOW',
    );
    expect(
      transitionEncounter('AWAIT_SECURE_DECISION', 'DECLINE_AND_COMPLETE'),
    ).toBe('ENCOUNTER_COMPLETE');
  });

  it('publishes a pending flow presentation ahead of the next turn', () => {
    expect(transitionEncounter('CHECK_OUTCOME', 'CONTINUE_WITH_FLOW')).toBe(
      'PRESENT_PENDING_FLOW',
    );
    expect(transitionEncounter('CHECK_OUTCOME', 'CONTINUE_NO_FLOW')).toBe(
      'TURN_START',
    );
    let state = transitionEncounter(
      'PRESENT_PENDING_FLOW',
      'FLOW_PRESENTATION_STARTED',
    );
    expect(state).toBe('RENDER_STATEMENT');
    state = transitionEncounter(state, 'STATEMENT_RENDERED');
    state = transitionEncounter(state, 'DTO_EMITTED');
    expect(state).toBe('TURN_START');
  });

  it('lets a pre-draw turn-start threshold finish the encounter directly', () => {
    expect(transitionEncounter('TURN_START', 'COMPLETE_ENCOUNTER')).toBe(
      'ENCOUNTER_COMPLETE',
    );
    expect(transitionEncounter('TURN_START', 'FAIL_ENCOUNTER')).toBe('FAILED');
  });

  it('rejects skipping SETTLE_TURN and leaving the decision without a choice', () => {
    expect(() => transitionEncounter('RUN_MODIFIERS', 'TURN_SETTLED')).toThrow(
      'Invalid encounter transition',
    );
    expect(() =>
      transitionEncounter('SETTLE_TURN', 'MODIFIERS_APPLIED'),
    ).toThrow('Invalid encounter transition');
    expect(() =>
      transitionEncounter('AWAIT_SECURE_DECISION', 'CONTINUE'),
    ).toThrow('Invalid encounter transition');
    expect(() =>
      transitionEncounter('AWAIT_SECURE_DECISION', 'TURN_READY'),
    ).toThrow('Invalid encounter transition');
    expect(() =>
      transitionEncounter('PRESENT_PENDING_FLOW', 'TURN_READY'),
    ).toThrow('Invalid encounter transition');
    expect(() => transitionEncounter('CHECK_OUTCOME', 'OBJECTIVES_CHECKED')).toThrow(
      'Invalid encounter transition',
    );
  });

  it('table-tests every allowed transition and rejects every unlisted pair', () => {
    const rows: readonly (readonly [EncounterState, EncounterEvent, EncounterState])[] = [
      ['ENCOUNTER_INIT', 'START', 'LOAD_CASE'],
      ['LOAD_CASE', 'CONTENT_LOADED', 'VALIDATE'],
      ['LOAD_CASE', 'CONTENT_LOADED_TRUSTED', 'BUILD_TRUTH'],
      ['VALIDATE', 'VALIDATION_PASSED', 'BUILD_TRUTH'],
      ['BUILD_TRUTH', 'TRUTH_BUILT', 'INIT_KNOWLEDGE'],
      ['INIT_KNOWLEDGE', 'KNOWLEDGE_INITIALIZED', 'ENTER_FLOW_NODE'],
      ['ENTER_FLOW_NODE', 'FLOW_NODE_ENTERED', 'RENDER_STATEMENT'],
      ['RENDER_STATEMENT', 'STATEMENT_RENDERED', 'EMIT_PUBLIC_DTO'],
      ['EMIT_PUBLIC_DTO', 'DTO_EMITTED', 'TURN_START'],
      ['TURN_START', 'TURN_READY', 'FREE_REVIEW'],
      ['TURN_START', 'COMPLETE_ENCOUNTER', 'ENCOUNTER_COMPLETE'],
      ['TURN_START', 'FAIL_ENCOUNTER', 'FAILED'],
      ['FREE_REVIEW', 'BEGIN_ARGUMENT', 'BUILD_ARGUMENT'],
      ['BUILD_ARGUMENT', 'ARGUMENT_BUILT', 'SUBMIT_ACTION'],
      ['SUBMIT_ACTION', 'ACTION_SUBMITTED', 'RESOLVE'],
      ['RESOLVE', 'RESOLUTION_READY', 'APPLY_EFFECTS'],
      ['APPLY_EFFECTS', 'EFFECTS_APPLIED', 'RENDER_REACTION'],
      ['RENDER_REACTION', 'REACTION_RENDERED', 'RUN_MODIFIERS'],
      ['RUN_MODIFIERS', 'MODIFIERS_APPLIED', 'SETTLE_TURN'],
      ['SETTLE_TURN', 'TURN_SETTLED', 'CHECK_FLOW_TRANSITION'],
      ['CHECK_FLOW_TRANSITION', 'ENTER_NEXT_FLOW', 'ENTER_FLOW_NODE'],
      ['CHECK_FLOW_TRANSITION', 'STAY_IN_FLOW', 'CHECK_OBJECTIVES'],
      ['CHECK_FLOW_TRANSITION', 'FLOW_LOGIC_COMMITTED', 'CHECK_OBJECTIVES'],
      ['CHECK_FLOW_TRANSITION', 'NO_FLOW', 'CHECK_OBJECTIVES'],
      ['CHECK_OBJECTIVES', 'OBJECTIVES_CHECKED', 'CHECK_OUTCOME'],
      ['CHECK_OUTCOME', 'CONTINUE', 'TURN_START'],
      ['CHECK_OUTCOME', 'OFFER_SECURE', 'AWAIT_SECURE_DECISION'],
      ['CHECK_OUTCOME', 'CONTINUE_NO_FLOW', 'TURN_START'],
      ['CHECK_OUTCOME', 'CONTINUE_WITH_FLOW', 'PRESENT_PENDING_FLOW'],
      ['CHECK_OUTCOME', 'COMPLETE_ENCOUNTER', 'ENCOUNTER_COMPLETE'],
      ['CHECK_OUTCOME', 'FAIL_ENCOUNTER', 'FAILED'],
      ['AWAIT_SECURE_DECISION', 'SECURE_STATEMENT', 'ENCOUNTER_COMPLETE'],
      ['AWAIT_SECURE_DECISION', 'DECLINE_NO_FLOW', 'TURN_START'],
      ['AWAIT_SECURE_DECISION', 'DECLINE_WITH_FLOW', 'PRESENT_PENDING_FLOW'],
      ['AWAIT_SECURE_DECISION', 'DECLINE_AND_COMPLETE', 'ENCOUNTER_COMPLETE'],
      ['PRESENT_PENDING_FLOW', 'FLOW_PRESENTATION_STARTED', 'RENDER_STATEMENT'],
    ];
    const expected = new Map(
      rows.map(([state, event, next]) => [`${state}|${event}`, next]),
    );

    for (const state of ENCOUNTER_STATES) {
      for (const event of ENCOUNTER_EVENTS) {
        const next = expected.get(`${state}|${event}`);
        if (next === undefined) {
          expect(
            () => transitionEncounter(state, event),
            `${state} + ${event} must be forbidden`,
          ).toThrow('Invalid encounter transition');
        } else {
          expect(transitionEncounter(state, event)).toBe(next);
        }
      }
    }
  });

  it('terminates with the canonical ENCOUNTER_COMPLETE state', () => {
    expect(transitionEncounter('CHECK_OUTCOME', 'COMPLETE_ENCOUNTER')).toBe(
      'ENCOUNTER_COMPLETE',
    );
  });

  it('exposes FREE_REVIEW as immutable allow-listed queries', () => {
    const mutable = {
      evidence: [
        {
          evidenceId: 'runtime-evidence',
          displayName: '기록',
          scopes: ['TIME'] as const,
          notProvenKeys: ['행위자'],
          commandPointCost: 0,
        },
      ],
      history: [
        {
          speakerId: 'runtime-speaker',
          body: '기록된 진술',
          claimIds: ['runtime-claim'],
        },
      ],
    };
    const queries = createFreeReviewQueries(mutable);
    mutable.evidence[0]!.displayName = '변경됨';
    mutable.history[0]!.body = '변경됨';

    expect(queries.listEvidence()[0]).toEqual({
      evidenceId: 'runtime-evidence',
      displayName: '기록',
      scopes: ['TIME'],
      notProvenKeys: ['행위자'],
      commandPointCost: 0,
    });
    expect(queries.listHistory()[0]?.body).toBe('기록된 진술');
    expect(Object.isFrozen(queries.listEvidence())).toBe(true);
    expect(Object.keys(queries.listEvidence()[0] ?? {})).not.toEqual(
      expect.arrayContaining(['correctAnswer', 'predictedResolution']),
    );
  });
});
