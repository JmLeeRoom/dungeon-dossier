import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('development console release gate', () => {
  it('loads the console only through a DEV-guarded dynamic import', async () => {
    const bootstrap = await readFile('src/app/bootstrap.ts', 'utf8');
    expect(bootstrap).toContain('if (import.meta.env.DEV)');
    expect(bootstrap).toContain("await import('../dev')");
    expect(bootstrap).not.toMatch(/^import .*['"]\.\.\/dev['"];?$/mu);
  });

  it('keeps truth-overlay sentinel text outside the production composition root', async () => {
    const bootstrap = await readFile('src/app/bootstrap.ts', 'utf8');
    expect(bootstrap).not.toContain('TRUTH OVERLAY · DEV BYTES ONLY');
  });
});
