import { describe, expect, it, vi, type Mock } from 'vitest';

import {
  createFlowErrorBoundary,
  type FlowErrorRecoveryCallbacks,
} from '../../src/app/flowErrorBoundary';

interface BoundaryFixture {
  readonly callbacks: FlowErrorRecoveryCallbacks[];
  readonly disposals: number[];
  readonly reported: unknown[];
  readonly bannerErrors: unknown[];
  readonly safeReturn: Mock<() => void>;
  readonly technicalError: () => string | undefined;
  readonly boundary: ReturnType<typeof createFlowErrorBoundary>;
}

function fixture(
  safeReturn: Mock<() => void> = vi.fn((): void => undefined),
): BoundaryFixture {
  const callbacks: FlowErrorRecoveryCallbacks[] = [];
  const disposals: number[] = [];
  const reported: unknown[] = [];
  const bannerErrors: unknown[] = [];
  let technicalError: string | undefined;
  const boundary = createFlowErrorBoundary({
    userMessage: '사용자 복구 메시지',
    publishTechnicalError(message): void {
      technicalError = message;
    },
    clearTechnicalError(): void {
      technicalError = undefined;
    },
    reportError(error): void {
      reported.push(error);
    },
    reportBannerError(error): void {
      bannerErrors.push(error);
    },
    showBanner(message, recoveryCallbacks): () => void {
      expect(message).toBe('사용자 복구 메시지');
      const index = callbacks.length;
      callbacks.push(recoveryCallbacks);
      disposals[index] = 0;
      return () => {
        disposals[index] = (disposals[index] ?? 0) + 1;
      };
    },
    returnToSafeState: safeReturn,
  });
  return {
    callbacks,
    disposals,
    reported,
    bannerErrors,
    safeReturn,
    technicalError: () => technicalError,
    boundary,
  };
}

describe('recoverable flow-error boundary', () => {
  it('publishes the technical error and clears it after a successful retry', () => {
    const state = fixture();
    const retry = vi.fn();
    const error = new Error('boundary failed');

    state.boundary.handle(error, retry);

    expect(state.technicalError()).toBe('boundary failed');
    expect(state.reported).toEqual([error]);
    expect(state.callbacks).toHaveLength(1);
    state.callbacks[0]?.onRetry();

    expect(retry).toHaveBeenCalledOnce();
    expect(state.technicalError()).toBeUndefined();
    expect(state.disposals).toEqual([1]);
    expect(state.bannerErrors).toEqual([]);
  });

  it('opens a fresh banner and preserves the exact operation when retry fails', () => {
    const state = fixture();
    const retry = vi.fn()
      .mockImplementationOnce(() => {
        throw new Error('retry failed');
      })
      .mockImplementationOnce(() => undefined);

    state.boundary.handle(new Error('initial failure'), retry);
    state.callbacks[0]?.onRetry();

    expect(retry).toHaveBeenCalledTimes(1);
    expect(state.callbacks).toHaveLength(2);
    expect(state.technicalError()).toBe('retry failed');
    expect(state.disposals).toEqual([1, 0]);

    state.callbacks[1]?.onRetry();
    expect(retry).toHaveBeenCalledTimes(2);
    expect(state.technicalError()).toBeUndefined();
    expect(state.disposals).toEqual([1, 1]);
  });

  it('retries a failed safe-return action without replaying the original operation', () => {
    const safeReturn = vi.fn()
      .mockImplementationOnce(() => {
        throw new Error('safe return failed');
      })
      .mockImplementationOnce(() => undefined);
    const state = fixture(safeReturn);
    const originalRetry = vi.fn();

    state.boundary.handle(new Error('committed boundary routing failed'), originalRetry);
    state.callbacks[0]?.onReturnToSafeState();

    expect(safeReturn).toHaveBeenCalledTimes(1);
    expect(originalRetry).not.toHaveBeenCalled();
    expect(state.callbacks).toHaveLength(2);

    state.callbacks[1]?.onRetry();
    expect(safeReturn).toHaveBeenCalledTimes(2);
    expect(originalRetry).not.toHaveBeenCalled();
    expect(state.technicalError()).toBeUndefined();
  });
});
