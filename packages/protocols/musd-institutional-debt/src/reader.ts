import { getNetwork } from "@mezo-dev-kit/chains";
import type { ContractId, ResolvedContract } from "@mezo-dev-kit/contracts";
import { verifyContractRuntime } from "@mezo-dev-kit/core";
import type { ReadCoordinate } from "@mezo-dev-kit/core";
import {
  createAbiCodec,
  parseAddress,
  parseHash32,
  parseHexData,
  parseUint,
} from "@mezo-dev-kit/evm";
import type { AbiValue } from "@mezo-dev-kit/evm";
import {
  calculateInstitutionalAccrual,
  calculateInstitutionalHealth,
  calculateInstitutionalOutstandingDebt,
  calculateInstitutionalPositionDebt,
  requireInstitutional,
} from "./accounting.ts";
import { INSTITUTIONAL_MODEL } from "./model.generated.ts";
import type {
  EnclaveSnapshot,
  InstitutionalPledge,
  InstitutionalPosition,
  InstitutionalReader,
  InstitutionalReaderConfig,
  InstitutionalSnapshot,
} from "./types.ts";
const zero = `0x${"0".repeat(40)}`;
function address(value: unknown): `0x${string}` {
  const result = parseAddress(value);
  requireInstitutional(result !== zero, "InvalidInput", "nonzero address required");
  return result;
}
function boolean(value: unknown): boolean {
  requireInstitutional(typeof value === "boolean", "IdentityMismatch", "boolean response required");
  return value;
}
function isTuple(value: AbiValue | undefined): value is readonly AbiValue[] {
  return Array.isArray(value);
}
function tuple(value: AbiValue | undefined, length?: number): readonly AbiValue[] {
  requireInstitutional(
    isTuple(value) && (length === undefined || value.length === length),
    "IdentityMismatch",
    "tuple response differs",
  );
  return value;
}
function bounded(value: unknown, max: number): value is readonly unknown[] {
  return Array.isArray(value) && value.length <= max;
}
function selector(value: unknown): `0x${string}` {
  const result = parseHexData(value);
  requireInstitutional(result.length === 10, "InvalidInput", "exact bytes4 selector required");
  return result;
}

export function createInstitutionalReader(
  config: InstitutionalReaderConfig,
): Readonly<InstitutionalReader> {
  requireInstitutional(
    config.networkId === "mezo-mainnet",
    "InvalidInput",
    "institutional reads currently require mainnet",
  );
  const network = getNetwork(config.networkId),
    codec = createAbiCodec(),
    { transport, registry } = config;
  async function start(blockNumber?: bigint) {
    requireInstitutional(
      parseUint(await transport.getChainId()) === network.evmChainId,
      "IdentityMismatch",
      "institutional chain differs",
    );
    const number = parseUint(blockNumber ?? (await transport.getBlockNumber())),
      block = await transport.getBlock(number);
    requireInstitutional(
      block?.number === number,
      "IdentityMismatch",
      "institutional block unavailable",
    );
    const coordinate: Readonly<ReadCoordinate> = Object.freeze({
      networkId: network.id,
      chainId: network.evmChainId,
      blockNumber: number,
      blockHash: parseHash32(block.hash),
    });
    const timestamp = parseUint(await transport.getBlockTimestamp(coordinate));
    const resolve = (contractId: ContractId) =>
      registry.resolve({ contractId, networkId: network.id, blockNumber: number });
    async function verify(contract: ResolvedContract) {
      await verifyContractRuntime({ contract, coordinate, transport });
    }
    async function read(contract: ResolvedContract, name: string, args: readonly AbiValue[] = []) {
      const entries = contract.readAbi.filter(
        (entry) => entry.type === "function" && entry.name === name,
      );
      requireInstitutional(
        entries.length === 1 && entries[0] !== undefined,
        "IdentityMismatch",
        `missing or ambiguous institutional getter ${name}`,
      );
      const entry = entries[0],
        data = codec.encodeFunction(entry, args);
      const response = parseHexData(
        await transport.read({
          ...coordinate,
          address: contract.address,
          contractId: contract.contractId,
          data,
        }),
      );
      requireInstitutional(
        response.length <= 2 + 1024 * 1024 * 2,
        "LimitExceeded",
        "institutional getter exceeds response budget",
      );
      return codec.decodeFunction(entry, response);
    }
    async function finish() {
      const final = await transport.getBlock(number);
      requireInstitutional(
        final?.hash === coordinate.blockHash &&
          parseUint(await transport.getChainId()) === network.evmChainId,
        "IdentityMismatch",
        "institutional coordinate changed",
      );
    }
    return { coordinate, timestamp, resolve, verify, read, finish };
  }
  return Object.freeze({
    async read(input) {
      requireInstitutional(
        bounded(input.positionIds, 16),
        "LimitExceeded",
        "at most 16 requested position IDs",
      );
      const ids = Object.freeze(input.positionIds.map((value) => parseHash32(value)));
      requireInstitutional(
        new Set(ids).size === ids.length,
        "InvalidInput",
        "duplicate requested position ID",
      );
      const ctx = await start(input.blockNumber),
        manager = ctx.resolve("musd.enclave-debt-manager"),
        musd = ctx.resolve("musd.token"),
        veBtc = ctx.resolve("incentives.ve-btc"),
        priceFeed = ctx.resolve("musd.price-feed"),
        pcv = ctx.resolve("musd.pcv");
      await Promise.all([manager, musd, veBtc, priceFeed].map(ctx.verify));
      const names = [
        "musd",
        "veBTC",
        "priceFeed",
        "pcv",
        "paused",
        "mintCap",
        "maxRate",
        "MAX_PLEDGED_VEBTC",
        "MIN_MINIMUM_CR",
        "ENCLAVE_ROLE",
        "totalPrincipal",
        "totalMintedDebt",
        "totalDebtBurned",
        "totalInterestMinted",
        "totalOriginatorFeeMinted",
        "totalFeesStored",
        "totalFeeSettled",
        "interest",
        "combinedFees",
        "getAccruedInterest",
        "getTotalOutstandingDebt",
      ] as const;
      const results = await Promise.all(names.map((name) => ctx.read(manager, name)));
      const field = (name: (typeof names)[number]) => {
        const result = results[names.indexOf(name)];
        requireInstitutional(result !== undefined, "IdentityMismatch", "missing manager read");
        return result;
      };
      requireInstitutional(
        address(field("musd")[0]) === musd.address &&
          address(field("veBTC")[0]) === veBtc.address &&
          address(field("priceFeed")[0]) === priceFeed.address &&
          address(field("pcv")[0]) === pcv.address,
        "IdentityMismatch",
        "institutional dependency differs",
      );
      const maxPledgedVeBtc = parseUint(field("MAX_PLEDGED_VEBTC")[0]);
      requireInstitutional(
        maxPledgedVeBtc <= 20n,
        "LimitExceeded",
        "pledge collection exceeds reader budget",
      );
      const acc = (name: "interest" | "combinedFees") =>
        Object.freeze({
          numerator: parseUint(field(name)[0]),
          lastUpdateTime: parseUint(field(name)[1]),
        });
      const interest = acc("interest"),
        combinedFees = acc("combinedFees"),
        accruedInterest = calculateInstitutionalAccrual({ ...interest, asOf: ctx.timestamp }),
        accruedCombinedFees = calculateInstitutionalAccrual({
          ...combinedFees,
          asOf: ctx.timestamp,
        });
      const totalPrincipal = parseUint(field("totalPrincipal")[0]),
        totalMintedDebt = parseUint(field("totalMintedDebt")[0]),
        totalDebtBurned = parseUint(field("totalDebtBurned")[0]),
        totalFeesStored = parseUint(field("totalFeesStored")[0]),
        totalFeeSettled = parseUint(field("totalFeeSettled")[0]);
      const outstandingDebt = calculateInstitutionalOutstandingDebt({
        totalPrincipal,
        totalFeesStored,
        accrued: accruedCombinedFees,
        totalFeeSettled,
      });
      requireInstitutional(
        totalMintedDebt >= totalDebtBurned &&
          totalMintedDebt - totalDebtBurned === totalPrincipal &&
          accruedInterest === parseUint(field("getAccruedInterest")[0]) &&
          outstandingDebt === parseUint(field("getTotalOutstandingDebt")[0]),
        "AccountingMismatch",
        "institutional aggregate getters disagree",
      );
      const priceEntry = priceFeed.readAbi.find(
        (entry) => entry.type === "function" && entry.name === "fetchPrice",
      );
      requireInstitutional(
        priceEntry !== undefined,
        "IdentityMismatch",
        "missing protocol price getter",
      );
      const priceData = codec.encodeFunction(priceEntry, []);
      let priceResponse: unknown = null;
      try {
        priceResponse = await transport.read({
          ...ctx.coordinate,
          address: priceFeed.address,
          contractId: priceFeed.contractId,
          data: priceData,
        });
      } catch {
        /* Optional price RPC failure is represented explicitly below. */
      }
      let price: InstitutionalSnapshot["price"] = Object.freeze({
        state: "unavailable",
        reason: "price-call-failed",
      });
      if (priceResponse !== null) {
        const amount = parseUint(codec.decodeFunction(priceEntry, parseHexData(priceResponse))[0]);
        price =
          amount > 0n
            ? Object.freeze({ state: "available", amount, decimals: 18 })
            : Object.freeze({ state: "unavailable", reason: "nonpositive-price" });
      }
      const enclaveRole = parseHash32(field("ENCLAVE_ROLE")[0]),
        positions: Readonly<InstitutionalPosition>[] = [];
      for (const positionId of ids) {
        const [record, debtValues, collateralValues, pledgedValues] = await Promise.all([
          ctx.read(manager, "getPosition", [positionId]),
          ctx.read(manager, "getPositionDebt", [positionId]),
          ctx.read(manager, "getPositionCollateral", [positionId]),
          ctx.read(manager, "getPledgedVeBtc", [positionId]),
        ]);
        const values = tuple(record[0], 13),
          statusIndex = parseUint(values[11], 8),
          status = INSTITUTIONAL_MODEL.statuses[Number(statusIndex)];
        requireInstitutional(
          status !== undefined,
          "IdentityMismatch",
          "unknown institutional position status",
        );
        const principal = parseUint(values[0]),
          storedInterest = parseUint(values[1]),
          storedOriginatorFee = parseUint(values[2]),
          lastUpdateTimestamp = parseUint(values[3]),
          interestRateBps = parseUint(values[4], 16),
          originatorFeeRateBps = parseUint(values[5], 16),
          warningCr = parseUint(values[6]),
          minimumCr = parseUint(values[7]),
          enclave = parseAddress(values[8]),
          borrower = parseAddress(values[9]),
          originator = parseAddress(values[10]);
        const pledgedIds = tuple(values[12]).map((value) => parseUint(value)),
          getterIds = tuple(pledgedValues[0]).map((value) => parseUint(value));
        requireInstitutional(
          BigInt(pledgedIds.length) <= maxPledgedVeBtc &&
            new Set(pledgedIds).size === pledgedIds.length &&
            pledgedIds.length === getterIds.length &&
            pledgedIds.every((id, index) => id === getterIds[index]),
          "IdentityMismatch",
          "pledged collection differs",
        );
        const debt = calculateInstitutionalPositionDebt({
          principal,
          storedInterest,
          storedOriginatorFee,
          lastUpdateTimestamp,
          interestRateBps,
          originatorFeeRateBps,
          asOf: ctx.timestamp,
        });
        requireInstitutional(
          [debt.principal, debt.accruedInterest, debt.accruedOriginatorFee, debt.totalDebt].every(
            (value, index) => value === parseUint(debtValues[index]),
          ),
          "AccountingMismatch",
          "position debt getters disagree",
        );
        const pledges = await Promise.all(
          pledgedIds.map(async (tokenId) => {
            const [lock, owner, pledgedPosition] = await Promise.all([
              ctx.read(veBtc, "locked", [tokenId]),
              ctx.read(veBtc, "ownerOf", [tokenId]),
              ctx.read(manager, "getVeBtcPositionId", [tokenId]),
            ]);
            const locked = tuple(lock[0], 4),
              ownerAddress = address(owner[0]),
              pledgeId = parseHash32(pledgedPosition[0]);
            requireInstitutional(
              status === "active" && ownerAddress === enclave && pledgeId === positionId,
              "IdentityMismatch",
              "pledge ownership or position mapping differs",
            );
            return Object.freeze({
              tokenId,
              owner: ownerAddress,
              positionId: pledgeId,
              amount: parseUint(locked[0], 128),
              end: parseUint(locked[1]),
              isPermanent: boolean(locked[2]),
              boost: parseUint(locked[3]),
            }) satisfies InstitutionalPledge;
          }),
        );
        const collateral = pledges.reduce((total, pledge) => parseUint(total + pledge.amount), 0n);
        requireInstitutional(
          collateral === parseUint(collateralValues[0]),
          "AccountingMismatch",
          "pledged collateral differs",
        );
        const enclaveRoleGranted = boolean(
          (await ctx.read(manager, "hasRole", [enclaveRole, enclave]))[0],
        );
        let health: InstitutionalPosition["health"];
        if (price.state === "unavailable")
          health = Object.freeze({ state: "unavailable", reason: price.reason });
        else {
          const value = calculateInstitutionalHealth({
              collateral,
              price: price.amount,
              debt: debt.totalDebt,
              warningCr,
              minimumCr,
            }),
            onchain = await ctx.read(manager, "getPositionHealthStatus", [positionId]);
          requireInstitutional(
            value.currentCr === parseUint(onchain[0]) &&
              value.warningCr === parseUint(onchain[1]) &&
              value.minimumCr === parseUint(onchain[2]) &&
              value.belowWarning === boolean(onchain[3]) &&
              value.belowMinimum === boolean(onchain[4]),
            "AccountingMismatch",
            "position health getter differs",
          );
          health = Object.freeze({ state: "available", value });
        }
        positions.push(
          Object.freeze({
            positionId,
            status,
            enclave,
            borrower,
            originator,
            principal,
            storedInterest,
            storedOriginatorFee,
            lastUpdateTimestamp,
            interestRateBps,
            originatorFeeRateBps,
            warningCr,
            minimumCr,
            debt,
            collateral,
            pledges: Object.freeze(pledges),
            enclaveRoleGranted,
            health,
          }),
        );
      }
      await ctx.finish();
      return Object.freeze({
        coordinate: ctx.coordinate,
        timestamp: ctx.timestamp,
        providerId: transport.id,
        manager: manager.address,
        musd: musd.address,
        veBtc: veBtc.address,
        priceFeed: priceFeed.address,
        pcv: pcv.address,
        paused: boolean(field("paused")[0]),
        mintCap: parseUint(field("mintCap")[0]),
        maxCombinedRateBps: parseUint(field("maxRate")[0], 16),
        maxPledgedVeBtc,
        minimumMinimumCr: parseUint(field("MIN_MINIMUM_CR")[0]),
        price,
        totals: Object.freeze({
          totalPrincipal,
          totalMintedDebt,
          totalDebtBurned,
          totalInterestMinted: parseUint(field("totalInterestMinted")[0]),
          totalOriginatorFeeMinted: parseUint(field("totalOriginatorFeeMinted")[0]),
          totalFeesStored,
          totalFeeSettled,
          interest,
          combinedFees,
          accruedInterest,
          accruedCombinedFees,
          outstandingDebt,
        }),
        positions: Object.freeze(positions),
        positionCoverage: "requested-ids-only",
      });
    },
    async readEnclave(input) {
      const generation = INSTITUTIONAL_MODEL.enclaves.find(
        (entry) => entry.generation === input.generation,
      );
      requireInstitutional(
        generation !== undefined && bounded(input.targets, 32),
        "InvalidInput",
        "known generation and at most 32 target-selector pairs required",
      );
      const account = address(input.account),
        targets = input.targets.map((target) =>
          Object.freeze({ address: address(target.address), selector: selector(target.selector) }),
        );
      requireInstitutional(
        new Set(targets.map((target) => `${target.address}:${target.selector}`)).size ===
          targets.length,
        "InvalidInput",
        "duplicate target-selector pair",
      );
      const maxUtxos = input.maxUtxos;
      requireInstitutional(
        maxUtxos === undefined ||
          (Number.isSafeInteger(maxUtxos) && maxUtxos > 0 && maxUtxos <= 256),
        "LimitExceeded",
        "UTXO response bound must be one to 256",
      );
      const ctx = await start(input.blockNumber),
        enclave = ctx.resolve(generation.contractId),
        veBtc = ctx.resolve("incentives.ve-btc"),
        bridge = ctx.resolve("bridge.native-assets-precompile");
      await Promise.all([ctx.verify(enclave), ctx.verify(veBtc)]);
      const [btcValues, veValues, bridgeValues, lockedToken] = await Promise.all([
        ctx.read(enclave, "btc"),
        ctx.read(enclave, "veBTC"),
        ctx.read(enclave, "ASSETS_BRIDGE"),
        ctx.read(veBtc, "token"),
      ]);
      const btc = address(btcValues[0]);
      requireInstitutional(
        address(veValues[0]) === veBtc.address &&
          address(bridgeValues[0]) === bridge.address &&
          btc === address(lockedToken[0]),
        "IdentityMismatch",
        "Enclave dependency differs",
      );
      const roles = await Promise.all(
        generation.roles.map(async (name) => {
          const role = parseHash32((await ctx.read(enclave, name))[0]);
          return Object.freeze({
            name,
            role,
            granted: boolean((await ctx.read(enclave, "hasRole", [role, account]))[0]),
          });
        }),
      );
      const targetStates = await Promise.all(
        targets.map(async (target) => {
          const allowed = boolean(
            (await ctx.read(enclave, "isTarget", [target.address, target.selector]))[0],
          );
          if (generation.genericTargetExclusions.length > 0)
            requireInstitutional(
              !allowed || (target.address !== veBtc.address && target.address !== bridge.address),
              "IdentityMismatch",
              "second Enclave target exclusion differs",
            );
          return Object.freeze({ ...target, allowed });
        }),
      );
      let utxos: EnclaveSnapshot["utxos"] = Object.freeze({ state: "not-requested" });
      if (maxUtxos !== undefined) {
        const rows = tuple((await ctx.read(enclave, "getTripartyUTXOs"))[0]);
        requireInstitutional(
          rows.length <= maxUtxos,
          "LimitExceeded",
          "recorded UTXOs exceed caller response bound",
        );
        const entries = rows.map((row) => {
          const fields = tuple(row, 3);
          return Object.freeze({
            txHash: parseHash32(fields[0]),
            outputIndex: parseUint(fields[1], 32),
            outputValueSatoshis: parseUint(fields[2], 64),
          });
        });
        requireInstitutional(
          new Set(entries.map((entry) => `${entry.txHash}:${entry.outputIndex}`)).size ===
            entries.length,
          "IdentityMismatch",
          "duplicate recorded UTXO",
        );
        utxos = Object.freeze({ state: "recorded", entries: Object.freeze(entries) });
      }
      await ctx.finish();
      return Object.freeze({
        coordinate: ctx.coordinate,
        timestamp: ctx.timestamp,
        providerId: transport.id,
        generation: generation.generation,
        address: enclave.address,
        account,
        btc,
        veBtc: veBtc.address,
        assetsBridge: bridge.address,
        roles: Object.freeze(roles),
        targets: Object.freeze(targetStates),
        targetCoverage: "requested-pairs-only",
        utxos,
      });
    },
  } satisfies InstitutionalReader);
}
