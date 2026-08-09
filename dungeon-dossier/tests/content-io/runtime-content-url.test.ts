import { describe, expect, it } from 'vitest';

import { runtimeContentUrl } from '../../src/content-io/runtimeContentUrl';

describe('runtimeContentUrl', () => {
  it('keeps the development root contract', () => {
    expect(runtimeContentUrl('common/cards.json', '/')).toBe('/content/common/cards.json');
  });

  it('follows a relative production base under a nested deployment path', () => {
    expect(runtimeContentUrl('/cases/tutorial/case.json', './')).toBe(
      './content/cases/tutorial/case.json',
    );
    expect(runtimeContentUrl('common/cards.json', '/dungeon-dossier/')).toBe(
      '/dungeon-dossier/content/common/cards.json',
    );
  });

  it('rejects an empty or escaping path', () => {
    expect(() => runtimeContentUrl('', './')).toThrow(/inside content/u);
    expect(() => runtimeContentUrl('../secret.json', './')).toThrow(/inside content/u);
  });
});
