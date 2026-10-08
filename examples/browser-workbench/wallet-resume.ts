import type { AccountContext } from "./accounts.ts";

/** Adapter subscriptions are normalized by the app's chosen connector. No browser globals. */
export function watchWallet(
  input: Readonly<{
    inspect: () => Promise<AccountContext | null>;
    onVisible: (listener: () => void) => () => void;
    onChange: (listener: (context: AccountContext | null) => void) => () => void;
    apply: (context: AccountContext | null) => void;
    unavailable: () => void;
  }>,
): { resume(): Promise<void>; dispose(): void } {
  let generation = 0;
  let pending: Promise<void> | null = null;
  let disposed = false;
  const resume = (): Promise<void> => {
    if (disposed) return Promise.resolve();
    if (pending !== null) return pending;
    const request = generation;
    const work = Promise.resolve()
      .then(input.inspect)
      .then(
        (context) => {
          if (!disposed && request === generation) input.apply(context);
        },
        () => {
          if (!disposed && request === generation) input.unavailable();
        },
      )
      .finally(() => {
        if (pending === work) pending = null;
      });
    pending = work;
    return work;
  };
  const stopVisible = input.onVisible(() => {
    resume().catch(input.unavailable);
  });
  const stopChanges = input.onChange((context) => {
    generation++;
    pending = null;
    if (!disposed) input.apply(context);
  });
  return {
    resume,
    dispose() {
      if (disposed) return;
      disposed = true;
      generation++;
      stopVisible();
      stopChanges();
    },
  };
}
