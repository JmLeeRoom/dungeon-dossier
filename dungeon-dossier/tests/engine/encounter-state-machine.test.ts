import { describe, expect, it } from 'vitest';
import {
  assertEightStepTurnMapping,
  createFreeReviewQueries,
  EncounterStateMachine,
  transitionEncounter,
  TURN_STATE_MAPPING,
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
