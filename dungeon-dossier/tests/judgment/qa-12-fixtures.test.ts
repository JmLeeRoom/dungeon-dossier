import { describe, expect, it } from 'vitest';
import {
  hasSolvableProofPath,
  resolveArgument,
  type ResolutionAxes,
} from '../../src/engine/resolution';
import { claim, evidence, input, rule } from './fixtures';

function expectAxes(
  actual: ResolutionAxes,
  expected: Readonly<{
    relevance: ResolutionAxes['relevance'];
    relation: ResolutionAxes['relation'];
    sufficiency: ResolutionAxes['sufficiency'];
    independence: ResolutionAxes['independence'];
    procedure?: ResolutionAxes['procedure'];
  }>,
): void {
  expect(actual).toEqual({
    validity: 'VALID',
    relevance: expected.relevance,
    relation: expected.relation,
    sufficiency: expected.sufficiency,
    independence: expected.independence,
    hypotheses: 'NOT_APPLICABLE',
    procedure: expected.procedure ?? 'FAIR',
  });
}

describe('canonical judgment QA fixtures', () => {
  it('QA1: rejects the soup receipt as explicitly insufficient', () => {
    const receipt = evidence('ev_qa_receipt', ['TIME', 'LOCATION']);
    const result = resolveArgument(
      input(
        rule(['IDENTITY', 'TIME', 'LOCATION'], {
          insufficient: [['ev_qa_receipt']],
        }),
        [receipt],
      ),
    );

    expect(result.code).toBe('R_INSUFFICIENT_GROUNDS');
    expectAxes(result.axes, {
      relevance: 'PARTIAL',
      relation: 'AMBIGUOUS',
      sufficiency: 'INSUFFICIENT',
      independence: 'MET',
    });
    expect(result.effects.composureDelta).toBe(0);
    expect(result.feedback?.missingScopes).toEqual(['IDENTITY']);
    expect(JSON.stringify(result.feedback)).not.toContain('ev_');
  });

  it('QA2: resolves the gate log as a direct contradiction', () => {
    const gateLog = evidence(
      'ev_qa_gate',
      ['IDENTITY', 'TIME', 'LOCATION'],
      { contradicts: true },
    );
    const result = resolveArgument(
      input(rule(['IDENTITY', 'TIME', 'LOCATION']), [gateLog]),
    );

    expect(result.code).toBe('R_DIRECT_CONTRADICTION');
    expectAxes(result.axes, {
      relevance: 'FULL', relation: 'CONTRADICTS', sufficiency: 'SUFFICIENT',
      independence: 'MET',
    });
    expect(result.effects.composureDelta).toBe(-18);
    expect(result.effects.epistemicState).toBe('REFUTED');
    expect(result.trace).toEqual([
      'ACTION_COMPATIBILITY', 'TARGET_EXPOSURE', 'RELEVANCE', 'RELATION',
      'SCOPE_COVERAGE', 'CONFIDENCE', 'INDEPENDENCE',
      'ALTERNATIVE_HYPOTHESES', 'PROCEDURE', 'LOOKUP',
    ]);
  });

  it('QA3: resolves the late electronic signature as a direct contradiction', () => {
    const signature = evidence('ev_qa_signature', ['TIME'], { contradicts: true });
    const result = resolveArgument(input(rule(['TIME']), [signature]));
    expect(result.code).toBe('R_DIRECT_CONTRADICTION');
    expectAxes(result.axes, {
      relevance: 'FULL', relation: 'CONTRADICTS', sufficiency: 'SUFFICIENT',
      independence: 'MET',
    });
  });

  it('QA4: reports indirect suspicion when independent sources are unmet', () => {
    const ledger = evidence('ev_qa_ledger', ['MOTIVE', 'ACTION'], {
      contradicts: true,
    });
    const result = resolveArgument(
      input(rule(['MOTIVE', 'ACTION'], { minimumSources: 2 }), [ledger]),
    );

    expectAxes(result.axes, {
      relevance: 'FULL', relation: 'CONTRADICTS', sufficiency: 'SUFFICIENT',
      independence: 'UNMET',
    });
    expect(result.code).toBe('R_INDIRECT_SUSPICION');
    expect(result.effects.epistemicState).toBe('SUSPECTED');
  });

  it('QA5: penalizes an attack against a supported truth', () => {
    const schedule = evidence('ev_qa_schedule', ['TIME'], { supports: true });
    const result = resolveArgument(input(rule(['TIME']), [schedule]));
    expect(result.code).toBe('R_TRUTH_ATTACKED');
    expectAxes(result.axes, {
      relevance: 'FULL', relation: 'SUPPORTS', sufficiency: 'SUFFICIENT',
      independence: 'MET',
    });
    expect(result.effects.composureDelta).toBe(0);
    expect(result.effects.coercionDelta).toBe(15);
    expect(result.effects.epistemicState).toBe('PROVISIONAL');
  });

  it('QA6: confirms a truth with supporting evidence', () => {
    const schedule = evidence('ev_qa_schedule', ['TIME'], { supports: true });
    const result = resolveArgument(
      input(rule(['TIME'], { direction: 'SUPPORT' }), [schedule], { intent: 'CONFIRM' }),
    );
    expect(result.code).toBe('R_CONFIRM_LOCKED');
    expectAxes(result.axes, {
      relevance: 'FULL', relation: 'SUPPORTS', sufficiency: 'SUFFICIENT',
      independence: 'MET',
    });
    expect(result.effects.epistemicState).toBe('SUPPORTED');
    expect(result.effects.coercionDelta).toBe(0);
  });

  it('QA7: awards partial credit as indirect suspicion', () => {
    const receipt = evidence('ev_qa_welfare', ['ACTION'], { contradicts: true });
    const result = resolveArgument(
      input(rule(['ACTION', 'SEQUENCE'], { partialRatio: 0.5 }), [receipt]),
    );
    expectAxes(result.axes, {
      relevance: 'PARTIAL', relation: 'CONTRADICTS', sufficiency: 'PROVISIONAL',
      independence: 'MET',
    });
    expect(result.code).toBe('R_INDIRECT_SUSPICION');
  });

  it('QA8: applies the Grade-B independent-source floor', () => {
    const copy = evidence('ev_qa_copy', ['ACTION'], {
      grade: 'B', contradicts: true, sourceId: 'copy-source', group: 'DOCUMENT',
    });
    const proof = rule(['ACTION']);
    const single = resolveArgument(input(proof, [copy]));
    expectAxes(single.axes, {
      relevance: 'FULL', relation: 'CONTRADICTS', sufficiency: 'SUFFICIENT',
      independence: 'UNMET',
    });
    expect(single.code).toBe('R_INDIRECT_SUSPICION');

    const corroboration = evidence('ev_qa_corroboration', ['ACTION'], {
      contradicts: true, sourceId: 'other-source', group: 'DIGITAL',
    });
    const combined = resolveArgument(
      input(proof, [copy, corroboration], {
        evidenceCatalog: [copy, corroboration],
      }),
    );
    expectAxes(combined.axes, {
      relevance: 'FULL', relation: 'CONTRADICTS', sufficiency: 'SUFFICIENT',
      independence: 'MET',
    });
    expect(combined.code).toBe('R_DIRECT_CONTRADICTION');
  });

  it('QA9: intercepts a locked claim without consuming command points', () => {
    const submitted = evidence('ev_qa_unlock_test', ['IDENTITY'], { contradicts: true });
    const proof = rule(['IDENTITY']);
    const locked = resolveArgument(
      input(proof, [submitted], {
        target: claim({ presentation: 'LOCKED' }),
      }),
    );
    expect(locked.code).toBe('R_ACTION_INVALID');
    expect(locked.reason).toBe('SILENCE');
    expect(locked.axes).toEqual({ validity: 'INVALID', procedure: 'FAIR' });
    expect(locked.effects.consumeCommandPoints).toBe(false);
    expect(locked.trace).toEqual(['ACTION_COMPATIBILITY']);

    const unlocked = resolveArgument(
      input(proof, [submitted], {
        target: claim({ presentation: 'NORMAL' }),
      }),
    );
    expect(unlocked.code).toBe('R_DIRECT_CONTRADICTION');
    expectAxes(unlocked.axes, {
      relevance: 'FULL', relation: 'CONTRADICTS', sufficiency: 'SUFFICIENT',
      independence: 'MET',
    });
  });

  it('QA10: preserves an alternate solvable path after evidence destruction', () => {
    const destroyed = evidence('ev_qa_original', ['ACTION', 'INTEGRITY'], {
      integrity: 'DESTROYED', contradicts: true,
    });
    const alternate = evidence('ev_qa_alternate', ['ACTION'], { contradicts: true });
    const directRule = rule(['ACTION', 'INTEGRITY'], {
      guaranteed: [['ev_qa_original']], requireIntegrity: true,
    });
    const alternateRule = rule(['ACTION'], {
      guaranteed: [['ev_qa_alternate']],
    });
    expect(hasSolvableProofPath([directRule, alternateRule], [destroyed, alternate])).toBe(true);
  });

  it('QA11: turns a forbidden procedure into immediate failure', () => {
    const stamped = evidence('ev_qa_stamped', ['ACTION'], { contradicts: true });
    const result = resolveArgument(
      input(rule(['ACTION']), [stamped], { procedure: 'FORBIDDEN' }),
    );
    expect(result.code).toBe('R_PROCEDURE_VIOLATION');
    expectAxes(result.axes, {
      relevance: 'FULL', relation: 'CONTRADICTS', sufficiency: 'SUFFICIENT',
      independence: 'MET', procedure: 'FORBIDDEN',
    });
    expect(result.effects.terminalOutcome).toBe('FAILED');
    expect(result.effects.composureDelta).toBe(0);
  });

  it('QA12: requires both instruction and integrity from independent sources', () => {
    const testimony = evidence('ev_qa_testimony', ['INSTRUCTION'], {
      grade: 'B', contradicts: true, sourceId: 'witness', group: 'TESTIMONY',
    });
    const header = evidence('ev_qa_header', ['INTEGRITY'], {
      contradicts: true, sourceId: 'system', group: 'DIGITAL',
    });
    const proof = rule(['INSTRUCTION', 'INTEGRITY'], { minimumSources: 2 });

    const single = resolveArgument(input(proof, [testimony]));
    expectAxes(single.axes, {
      relevance: 'PARTIAL', sufficiency: 'INSUFFICIENT', independence: 'UNMET',
      relation: 'CONTRADICTS',
    });
    expect(single.code).toBe('R_INSUFFICIENT_GROUNDS');

    const combined = resolveArgument(
      input(proof, [testimony, header], { evidenceCatalog: [testimony, header] }),
    );
    expectAxes(combined.axes, {
      relevance: 'FULL', sufficiency: 'SUFFICIENT', independence: 'MET',
      relation: 'CONTRADICTS',
    });
    expect(combined.code).toBe('R_DIRECT_CONTRADICTION');
  });
});
