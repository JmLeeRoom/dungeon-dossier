import { describe, expect, it } from 'vitest';
import type { EvidenceView, StatementTokenView } from '../../src/dto';
import {
  EPISTEMIC_STATES,
  PRESENTATION_STATES,
  type EpistemicState,
  type PresentationState,
} from '../../src/engine/domain';
import {
  canSubmitInterrogationSelection,
  cardNeedsEvidence,
  type InterrogationCardView,
} from '../../src/ui/screens/interrogation/model';
import {
  interrogationCardAttachments,
  interrogationCardLayerAssetKey,
} from '../../src/ui/screens/interrogation/createInterrogationScreen';
import { buildEvidenceTraySlots } from '../../src/ui/widgets/evidenceTray';
import {
  buildGaugeDisplayModel,
  coercionWarningSlipCount,
} from '../../src/ui/widgets/gauge';
import { buildShieldDisplayModel } from '../../src/ui/widgets/shield';
import {
  deriveFacetTagChipState,
  deriveTagChipState,
  type TagChipState,
} from '../../src/ui/widgets/tagChip';
import { TypewriterStream, caretVisible } from '../../src/ui/widgets/typewriter';

function statementToken(
  overrides: Partial<StatementTokenView> = {},
): StatementTokenView {
  return {
    claimId: 'claim',
    speakerId: 'suspect',
    facet: 'WHO',
    text: '진술',
    epistemic: 'UNKNOWN',
    presentation: 'NORMAL',
    resistance: 1,
    ...overrides,
  };
}

function expectedTagState(
  epistemic: EpistemicState,
  presentation: PresentationState,
): TagChipState {
  if (epistemic === 'REFUTED') return 'BROKEN';
  if (presentation === 'LOCKED' || presentation === 'COMPOUND') return 'SHIELDED';
  if (
    epistemic === 'SUSPECTED' ||
    epistemic === 'PROVISIONAL' ||
    epistemic === 'UNRESOLVED' ||
    presentation === 'DISTORTED' ||
    presentation === 'DUPLICATED'
  ) {
    return 'SHAKEN';
  }
  return 'DEFAULT';
}

const CARDS: readonly InterrogationCardView[] = [
  {
    cardId: 'query',
    title: '질문',
    description: '묻는다',
    intent: 'QUERY',
    cpCost: 1,
    requiresEvidence: false,
  },
  {
    cardId: 'contradict',
    title: '모순 지적',
    description: '증거로 반박한다',
    intent: 'CONTRADICT',
    cpCost: 2,
    requiresEvidence: true,
  },
];

const EVIDENCE: readonly EvidenceView[] = [
  {
    evidenceId: 'ev1',
    displayName: '근무표',
    grade: 'A',
    scopes: ['TIME'],
    notProvenKeys: ['범인을 특정하지 못한다'],
  },
  {
    evidenceId: 'ev2',
    displayName: '사진',
    grade: 'B',
    scopes: ['PRESENCE'],
    notProvenKeys: ['행동을 입증하지 못한다'],
  },
  {
    evidenceId: 'ev3',
    displayName: '지도',
    grade: 'C',
    scopes: ['ROUTE'],
    notProvenKeys: [],
  },
];

describe('tag-chip display derivation', () => {
  it('maps every public epistemic/presentation pair with explicit precedence', () => {
    for (const epistemic of EPISTEMIC_STATES) {
      for (const presentation of PRESENTATION_STATES) {
        expect(
          deriveTagChipState(epistemic, presentation),
          `${epistemic}/${presentation}`,
        ).toBe(expectedTagState(epistemic, presentation));
      }
    }
  });

  it('applies BROKEN > SHIELDED > SHAKEN > DEFAULT across visible facet tokens', () => {
    const tokens = [
      statementToken({ claimId: 'default', epistemic: 'SUPPORTED' }),
      statementToken({ claimId: 'shaken', epistemic: 'SUSPECTED' }),
      statementToken({ claimId: 'shield', presentation: 'LOCKED' }),
      statementToken({ claimId: 'broken', epistemic: 'REFUTED' }),
      statementToken({
        claimId: 'other-facet',
        facet: 'WHEN',
        epistemic: 'REFUTED',
      }),
    ];

    expect(deriveFacetTagChipState('WHO', tokens)).toBe('BROKEN');
    expect(deriveFacetTagChipState('WHEN', tokens)).toBe('BROKEN');
    expect(deriveFacetTagChipState('WHY', tokens)).toBe('DEFAULT');
  });

  it('does not let hidden tokens affect a facet', () => {
    expect(
      deriveFacetTagChipState('WHO', [
        statementToken({ epistemic: 'REFUTED', presentation: 'HIDDEN' }),
      ]),
    ).toBe('DEFAULT');
  });
});

describe('resistance-only shield model', () => {
  it('normalizes the one public durability input without adding a shield type', () => {
    expect(buildShieldDisplayModel(2.6)).toEqual({
      visible: true,
      resistance: 3,
      durabilityLabel: '3',
    });
    expect(Object.keys(buildShieldDisplayModel(2))).toEqual([
      'visible',
      'resistance',
      'durabilityLabel',
    ]);
    expect(buildShieldDisplayModel(-4)).toEqual({
      visible: false,
      resistance: 0,
      durabilityLabel: '0',
    });
    expect(buildShieldDisplayModel(Number.NaN)).toEqual(buildShieldDisplayModel(0));
  });
});

describe('HUD gauge display models', () => {
  it('clamps composure and exposes the 1-30% notch only after unlock', () => {
    expect(buildGaugeDisplayModel(42, 100)).toMatchObject({
      value: 42,
      max: 100,
      ratio: 0.42,
      filledCells: 4,
      cellCount: 10,
      sweetSpot: undefined,
    });
    expect(buildGaugeDisplayModel(120, 100, { sweetSpotUnlocked: true })).toEqual({
      value: 100,
      max: 100,
      ratio: 1,
      filledCells: 10,
      cellCount: 10,
      sweetSpot: { fromRatio: 0.01, toRatio: 0.3 },
    });
    expect(buildGaugeDisplayModel(-10, 0, { cellCount: 0 })).toMatchObject({
      value: 0,
      max: 1,
      filledCells: 0,
      cellCount: 1,
    });
    expect(buildGaugeDisplayModel(42, 120, {
      sweetSpotUnlocked: true,
      sweetSpotMin: 18,
      sweetSpotMax: 42,
    }).sweetSpot).toEqual({ fromRatio: 0.15, toRatio: 0.35 });
    expect(buildGaugeDisplayModel(42, 100, {
      sweetSpotUnlocked: true,
      sweetSpotMin: 60,
      sweetSpotMax: 20,
    }).sweetSpot).toEqual({ fromRatio: 0.2, toRatio: 0.6 });
  });

  it('accumulates at most five coercion warning slips at 20% steps', () => {
    expect(coercionWarningSlipCount(0, 100)).toBe(0);
    expect(coercionWarningSlipCount(19.99, 100)).toBe(0);
    expect(coercionWarningSlipCount(20, 100)).toBe(1);
    expect(coercionWarningSlipCount(99, 100)).toBe(4);
    expect(coercionWarningSlipCount(100, 100)).toBe(5);
    expect(coercionWarningSlipCount(300, 100)).toBe(5);
    expect(coercionWarningSlipCount(Number.NaN, 100)).toBe(0);
    expect(coercionWarningSlipCount(50, 0)).toBe(0);
  });
});

describe('typewriter stream', () => {
  it('starts on the first received character and completes only after catch-up', () => {
    const stream = new TypewriterStream(30);
    expect(stream.append('ABC')).toEqual({
      visibleText: 'A',
      emittedCharacters: 1,
      caughtUp: false,
      complete: false,
    });
    expect(stream.finish().complete).toBe(false);
    expect(stream.advance(29).visibleText).toBe('A');
    expect(stream.advance(1)).toMatchObject({
      visibleText: 'AB',
      emittedCharacters: 1,
      complete: false,
    });
    expect(stream.advance(30)).toMatchObject({
      visibleText: 'ABC',
      emittedCharacters: 1,
      caughtUp: true,
      complete: true,
    });
  });

  it('animates live chunks and the same fallback text identically', () => {
    const live = new TypewriterStream(25);
    const fallback = new TypewriterStream(25);

    live.append('던전');
    live.append(' 수사');
    live.finish();
    fallback.append('던전 수사');
    fallback.finish();

    expect(live.snapshot()).toEqual(fallback.snapshot());
    for (const elapsed of [10, 15, 25, 50, 25]) {
      expect(live.advance(elapsed)).toEqual(fallback.advance(elapsed));
    }
    expect(live.snapshot()).toMatchObject({ visibleText: '던전 수사', complete: true });
  });

  it('uses an equal half-period caret duty cycle', () => {
    expect(caretVisible(0, 100)).toBe(true);
    expect(caretVisible(49, 100)).toBe(true);
    expect(caretVisible(50, 100)).toBe(false);
    expect(caretVisible(100, 100)).toBe(true);
  });
});

describe('card, evidence, and submit selection models', () => {
  it('maps authored card parts and selected evidence to runtime asset layers', () => {
    const card: InterrogationCardView = {
      ...CARDS[1]!,
      attachments: { stampId: 'RED', postId: 'HOW', evidenceIds: ['ev1'] },
    };
    expect(interrogationCardAttachments(card, ['ev1', 'ev2'], true)).toEqual({
      stampId: 'RED',
      postId: 'HOW',
      evidenceIds: ['ev1', 'ev2'],
    });
    expect(interrogationCardAttachments(card, ['ev2'], false).evidenceIds).toEqual(['ev1']);
    expect(interrogationCardLayerAssetKey(card, 'base', undefined, EVIDENCE)).toBe(
      'card/기본/템플릿',
    );
    expect(interrogationCardLayerAssetKey(card, 'illust', undefined, EVIDENCE)).toBe(
      'card/모순/일러',
    );
    expect(interrogationCardLayerAssetKey(card, 'evidence', 'ev2', EVIDENCE)).toBe(
      'ev/사건/증거2',
    );
    expect(interrogationCardLayerAssetKey(card, 'stamp', 'RED', EVIDENCE)).toBeUndefined();
    expect(interrogationCardLayerAssetKey(card, 'post', 'card/clip/기본', EVIDENCE)).toBe(
      'card/clip/기본',
    );
  });

  it('fills three evidence slots in selected-id order and ignores unknown ids', () => {
    const slots = buildEvidenceTraySlots(
      EVIDENCE,
      ['ev2', 'missing', 'ev1', 'ev3'],
      3,
    );
    expect(slots.map((slot) => slot.evidence?.evidenceId)).toEqual(['ev2', 'ev1', 'ev3']);
    expect(slots.every((slot) => slot.selected)).toBe(true);
    expect(buildEvidenceTraySlots(EVIDENCE, [], 3).map((slot) => slot.evidence)).toEqual([
      undefined,
      undefined,
      undefined,
    ]);
  });

  it('requires a known card, a facet, and evidence when the card declares it', () => {
    expect(cardNeedsEvidence(CARDS, 'query')).toBe(false);
    expect(cardNeedsEvidence(CARDS, 'contradict')).toBe(true);
    expect(
      canSubmitInterrogationSelection(CARDS, {
        cardId: 'query',
        facet: 'WHO',
        evidenceIds: [],
      }),
    ).toBe(true);
    expect(
      canSubmitInterrogationSelection(CARDS, {
        cardId: 'contradict',
        facet: 'WHO',
        evidenceIds: [],
      }),
    ).toBe(false);
    expect(
      canSubmitInterrogationSelection(CARDS, {
        cardId: 'contradict',
        facet: 'WHO',
        evidenceIds: ['ev1'],
      }),
    ).toBe(true);
    expect(
      canSubmitInterrogationSelection(CARDS, {
        cardId: 'missing-card',
        facet: 'WHO',
        evidenceIds: [],
      }),
    ).toBe(false);
    expect(
      canSubmitInterrogationSelection(CARDS, {
        cardId: 'query',
        evidenceIds: [],
      }),
    ).toBe(false);
  });
});
