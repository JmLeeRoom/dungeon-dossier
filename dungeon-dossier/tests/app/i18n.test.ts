import { afterEach, describe, expect, it } from 'vitest';

import { clearStrings, hasString, installStrings, t } from '../../src/app/i18n';

describe('Korean string resolver', () => {
  afterEach(() => {
    clearStrings();
  });

  it('resolves installed keys before caller fallbacks', () => {
    installStrings({
      'event.sample.title': '현장 조사',
    });

    expect(t('event.sample.title', '대체 제목')).toBe('현장 조사');
    expect(hasString('event.sample.title')).toBe(true);
  });

  it('uses an explicit fallback and keeps an unhandled key visible for diagnostics', () => {
    expect(t('event.missing.title', '알 수 없는 이벤트')).toBe('알 수 없는 이벤트');
    expect(t('event.missing.title')).toBe('event.missing.title');
    expect(t(undefined, '빈 라벨')).toBe('빈 라벨');
  });
});
