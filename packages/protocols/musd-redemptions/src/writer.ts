import { resolveEvent, resolveOperation } from "@mezo-dev-kit/contracts";
import { getReceiptExecutionFee, getReceiptLogs, parseSubmissionRecord } from "@mezo-dev-kit/core";
import { createAbiCodec, parseAddress, parseUint } from "@mezo-dev-kit/evm";
import type { AbiValue } from "@mezo-dev-kit/evm";
import { calculateSimpleInterest, splitDebtPayment } from "@mezo-dev-kit/musd-borrowing";
import { decodeTokenTransfers } from "@mezo-dev-kit/tokens";
import { redemptionRequire } from "./errors.ts";
import { calculateRedemptionCollateral, calculateRedemptionFee } from "./math.ts";
import { root, ZERO } from "./reader.ts";
import { decodeRedemptionAmounts } from "./trace.ts";
import type { RedemptionAmounts } from "./trace.ts";
import type {
  PreparedRedemption,
  RedemptionBounds,
  RedemptionQuote,
  RedemptionWriter,
  RedemptionWriterConfig,
} from "./types.ts";
const codec = createAbiCodec();
function operation(quote: RedemptionQuote) {
  return resolveOperation({
    contractId: "musd.trove-manager",
    networkId: quote.snapshot.borrowing.coordinate.networkId,
    blockNumber: quote.snapshot.borrowing.coordinate.blockNumber,
    functionName: "redeemCollateral",
  });
}
function calldata(quote: RedemptionQuote) {
  return codec.encodeFunction(operation(quote).functionAbi, [
    quote.attemptedAmount,
    quote.first,
    quote.upper,
    quote.lower,
    quote.partialNominalRatio,
    quote.input.maxIterations,
  ]);
}
function checkBounds(bounds: RedemptionBounds) {
  for (const value of [
    bounds.minActualAmount,
    bounds.minNetCollateral,
    bounds.maxRedemptionRate,
    bounds.maxBlockAge,
  ])
    parseUint(value);
  redemptionRequire(
    bounds.minActualAmount > 0n &&
      bounds.minNetCollateral > 0n &&
      bounds.maxRedemptionRate <= 10n ** 18n,
    "InvalidInput",
    "positive redemption output minimums and a valid rate cap required",
  );
}
function outputSatisfied(amounts: RedemptionAmounts, bounds: RedemptionBounds) {
  return (
    amounts.actualAmount >= bounds.minActualAmount &&
    amounts.netCollateral >= bounds.minNetCollateral
  );
}
/** Source aggregate formula is simple-interest with the already rate-weighted numerator and rate one. */
function accrual(numerator: bigint, elapsed: bigint) {
  return calculateSimpleInterest(numerator, 1n, elapsed);
}
export function createRedemptionWriter(config: RedemptionWriterConfig): Readonly<RedemptionWriter> {
  const owned = new WeakSet<PreparedRedemption>(),
    simulations = new WeakMap<object, PreparedRedemption>();
  function assertOwned(prepared: PreparedRedemption) {
    redemptionRequire(owned.has(prepared), "InvalidInput", "prepare with this redemption writer");
  }
  return Object.freeze({
    async prepare(input) {
      redemptionRequire(
        typeof input.operationId === "string" && input.operationId.length > 0,
        "InvalidInput",
        "operationId required",
      );
      const bounds = Object.freeze(structuredClone(input.bounds));
      checkBounds(bounds);
      const quote = await config.reader.quote(input.quote),
        base = quote.snapshot.borrowing;
      redemptionRequire(
        bounds.minActualAmount <= quote.attemptedAmount &&
          quote.snapshot.redemptionRate <= bounds.maxRedemptionRate,
        "BoundExceeded",
        "redemption amount or rate exceeds policy",
      );
      redemptionRequire(
        !Object.values(base.contracts).some((contract) => contract.address === base.account),
        "InvalidInput",
        "direct wallet redeemer required",
      );
      const transaction = Object.freeze({
        operationId: input.operationId,
        contractId: "musd.trove-manager" as const,
        coordinate: base.coordinate,
        from: base.account,
        to: operation(quote).contract.address,
        value: 0n,
        data: calldata(quote),
      });
      const prepared = Object.freeze({ quote, bounds, transaction });
      owned.add(prepared);
      return prepared;
    },
    async simulate(prepared) {
      assertOwned(prepared);
      const simulated = await config.execution.simulate(
        prepared.transaction,
        async (data, coordinate, call) => {
          redemptionRequire(
            data.length === 2,
            "SimulationFailed",
            "redemption must return no bytes",
          );
          const fresh = await config.reader.quote({
            ...prepared.quote.input,
            blockNumber: coordinate.blockNumber,
          });
          redemptionRequire(
            fresh.snapshot.borrowing.coordinate.blockHash === coordinate.blockHash &&
              fresh.snapshot.redemptionRate <= prepared.bounds.maxRedemptionRate &&
              fresh.snapshot.borrowing.musdBalance >= prepared.quote.attemptedAmount,
            "BoundExceeded",
            "exact simulation state exceeds redemption policy",
          );
          const amounts = await config.simulator.simulate({ call, coordinate });
          for (const amount of Object.values(amounts)) parseUint(amount);
          redemptionRequire(
            amounts.attemptedAmount === prepared.quote.attemptedAmount &&
              amounts.actualAmount <= amounts.attemptedAmount &&
              amounts.grossCollateral === amounts.netCollateral + amounts.collateralFee &&
              outputSatisfied(amounts, prepared.bounds),
            "BoundExceeded",
            "simulated redemption output is below policy or malformed",
          );
        },
      );
      simulations.set(simulated, prepared);
      return simulated;
    },
    async submit(prepared, simulated) {
      assertOwned(prepared);
      redemptionRequire(
        simulations.get(simulated) === prepared,
        "InvalidInput",
        "redemption simulation differs",
      );
      return config.execution.submit(simulated, async () => {
        const input = { ...prepared.quote.input };
        delete input.blockNumber;
        const fresh = await config.reader.quote(input),
          age =
            fresh.snapshot.borrowing.coordinate.blockNumber -
            prepared.transaction.coordinate.blockNumber;
        redemptionRequire(
          age >= 0n &&
            age <= prepared.bounds.maxBlockAge &&
            fresh.snapshot.canBurn &&
            fresh.snapshot.redemptionRate <= prepared.bounds.maxRedemptionRate &&
            fresh.snapshot.borrowing.musdBalance >= prepared.quote.attemptedAmount,
          "BoundExceeded",
          "redemption quote expired, balance or rate changed",
        );
      });
    },
    async reconcile(prepared, value) {
      checkBounds(prepared.bounds);
      const record = parseSubmissionRecord(value),
        call = prepared.transaction,
        quote = prepared.quote;
      redemptionRequire(
        record.operationId === call.operationId &&
          record.contractId === "musd.trove-manager" &&
          call.contractId === record.contractId &&
          record.targetRole === undefined &&
          record.call.from === call.from &&
          call.from === quote.snapshot.borrowing.account &&
          record.call.to === call.to &&
          call.to === operation(quote).contract.address &&
          record.call.data === call.data &&
          call.data === calldata(quote) &&
          BigInt(record.call.value) === 0n &&
          call.value === 0n &&
          BigInt(record.call.chainId) === call.coordinate.chainId &&
          BigInt(record.blockNumber) === call.coordinate.blockNumber &&
          record.blockHash === call.coordinate.blockHash,
        "ReconciliationMismatch",
        "redemption intent differs",
      );
      return config.execution.reconcile(record, async (receipt) => {
        redemptionRequire(
          receipt.blockNumber > 0n,
          "ReconciliationMismatch",
          "receipt predecessor required",
        );
        const coordinate = {
            ...call.coordinate,
            blockNumber: receipt.blockNumber,
            blockHash: receipt.blockHash,
          },
          logs = getReceiptLogs(receipt, call.to),
          amounts = decodeRedemptionAmounts({ logs, contract: call.to, coordinate });
        redemptionRequire(
          amounts.attemptedAmount === quote.attemptedAmount,
          "ReconciliationMismatch",
          "redemption attempted amount differs",
        );
        const updated = resolveEvent({
            contractId: "musd.trove-manager",
            networkId: coordinate.networkId,
            blockNumber: coordinate.blockNumber,
            eventName: "TroveUpdated",
          }),
          updates = logs
            .map((log) => codec.decodeEvent(updated, log))
            .filter((row) => row !== null);
        // Canonical TroveManagerOperation: applyPendingRewards=0, liquidate=1, redeemCollateral=2.
        redemptionRequire(
          updates.every((row) => row[7] === 0n || row[7] === 2n),
          "ReconciliationMismatch",
          "unexpected trove operation in redemption",
        );
        const redeemed = updates.filter((row) => row[7] === 2n),
          accounts = [...new Set(updates.map((row) => parseAddress(row[0])))];
        redemptionRequire(
          redeemed.length > 0 &&
            accounts.length <= Number(quote.input.maxIterations) &&
            new Set(redeemed.map((row) => row[0])).size === redeemed.length,
          "ReconciliationMismatch",
          "redemption position coverage differs",
        );
        const read = (blockNumber: bigint) =>
          config.reader.read({ account: call.from, borrowers: accounts, blockNumber });
        const [before, after, rawReceipt] = await Promise.all([
          read(receipt.blockNumber - 1n),
          read(receipt.blockNumber),
          config.transport.getReceipt(receipt.transactionHash),
        ]);
        redemptionRequire(
          after.borrowing.coordinate.blockHash === receipt.blockHash &&
            before.borrowing.price === after.borrowing.price &&
            before.redemptionRate === after.redemptionRate &&
            before.borrowing.gasCompensation === after.borrowing.gasCompensation,
          "ReconciliationMismatch",
          "settlement identity, price or fee changed within block",
        );
        const gasFee = getReceiptExecutionFee({
          receipt,
          raw: rawReceipt,
          from: call.from,
          to: call.to,
        });
        let principalPaid = 0n,
          interestPaid = 0n,
          collateralDrawn = 0n,
          surplus = 0n,
          pendingPrincipal = 0n,
          pendingInterest = 0n,
          pendingCollateral = 0n,
          removedNumerator = 0n,
          addedNumerator = 0n;
        const closedBorrowers: `0x${string}`[] = [],
          partialBorrowers: `0x${string}`[] = [];
        for (const account of accounts) {
          const previous = before.positions.find((row) => row.account === account),
            current = after.positions.find((row) => row.account === account);
          redemptionRequire(
            previous !== undefined &&
              current !== undefined &&
              previous.position.status === "active",
            "ReconciliationMismatch",
            "redemption predecessor position unavailable",
          );
          const position = previous.position,
            actual = current.position;
          const interest = parseUint(
            position.storedInterest +
              calculateSimpleInterest(
                position.storedPrincipal,
                position.annualRateBps,
                after.borrowing.timestamp - position.lastInterestUpdateTime,
              ) +
              position.pendingInterest,
          );
          const event = redeemed.find((row) => row[0] === account);
          const rewards = updates.filter((row) => row[0] === account && row[7] === 0n);
          redemptionRequire(
            rewards.length <= 1 &&
              (rewards.length === 1 ||
                (position.pendingCollateral === 0n &&
                  position.pendingPrincipal === 0n &&
                  position.pendingInterest === 0n)),
            "ReconciliationMismatch",
            "pending reward evidence differs",
          );
          pendingPrincipal += position.pendingPrincipal;
          pendingInterest += position.pendingInterest;
          pendingCollateral += position.pendingCollateral;
          addedNumerator += position.pendingPrincipal * position.annualRateBps;
          if (!event) {
            redemptionRequire(
              actual.status === "active" &&
                actual.principal === position.principal &&
                actual.interest === interest &&
                actual.collateral === position.collateral &&
                current.surplus === previous.surplus,
              "ReconciliationMismatch",
              "materialized skipped position differs",
            );
            continue;
          }
          const full = actual.status === "closed-by-redemption";
          redemptionRequire(
            full || actual.status === "active",
            "ReconciliationMismatch",
            "unexpected redeemed position status",
          );
          const reserve = full ? before.borrowing.gasCompensation : 0n;
          const payment = parseUint(
              position.principal + interest - actual.principal - actual.interest - reserve,
            ),
            split = splitDebtPayment(interest, payment),
            collateral = calculateRedemptionCollateral({
              musdLot: payment,
              price: before.borrowing.price,
            });
          redemptionRequire(
            payment > 0n &&
              actual.principal === position.principal - split.principalAdjustment - reserve &&
              actual.interest === interest - split.interestAdjustment &&
              (full
                ? actual.collateral === 0n && actual.stake === 0n
                : actual.collateral === position.collateral - collateral &&
                  actual.netDebt >= after.borrowing.minimumNetDebt) &&
              event[1] === actual.principal &&
              event[2] === actual.interest &&
              event[3] === actual.collateral &&
              event[4] === actual.stake &&
              (full ||
                (event[5] === actual.annualRateBps && event[6] === actual.lastInterestUpdateTime)),
            "ReconciliationMismatch",
            "redemption debt split or position event differs",
          );
          const remainder = full ? parseUint(position.collateral - collateral) : 0n;
          redemptionRequire(
            current.surplus === previous.surplus + remainder,
            "ReconciliationMismatch",
            "borrower surplus differs",
          );
          if (full) closedBorrowers.push(account);
          else partialBorrowers.push(account);
          principalPaid += split.principalAdjustment;
          interestPaid += split.interestAdjustment;
          collateralDrawn += collateral;
          surplus += remainder;
          removedNumerator += (split.principalAdjustment + reserve) * position.annualRateBps;
        }
        const reserves = before.borrowing.gasCompensation * BigInt(closedBorrowers.length),
          systemAccrual = accrual(
            before.interestNumerator,
            after.borrowing.timestamp - before.interestUpdatedAt,
          ),
          token = root(after.borrowing, "token").address,
          pcv = root(after.borrowing, "pcv").address,
          gasPool = root(after.borrowing, "gas-pool").address;
        const transfers = decodeTokenTransfers(receipt, token);
        function transferred(from: `0x${string}`, to: `0x${string}`) {
          return transfers
            .filter((row) => row.from === from && row.to === to)
            .reduce((sum, row) => sum + row.amount, 0n);
        }
        redemptionRequire(
          transfers.every(
            (row) =>
              (row.from === call.from && row.to === ZERO) ||
              (row.from === gasPool && row.to === ZERO) ||
              (row.from === ZERO && row.to === pcv),
          ) &&
            transferred(call.from, ZERO) === amounts.actualAmount &&
            transferred(gasPool, ZERO) === reserves &&
            transferred(ZERO, pcv) === systemAccrual,
          "ReconciliationMismatch",
          "redemption burns or interest mint differ",
        );
        const pool = root(after.borrowing, "active-pool"),
          sentAbi = resolveEvent({
            contractId: pool.contractId,
            networkId: coordinate.networkId,
            blockNumber: coordinate.blockNumber,
            eventName: "CollateralSent",
          }),
          poolLogs = getReceiptLogs(receipt, pool.address),
          sent = poolLogs
            .map((log) => codec.decodeEvent(sentAbi, log))
            .filter((row) => row !== null);
        const sumSent = (recipient: `0x${string}`) =>
          sent
            .filter((row) => row[0] === recipient)
            .reduce((sum, row) => sum + parseUint(row[1]), 0n);
        const surplusPool = root(after.borrowing, "coll-surplus-pool").address;
        redemptionRequire(
          sent.length === closedBorrowers.length + 2 &&
            sent.every((row) => row[0] === pcv || row[0] === call.from || row[0] === surplusPool) &&
            sumSent(call.from) === amounts.netCollateral &&
            sumSent(pcv) === amounts.collateralFee &&
            sumSent(surplusPool) === surplus,
          "ReconciliationMismatch",
          "native pool sends differ",
        );
        const debtAbi = resolveEvent({
            contractId: pool.contractId,
            networkId: coordinate.networkId,
            blockNumber: coordinate.blockNumber,
            eventName: "ActivePoolDebtUpdated",
          }),
          debtEvents = poolLogs
            .map((log) => codec.decodeEvent(debtAbi, log))
            .filter((row) => row !== null),
          last: readonly AbiValue[] | undefined = debtEvents.at(-1);
        redemptionRequire(
          principalPaid + interestPaid === amounts.actualAmount &&
            collateralDrawn === amounts.grossCollateral &&
            calculateRedemptionFee({ collateralDrawn, redemptionRate: after.redemptionRate }) ===
              amounts.collateralFee &&
            after.borrowing.musdBalance === before.borrowing.musdBalance - amounts.actualAmount &&
            after.nativeBalance + gasFee === before.nativeBalance + amounts.netCollateral &&
            after.pcvNativeBalance === before.pcvNativeBalance + amounts.collateralFee &&
            after.pcvMusdBalance === before.pcvMusdBalance + systemAccrual &&
            after.totalSupply ===
              before.totalSupply + systemAccrual - amounts.actualAmount - reserves &&
            after.gasPoolBalance === before.gasPoolBalance - reserves &&
            after.activeCollateral ===
              before.activeCollateral + pendingCollateral - collateralDrawn - surplus &&
            after.activePrincipal ===
              before.activePrincipal + pendingPrincipal - principalPaid - reserves &&
            after.activeInterest ===
              before.activeInterest -
                before.accruedSystemInterest +
                systemAccrual +
                pendingInterest -
                interestPaid &&
            after.defaultCollateral === before.defaultCollateral - pendingCollateral &&
            after.defaultPrincipal === before.defaultPrincipal - pendingPrincipal &&
            after.defaultInterest === before.defaultInterest - pendingInterest &&
            after.interestNumerator ===
              before.interestNumerator + addedNumerator - removedNumerator &&
            after.interestUpdatedAt === after.borrowing.timestamp &&
            after.accruedSystemInterest === 0n &&
            last?.[0] === after.activePrincipal &&
            last[1] === after.activeInterest &&
            after.borrowing.troveCount ===
              before.borrowing.troveCount - BigInt(closedBorrowers.length),
          "ReconciliationMismatch",
          "redemption event and block-state changes differ",
        );
        return Object.freeze({
          amounts,
          snapshot: after,
          gasFee,
          closedBorrowers: Object.freeze(closedBorrowers),
          partialBorrowers: Object.freeze(partialBorrowers),
          boundsSatisfied:
            outputSatisfied(amounts, prepared.bounds) &&
            after.redemptionRate <= prepared.bounds.maxRedemptionRate,
        });
      });
    },
  } satisfies RedemptionWriter);
}
