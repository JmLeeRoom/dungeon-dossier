export interface FlowErrorRecoveryCallbacks {
  readonly onRetry: () => void;
  readonly onReturnToSafeState: () => void;
}

export interface FlowErrorBoundaryOptions {
  readonly userMessage: string;
  readonly publishTechnicalError: (message: string) => void;
  readonly clearTechnicalError: () => void;
  readonly reportError: (error: unknown) => void;
  readonly reportBannerError: (error: unknown) => void;
  readonly showBanner: (
    userMessage: string,
    callbacks: FlowErrorRecoveryCallbacks,
  ) => () => void;
  readonly returnToSafeState: () => void;
}

export interface FlowErrorBoundary {
  readonly handle: (error: unknown, retry: () => void) => void;
  readonly close: () => void;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Owns the recoverable flow-error lifecycle independently of Pixi rendering.
 * A failed recovery is routed through a fresh banner whose retry action is the
 * exact operation that failed, so already-committed boundaries are not replayed.
 */
export function createFlowErrorBoundary(
  options: FlowErrorBoundaryOptions,
): FlowErrorBoundary {
  let disposeBanner: (() => void) | undefined;

  const close = (): void => {
    const dispose = disposeBanner;
    disposeBanner = undefined;
    dispose?.();
  };

  const handle = (error: unknown, retry: () => void): void => {
    options.publishTechnicalError(errorMessage(error));
    options.reportError(error);
    close();

    const recover = (action: () => void): void => {
      close();
      options.clearTechnicalError();
      try {
        action();
      } catch (recoveryError) {
        handle(recoveryError, action);
      }
    };

    try {
      disposeBanner = options.showBanner(options.userMessage, {
        onRetry: () => recover(retry),
        onReturnToSafeState: () => recover(options.returnToSafeState),
      });
    } catch (bannerError) {
      options.reportBannerError(bannerError);
    }
  };

  return { handle, close };
}
