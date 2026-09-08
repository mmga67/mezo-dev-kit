import type { ResolvedContract } from "@mezo-dev-kit/contracts";
import { createAbiCodec, parseAddress, parseHash32, parseUint } from "@mezo-dev-kit/evm";
import type { AbiValue } from "@mezo-dev-kit/evm";
import { createBorrowingReader, normalizeBorrowingPosition } from "@mezo-dev-kit/musd-borrowing";
import type { BorrowingSnapshot } from "@mezo-dev-kit/musd-borrowing";
import { redemptionRequire } from "./errors.ts";
import type {
  RedemptionPosition,
  RedemptionReader,
  RedemptionReaderConfig,
  RedemptionSnapshot,
} from "./types.ts";
const codec = createAbiCodec();
export const ZERO = parseAddress(`0x${"0".repeat(40)}`);
export function root(snapshot: BorrowingSnapshot, id: string): Readonly<ResolvedContract> {
  const contract = snapshot.contracts[id];
  redemptionRequire(contract !== undefined, "IdentityMismatch", "missing redemption root");
  return contract;
}
function bounded(value: unknown): value is readonly `0x${string}`[] {
  return Array.isArray(value) && value.length <= 64;
}
export function createRedemptionReader(config: RedemptionReaderConfig): Readonly<RedemptionReader> {
  const borrowing = createBorrowingReader(config),
    { transport } = config;
  async function start(account: `0x${string}`, blockNumber?: bigint) {
    const base = await borrowing.read({
        account,
        ...(blockNumber === undefined ? {} : { blockNumber }),
      }),
      coordinate = base.coordinate;
    async function read(id: string, name: string, args: readonly AbiValue[] = []) {
      const contract = root(base, id),
        entries = contract.readAbi.filter(
          (entry) => entry.type === "function" && entry.name === name,
        ),
        abi = entries[0];
      redemptionRequire(
        entries.length === 1 && abi !== undefined,
        "IdentityMismatch",
        `missing redemption getter ${id}.${name}`,
      );
      return codec.decodeFunction(
        abi,
        await transport.read({
          ...coordinate,
          contractId: contract.contractId,
          address: contract.address,
          data: codec.encodeFunction(abi, args),
        }),
      );
    }
    const number = async (id: string, name: string, args: readonly AbiValue[] = []) =>
      parseUint((await read(id, name, args))[0]);
    async function position(account: `0x${string}`): Promise<Readonly<RedemptionPosition>> {
      const [stored, entire, surplus] = await Promise.all([
        read("trove-manager", "Troves", [account]),
        read("trove-manager", "getEntireDebtAndColl", [account]),
        number("coll-surplus-pool", "getCollateral", [account]),
      ]);
      return Object.freeze({
        account,
        surplus,
        position: normalizeBorrowingPosition({
          stored,
          entire,
          timestamp: base.timestamp,
          gasCompensation: base.gasCompensation,
        }),
      });
    }
    async function finish(
      positions: readonly RedemptionPosition[],
    ): Promise<Readonly<RedemptionSnapshot>> {
      const burn = (await read("token", "burnList", [root(base, "trove-manager").address]))[0];
      redemptionRequire(
        typeof burn === "boolean",
        "IdentityMismatch",
        "invalid redemption burn permission",
      );
      const [
        redemptionRate,
        nativeBalance,
        pcvNativeBalance,
        pcvMusdBalance,
        gasPoolBalance,
        totalSupply,
        activeCollateral,
        activePrincipal,
        activeInterest,
        defaultCollateral,
        defaultPrincipal,
        defaultInterest,
        interestNumerator,
        interestUpdatedAt,
        accruedSystemInterest,
      ] = await Promise.all([
        number("borrower-operations", "redemptionRate"),
        transport.getBalance(base.account, coordinate),
        transport.getBalance(root(base, "pcv").address, coordinate),
        number("token", "balanceOf", [root(base, "pcv").address]),
        number("token", "balanceOf", [root(base, "gas-pool").address]),
        number("token", "totalSupply"),
        number("active-pool", "getCollateralBalance"),
        number("active-pool", "getPrincipal"),
        number("active-pool", "getInterest"),
        number("default-pool", "getCollateralBalance"),
        number("default-pool", "getPrincipal"),
        number("default-pool", "getInterest"),
        number("interest-rate-manager", "interestNumerator"),
        number("interest-rate-manager", "lastUpdatedTime"),
        number("interest-rate-manager", "getAccruedInterest"),
      ]);
      redemptionRequire(
        redemptionRate <= 10n ** 18n &&
          activeInterest >= accruedSystemInterest &&
          interestUpdatedAt <= base.timestamp &&
          activeCollateral + defaultCollateral === base.systemCollateral &&
          activePrincipal + activeInterest + defaultPrincipal + defaultInterest === base.systemDebt,
        "IdentityMismatch",
        "redemption totals differ",
      );
      redemptionRequire(
        parseUint(await transport.getChainId()) === coordinate.chainId &&
          parseHash32((await transport.getBlock(coordinate.blockNumber))?.hash) ===
            coordinate.blockHash,
        "IdentityMismatch",
        "redemption snapshot anchor changed",
      );
      return Object.freeze({
        borrowing: base,
        positions: Object.freeze([...positions]),
        redemptionRate,
        canBurn: burn,
        nativeBalance,
        pcvNativeBalance,
        pcvMusdBalance,
        gasPoolBalance,
        totalSupply,
        activeCollateral,
        activePrincipal,
        activeInterest,
        defaultCollateral,
        defaultPrincipal,
        defaultInterest,
        interestNumerator,
        interestUpdatedAt,
        accruedSystemInterest,
      });
    }
    return { base, read, number, position, finish };
  }
  return Object.freeze({
    async read(input) {
      const borrowers = input.borrowers ?? [];
      redemptionRequire(bounded(borrowers), "LimitExceeded", "at most 64 requested borrowers");
      const accounts = borrowers.map((value) => parseAddress(value));
      redemptionRequire(
        new Set(accounts).size === accounts.length && !accounts.includes(ZERO),
        "InvalidInput",
        "unique nonzero borrowers required",
      );
      const context = await start(input.account, input.blockNumber),
        positions: RedemptionPosition[] = [];
      for (const account of accounts) positions.push(await context.position(account));
      return context.finish(positions);
    },
    async quote(value) {
      const input = Object.freeze(structuredClone(value));
      const captured = input,
        amount = parseUint(input.requestedAmount),
        iterations = parseUint(input.maxIterations),
        trials = parseUint(input.trials),
        seed = parseUint(input.seed),
        mode = input.amountMode ?? "truncate";
      redemptionRequire(
        amount > 0n &&
          iterations > 0n &&
          iterations <= 64n &&
          Number.isSafeInteger(input.maxTailScan) &&
          input.maxTailScan > 0 &&
          input.maxTailScan <= 64 &&
          trials > 0n &&
          trials <= 1000n &&
          (mode === "truncate" || mode === "requested"),
        "InvalidInput",
        "positive bounded redemption and hint inputs required",
      );
      const context = await start(input.account, input.blockNumber),
        { base, read, number } = context;
      redemptionRequire(
        base.tcr >= base.mcr,
        "UnavailableRedemption",
        "system TCR below redemption minimum",
      );
      const previous = async (account: `0x${string}`) =>
        parseAddress((await read("sorted-troves", "getPrev", [account]))[0]);
      let first = parseAddress((await read("sorted-troves", "getLast"))[0]),
        tailEntriesChecked = 0;
      const tail = new Set<string>();
      while (first !== ZERO) {
        redemptionRequire(
          ++tailEntriesChecked <= input.maxTailScan && !tail.has(first),
          "LimitExceeded",
          "eligible tail exceeds scan budget or cycles",
        );
        tail.add(first);
        if ((await number("trove-manager", "getCurrentICR", [first, base.price])) >= base.mcr)
          break;
        first = await previous(first);
      }
      redemptionRequire(first !== ZERO, "UnavailableRedemption", "no eligible redemption tail");
      const helper = await read("hint-helpers", "getRedemptionHints", [
          amount,
          base.price,
          iterations,
        ]),
        helperTruncatedAmount = parseUint(helper[2]),
        partialNominalRatio = parseUint(helper[1]);
      redemptionRequire(
        parseAddress(helper[0]) === first &&
          helperTruncatedAmount > 0n &&
          helperTruncatedAmount <= amount,
        "UnavailableRedemption",
        "redemption hint outcome differs or is empty",
      );
      const attemptedAmount = mode === "truncate" ? helperTruncatedAmount : amount;
      redemptionRequire(
        base.musdBalance >= attemptedAmount,
        "UnavailableRedemption",
        "MUSD balance must cover attempted amount",
      );
      const positions: RedemptionPosition[] = [],
        visited = new Set<string>();
      let cursor = first;
      for (let i = 0n; i < iterations && cursor !== ZERO; i++) {
        redemptionRequire(!visited.has(cursor), "IdentityMismatch", "redemption queue cycles");
        visited.add(cursor);
        const row = await context.position(cursor);
        redemptionRequire(
          row.position.status === "active",
          "IdentityMismatch",
          "queue contains inactive borrower",
        );
        positions.push(row);
        cursor = await previous(cursor);
      }
      let upper = ZERO,
        lower = ZERO,
        nextSeed = seed;
      if (partialNominalRatio > 0n) {
        const approximate = await read("hint-helpers", "getApproxHint", [
            partialNominalRatio,
            trials,
            seed,
          ]),
          hint = parseAddress(approximate[0]);
        nextSeed = parseUint(approximate[2]);
        const pair = await read("sorted-troves", "findInsertPosition", [
          partialNominalRatio,
          hint,
          hint,
        ]);
        upper = parseAddress(pair[0]);
        lower = parseAddress(pair[1]);
        // Neighbours that may be removed during this bounded redemption cannot be stable hints.
        for (let i = 0; visited.has(upper); i++) {
          redemptionRequire(i < positions.length, "IdentityMismatch", "upper hint cycles");
          upper = await previous(upper);
        }
        for (let i = 0; visited.has(lower); i++) {
          redemptionRequire(i < positions.length, "IdentityMismatch", "lower hint cycles");
          lower = parseAddress((await read("sorted-troves", "getNext", [lower]))[0]);
        }
      }
      const snapshot = await context.finish(positions);
      redemptionRequire(snapshot.canBurn, "UnavailableRedemption", "TroveManager cannot burn MUSD");
      return Object.freeze({
        snapshot,
        input: captured,
        attemptedAmount,
        helperTruncatedAmount,
        first,
        upper,
        lower,
        partialNominalRatio,
        seed: nextSeed,
        tailEntriesChecked,
      });
    },
  } satisfies RedemptionReader);
}
