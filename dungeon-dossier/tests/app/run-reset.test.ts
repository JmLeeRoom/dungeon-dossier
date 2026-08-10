import { describe, expect, it } from 'vitest';

import { isRunResetRequested } from '../../src/app/runReset';

describe('run reset query contract', () => {
  it.each([
    ['1', true],
    ['true', true],
    ['0', false],
    ['false', false],
    ['', false],
    [null, false],
  ] as const)('parses reset=%s as %s', (value, expected) => {
    expect(isRunResetRequested(value)).toBe(expected);
  });
});
