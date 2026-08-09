import { describe, expect, it } from 'vitest';
import type { Condition } from '../../src/engine/domain';
import {
  assertFlowDefinition,
  enterFlowNode,
  evaluateFlowCondition,
  runFlowTransition,
  type FlowNode,
  type FlowRuntimeState,
} from '../../src/engine/encounter/FlowRunner';
import {
  MODIFIER_EFFECT_TYPES,
  MODIFIER_TRIGGERS,
  applyModifierEffect,
  applyTriggeredModifiers,
  assertModifierDefinition,
  selectModifierTargets,
  type EncounterModifier,
  type ModifierRuntimeState,
  type ModifierTargetSelector,
} from '../../src/engine/encounter/ModifierSystem';
import { createRngState } from '../../src/engine/rng/seededRng';

function flowNode(
  nodeId: string,
  enterConditions: readonly Condition[],
  overrides: Partial<FlowNode> = {},
): FlowNode {
  return {
    node_id: nodeId,
    enter_conditions: [...enterConditions],
    reveal_claim_ids: [],
    revise_claim_ids: [],
    open_route_ids: [],
    activate_modifiers: [],
    deactivate_modifiers: [],
    reaction_key: `reaction.${nodeId}`,
    resource_delta: {},
    is_terminal: false,
    ...overrides,
  };
}

function flowState(): FlowRuntimeState {
  return {
    currentNodeId: 'opening',
    enteredNodeIds: ['opening'],
    claims: {
      location: {
        commitment: 'COMMITTED',
        epistemic: 'REFUTED',
        presentation: 'NORMAL',
      },
      route: {
        commitment: 'ASSERTED',
        epistemic: 'REFUTED',
        presentation: 'NORMAL',
      },
    },
    revealedClaimIds: ['location'],
    openRouteIds: [],
    usedRouteIds: ['motive-route'],
    activeModifierIds: ['old-modifier'],
    completedObjectiveIds: [],
    requiredObjectiveIds: [],
    resources: { resistance: 2 },
    terminal: false,
  };
}

function modifierState(): ModifierRuntimeState {
  return {
    turn: 3,
    claims: {
      unsettled: {
        commitment: 'ASSERTED',
        epistemic: 'PROVISIONAL',
        presentation: 'NORMAL',
        resistance: 2,
        facet: 'WHERE',
      },
      settled: {
        commitment: 'COMMITTED',
        epistemic: 'REFUTED',
        presentation: 'NORMAL',
        resistance: 10,
        facet: 'WHERE',
      },
    },
    evidence: {
      original: { integrity: 'INTACT', acquired: true },
      alternate: { integrity: 'INTACT', acquired: true },
    },
    cards: {
      upgraded: { upgraded: true },
      basic: { upgraded: false },
    },
    resources: { cp: 3, stress: 5, coercion: 0 },
    revealedClaimIds: ['unsettled', 'settled'],
    evidenceOrder: ['original', 'alternate'],
    hand: ['upgraded', 'basic'],
    drawPile: [],
    discardPile: [],
  };
}

describe('FlowRunner', () => {
  it('selects the first eligible node and never enters it twice', () => {
    const condition: Condition = {
      type: 'CLAIM_EPISTEMIC',
      claim_id: 'location',
      state: 'REFUTED',
    };
    const first = flowNode('defense-one', [condition]);
    const second = flowNode('defense-two', [condition], { is_terminal: true });

    const transition = runFlowTransition([first, second], flowState());
    expect(transition.node?.node_id).toBe('defense-one');
    expect(transition.state.enteredNodeIds).toEqual(['opening', 'defense-one']);

    const next = runFlowTransition([first, second], transition.state);
    expect(next.node?.node_id).toBe('defense-two');
  });

  it('keeps reveals monotonic and turns a revised COMMITTED claim into CONTRADICTED', () => {
    const truthGraph = Object.freeze({ immutable: true });
    const statementHistory = Object.freeze([{ body: 'original' }]);
    const resolutionLogic = Object.freeze({ version: 1 });
    const state = {
      ...flowState(),
      truthGraph,
      statementHistory,
      resolutionLogic,
    };
    const node = flowNode('defense', [], {
      reveal_claim_ids: ['route'],
      revise_claim_ids: ['location'],
      open_route_ids: ['detail-route'],
      activate_modifiers: ['new-modifier'],
      deactivate_modifiers: ['old-modifier'],
      resource_delta: { resistance: 1 },
    });

    const next = enterFlowNode(node, state);
    expect(next.claims.location?.commitment).toBe('CONTRADICTED');
    expect(next.claims.location?.epistemic).toBe('REFUTED');
    expect(next.revealedClaimIds).toEqual(['location', 'route']);
    expect(next.activeModifierIds).toEqual(['new-modifier']);
    expect(next.resources.resistance).toBe(3);
    expect(next.truthGraph).toBe(truthGraph);
    expect(next.statementHistory).toBe(statementHistory);
    expect(next.resolutionLogic).toBe(resolutionLogic);
    expect(() => enterFlowNode(node, next)).toThrow('already been entered');
  });

  it('rejects composure/resource gates and requires a terminal flow tail', () => {
    expect(() =>
      evaluateFlowCondition(
        { type: 'RESOURCE_RANGE', resource: 'composure', max: 30 },
        flowState(),
      ),
    ).toThrow('flow transitions cannot use resource');

    expect(() => assertFlowDefinition([flowNode('only', [])])).toThrow(
      'final FlowNode must be terminal',
    );
  });
});

describe('ModifierSystem', () => {
  it('publishes the fixed 13-trigger and 21-effect catalogues', () => {
    expect(MODIFIER_TRIGGERS).toHaveLength(13);
    expect(MODIFIER_TRIGGERS).toEqual(
      expect.arrayContaining(['ON_TURN_START_PRE_DRAW', 'ON_HAND_READY']),
    );
    expect(MODIFIER_EFFECT_TYPES).toEqual(
      expect.arrayContaining(['LOCK_CARD', 'SEAL_EVIDENCE', 'TRIGGER_QTE']),
    );
    expect(MODIFIER_EFFECT_TYPES).toHaveLength(21);
  });

  it('uses only the explicit seeded RNG stream for random target selection', () => {
    const state = modifierState();
    const selector: ModifierTargetSelector = {
      scope: 'VISIBLE_CLAIMS',
      exclude_states: { epistemic: ['SUPPORTED', 'REFUTED'] },
      count: 1,
      selection: 'SEEDED_RANDOM',
    };
    const first = selectModifierTargets(
      'CLAIM',
      selector,
      state,
      createRngState(77, 'MODIFIER_SELECTION'),
    );
    const replay = selectModifierTargets(
      'CLAIM',
      selector,
      state,
      createRngState(77, 'MODIFIER_SELECTION'),
    );

    expect(first).toEqual(replay);
    expect(first.targetIds).toEqual(['unsettled']);
    expect(() => selectModifierTargets('CLAIM', selector, state)).toThrow(
      'explicit RngState',
    );
  });

  it('implements reversible card/evidence locks and queues declarative QTE outcomes', () => {
    const state = modifierState();
    const locked = applyModifierEffect(state, {
      type: 'LOCK_CARD',
      target_selector: {
        scope: 'UPGRADED_CARDS',
        ids: ['upgraded'],
        count: 1,
        selection: 'DETERMINISTIC_BY_INDEX',
      },
      duration_turns: 2,
    }).state;
    const sealed = applyModifierEffect(locked, {
      type: 'SEAL_EVIDENCE',
      target_selector: {
        scope: 'OWNED_EVIDENCE',
        ids: ['original'],
        count: 1,
        selection: 'DETERMINISTIC_BY_INDEX',
      },
      duration_turns: 2,
    }).state;
    const qte = applyModifierEffect(sealed, {
      type: 'TRIGGER_QTE',
      parameters: {
        qte_id: 'invoice-catch',
        on_success: { resource: 'cp', delta: 1 },
        on_fail: { resource: 'stress', delta: -1 },
      },
    }).state;

    expect(qte.cards.upgraded?.lockedUntilTurn).toBe(5);
    expect(qte.evidence.original?.sealedUntilTurn).toBe(5);
    expect(qte.queuedQtes).toEqual([
      {
        qteId: 'invoice-catch',
        onSuccess: { resource: 'cp', delta: 1 },
        onFail: { resource: 'stress', delta: -1 },
      },
    ]);
  });

  it('does not disturb settled claims or immutable caller-owned domains', () => {
    const truthGraph = Object.freeze({ relation: 'private' });
    const statementHistory = Object.freeze(['original']);
    const resolutionLogic = Object.freeze({ resolver: 'fixed' });
    const state = {
      ...modifierState(),
      truthGraph,
      statementHistory,
      resolutionLogic,
    };
    const next = applyModifierEffect(state, {
      type: 'DISTORT_CLAIM_VIEW',
      target_selector: {
        scope: 'VISIBLE_CLAIMS',
        ids: ['unsettled', 'settled'],
        exclude_states: { epistemic: [] },
        selection: 'DETERMINISTIC_BY_INDEX',
      },
    }).state;

    expect(next.claims.unsettled?.presentation).toBe('DISTORTED');
    expect(next.claims.settled?.presentation).toBe('NORMAL');
    expect(next.claims.settled?.epistemic).toBe('REFUTED');
    expect(next.truthGraph).toBe(truthGraph);
    expect(next.statementHistory).toBe(statementHistory);
    expect(next.resolutionLogic).toBe(resolutionLogic);
  });

  it('rolls REMOVE_EVIDENCE back when its before/after check loses the last path', () => {
    const state = modifierState();
    const checkedStates: ModifierRuntimeState[] = [];
    const removed = applyModifierEffect(
      state,
      {
        type: 'REMOVE_EVIDENCE',
        target_selector: {
          scope: 'OWNED_EVIDENCE',
          ids: ['original'],
          count: 1,
          selection: 'DETERMINISTIC_BY_INDEX',
        },
      },
      {
        hasSolvablePath(candidate) {
          checkedStates.push(candidate);
          return candidate.evidence.original?.integrity !== 'DESTROYED';
        },
      },
    );

    expect(checkedStates).toHaveLength(2);
    expect(removed.state).toBe(state);
    expect(removed.blockedReason).toBe('NO_SOLVABLE_PATH');
    expect(state.evidence.original?.integrity).toBe('INTACT');
  });

  it('honors priority and activation limits for matching Trigger+Condition+Effect data', () => {
    const modifier = (
      id: string,
      priority: number,
      amount: number,
    ): EncounterModifier => ({
      modifier_id: id,
      trigger: 'ON_TURN_END',
      condition: { type: 'ALWAYS' },
      effect: { type: 'REDUCE_CP', delta: amount },
      counterplay: {
        allowed_intents: ['RECOVER'],
        partner_skills: [],
        always_available: true,
      },
      activation_limit: 1,
      priority,
    });
    const state = {
      ...modifierState(),
      activeModifierIds: ['low', 'high'],
    };
    const once = applyTriggeredModifiers(
      state,
      [modifier('low', 1, 1), modifier('high', 100, 1)],
      'ON_TURN_END',
    );
    const twice = applyTriggeredModifiers(
      once.state,
      [modifier('low', 1, 1), modifier('high', 100, 1)],
      'ON_TURN_END',
    );

    expect(once.appliedModifierIds).toEqual(['high', 'low']);
    expect(once.state.resources.cp).toBe(1);
    expect(twice.appliedModifierIds).toEqual([]);
    expect(twice.state.resources.cp).toBe(1);
  });

  it('requires Claim selectors to declare settled-state exclusions', () => {
    const modifier: EncounterModifier = {
      modifier_id: 'invalid-targeting',
      trigger: 'ON_RESOLUTION',
      condition: { type: 'ALWAYS' },
      effect: {
        type: 'DISTORT_CLAIM_VIEW',
        target_selector: {
          scope: 'VISIBLE_CLAIMS',
          selection: 'DETERMINISTIC_BY_INDEX',
        },
      },
      counterplay: {
        allowed_intents: ['CLARIFY'],
        partner_skills: [],
        always_available: true,
      },
      activation_limit: 1,
      priority: 1,
    };
    expect(() => assertModifierDefinition(modifier)).toThrow(
      'must exclude settled Claim states',
    );
  });
});
