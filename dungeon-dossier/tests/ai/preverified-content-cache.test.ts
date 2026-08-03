import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  CacheProvider,
  importPreverifiedDialogueCache,
  MemoryDialogueCache,
  OutputValidator,
  type StatementRequest,
} from '../../src/ai';

const tutorialRequest: StatementRequest = {
  speaker_profile: {
    race: 'SLIME',
    personality: ['TIMID'],
    speech: 'POLITE_TREMBLING',
    forbidden_expressions: ['사실은', '거짓말'],
  },
  allowed_claims: [
    {
      claimId: 'clm_tutorial_who',
      canonicalMeaning: '사건 시간대 탕비실에는 자신 혼자 있었다',
      facet: 'WHO',
    },
  ],
  presentation_groups: [],
  forbidden_information: [
    'truth_relation',
    'proof_rules',
    'hypotheses',
    'exact_composure',
  ],
  seed: 0,
};

describe('preverified content AI cache', () => {
  it('validates once and replays the tutorial Slime segment by content hash', async () => {
    const file = JSON.parse(
      await readFile(
        new URL('../../content/ai-cache/tutorial-slime-full-statement.json', import.meta.url),
        'utf8',
      ),
    ) as unknown;
    const cache = new MemoryDialogueCache();
    await expect(importPreverifiedDialogueCache(file, cache)).resolves.toBe(1);
    const provider = new CacheProvider(cache, {
      promptVersion: 'phase4-v1',
      modelId: 'claude-proxy',
    });
    const response = await provider.renderStatement(tutorialRequest);
    const validation = new OutputValidator({
      maxOutOfTokenCharacters: 80,
      allowedTimeHours: [17],
    }).validateStatement(response, tutorialRequest);

    expect(validation.valid).toBe(true);
    expect(response).toMatchObject({
      request_id: 'cache-tutorial-slime-full-v1',
      model_id: 'cache-preverified',
      seed: 0,
    });
  });
});
