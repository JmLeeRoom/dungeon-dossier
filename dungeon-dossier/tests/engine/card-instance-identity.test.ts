import { describe, expect, it } from 'vitest';

import {
  beginEncounterAttempt,
  createCardInstanceId,
  createEncounterAttemptId,
  createRunIdentityState,
  discardHandInstances,
  mintCardInstance,
  playCardInstance,
  type InstanceHandState,
} from '../../src/engine/cards';

describe('run identity and card instance ids', () => {
  it('derives deterministic attempt and instance ids from the identity state', () => {
    const identity = beginEncounterAttempt(createRunIdentityState('run-7'));
    const attemptId = createEncounterAttemptId(identity, 'node_slime');

    expect(attemptId).toBe('run-7:node_slime:1');
    expect(createCardInstanceId('node_slime', attemptId, 0)).toBe(
      'node_slime:run-7:node_slime:1:0',
    );
  });

  it('advances the attempt ordinal only through an explicit attempt begin', () => {
    const fresh = createRunIdentityState('run-7');
    expect(fresh.encounterAttemptOrdinal).toBe(0);

    const first = beginEncounterAttempt(fresh);
    const retry = beginEncounterAttempt(first);
    expect(first.encounterAttemptOrdinal).toBe(1);
    expect(retry.encounterAttemptOrdinal).toBe(2);
    // A remount reuses the same identity object; ids from it stay identical.
    expect(createEncounterAttemptId(first, 'node_slime')).toBe(
      createEncounterAttemptId(first, 'node_slime'),
    );
  });

  it('mints unique instances for duplicate blueprints and persists the serial', () => {
    let identity = beginEncounterAttempt(createRunIdentityState('run-7'));
    const first = mintCardInstance(identity, 'node_slime', 'card_leading_question');
    identity = first.identity;
    const second = mintCardInstance(identity, 'node_slime', 'card_leading_question');
    identity = second.identity;

    expect(first.instance.blueprintId).toBe(second.instance.blueprintId);
    expect(first.instance.instanceId).not.toBe(second.instance.instanceId);
    expect(identity.nextDrawSerial).toBe(2);
  });

  it('keeps ids collision-free across a retry of the same node', () => {
    let identity = beginEncounterAttempt(createRunIdentityState('run-7'));
    const beforeRetry = mintCardInstance(identity, 'node_slime', 'card_bat_threat');
    // Retry: the ordinal advances while the draw serial keeps counting up.
    identity = beginEncounterAttempt(beforeRetry.identity);
    const afterRetry = mintCardInstance(identity, 'node_slime', 'card_bat_threat');

    expect(afterRetry.instance.instanceId).not.toBe(
      beforeRetry.instance.instanceId,
    );
  });

  it('rejects identity segments that would break the id grammar', () => {
    expect(() => createRunIdentityState('')).toThrow('non-empty');
    expect(() => createRunIdentityState('run:7')).toThrow("must not contain ':'");
    expect(() =>
      createEncounterAttemptId(
        { runInstanceId: 'run-7', encounterAttemptOrdinal: -1 },
        'node_slime',
      ),
    ).toThrow('non-negative');
    expect(() => createCardInstanceId('node:slime', 'run-7:node:1', 0)).toThrow(
      "must not contain ':'",
    );
  });
});

describe('duplicate-safe hand operations', () => {
  const HAND: InstanceHandState = {
    hand: [
      { instanceId: 'i-1', blueprintId: 'card_leading_question' },
      { instanceId: 'i-2', blueprintId: 'card_leading_question' },
      { instanceId: 'i-3', blueprintId: 'card_bat_threat' },
    ],
    discardPile: [{ instanceId: 'i-0', blueprintId: 'card_toss_dossier' }],
  };

  it('plays exactly the selected copy when the blueprint is duplicated', () => {
    const result = playCardInstance(HAND, 'i-2');

    expect(result.played).toEqual({
      instanceId: 'i-2',
      blueprintId: 'card_leading_question',
    });
    expect(result.state.hand.map((card) => card.instanceId)).toEqual([
      'i-1',
      'i-3',
    ]);
    expect(result.state.discardPile.map((card) => card.instanceId)).toEqual([
      'i-0',
      'i-2',
    ]);
  });

  it('discards the full remaining hand as a multiset', () => {
    const afterPlay = playCardInstance(HAND, 'i-2').state;
    const result = discardHandInstances(afterPlay);

    expect(result.discardedInstanceIds).toEqual(['i-1', 'i-3']);
    expect(result.state.hand).toEqual([]);
    expect(result.state.discardPile.map((card) => card.instanceId)).toEqual([
      'i-0',
      'i-2',
      'i-1',
      'i-3',
    ]);
  });

  it('rejects unknown instances and duplicated instance ids', () => {
    expect(() => playCardInstance(HAND, 'i-9')).toThrow('not in hand');
    const corrupted: InstanceHandState = {
      hand: [
        { instanceId: 'i-1', blueprintId: 'card_leading_question' },
        { instanceId: 'i-1', blueprintId: 'card_leading_question' },
      ],
      discardPile: [],
    };
    expect(() => playCardInstance(corrupted, 'i-1')).toThrow('unique');
    expect(() => discardHandInstances(corrupted)).toThrow('unique');
  });
});
