import { describe, expect, it } from 'vitest';

import {
  errorBannerActions,
  RUN_FLOW_ERROR_MESSAGE,
} from '../../src/ui/screens/error';

describe('recoverable run error banner', () => {
  it('uses readable Korean recovery copy instead of raw exception text', () => {
    expect(RUN_FLOW_ERROR_MESSAGE).toBe(
      '수사 진행 중 오류가 발생했습니다. 이전 상태로 복구합니다.',
    );
  });

  it('always exposes retry and run-strip return actions', () => {
    expect(errorBannerActions()).toEqual([
      { id: 'RETRY', label: '다시 시도' },
      { id: 'RETURN_TO_STRIP', label: '진행 기록으로 복귀' },
    ]);
  });
});
