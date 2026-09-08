import { createHash } from "node:crypto";
import { normalizePriceAmount } from "@mezo-dev-kit/prices";
import { getNetwork } from "@mezo-dev-kit/chains";
import { resolveRuntimeIdentity } from "@mezo-dev-kit/contracts";
import type { ContractAbiEntry, ResolvedContract } from "@mezo-dev-kit/contracts";
import { createCoreReadClient } from "@mezo-dev-kit/core";
import type { CoreReadCall, ReadCoordinate } from "@mezo-dev-kit/core";
import {
  decodeFunctionResult,
  encodeFunctionData,
  parseAddress,
  parseHash32,
  parseHexData,
} from "@mezo-dev-kit/evm";
import type { AbiScalar } from "@mezo-dev-kit/evm";
import { BorrowingError } from "./errors.ts";
import { calculateCollateralRatio, uint } from "./math.ts";
import { normalizeBorrowingPosition } from "./position.ts";
import type { BorrowingReader, BorrowingReaderConfig, BorrowingSnapshot } from "./types.ts";

const roots = [
  "borrower-operations",
  "trove-manager",
  "token",
  "active-pool",
  "default-pool",
  "interest-rate-manager",
  "governable-variables",
  "hint-helpers",
  "sorted-troves",
  "coll-surplus-pool",
  "price-feed",
  "gas-pool",
  "pcv",
] as const;
const ZERO = parseAddress("0x0000000000000000000000000000000000000000");

export function readFunction(contract: ResolvedContract, name: string): ContractAbiEntry {
  const matches = contract.readAbi.filter(
    (entry) => entry.type === "function" && entry.name === name,
  );
  const entry = matches[0];
  if (matches.length !== 1 || !entry)
    throw new BorrowingError("UnsupportedDeployment", `missing or overloaded read ${name}`);
  return entry;
}
function bool(value: unknown): boolean {
  if (typeof value !== "boolean") throw new BorrowingError("InvalidState", "expected boolean");
  return value;
}
function codeHash(value: unknown): string {
  return createHash("sha256")
    .update(Buffer.from(parseHexData(value).slice(2), "hex"))
    .digest("hex");
}

export function createBorrowingReader(config: BorrowingReaderConfig): Readonly<BorrowingReader> {
  if (config.networkId !== "mezo-mainnet")
    throw new BorrowingError("UnsupportedDeployment", "initial borrowing deployment is mainnet");
  const network = getNetwork(config.networkId);
  const core = createCoreReadClient({
    network,
    registry: config.registry,
    transport: config.transport,
  });
  function resolve(root: (typeof roots)[number], blockNumber: bigint) {
    return config.registry.resolve({
      contractId: `musd.${root}`,
      networkId: network.id,
      blockNumber,
    });
  }
  async function coherent(coordinate: ReadCoordinate): Promise<void> {
    const block = await config.transport.getBlock(coordinate.blockNumber);
    if (!block || parseHash32(block.hash) !== coordinate.blockHash)
      throw new BorrowingError("StaleState", "snapshot block changed");
  }
  async function identity(contract: ResolvedContract, coordinate: ReadCoordinate): Promise<void> {
    const expected = resolveRuntimeIdentity({
      contractId: contract.contractId,
      networkId: network.id,
      blockNumber: coordinate.blockNumber,
    });
    if (
      codeHash(await config.transport.getCode(contract.address, coordinate)) !==
      expected.addressCodeSha256
    )
      throw new BorrowingError("UnsupportedDeployment", `runtime changed: ${contract.contractId}`);
    if (expected.implementationSlot !== null) {
      const slot = parseHash32(
        await config.transport.getStorage(
          contract.address,
          expected.implementationSlot,
          coordinate,
        ),
      );
      if (
        slot.slice(2, 26) !== "0".repeat(24) ||
        parseAddress(`0x${slot.slice(-40)}`) !== contract.implementationAddress ||
        contract.implementationAddress === null
      )
        throw new BorrowingError(
          "UnsupportedDeployment",
          `proxy generation changed: ${contract.contractId}`,
        );
      if (
        codeHash(await config.transport.getCode(contract.implementationAddress, coordinate)) !==
        expected.implementationCodeSha256
      )
        throw new BorrowingError(
          "UnsupportedDeployment",
          `implementation runtime changed: ${contract.contractId}`,
        );
    }
  }
  async function read(
    input: Parameters<BorrowingReader["read"]>[0],
  ): Promise<Readonly<BorrowingSnapshot>> {
    const account = parseAddress(input.account);
    if (account === ZERO) throw new BorrowingError("InvalidInput", "borrower must be nonzero");
    await core.assertChain();
    const blockNumber = uint(input.blockNumber ?? (await config.transport.getBlockNumber()));
    const contracts = Object.freeze(
      Object.fromEntries(roots.map((root) => [root, resolve(root, blockNumber)])),
    );
    function contract(root: (typeof roots)[number]): ResolvedContract {
      return resolve(root, blockNumber);
    }
    const calls: CoreReadCall[] = [];
    const abis = new Map<string, ContractAbiEntry>();
    const oracle = config.registry.resolve({
      contractId: "oracle.skip-btc-usd",
      networkId: network.id,
      blockNumber,
    });
    function targetCall(
      id: string,
      target: ResolvedContract,
      name: string,
      args: readonly AbiScalar[] = [],
    ): void {
      const abi = readFunction(target, name);
      abis.set(id, abi);
      calls.push({ id, contractId: target.contractId, data: encodeFunctionData(abi, args) });
    }
    function call(
      id: string,
      root: (typeof roots)[number],
      name: string,
      args: readonly AbiScalar[] = [],
    ): void {
      const target = contract(root);
      const abi = readFunction(target, name);
      abis.set(id, abi);
      calls.push({ id, contractId: target.contractId, data: encodeFunctionData(abi, args) });
    }
    call("stored", "trove-manager", "Troves", [account]);
    call("entire", "trove-manager", "getEntireDebtAndColl", [account]);
    for (const name of ["getEntireSystemColl", "getEntireSystemDebt", "getTroveOwnersCount"])
      call(name, "trove-manager", name);
    for (const name of [
      "MUSD_GAS_COMPENSATION",
      "minNetDebt",
      "MCR",
      "CCR",
      "borrowingRate",
      "refinancingFeePercentage",
    ])
      call(name, "borrower-operations", name);
    call("price", "price-feed", "fetchPrice");
    call("oracleAddress", "price-feed", "oracle");
    call("targetDigits", "price-feed", "TARGET_DIGITS");
    targetCall("oracleRound", oracle, "latestRoundData");
    targetCall("oracleDecimals", oracle, "decimals");
    call("offeredRate", "interest-rate-manager", "interestRate");
    call("feeExempt", "governable-variables", "isAccountFeeExempt", [account]);
    call("musdBalance", "token", "balanceOf", [account]);
    call("canMint", "token", "mintList", [contract("borrower-operations").address]);
    call("canBurn", "token", "burnList", [contract("borrower-operations").address]);
    call("surplus", "coll-surplus-pool", "getCollateral", [account]);
    const edges: readonly (readonly [(typeof roots)[number], string, (typeof roots)[number]])[] = [
      ["borrower-operations", "troveManager", "trove-manager"],
      ["borrower-operations", "musd", "token"],
      ["borrower-operations", "priceFeed", "price-feed"],
      ["borrower-operations", "activePool", "active-pool"],
      ["borrower-operations", "defaultPool", "default-pool"],
      ["borrower-operations", "interestRateManager", "interest-rate-manager"],
      ["borrower-operations", "governableVariables", "governable-variables"],
      ["borrower-operations", "sortedTroves", "sorted-troves"],
      ["borrower-operations", "collSurplusPool", "coll-surplus-pool"],
      ["borrower-operations", "gasPoolAddress", "gas-pool"],
      ["borrower-operations", "pcvAddress", "pcv"],
      ["trove-manager", "gasPoolAddress", "gas-pool"],
      ["trove-manager", "pcv", "pcv"],
      ["active-pool", "borrowerOperationsAddress", "borrower-operations"],
      ["active-pool", "defaultPoolAddress", "default-pool"],
      ["default-pool", "activePoolAddress", "active-pool"],
      ["coll-surplus-pool", "borrowerOperationsAddress", "borrower-operations"],
      ["coll-surplus-pool", "activePoolAddress", "active-pool"],
      ["trove-manager", "borrowerOperations", "borrower-operations"],
      ["trove-manager", "priceFeed", "price-feed"],
      ["trove-manager", "activePool", "active-pool"],
      ["trove-manager", "defaultPool", "default-pool"],
      ["trove-manager", "interestRateManager", "interest-rate-manager"],
      ["trove-manager", "sortedTroves", "sorted-troves"],
      ["active-pool", "interestRateManager", "interest-rate-manager"],
      ["hint-helpers", "troveManager", "trove-manager"],
      ["hint-helpers", "sortedTroves", "sorted-troves"],
      ["sorted-troves", "troveManager", "trove-manager"],
    ];
    for (const [owner, method] of edges) call(`${owner}.${method}`, owner, method);
    const result = await core.readCoherent({ calls, blockNumber });
    const { coordinate } = result;
    const timestamp = await config.transport.getBlockTimestamp(coordinate);
    for (const root of roots) await identity(contract(root), coordinate);
    function values(id: string): readonly AbiScalar[] {
      const item = result.reads[id];
      const abi = abis.get(id);
      if (item?.status !== "available" || !abi)
        throw new BorrowingError("InvalidState", `missing required read ${id}`);
      return decodeFunctionResult(abi, item.value);
    }
    const n = (id: string) => uint(values(id)[0]);
    for (const [owner, method, target] of edges)
      if (parseAddress(values(`${owner}.${method}`)[0]) !== contract(target).address)
        throw new BorrowingError("UnsupportedDeployment", `topology changed: ${owner}.${method}`);
    const gasCompensation = n("MUSD_GAS_COMPENSATION");
    const position = normalizeBorrowingPosition({
      stored: values("stored"),
      entire: values("entire"),
      timestamp,
      gasCompensation,
    });
    const price = n("price");
    if (parseAddress(values("oracleAddress")[0]) !== oracle.address)
      throw new BorrowingError("UnsupportedDeployment", "PriceFeed oracle source changed");
    const round = values("oracleRound");
    const answer = round[1];
    const decimals = n("oracleDecimals");
    const digits = n("targetDigits");
    if (
      typeof answer !== "bigint" ||
      answer <= 0n ||
      decimals > 77n ||
      digits > 77n ||
      uint(round[3]) > timestamp ||
      uint(round[3]) === 0n
    )
      throw new BorrowingError("InvalidState", "invalid native oracle answer or timestamp");
    const scaled = normalizePriceAmount({
      raw: answer,
      exponent: -Number(decimals),
      targetDecimals: Number(digits),
      rounding: "toward-zero",
      zeroAllowed: false,
      allowPrecisionLoss: true,
    });
    if (scaled.status !== "valid" || scaled.value !== price)
      throw new BorrowingError("InvalidState", "PriceFeed and native oracle price disagree");
    const mcr = n("MCR");
    const ccr = n("CCR");
    if (price === 0n || mcr === 0n || ccr < mcr)
      throw new BorrowingError("InvalidState", "invalid price or collateral ratio parameters");
    const systemCollateral = n("getEntireSystemColl");
    const systemDebt = n("getEntireSystemDebt");
    const tcr = calculateCollateralRatio(systemCollateral, systemDebt, price);
    await coherent(coordinate);
    return Object.freeze({
      account,
      coordinate,
      timestamp,
      contracts,
      position,
      price,
      systemCollateral,
      systemDebt,
      tcr,
      recoveryMode: tcr < ccr,
      troveCount: n("getTroveOwnersCount"),
      gasCompensation,
      minimumNetDebt: n("minNetDebt"),
      mcr,
      ccr,
      borrowingRate: n("borrowingRate"),
      refinancingFeePercentage: n("refinancingFeePercentage"),
      offeredAnnualRateBps: n("offeredRate"),
      feeExempt: bool(values("feeExempt")[0]),
      canMint: bool(values("canMint")[0]),
      canBurn: bool(values("canBurn")[0]),
      musdBalance: n("musdBalance"),
      surplus: n("surplus"),
    });
  }
  async function hints(input: Parameters<BorrowingReader["hints"]>[0]) {
    const { snapshot } = input;
    const trials = uint(input.trials);
    if (trials === 0n || trials > 1000n)
      throw new BorrowingError("InvalidInput", "hint trials must be between 1 and 1000");
    const seed = uint(input.seed);
    const ratio = uint(input.nominalRatio);
    async function query(root: (typeof roots)[number], name: string, args: readonly AbiScalar[]) {
      const target = resolve(root, snapshot.coordinate.blockNumber);
      const abi = readFunction(target, name);
      const result = await core.readCoherent({
        blockNumber: snapshot.coordinate.blockNumber,
        calls: [{ id: "hint", contractId: target.contractId, data: encodeFunctionData(abi, args) }],
      });
      if (
        result.coordinate.blockHash !== snapshot.coordinate.blockHash ||
        result.reads.hint?.status !== "available"
      )
        throw new BorrowingError("StaleState", "hint coordinate differs from snapshot");
      return decodeFunctionResult(abi, result.reads.hint.value);
    }
    const approximate = await query("hint-helpers", "getApproxHint", [ratio, trials, seed]);
    const hint = parseAddress(approximate[0]);
    const pair = await query("sorted-troves", "findInsertPosition", [ratio, hint, hint]);
    let upper = parseAddress(pair[0]);
    let lower = parseAddress(pair[1]);
    if (upper === snapshot.account)
      upper = parseAddress((await query("sorted-troves", "getPrev", [snapshot.account]))[0]);
    if (lower === snapshot.account)
      lower = parseAddress((await query("sorted-troves", "getNext", [snapshot.account]))[0]);
    await coherent(snapshot.coordinate);
    return Object.freeze({ upper, lower, seed: uint(approximate[2]) });
  }
  return Object.freeze({ read, hints });
}
