import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  createAbiCodec,
  parseAddress,
  parseHash32,
  parseHexData,
  parseRpcQuantity,
  parseUnitsExact,
  parseUint,
  toRpcQuantity,
} from "@mezo-dev-kit/evm";
import { getTokenInterface, resolveRoleInterface } from "@mezo-dev-kit/contracts";
import type { ContractAbiEntry } from "@mezo-dev-kit/contracts";
import { createSavingsRpcReader } from "@mezo-dev-kit/musd-savings";
import { createVaultRpcReader } from "@mezo-dev-kit/usdc-lending-vault";
import { createTokenReader, planApproval } from "@mezo-dev-kit/tokens";
import { approveToken } from "./approval.ts";
import { createLendingRpcReader } from "@mezo-dev-kit/musdc-lending";
import type { LocalFork } from "./local-fork.ts";
import { readWalletToken } from "./token-units.ts";
import { invariant, object } from "./validation.ts";

function abiFunction(abi: readonly ContractAbiEntry[], name: string): ContractAbiEntry {
  const entries = abi.filter((entry) => entry.type === "function" && entry.name === name);
  invariant(entries.length === 1 && entries[0], `Expected one canonical ${name} function`);
  return entries[0];
}

/** Test-only selector dispatch. Returned bytes are captured at the source parent;
 * all other selectors revert. This does not reproduce Mezo's native engine. */
export function responseFixture(
  responses: readonly { readonly selector: `0x${string}`; readonly data: `0x${string}` }[],
): `0x${string}` {
  const parts: string[] = [],
    jumps: number[] = [],
    offsets: number[] = [];
  let size = 0;
  const push2 = (value: number) => {
    invariant(
      Number.isSafeInteger(value) && value >= 0 && value <= 65535,
      "Fixture bytecode exceeds PUSH2 bounds",
    );
    return `61${value.toString(16).padStart(4, "0")}`;
  };
  const emit = (part: string) => {
    parts.push(part);
    size += part.length / 2;
  };
  for (const response of responses) {
    invariant(parseHexData(response.selector).length === 10, "Expected a function selector");
    parseHexData(response.data);
    emit(`5f3560e01c63${response.selector.slice(2)}14`);
    jumps.push(parts.length);
    emit("61000057");
  }
  emit("5f5ffd");
  for (const [index, response] of responses.entries()) {
    const jump = jumps[index];
    invariant(jump !== undefined, "Missing fixture jump");
    parts[jump] = `${push2(size)}57`;
    emit("5b");
    emit(push2((response.data.length - 2) / 2));
    offsets.push(parts.length);
    emit("610000");
    emit(`5f39${push2((response.data.length - 2) / 2)}5ff3`);
  }
  for (const [index, response] of responses.entries()) {
    const offset = offsets[index];
    invariant(offset !== undefined, "Missing fixture data");
    parts[offset] = push2(size);
    emit(response.data.slice(2));
  }
  return parseHexData(`0x${parts.join("")}`);
}

export async function installOracleFixture(fork: LocalFork): Promise<void> {
  const runtime = fork.runtime;
  const oracle = runtime.registry.resolve({
    contractId: "oracle.skip-btc-usd",
    networkId: runtime.network.id,
    blockNumber: fork.parent.number,
  });
  const codec = createAbiCodec();
  const responses: { selector: `0x${string}`; data: `0x${string}` }[] = [];
  for (const name of ["decimals", "latestRoundData"]) {
    const abi = abiFunction(oracle.readAbi, name);
    const selector = codec.encodeFunction(abi);
    const data = parseHexData(
      await fork.source({
        method: "eth_call",
        params: [{ to: oracle.address, data: selector }, toRpcQuantity(fork.parent.number)],
      }),
    );
    codec.decodeFunction(abi, data);
    responses.push({ selector, data });
  }
  const original = parseHexData(
    await fork.request({
      method: "eth_getCode",
      params: [oracle.address, toRpcQuantity(fork.parent.number)],
    }),
  );
  await fork.request({
    method: "anvil_setCode",
    params: [oracle.address, responseFixture(responses)],
  });
  // Mezo exposes interface bytes separately from native dispatch. Our labeled
  // local model preserves those captured bytes while executing the fixture.
  fork.replaceRequest(
    (request) => (input) =>
      input.method === "eth_getCode" && input.params[0] === oracle.address
        ? Promise.resolve(original)
        : request(input),
  );
  runtime.report("Fixture: captured native oracle", {
    contractId: oracle.contractId,
    parent: fork.parent,
    selectors: responses.map((response) => response.selector),
  });
}

export async function fundMusd(fork: LocalFork, amount: string): Promise<void> {
  const runtime = fork.runtime;
  const token = runtime.registry.resolve({
    contractId: "musd.token",
    networkId: runtime.network.id,
    blockNumber: fork.parent.number,
  });
  const holder = runtime.registry.resolve({
    contractId: "musd.gas-pool",
    networkId: runtime.network.id,
    blockNumber: fork.parent.number,
  });
  const wallet = await readWalletToken(runtime, {
    contractId: token.contractId,
    address: token.address,
  });
  await fundToken(
    fork,
    holder.address,
    token.address,
    parseUnitsExact(amount, Number(wallet.decimals)),
  );
}

/** Move real token balances only inside the verified local snapshot. */
export async function fundToken(
  fork: LocalFork,
  holder: `0x${string}`,
  token: `0x${string}`,
  amount: bigint,
): Promise<void> {
  const runtime = fork.runtime;
  // The public token interface intentionally curates approval/read methods.
  // Fixture funding resolves transfer from its existing canonical full ABI.
  const abi: unknown = JSON.parse(
    await readFile(
      resolve(fork.repositoryRoot, "knowledge/contracts/artifacts/abis/musd/token.json"),
      "utf8",
    ),
  );
  invariant(Array.isArray(abi), "Canonical token fixture ABI must be an array");
  const transfer: unknown = abi.find(
    (entry: unknown) => object(entry).type === "function" && object(entry).name === "transfer",
  );
  invariant(transfer, "Canonical token ABI is missing transfer");
  await fork.request({ method: "anvil_impersonateAccount", params: [holder] });
  try {
    await fork.request({
      method: "anvil_setBalance",
      params: [
        holder,
        toRpcQuantity(parseUnitsExact("1", runtime.network.nativeCurrency.decimals)),
      ],
    });
    const hash = parseHash32(
      await fork.request({
        method: "eth_sendTransaction",
        params: [
          {
            from: holder,
            to: token,
            data: createAbiCodec().encodeFunction(transfer, [runtime.account, amount]),
          },
        ],
      }),
    );
    await checkFixtureReceipt(fork, hash);
    runtime.report("Fixture: local token funding", {
      token,
      recipient: runtime.account,
      amount,
      hash,
    });
  } finally {
    await fork.request({ method: "anvil_stopImpersonatingAccount", params: [holder] });
  }
}

export async function checkFixtureReceipt(fork: LocalFork, hash: `0x${string}`): Promise<void> {
  const receipt = object(
    await fork.request({ method: "eth_getTransactionReceipt", params: [hash] }),
  );
  invariant(parseRpcQuantity(receipt.status) === 1n, "Local fixture transaction reverted");
}

/** Discover representations from the reader's verified market, not a copied token list. */
export async function lendingAssets(
  fork: LocalFork,
): Promise<{ loan: `0x${string}`; collateral: `0x${string}`; morpho: `0x${string}` }> {
  const runtime = fork.runtime;
  const reader = createLendingRpcReader({
    networkId: runtime.network.id,
    registry: runtime.registry,
    transport: runtime.transport,
  });
  const snapshot = await reader.read({ account: runtime.account, maxPriceAgeSeconds: 300n });
  const morpho = runtime.registry.resolve({
    contractId: "lending.morpho",
    networkId: runtime.network.id,
    blockNumber: snapshot.coordinate.blockNumber,
  });
  const abi = abiFunction(morpho.readAbi, "idToMarketParams");
  const codec = createAbiCodec();
  const values = codec.decodeFunction(
    abi,
    await runtime.transport.read({
      ...snapshot.coordinate,
      contractId: morpho.contractId,
      address: morpho.address,
      data: codec.encodeFunction(abi, [snapshot.marketId]),
    }),
  );
  return {
    loan: parseAddress(values[0]),
    collateral: parseAddress(values[1]),
    morpho: morpho.address,
  };
}

/** Install the repository's explicitly compiled native-token test contract. */
export async function installNativeTokenFixture(
  fork: LocalFork,
  address: `0x${string}`,
  artifactPath: string,
  amount: bigint,
  holders: readonly `0x${string}`[] = [],
): Promise<void> {
  const artifact = object(JSON.parse(await readFile(artifactPath, "utf8")) as unknown);
  const bytecode = parseHexData(object(artifact.deployedBytecode).object);
  invariant(Array.isArray(artifact.abi), "Native fixture artifact must contain its ABI");
  const seed = artifact.abi.find(
    (entry: unknown) => object(entry).type === "function" && object(entry).name === "seed",
  ) as unknown;
  invariant(seed, "Use the compiled NativeTokenFixture artifact");
  const codec = createAbiCodec();
  const balanceAbi = abiFunction(getTokenInterface(), "balanceOf");
  const balances = await Promise.all(
    holders.map(async (holder) => ({
      holder,
      amount: parseUint(
        codec.decodeFunction(
          balanceAbi,
          parseHexData(
            await fork.source({
              method: "eth_call",
              params: [
                { to: address, data: codec.encodeFunction(balanceAbi, [holder]) },
                toRpcQuantity(fork.parent.number),
              ],
            }),
          ),
        )[0],
      ),
    })),
  );
  await fork.request({ method: "anvil_setCode", params: [address, bytecode] });
  for (const entry of [...balances, { holder: fork.runtime.account, amount }]) {
    const hash = parseHash32(
      await fork.request({
        method: "eth_sendTransaction",
        params: [
          {
            from: fork.runtime.account,
            to: address,
            data: codec.encodeFunction(seed, [entry.holder, entry.amount]),
          },
        ],
      }),
    );
    await checkFixtureReceipt(fork, hash);
  }
  fork.runtime.report("Fixture: native-token execution model", {
    address,
    amount,
    capturedHolders: balances,
  });
}

export async function installLockTokens(fork: LocalFork, artifactPath: string): Promise<void> {
  // The verified boost graph reads both escrows, even when only veBTC is used.
  for (const contractId of ["incentives.ve-btc", "incentives.ve-mezo"] as const) {
    const contract = fork.runtime.registry.resolve({
      contractId,
      networkId: fork.runtime.network.id,
      blockNumber: fork.parent.number,
    });
    const getter = abiFunction(contract.readAbi, "token");
    const codec = createAbiCodec();
    const token = parseAddress(
      codec.decodeFunction(
        getter,
        parseHexData(
          await fork.source({
            method: "eth_call",
            params: [
              { to: contract.address, data: codec.encodeFunction(getter) },
              toRpcQuantity(fork.parent.number),
            ],
          }),
        ),
      )[0],
    );
    await installNativeTokenFixture(fork, token, artifactPath, parseUnitsExact("10", 18), [
      contract.address,
    ]);
  }
}

export async function installGaugeReward(
  fork: LocalFork,
  role: "savings-gauge" | "vault-gauge",
  artifactPath: string,
): Promise<void> {
  const runtime = fork.runtime;
  const config = {
    networkId: runtime.network.id,
    registry: runtime.registry,
    transport: runtime.transport,
  };
  // The full gauge reader needs native reward dispatch. Discover its address
  // through the owning root before installing that local model.
  const snapshot =
    role === "savings-gauge"
      ? await createSavingsRpcReader(config).read({ account: runtime.account })
      : await createVaultRpcReader(config).read({
          account: runtime.account,
          maxPriceAgeSeconds: 300n,
          previewAssets: 0n,
          previewShares: 0n,
        });
  invariant(snapshot.gauge.status === "available", "Gauge discovery unavailable for fixture setup");
  const gauge = snapshot.gauge.value.address;
  const getter = abiFunction(
    resolveRoleInterface({ role, networkId: runtime.network.id }).abi,
    "rewardToken",
  );
  const codec = createAbiCodec();
  const rewardToken = parseAddress(
    codec.decodeFunction(
      getter,
      parseHexData(
        await fork.request({
          method: "eth_call",
          params: [
            { to: gauge, data: codec.encodeFunction(getter) },
            toRpcQuantity(snapshot.coordinate.blockNumber),
          ],
        }),
      ),
    )[0],
  );
  await installNativeTokenFixture(fork, rewardToken, artifactPath, 0n, [gauge]);
}

export async function advanceLocalTime(fork: LocalFork, timestamp: bigint): Promise<void> {
  const current = object(
    await fork.request({ method: "eth_getBlockByNumber", params: ["latest", false] }),
  );
  invariant(timestamp > parseRpcQuantity(current.timestamp), "Local time may only advance");
  await fork.request({ method: "evm_setNextBlockTimestamp", params: [toRpcQuantity(timestamp)] });
  await fork.request({ method: "evm_mine", params: [] });
  fork.runtime.report("Fixture: local time advanced", { timestamp });
}

export async function seedSavingsYield(fork: LocalFork): Promise<void> {
  const runtime = fork.runtime;
  const snapshot = await createSavingsRpcReader({
    networkId: runtime.network.id,
    registry: runtime.registry,
    transport: runtime.transport,
  }).read({ account: runtime.account });
  const token = runtime.registry.resolve({
    contractId: "musd.token",
    networkId: runtime.network.id,
    blockNumber: snapshot.coordinate.blockNumber,
  });
  const wallet = await createTokenReader({ transport: runtime.transport }).read({
    target: { contractId: token.contractId, address: token.address },
    account: runtime.account,
    spender: snapshot.savings,
    coordinate: snapshot.coordinate,
  });
  const amount = parseUnitsExact("10", Number(wallet.decimals));
  await approveToken(
    runtime,
    runtime.createExecution(),
    "fixture-yield-approval",
    wallet,
    planApproval({ allowance: wallet.allowance, requiredAmount: amount }),
  );
  const artifact = object(
    JSON.parse(
      await readFile(
        resolve(
          fork.repositoryRoot,
          "knowledge/contracts/artifacts/dynamic-interfaces/savings-current-explorer.json",
        ),
        "utf8",
      ),
    ) as unknown,
  );
  invariant(Array.isArray(artifact.abi), "Missing canonical Savings fixture ABI");
  const receive: unknown = artifact.abi.find(
    (entry: unknown) => object(entry).name === "receiveProtocolYield",
  );
  invariant(receive, "Missing receiveProtocolYield");
  const hash = parseHash32(
    await fork.request({
      method: "eth_sendTransaction",
      params: [
        {
          from: runtime.account,
          to: snapshot.savings,
          data: createAbiCodec().encodeFunction(receive, [amount]),
        },
      ],
    }),
  );
  await checkFixtureReceipt(fork, hash);
  runtime.report("Fixture: donated protocol yield", { amount, hash });
}
