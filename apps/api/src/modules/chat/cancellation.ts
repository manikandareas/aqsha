export type CancellationBoundaryStatus =
  | "propagated"
  | "unsupported"
  | "already_finished";

export type CancellationBoundaries = {
  modelStream: CancellationBoundaryStatus;
  subagents: CancellationBoundaryStatus;
  sandbox: CancellationBoundaryStatus;
  render: CancellationBoundaryStatus;
  upload: CancellationBoundaryStatus;
};

export type RunCancellationHandle = {
  signal: AbortSignal;
  readonly cancelRequested: boolean;
  release: () => void;
};

export class RunCancellationRegistry {
  private readonly handles = new Map<
    string,
    {
      controller: AbortController;
      cancelRequested: boolean;
      cleanupParentAbort?: () => void;
    }
  >();

  track(runId: string, parentSignal?: AbortSignal): RunCancellationHandle {
    const controller = new AbortController();
    const state = {
      controller,
      cancelRequested: false,
      cleanupParentAbort: undefined as (() => void) | undefined,
    };

    if (parentSignal) {
      const abortFromParent = () => {
        if (!controller.signal.aborted) {
          controller.abort(parentSignal.reason);
        }
      };

      if (parentSignal.aborted) {
        abortFromParent();
      } else {
        parentSignal.addEventListener("abort", abortFromParent, { once: true });
        state.cleanupParentAbort = () => {
          parentSignal.removeEventListener("abort", abortFromParent);
        };
      }
    }

    this.handles.set(runId, state);

    return {
      signal: controller.signal,
      get cancelRequested() {
        return state.cancelRequested;
      },
      release: () => {
        state.cleanupParentAbort?.();
        if (this.handles.get(runId) === state) {
          this.handles.delete(runId);
        }
      },
    };
  }

  cancel(runId: string): CancellationBoundaries {
    const state = this.handles.get(runId);

    if (!state) {
      return {
        modelStream: "already_finished",
        subagents: "already_finished",
        sandbox: "already_finished",
        render: "already_finished",
        upload: "already_finished",
      };
    }

    state.cancelRequested = true;
    if (!state.controller.signal.aborted) {
      state.controller.abort("run_cancel_requested");
    }

    return {
      modelStream: "propagated",
      subagents: "propagated",
      sandbox: "unsupported",
      render: "unsupported",
      upload: "unsupported",
    };
  }
}
