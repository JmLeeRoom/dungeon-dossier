import { describe, expect, it } from 'vitest';
import type { FallbackCatalog } from '../../src/ai';
import {
  createPhase4DialogueService,
  toComposureBand,
} from '../../src/app/createPhase4DialogueService';

const catalog: FallbackCatalog = {
  statements: {
    'runtime-claim': [
      {
        full_text: '사전 작성 진술',
        tokens: [
          {
            token_id: 'authored-token',
            claim_ids: ['runtime-claim'],
            text: '사전 작성 진술',
            span_start: 0,
            span_end: 8,
          },
        ],
      },
    ],
  },
  reactions: {},
};

describe('Phase 4 dialogue app composition', () => {
  it('uses the P0 authored fallback without a network dependency', async () => {
    const service = await createPhase4DialogueService({
      speakerProfile: {
        race: 'SLIME',
        personality: ['TIMID'],
        speech: 'POLITE',
        forbidden_expressions: ['사실은'],
      },
      fallbackCatalog: catalog,
    });
    const line = await service.renderStatement(
      {
        allowedClaims: [
          {
            claimId: 'runtime-claim',
            canonicalMeaning: '허용된 의미',
            facet: 'WHO',
          },
        ],
        reactionKey: 'runtime-reaction',
        missingScopes: [],
        seed: 7,
      },
      { aiEnabled: false, composureBand: 'MID' },
    );

    expect(line).toBe('사전 작성 진술');
    expect(service.generationSummary()).toMatchObject({
      total_generations: 1,
      live_validations: 0,
      fallback_generations: 1,
      prompt_revision_required: false,
    });
  });

  it('maps exact composure only to a coarse public band', () => {
    expect(toComposureBand(76, 100)).toBe('HIGH');
    expect(toComposureBand(75, 100)).toBe('MID');
    expect(toComposureBand(50, 100)).toBe('LOW');
    expect(toComposureBand(25, 100)).toBe('CRITICAL');
    expect(() => toComposureBand(1, 0)).toThrow('positive maximum');
  });
});
