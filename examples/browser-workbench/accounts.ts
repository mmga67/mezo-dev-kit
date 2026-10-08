export interface AccountContext {
  readonly account: "alice" | "bob";
  readonly chain: "demo-a" | "demo-b";
}
export interface SourceValue {
  readonly units: bigint;
  readonly observedAt: number;
  readonly source: string;
}
export type SourceState = Readonly<{
  status: "loading" | "available" | "unavailable";
  value: SourceValue | null;
}>;
export interface AccountState {
  readonly context: AccountContext;
  readonly balance: SourceState;
  readonly valuation: SourceState;
}
export type AccountSources = Readonly<
  Record<"balance" | "valuation", (context: AccountContext) => Promise<SourceValue>>
>;

/** One active query scope. Even an adapter that cannot abort cannot publish obsolete data. */
export function createAccountLoader(
  sources: AccountSources,
  publish: (state: AccountState) => void,
): { refresh(context: AccountContext): Promise<void>; cancel(): void; dispose(): void } {
  let generation = 0;
  let state: AccountState | null = null;
  let disposed = false;
  return {
    async refresh(context: AccountContext): Promise<void> {
      if (disposed) return;
      const request = ++generation;
      const same =
        state?.context.account === context.account && state.context.chain === context.chain;
      state = {
        context,
        balance: { status: "loading", value: same ? (state?.balance.value ?? null) : null },
        valuation: { status: "loading", value: same ? (state?.valuation.value ?? null) : null },
      };
      publish(state);
      await Promise.all(
        (["balance", "valuation"] as const).map(async (source) => {
          let result: SourceState;
          try {
            result = { status: "available", value: await sources[source](context) };
          } catch {
            // The example exposes source availability, never raw provider diagnostics or zero.
            result = { status: "unavailable", value: null };
          }
          if (request !== generation || disposed || state === null) return;
          state = { ...state, [source]: result };
          publish(state);
        }),
      );
    },
    cancel() {
      generation++;
    },
    dispose() {
      disposed = true;
      generation++;
    },
  };
}
