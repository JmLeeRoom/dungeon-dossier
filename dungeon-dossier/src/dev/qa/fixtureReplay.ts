import type { Grade, ProofScope } from '../../engine/domain';
import {
  hasSolvableProofPath,
  resolveArgument,
  type HypothesisResult,
  type Independence,
  type Relation,
  type Relevance,
  type Resolution,
  type ResolutionClaim,
  type ResolutionCode,
  type ResolutionEvidence,
  type ResolutionInput,
  type ResolutionProofRule,
  type ResolverBalance,
  type Sufficiency,
} from '../../engine/resolution';

export const QA_FIXTURE_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;
export type QaFixtureNumber = (typeof QA_FIXTURE_NUMBERS)[number];

/** The five axes consumed by the production resolution lookup table. */
export interface FiveAxisSnapshot {
  readonly relevance: Relevance | null;
  readonly relation: Relation | null;
  readonly sufficiency: Sufficiency | null;
  readonly independence: Independence | null;
  readonly hypotheses: HypothesisResult | null;
}

export interface QaReplayResolution {
  readonly label: string;
  readonly code: ResolutionCode;
  readonly axes: FiveAxisSnapshot;
}

export interface QaFixtureReplay {
  readonly fixture: QaFixtureNumber;
  readonly title: string;
  readonly resolutions: readonly QaReplayResolution[];
  readonly solvablePath: boolean | null;
}

export class QaFixtureAssertionError extends Error {
  readonly fixture: QaFixtureNumber;
  readonly step: string;

  constructor(fixture: QaFixtureNumber, step: string, message: string) {
    super(`QA${fixture.toString()} ${step}: ${message}`);
    this.name = 'QaFixtureAssertionError';
    this.fixture = fixture;
    this.step = step;
  }
}

const QA_BALANCE: ResolverBalance = {
  directContradictionDamage: 18,
  indirectSuspicionDamage: 5,
  coercion: {
    directContradiction: 1,
    indirectSuspicion: 1,
    insufficient: 2,
    truthAttack: 15,
    irrelevant: 7,
  },
  committedMultiplier: 1.4,
  independencePartialWeight: 0.5,
};

// These IDs are deliberately isolated in src/dev. The dev console replays
// synthetic data and must never make a shipped case depend on fixture IDs.
const TARGET_CLAIM_ID = 'clm_dev_qa_target';
const TARGET_SPEAKER_ID = 'ent_dev_qa_speaker';
const RULE_ID = 'pr_dev_qa_rule';

function createClaim(overrides: Partial<ResolutionClaim> = {}): ResolutionClaim {
  return {
    claimId: TARGET_CLAIM_ID,
    speakerId: TARGET_SPEAKER_ID,
    facet: 'WHERE',
    predicate: 'LOCATED_AT',
    canonicalMeaning: '개발 QA 검증 대상 진술',
    commitment: 'ASSERTED',
    epistemic: 'UNKNOWN',
    presentation: 'NORMAL',
    ...overrides,
  };
}

interface EvidenceOptions {
  readonly grade?: Grade;
  readonly sourceId?: string;
  readonly group?: string;
  readonly derivedFrom?: string | null;
  readonly confidence?: number;
  readonly supports?: boolean;
  readonly contradicts?: boolean;
  readonly integrity?: ResolutionEvidence['integrity'];
}

function createEvidence(
  evidenceId: string,
  scopes: readonly ProofScope[],
  options: EvidenceOptions = {},
): ResolutionEvidence {
  return {
    evidenceId,
    grade: options.grade ?? 'A',
    integrity: options.integrity ?? 'INTACT',
    independence: {
      sourceId: options.sourceId ?? evidenceId,
      group: options.group ?? evidenceId,
      derivedFrom: options.derivedFrom ?? null,
    },
    observations: [
      {
        predicate: 'OBSERVATION',
        scopes,
        confidence: options.confidence ?? 0.95,
        ...(options.supports === true ? { supportsClaimIds: [TARGET_CLAIM_ID] } : {}),
        ...(options.contradicts === true
          ? { contradictsClaimIds: [TARGET_CLAIM_ID] }
          : {}),
      },
    ],
  };
}

interface RuleOptions {
  readonly direction?: ResolutionProofRule['direction'];
  readonly minimumSources?: number;
  readonly minimumConfidence?: number;
  readonly guaranteed?: readonly (readonly string[])[];
  readonly insufficient?: readonly (readonly string[])[];
  readonly partialRatio?: number;
  readonly requireIntegrity?: boolean;
}

function createRule(
  requiredScopes: readonly ProofScope[],
  options: RuleOptions = {},
): ResolutionProofRule {
  return {
    ruleId: RULE_ID,
    targetClaimId: TARGET_CLAIM_ID,
    direction: options.direction ?? 'CONTRADICT',
    requirements: {
      requiredScopes,
      minimumConfidence: options.minimumConfidence ?? 0.9,
      minimumIndependentSources: options.minimumSources ?? 1,
      ...(options.requireIntegrity === undefined
        ? {}
        : { requireIntegrity: options.requireIntegrity }),
    },
    ...(options.guaranteed === undefined
      ? {}
      : { guaranteedEvidenceSets: options.guaranteed }),
    ...(options.insufficient === undefined
      ? {}
      : { knownInsufficientSets: options.insufficient }),
    ...(options.partialRatio === undefined
      ? {}
      : {
          partialCredit: {
            scopesCoveredRatio: options.partialRatio,
            result: 'SUSPECTED' as const,
          },
        }),
  };
}

function createInput(
  proofRule: ResolutionProofRule,
  evidence: readonly ResolutionEvidence[],
  overrides: Partial<ResolutionInput> = {},
): ResolutionInput {
  return {
    intent: 'CONTRADICT',
    targetKind: 'CLAIM',
    target: createClaim(),
    targetExposed: true,
    evidence,
    evidenceCatalog: evidence,
    proofRule,
    procedure: 'FAIR',
    balance: QA_BALANCE,
    commandPointCost: 1,
    ...overrides,
  };
}

function snapshotAxes(result: Resolution): FiveAxisSnapshot {
  return {
    relevance: result.axes.relevance ?? null,
    relation: result.axes.relation ?? null,
    sufficiency: result.axes.sufficiency ?? null,
    independence: result.axes.independence ?? null,
    hypotheses: result.axes.hypotheses ?? null,
  };
}

function printable(value: unknown): string {
  return JSON.stringify(value);
}

function assertValue(
  fixture: QaFixtureNumber,
  step: string,
  field: string,
  actual: unknown,
  expected: unknown,
): void {
  if (Object.is(actual, expected)) return;
  throw new QaFixtureAssertionError(
    fixture,
    step,
    `${field} expected ${printable(expected)}, received ${printable(actual)}`,
  );
}

function assertArray(
  fixture: QaFixtureNumber,
  step: string,
  field: string,
  actual: readonly unknown[],
  expected: readonly unknown[],
): void {
  if (
    actual.length === expected.length &&
    actual.every((value, index) => Object.is(value, expected[index]))
  ) {
    return;
  }
  throw new QaFixtureAssertionError(
    fixture,
    step,
    `${field} expected ${printable(expected)}, received ${printable(actual)}`,
  );
}

function assertResolution(
  fixture: QaFixtureNumber,
  label: string,
  input: ResolutionInput,
  expectedCode: ResolutionCode,
  expectedAxes: FiveAxisSnapshot,
): Readonly<{ report: QaReplayResolution; result: Resolution }> {
  const result = resolveArgument(input);
  const axes = snapshotAxes(result);
  assertValue(fixture, label, 'code', result.code, expectedCode);
  for (const axis of [
    'relevance',
    'relation',
    'sufficiency',
    'independence',
    'hypotheses',
  ] as const) {
    assertValue(fixture, label, `axes.${axis}`, axes[axis], expectedAxes[axis]);
  }
  return { report: { label, code: result.code, axes }, result };
}

const FULL_DIRECT_AXES: FiveAxisSnapshot = {
  relevance: 'FULL',
  relation: 'CONTRADICTS',
  sufficiency: 'SUFFICIENT',
  independence: 'MET',
  hypotheses: 'NOT_APPLICABLE',
};

function report(
  fixture: QaFixtureNumber,
  title: string,
  resolutions: readonly QaReplayResolution[],
  solvablePath: boolean | null = null,
): QaFixtureReplay {
  return { fixture, title, resolutions, solvablePath };
}

function replayQa1(): QaFixtureReplay {
  const fixture = 1;
  const receiptId = 'ev_dev_qa_receipt';
  const receipt = createEvidence(receiptId, ['IDENTITY', 'LOCATION']);
  const replay = assertResolution(
    fixture,
    '국밥집 영수증 단독',
    createInput(
      createRule(['IDENTITY', 'TIME', 'LOCATION'], { insufficient: [[receiptId]] }),
      [receipt],
    ),
    'R_INSUFFICIENT_GROUNDS',
    {
      relevance: 'PARTIAL',
      relation: 'AMBIGUOUS',
      sufficiency: 'INSUFFICIENT',
      independence: 'MET',
      hypotheses: 'NOT_APPLICABLE',
    },
  );
  assertArray(fixture, replay.report.label, 'missingScopes', replay.result.feedback?.missingScopes ?? [], ['TIME']);
  return report(fixture, '입증 범위 함정', [replay.report]);
}

function replayQa2(): QaFixtureReplay {
  const fixture = 2;
  const gateLog = createEvidence(
    'ev_dev_qa_gate_log',
    ['IDENTITY', 'TIME', 'LOCATION'],
    { contradicts: true },
  );
  const replay = assertResolution(
    fixture,
    'GATE-04 출입 로그',
    createInput(createRule(['IDENTITY', 'TIME', 'LOCATION']), [gateLog]),
    'R_DIRECT_CONTRADICTION',
    FULL_DIRECT_AXES,
  );
  return report(fixture, '직접 모순', [replay.report]);
}

function replayQa3(): QaFixtureReplay {
  const fixture = 3;
  const signature = createEvidence('ev_dev_qa_signature', ['TIME'], { contradicts: true });
  const replay = assertResolution(
    fixture,
    '23:07 전자 서명',
    createInput(createRule(['TIME']), [signature]),
    'R_DIRECT_CONTRADICTION',
    FULL_DIRECT_AXES,
  );
  return report(fixture, '전자 서명 시각 모순', [replay.report]);
}

function replayQa4(): QaFixtureReplay {
  const fixture = 4;
  const ledger = createEvidence('ev_dev_qa_ledger', ['MOTIVE', 'ACTION'], {
    contradicts: true,
  });
  const replay = assertResolution(
    fixture,
    '빨간 장부 단독',
    createInput(createRule(['MOTIVE', 'ACTION'], { minimumSources: 2 }), [ledger]),
    'R_INDIRECT_SUSPICION',
    { ...FULL_DIRECT_AXES, independence: 'UNMET' },
  );
  return report(fixture, '독립 출처 부족', [replay.report]);
}

function replayQa5(): QaFixtureReplay {
  const fixture = 5;
  const schedule = createEvidence('ev_dev_qa_truth_schedule', ['TIME'], { supports: true });
  const replay = assertResolution(
    fixture,
    '진실 태그 공격',
    createInput(createRule(['TIME']), [schedule]),
    'R_TRUTH_ATTACKED',
    { ...FULL_DIRECT_AXES, relation: 'SUPPORTS' },
  );
  assertValue(fixture, replay.report.label, 'composureDelta', replay.result.effects.composureDelta, 0);
  assertValue(fixture, replay.report.label, 'coercionDelta', replay.result.effects.coercionDelta, 15);
  return report(fixture, '진실 공격 페널티', [replay.report]);
}

function replayQa6(): QaFixtureReplay {
  const fixture = 6;
  const schedule = createEvidence('ev_dev_qa_confirm_schedule', ['TIME'], { supports: true });
  const replay = assertResolution(
    fixture,
    '사실 확인 + 청소 근무표',
    createInput(createRule(['TIME'], { direction: 'SUPPORT' }), [schedule], {
      intent: 'CONFIRM',
    }),
    'R_CONFIRM_LOCKED',
    { ...FULL_DIRECT_AXES, relation: 'SUPPORTS' },
  );
  assertValue(
    fixture,
    replay.report.label,
    'epistemicState',
    replay.result.effects.epistemicState,
    'SUPPORTED',
  );
  return report(fixture, '사실 확인 고정', [replay.report]);
}

function replayQa7(): QaFixtureReplay {
  const fixture = 7;
  const receipt = createEvidence('ev_dev_qa_welfare_receipt', ['ACTION'], {
    contradicts: true,
  });
  const replay = assertResolution(
    fixture,
    '붉은 복지비 영수증 단독',
    createInput(createRule(['ACTION', 'SEQUENCE'], { partialRatio: 0.5 }), [receipt]),
    'R_INDIRECT_SUSPICION',
    {
      relevance: 'PARTIAL',
      relation: 'CONTRADICTS',
      sufficiency: 'PROVISIONAL',
      independence: 'MET',
      hypotheses: 'NOT_APPLICABLE',
    },
  );
  return report(fixture, '부분 입증', [replay.report]);
}

function replayQa8(): QaFixtureReplay {
  const fixture = 8;
  const copy = createEvidence('ev_dev_qa_duplicate_copy', ['ACTION'], {
    grade: 'B',
    contradicts: true,
    sourceId: 'dev-qa-copy-source',
    group: 'DOCUMENT',
  });
  const proof = createRule(['ACTION']);
  const single = assertResolution(
    fixture,
    '사본 B 단독',
    createInput(proof, [copy]),
    'R_INDIRECT_SUSPICION',
    { ...FULL_DIRECT_AXES, independence: 'UNMET' },
  );

  const corroboration = createEvidence('ev_dev_qa_copy_corroboration', ['ACTION'], {
    contradicts: true,
    sourceId: 'dev-qa-independent-source',
    group: 'DIGITAL',
  });
  const combined = assertResolution(
    fixture,
    '독립 증거 추가',
    createInput(proof, [copy, corroboration], { evidenceCatalog: [copy, corroboration] }),
    'R_DIRECT_CONTRADICTION',
    FULL_DIRECT_AXES,
  );
  return report(fixture, 'Grade-B 독립 출처 하한', [single.report, combined.report]);
}

function replayQa9(): QaFixtureReplay {
  const fixture = 9;
  const submitted = createEvidence('ev_dev_qa_locked_claim', ['IDENTITY'], {
    contradicts: true,
  });
  const replay = assertResolution(
    fixture,
    '잠금 태그 조기 공격',
    createInput(createRule(['IDENTITY']), [submitted], {
      target: createClaim({ presentation: 'LOCKED' }),
    }),
    'R_ACTION_INVALID',
    {
      relevance: null,
      relation: null,
      sufficiency: null,
      independence: null,
      hypotheses: null,
    },
  );
  assertValue(fixture, replay.report.label, 'reason', replay.result.reason, 'SILENCE');
  return report(fixture, '묵비권 잠금', [replay.report]);
}

function replayQa10(): QaFixtureReplay {
  const fixture = 10;
  const originalId = 'ev_dev_qa_destroyed_original';
  const alternateId = 'ev_dev_qa_alternate_path';
  const destroyed = createEvidence(originalId, ['ACTION', 'INTEGRITY'], {
    integrity: 'DESTROYED',
    contradicts: true,
  });
  const alternate = createEvidence(alternateId, ['ACTION'], { contradicts: true });
  const directRule = createRule(['ACTION', 'INTEGRITY'], {
    guaranteed: [[originalId]],
    requireIntegrity: true,
  });
  const alternateRule = createRule(['ACTION'], { guaranteed: [[alternateId]] });

  const destroyedPath = assertResolution(
    fixture,
    '파쇄된 원본 경로',
    createInput(directRule, [destroyed]),
    'R_INSUFFICIENT_GROUNDS',
    { ...FULL_DIRECT_AXES, sufficiency: 'INSUFFICIENT' },
  );
  const alternatePath = assertResolution(
    fixture,
    '분할 정산표 대체 경로',
    createInput(alternateRule, [alternate]),
    'R_DIRECT_CONTRADICTION',
    FULL_DIRECT_AXES,
  );

  const solvablePath = hasSolvableProofPath(
    [directRule, alternateRule],
    [destroyed, alternate],
  );
  assertValue(fixture, '대체 경로 검사', 'hasSolvableProofPath', solvablePath, true);
  return report(
    fixture,
    '파쇄 후 해결 경로 보존',
    [destroyedPath.report, alternatePath.report],
    solvablePath,
  );
}

function replayQa11(): QaFixtureReplay {
  const fixture = 11;
  const stamped = createEvidence('ev_dev_qa_forbidden_stamp', ['ACTION'], {
    contradicts: true,
  });
  const replay = assertResolution(
    fixture,
    '변호인 페이즈 빨간 도장',
    createInput(createRule(['ACTION']), [stamped], { procedure: 'FORBIDDEN' }),
    'R_PROCEDURE_VIOLATION',
    FULL_DIRECT_AXES,
  );
  assertValue(
    fixture,
    replay.report.label,
    'terminalOutcome',
    replay.result.effects.terminalOutcome,
    'FAILED',
  );
  return report(fixture, '금지 절차 즉시 실패', [replay.report]);
}

function replayQa12(): QaFixtureReplay {
  const fixture = 12;
  const testimony = createEvidence('ev_dev_qa_testimony', ['INSTRUCTION'], {
    grade: 'B',
    contradicts: true,
    sourceId: 'dev-qa-witness',
    group: 'TESTIMONY',
  });
  const header = createEvidence('ev_dev_qa_remote_header', ['INTEGRITY'], {
    contradicts: true,
    sourceId: 'dev-qa-system',
    group: 'DIGITAL',
  });
  const proof = createRule(['INSTRUCTION', 'INTEGRITY'], { minimumSources: 2 });

  const single = assertResolution(
    fixture,
    '증언 B 단독',
    createInput(proof, [testimony]),
    'R_INSUFFICIENT_GROUNDS',
    {
      relevance: 'PARTIAL',
      relation: 'CONTRADICTS',
      sufficiency: 'INSUFFICIENT',
      independence: 'UNMET',
      hypotheses: 'NOT_APPLICABLE',
    },
  );
  const combined = assertResolution(
    fixture,
    '원격지시 헤더 병용',
    createInput(proof, [testimony, header], { evidenceCatalog: [testimony, header] }),
    'R_DIRECT_CONTRADICTION',
    FULL_DIRECT_AXES,
  );
  return report(fixture, '최종 교차 검증', [single.report, combined.report]);
}

const REPLAYERS = {
  1: replayQa1,
  2: replayQa2,
  3: replayQa3,
  4: replayQa4,
  5: replayQa5,
  6: replayQa6,
  7: replayQa7,
  8: replayQa8,
  9: replayQa9,
  10: replayQa10,
  11: replayQa11,
  12: replayQa12,
} as const satisfies Readonly<Record<QaFixtureNumber, () => QaFixtureReplay>>;

export function replayQaFixture(fixture: QaFixtureNumber): QaFixtureReplay {
  return REPLAYERS[fixture]();
}

export function replayAllQaFixtures(): readonly QaFixtureReplay[] {
  return QA_FIXTURE_NUMBERS.map(replayQaFixture);
}
