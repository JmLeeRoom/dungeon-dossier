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
  interrogationCardKey,
  interrogationCardAllowsFacet,
  selectedInterrogationCard,
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
  applyTagChipDeactivation,
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
    // A facet the statement says nothing public about is an empty slot, not a
    // default one, so it gets its own plate.
    expect(deriveFacetTagChipState('WHY', tokens)).toBe('HIDDEN_SLOT');
  });

  it('reports a facet with only hidden tokens as an empty slot, and nothing more', () => {
    // `toPublicDTO` already dropped the claim. All that survives is the boolean
    // "nothing public here" — never the hidden claim's id or wording.
    expect(
      deriveFacetTagChipState('WHO', [
        statementToken({ epistemic: 'REFUTED', presentation: 'HIDDEN' }),
      ]),
    ).toBe('HIDDEN_SLOT');
    expect(deriveFacetTagChipState('WHO', [])).toBe('HIDDEN_SLOT');
    expect(
      deriveFacetTagChipState('WHO', [statementToken({ epistemic: 'SUPPORTED' })]),
    ).toBe('DEFAULT');
  });

  it('layers DEACTIVATED over any state except an empty slot', () => {
    expect(applyTagChipDeactivation('DEFAULT', true)).toBe('DEFAULT');
    expect(applyTagChipDeactivation('DEFAULT', false)).toBe('DEACTIVATED');
    expect(applyTagChipDeactivation('BROKEN', false)).toBe('DEACTIVATED');
    // An empty slot stays empty: there is nothing there to deactivate.
    expect(applyTagChipDeactivation('HIDDEN_SLOT', false)).toBe('HIDDEN_SLOT');
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
    const evidenceKeys = { ev1: 'ui/card/evidence00', ev2: 'ui/card/evidence02' };
    expect(interrogationCardLayerAssetKey(card, 'base', undefined, evidenceKeys)).toBe(
      'ui/card/base',
    );
    // No approved art for this card id, so it falls back to its intent plate.
    expect(interrogationCardLayerAssetKey(card, 'illust', undefined, evidenceKeys)).toBe(
      'card/모순/일러',
    );
    expect(
      interrogationCardLayerAssetKey(
        { ...card, artAssetKey: 'ui/card/illust02' },
        'illust',
        undefined,
        evidenceKeys,
      ),
    ).toBe('ui/card/illust02');
    // Evidence resolves by id, never by its position in the tray.
    expect(interrogationCardLayerAssetKey(card, 'evidence', 'ev2', evidenceKeys)).toBe(
      'ui/card/evidence02',
    );
    expect(
      interrogationCardLayerAssetKey(card, 'evidence', 'ev_unmapped', evidenceKeys),
    ).toBeUndefined();
    expect(interrogationCardLayerAssetKey(card, 'stamp', 'RED', evidenceKeys)).toBe(
      'ui/card_stamp/pushy',
    );
    expect(interrogationCardLayerAssetKey(card, 'post', 'HOW', evidenceKeys)).toBe('ui/card/post');
    expect(interrogationCardLayerAssetKey(card, 'post', 'CLIP', evidenceKeys)).toBe(
      'ui/card/pushy',
    );
    expect(interrogationCardLayerAssetKey(card, 'post', 'card/clip/기본', evidenceKeys)).toBe(
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
    expect(interrogationCardAllowsFacet({ ...CARDS[0]!, allowedFacets: ['WHEN'] }, 'WHO'))
      .toBe(false);
    expect(interrogationCardAllowsFacet(CARDS[0], 'WHO')).toBe(true);
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
    expect(
      canSubmitInterrogationSelection(
        CARDS.map((card) => card.cardId === 'query' ? { ...card, locked: true } : card),
        { cardId: 'query', facet: 'WHO', evidenceIds: [] },
      ),
    ).toBe(false);
    expect(
      canSubmitInterrogationSelection(
        CARDS.map((card) =>
          card.cardId === 'query' ? { ...card, allowedFacets: ['WHEN'] as const } : card,
        ),
        { cardId: 'query', facet: 'WHO', evidenceIds: [] },
      ),
    ).toBe(false);
  });

  it('enforces the combat target matrix, exact evidence count, and current CP', () => {
    const combatCard = (
      cardId: string,
      targetRule: NonNullable<InterrogationCardView['combat']>['targetRule'],
      evidenceMode: NonNullable<InterrogationCardView['combat']>['evidenceMode'],
      affordable = true,
    ): InterrogationCardView => ({
      cardId,
      title: cardId,
      description: '',
      intent: 'CONTRADICT',
      cpCost: 1,
      requiresEvidence: evidenceMode === 'EXACTLY_ONE',
      affordable,
      combat: { roleLabel: '역할', targetRule, evidenceMode },
    });
    const leading = combatCard('leading', 'GAP_OR_SHIELD_ATTEMPT', 'OPTIONAL_FOR_SHIELD');
    const toss = combatCard('toss', 'GAP_OR_BROKEN', 'NONE');
    const finisher = combatCard('finisher', 'BROKEN', 'EXACTLY_ONE');
    const proof = combatCard('proof', 'ANY_CLAIM', 'EXACTLY_ONE');
    const broke = combatCard('broke', 'ANY_CLAIM', 'NONE', false);
    const cards = [leading, toss, finisher, proof, broke];

    expect(interrogationCardAllowsFacet(leading, 'WHO', 'GAP')).toBe(true);
    expect(interrogationCardAllowsFacet(leading, 'WHO', 'SHIELDED')).toBe(true);
    expect(interrogationCardAllowsFacet(leading, 'WHO', 'BROKEN')).toBe(false);
    expect(interrogationCardAllowsFacet(toss, 'WHO', 'SHIELDED')).toBe(false);
    expect(interrogationCardAllowsFacet(toss, 'WHO', 'BROKEN')).toBe(true);
    expect(interrogationCardAllowsFacet(finisher, 'WHO', 'GAP')).toBe(false);
    expect(interrogationCardAllowsFacet(finisher, 'WHO', 'BROKEN')).toBe(true);

    const submit = (cardId: string, evidenceIds: readonly string[], exposure: 'GAP' | 'SHIELDED' | 'BROKEN') =>
      canSubmitInterrogationSelection(
        cards,
        { cardId, facet: 'WHO', evidenceIds },
        { WHO: exposure },
      );
    expect(submit('leading', [], 'GAP')).toBe(true);
    expect(submit('leading', ['ev'], 'GAP')).toBe(false);
    expect(submit('leading', [], 'SHIELDED')).toBe(false);
    expect(submit('leading', ['ev'], 'SHIELDED')).toBe(true);
    expect(submit('leading', ['ev1', 'ev2'], 'SHIELDED')).toBe(false);
    expect(submit('toss', [], 'BROKEN')).toBe(true);
    expect(submit('toss', ['ev'], 'BROKEN')).toBe(false);
    expect(submit('finisher', ['ev'], 'BROKEN')).toBe(true);
    expect(submit('finisher', [], 'BROKEN')).toBe(false);
    expect(submit('proof', ['ev'], 'SHIELDED')).toBe(true);
    expect(submit('broke', [], 'GAP')).toBe(false);
  });

  it('resolves duplicate blueprints by instance instead of the first card id match', () => {
    const duplicates: readonly InterrogationCardView[] = [
      { ...CARDS[0]!, instanceId: 'copy-1', affordable: false },
      { ...CARDS[0]!, instanceId: 'copy-2', affordable: true },
    ];
    expect(interrogationCardKey(duplicates[0]!, 0)).toBe('copy-1');
    expect(interrogationCardKey(duplicates[1]!, 1)).toBe('copy-2');
    expect(selectedInterrogationCard(duplicates, {
      cardId: 'query',
      instanceId: 'copy-2',
    })).toBe(duplicates[1]);
    expect(canSubmitInterrogationSelection(duplicates, {
      cardId: 'query',
      instanceId: 'copy-2',
      facet: 'WHO',
      evidenceIds: [],
    })).toBe(true);
    expect(canSubmitInterrogationSelection(duplicates, {
      cardId: 'query',
      instanceId: 'copy-1',
      facet: 'WHO',
      evidenceIds: [],
    })).toBe(false);
    expect(canSubmitInterrogationSelection(duplicates, {
      cardId: 'query',
      instanceId: 'missing-copy',
      facet: 'WHO',
      evidenceIds: [],
    })).toBe(false);
  });
});
