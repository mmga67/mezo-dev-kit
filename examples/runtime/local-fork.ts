import { setTimeout } from "node:timers/promises";
import { getNetwork } from "@mezo-dev-kit/chains";
import type { NetworkId } from "@mezo-dev-kit/chains";
import { createConnection } from "../setup.ts";
import { createExecutionClient } from "@mezo-dev-kit/core";
import type { RpcRequest } from "@mezo-dev-kit/core";
import { parseAddress, parseHash32, parseRpcQuantity, toRpcQuantity } from "@mezo-dev-kit/evm";
import type { ExampleRuntime } from "./example-runtime.ts";
import { createHttpRequest } from "./rpc-request.ts";
import { createFileSubmissionStore } from "./submission-store.ts";
import type { FileSubmissionStore } from "./submission-store.ts";
import type { Report } from "./output.ts";
import { invariant, object } from "./validation.ts";

export interface LocalFork {
  readonly repositoryRoot: string;
  readonly runtime: ExampleRuntime;
  readonly source: RpcRequest;
  readonly request: RpcRequest;
  readonly store: FileSubmissionStore;
  readonly parent: { readonly number: bigint; readonly hash: `0x${string}` };
  /** Only labeled native fixtures may intercept local RPC results. */
  replaceRequest(wrap: (request: RpcRequest) => RpcRequest): void;
  close(): Promise<void>;
}

/** Verify the source parent before exposing a mutation-capable local session. */
export async function connectLocalFork(options: {
  readonly url: string;
  readonly sourceUrl: string;
  readonly networkId?: NetworkId;
  readonly runId: string;
  readonly directory: string;
  readonly repositoryRoot: string;
  readonly report: Report;
  readonly keepState?: boolean;
  /** The independent native BTC ledger used by lock fixtures cannot debit Anvil gas. */
  readonly gasPriceWei?: 0n | 1n;
  readonly signal?: AbortSignal;
}): Promise<LocalFork> {
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(options.runId))
    throw new TypeError("Run ID must contain 1–64 letters, digits, underscores or hyphens");
  const signal = options.signal ? { signal: options.signal } : {};
  const source = createHttpRequest({ url: options.sourceUrl, policy: "read-only", ...signal });
  const raw = createHttpRequest({
    url: options.url,
    policy: "local-fork",
    timeoutMs: 60000,
    ...signal,
  });
  const gasPriceWei = options.gasPriceWei ?? 1n;
  const version = await raw({ method: "web3_clientVersion", params: [] });
  invariant(
    typeof version === "string" && version.toLowerCase().includes("anvil"),
    "Local execution requires Anvil",
  );
  const network = getNetwork(options.networkId ?? "mezo-mainnet");
  for (const request of [source, raw])
    invariant(
      parseRpcQuantity(await request({ method: "eth_chainId", params: [] })) === network.evmChainId,
      "Source and local chain must match the selected network",
    );
  const initial = object(await raw({ method: "eth_getBlockByNumber", params: ["latest", false] }));
  const parent = { number: parseRpcQuantity(initial.number), hash: parseHash32(initial.hash) };
  const canonical = object(
    await source({ method: "eth_getBlockByNumber", params: [toRpcQuantity(parent.number), false] }),
  );
  invariant(
    parseHash32(canonical.hash) === parent.hash &&
      parseRpcQuantity(canonical.number) === parent.number,
    "Start a fresh fork at an exact source block before running a new workflow",
  );
  const accounts: unknown = await raw({ method: "eth_accounts", params: [] });
  invariant(
    Array.isArray(accounts) && accounts.length > 0,
    "Local node must expose a funded development account",
  );
  const account = parseAddress(accounts[0]);
  const store = await createFileSubmissionStore(options.directory);
  invariant(
    (await store.list()).length === 0,
    "This run already has submissions. Use resume; do not submit the workflow again",
  );
  const automine = await raw({ method: "anvil_getAutomine", params: [] });
  invariant(typeof automine === "boolean", "Cannot determine local mining policy");
  const snapshot = await raw({ method: "evm_snapshot", params: [] });
  invariant(typeof snapshot === "string", "Local snapshot was not created");
  try {
    await raw({ method: "evm_setAutomine", params: [false] });
  } catch (error) {
    const cleanup = createHttpRequest({ url: options.url, policy: "local-fork" });
    invariant(
      (await cleanup({ method: "evm_revert", params: [snapshot] })) === true,
      "Failed to restore setup snapshot",
    );
    await cleanup({ method: "evm_setAutomine", params: [automine] });
    throw error;
  }
  let implementation: RpcRequest = async (input) => {
    if (input.method !== "eth_sendTransaction") return raw(input);
    // A fixed gas policy and one-second blocks make this local demonstration repeatable.
    // This is fixture mining, not a production wallet's fee policy.
    await raw({ method: "anvil_setNextBlockBaseFeePerGas", params: ["0x0"] });
    const hash = await raw({
      ...input,
      params: [
        { ...object(input.params[0]), gas: "0x989680", gasPrice: toRpcQuantity(gasPriceWei) },
      ],
    });
    const current = object(
      await raw({ method: "eth_getBlockByNumber", params: ["latest", false] }),
    );
    await raw({
      method: "evm_setNextBlockTimestamp",
      params: [toRpcQuantity(parseRpcQuantity(current.timestamp) + 1n)],
    });
    await raw({ method: "evm_mine", params: [] });
    return hash;
  };
  const request: RpcRequest = (input) => implementation(input);
  const connection = createConnection({
    networkId: network.id,
    account,
    readRequest: request,
    walletRequest: request,
    store,
  });
  const { registry, transport, signer } = connection;
  const runtime: ExampleRuntime = {
    ...connection,
    operationId: (step) => `${options.runId}:${step}`,
    createExecution: (resolveTarget) =>
      createExecutionClient({
        network,
        registry,
        transport,
        signer,
        store,
        maxBlockAge: 2n,
        confirmations: 1n,
        ...(resolveTarget ? { resolveTarget } : {}),
      }),
    polling: {
      attempts: 20,
      pause: async () => {
        await setTimeout(250, undefined, signal);
      },
    },
    report: options.report,
  };
  options.report("Local fork", {
    network: network.id,
    parent,
    account,
    runId: options.runId,
    confirmations: 1,
    gasPriceWei: gasPriceWei.toString(),
    restoresSnapshot: !options.keepState,
  });
  return {
    runtime,
    source,
    request,
    store,
    parent,
    repositoryRoot: options.repositoryRoot,
    replaceRequest: (wrap) => {
      implementation = wrap(implementation);
    },
    close: async () => {
      // Cleanup must still be possible after the operation's cancellation signal fires.
      const cleanup = createHttpRequest({ url: options.url, policy: "local-fork" });
      if (options.keepState) {
        await cleanup({ method: "evm_setAutomine", params: [automine] });
        options.report("Local state retained", { runId: options.runId, parent });
      } else {
        invariant(
          (await cleanup({ method: "evm_revert", params: [snapshot] })) === true,
          "Failed to restore local snapshot",
        );
        await cleanup({ method: "evm_setAutomine", params: [automine] });
        options.report("Local snapshot restored", parent);
      }
    },
  };
}
