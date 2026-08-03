import { describe, expect, it, vi } from 'vitest';
import { OUTCOME_CODES, type PublicDTO } from '../../src/dto';
import { RESOLUTION_CODES } from '../../src/engine/domain';
import type { AssetSlot } from '../../src/ui/core/assetRegistry';
import {
  assetRegistryKey,
  resolveAsset,
} from '../../src/ui/core/assetResolver';
import {
  dossierPageCount,
  queryDossierRows,
  toggleDossierSelection,
} from '../../src/ui/screens/dossier/model';
import {
  ENDING_DIRECTION_KEYS,
  JUDGMENT_DIRECTION_KEYS,
  OUTCOME_DIRECTION_TABLE,
  RESOLUTION_DIRECTION_TABLE,
  directionForOutcome,
  directionForResolution,
} from '../../src/ui/screens/interrogation/directionTable';

const DTO: PublicDTO = {
  statement: [],
  evidence: [
    {
      evidenceId: 'schedule',
      displayName: '청소 근무표',
      grade: 'A',
      scopes: ['TIME', 'PRESENCE'],
      notProvenKeys: ['범인을 특정하지 못한다'],
    },
    {
      evidenceId: 'photo',
      displayName: '점액 흔적 사진',
      grade: 'B',
      scopes: ['LOCATION'],
      notProvenKeys: ['절도 행동은 입증하지 못한다', '소유자를 입증하지 못한다'],
    },
  ],
  resources: { composure: 60, coercion: 10, commandPoints: 3 },
  objectives: [],
};

describe('FREE_REVIEW dossier projection', () => {
  it('shows titles, proof scopes, not-proven lines, costs, and selection only', () => {
    const before = JSON.stringify(DTO);
    const rows = queryDossierRows({
      dto: DTO,
      selectedEvidenceIds: ['photo'],
      evidenceCosts: { schedule: -2, photo: 2 },
    });

    expect(rows).toEqual([
      {
        evidenceId: 'schedule',
        title: '청소 근무표',
        grade: 'A',
        scopeLabels: ['시간', '현장 존재'],
        notProvenKeys: ['범인을 특정하지 못한다'],
        attachmentCost: 0,
        selected: false,
      },
      {
        evidenceId: 'photo',
        title: '점액 흔적 사진',
        grade: 'B',
        scopeLabels: ['장소'],
        notProvenKeys: ['절도 행동은 입증하지 못한다', '소유자를 입증하지 못한다'],
        attachmentCost: 2,
        selected: true,
      },
    ]);
    expect(JSON.stringify(DTO)).toBe(before);

    const allowedKeys = [
      'attachmentCost',
      'evidenceId',
      'grade',
      'notProvenKeys',
      'scopeLabels',
      'selected',
      'title',
    ];
    for (const row of rows) {
      expect(Object.keys(row).sort()).toEqual(allowedKeys);
      expect(JSON.stringify(row)).not.toMatch(
        /correct|answer|prediction|willContradict|proofRules|truth/iu,
      );
    }
  });

  it('toggles attachment selection without exceeding the three-slot limit', () => {
    expect(toggleDossierSelection(['schedule'], 'schedule')).toEqual([]);
    expect(toggleDossierSelection(['schedule'], 'photo')).toEqual(['schedule', 'photo']);
    expect(toggleDossierSelection(['a', 'b', 'c'], 'd')).toEqual(['a', 'b', 'c']);
    expect(toggleDossierSelection(['a', 'b', 'c'], 'b')).toEqual(['a', 'c']);
  });

  it('keeps even an empty dossier on one page', () => {
    expect(dossierPageCount(0)).toBe(1);
    expect(dossierPageCount(3)).toBe(1);
    expect(dossierPageCount(4)).toBe(2);
    expect(dossierPageCount(10, 4)).toBe(3);
  });
});

describe('declarative direction tables', () => {
  it('covers every ResolutionCode with the committed direction mapping', () => {
    expect(Object.keys(RESOLUTION_DIRECTION_TABLE).sort()).toEqual(
      [...RESOLUTION_CODES].sort(),
    );
    expect(RESOLUTION_DIRECTION_TABLE).toEqual({
      R_DIRECT_CONTRADICTION: 'JUDGMENT_DIRECT',
      R_INDIRECT_SUSPICION: 'JUDGMENT_SUSPICION',
      R_INSUFFICIENT_GROUNDS: 'JUDGMENT_INSUFFICIENT',
      R_TRUTH_ATTACKED: 'JUDGMENT_TRUTH_ATTACK',
      R_IRRELEVANT_EVIDENCE: 'JUDGMENT_IRRELEVANT',
      R_CONFIRM_LOCKED: 'JUDGMENT_INSUFFICIENT',
      R_CONFIRM_PROVISIONAL: 'JUDGMENT_SUSPICION',
      R_CONFIRM_CONFLICT: 'JUDGMENT_TRUTH_ATTACK',
      R_QUERY_SUCCESS: 'JUDGMENT_SUSPICION',
      R_QUERY_BLOCKED: 'JUDGMENT_INSUFFICIENT',
      R_CLARIFY_SUCCESS: 'JUDGMENT_SUSPICION',
      R_CLARIFY_NOOP: 'JUDGMENT_INSUFFICIENT',
      R_COMMIT_SUCCESS: 'JUDGMENT_DIRECT',
      R_COMMIT_REFUSED: 'JUDGMENT_INSUFFICIENT',
      R_FORENSIC_REVEALED: 'JUDGMENT_DIRECT',
      R_PRESSURE_APPLIED: 'JUDGMENT_SUSPICION',
      R_PRESSURE_BACKFIRE: 'JUDGMENT_TRUTH_ATTACK',
      R_RECOVER_APPLIED: 'JUDGMENT_SUSPICION',
      R_SPECIAL_APPLIED: 'JUDGMENT_DIRECT',
      R_ACTION_INVALID: 'JUDGMENT_INSUFFICIENT',
      R_PROCEDURE_VIOLATION: 'JUDGMENT_TRUTH_ATTACK',
    });

    for (const code of RESOLUTION_CODES) {
      const direction = directionForResolution(code);
      expect(JUDGMENT_DIRECTION_KEYS).toContain(direction);
      expect(direction).toBe(RESOLUTION_DIRECTION_TABLE[code]);
    }
  });

  it('covers every OutcomeCode and uses each of the five ending treatments', () => {
    expect(Object.keys(OUTCOME_DIRECTION_TABLE).sort()).toEqual([...OUTCOME_CODES].sort());
    expect(OUTCOME_DIRECTION_TABLE).toEqual({
      O_FULL_STATEMENT: 'ENDING_POLAROID',
      O_ARREST: 'ENDING_TRANSFER_STAMP',
      O_COERCED_CONFESSION: 'ENDING_BGM_MUTE',
      O_COUNSEL_INTERVENTION: 'ENDING_CARD_AND_KNOCK',
      O_OVERWORK: 'ENDING_OVERWORK',
    });
    expect(new Set(Object.values(OUTCOME_DIRECTION_TABLE))).toEqual(
      new Set(ENDING_DIRECTION_KEYS),
    );
    for (const code of OUTCOME_CODES) {
      expect(directionForOutcome(code)).toBe(OUTCOME_DIRECTION_TABLE[code]);
    }
  });
});

describe('runtime asset fallback', () => {
  const exact: AssetSlot = {
    category: 'portrait',
    name: '하피',
    state: 'base',
    url: '/assets/harpy.png',
  };
  const fallback: AssetSlot = {
    category: 'placeholder',
    name: 'missing',
    state: 'fallback',
    url: '/assets/missing.png',
  };

  it('returns an exact registry object without warning', () => {
    const registry = new Map([[assetRegistryKey(exact), exact]]);
    const warn = vi.fn();

    expect(resolveAsset(registry, 'portrait/하피/base', fallback, warn)).toBe(exact);
    expect(
      resolveAsset(
        registry,
        { category: 'portrait', name: '하피', state: 'base' },
        fallback,
        warn,
      ),
    ).toBe(exact);
    expect(warn).not.toHaveBeenCalled();
  });

  it('returns the one supplied fallback and reports the missing exact key', () => {
    const warn = vi.fn();
    expect(
      resolveAsset(new Map(), { category: 'bg', name: 'room', state: 'sepia' }, fallback, warn),
    ).toBe(fallback);
    expect(warn).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith(
      'Missing asset "bg/room/sepia"; using fallback "placeholder/missing/fallback".',
    );
  });

  it('uses console.warn when no warning adapter is supplied', () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(resolveAsset(new Map(), 'ui/unknown/base', fallback)).toBe(fallback);
    expect(warning).toHaveBeenCalledOnce();
  });
});
