import { getNetwork } from "@mezo-dev-kit/chains";
import { ContractRegistryError } from "@mezo-dev-kit/contracts";
import type { ContractId } from "@mezo-dev-kit/contracts";
import { CoreReadError, createCoreReadClient } from "@mezo-dev-kit/core";
import type { CoreReadCall } from "@mezo-dev-kit/core";

import { amount, beneficialPrincipal, calculateSavingsYield, uint256 } from "./accounting.ts";
import { SavingsReadError } from "./errors.ts";
import {
  SAVINGS_EVIDENCE,
  SAVINGS_INPUT_DIGEST,
  SAVINGS_NETWORK,
  SAVINGS_ROOTS,
  SAVINGS_RUNTIME_SHA256,
} from "./model.generated.ts";
import {
  address,
  available,
  codeHash,
  encode,
  implementation,
  optional,
  readCall,
  sameAddress,
  scalar,
  unavailable,
} from "./reads.ts";
import { readConverter, readGauge, readStrategy } from "./roles.ts";
import type {
  SavingsCall,
  SavingsReader,
  SavingsReaderConfig,
  SavingsReadValue,
  SavingsSnapshot,
  SavingsWallet,
} from "./types.ts";

export function createSavingsReader(config: SavingsReaderConfig): Readonly<SavingsReader> {
  if (
    !config ||
    typeof config !== "object" ||
    !config.codec ||
    typeof config.codec.encodeRead !== "function" ||
    typeof config.codec.decodeRead !== "function" ||
    !config.transport ||
    typeof config.transport.getCode !== "function" ||
    typeof config.transport.getStorage !== "function"
  )
    throw new SavingsReadError("InvalidInput", "config");
  if (config.networkId !== SAVINGS_NETWORK)
    throw new SavingsReadError("UnsupportedNetwork", "networkId");
  const network = getNetwork(config.networkId);
  const core = createCoreReadClient({
    network,
    registry: config.registry,
    transport: config.transport,
  });

  async function read(
    input: Parameters<SavingsReader["read"]>[0],
  ): Promise<Readonly<SavingsSnapshot>> {
    const account = address(input?.account, "account");
    const requested =
      input.blockNumber === undefined ? undefined : uint256(input.blockNumber, "blockNumber");
    await core.assertChain();
    const blockNumber =
      requested ?? uint256(await config.transport.getBlockNumber(), "blockNumber");
    const resolve = (contractId: ContractId) =>
      config.registry.resolve({ contractId, networkId: network.id, blockNumber });
    const savings = resolve(SAVINGS_ROOTS["savings-deployment"]);
    const musd = resolve(SAVINGS_ROOTS["musd-token"]);
    const pcv = resolve(SAVINGS_ROOTS.pcv);
    const voter = resolve(SAVINGS_ROOTS["pools-voter"]);
    const calls: CoreReadCall[] = [];
    const descriptions = new Map<string, SavingsCall>();
    function add(
      id: string,
      contract: typeof savings,
      name: string,
      args: readonly `0x${string}`[] = [],
      required = true,
    ): void {
      const call = readCall(contract.readAbi, name, args);
      descriptions.set(id, call);
      calls.push({ id, contractId: contract.contractId, data: encode(config, call), required });
    }
    for (const name of [
      "totalSupply",
      "pendingYield",
      "yieldIndex",
      "gaugeYieldClaimCap",
      "strategy",
      "vaultGauge",
      "musdToken",
      "yieldToken",
      "pcv",
    ])
      add(name, savings, name);
    add("feeRecipient", pcv, "feeRecipient");
    add("btcRecipient", pcv, "btcRecipient");
    add("voterGauge", voter, "gauges", [savings.address]);
    for (const name of ["balanceOf", "claimableYield", "supplyYieldIndex"])
      add(`wallet.${name}`, savings, name, [account], false);
    const initial = await core.readCoherent({ calls, blockNumber });
    const { coordinate } = initial;
    function value(id: string): unknown {
      const item = initial.reads[id];
      const call = descriptions.get(id);
      if (item?.status !== "available" || !call) throw new SavingsReadError("ReadUnavailable", id);
      try {
        return config.codec.decodeRead({ ...call, data: item.value });
      } catch (cause) {
        throw new SavingsReadError("InvalidReadValue", id, { cause });
      }
    }
    const supply = scalar(value("totalSupply"), "totalSupply");
    const yieldIndex = scalar(value("yieldIndex"), "yieldIndex");
    const pendingYield = amount("MUSD", scalar(value("pendingYield"), "pendingYield"));
    const gaugeYieldClaimCap = amount(
      "MUSD",
      scalar(value("gaugeYieldClaimCap"), "gaugeYieldClaimCap"),
    );
    sameAddress(value("musdToken"), musd.address, "savings.musdToken");
    sameAddress(value("yieldToken"), musd.address, "savings.yieldToken");
    sameAddress(value("pcv"), pcv.address, "savings.pcv");
    sameAddress(value("feeRecipient"), savings.address, "pcv.feeRecipient");
    const gaugeAddress = address(value("vaultGauge"), "savings.vaultGauge");
    sameAddress(value("voterGauge"), gaugeAddress, "voter.gauges");
    if (account === gaugeAddress)
      throw new SavingsReadError("InvalidInput", "account is gauge custody");
    const strategyAddress = address(value("strategy"), "savings.strategy");
    const converterAddress = address(value("btcRecipient"), "pcv.btcRecipient");
    if (savings.implementationAddress === null)
      throw new SavingsReadError("UnsupportedRole", "savings.implementation");
    sameAddress(
      await implementation(config, coordinate, savings.address),
      savings.implementationAddress,
      "savings.implementation",
    );
    if (
      codeHash(
        await config.transport.getCode({ ...coordinate, address: savings.implementationAddress }),
      ) !== SAVINGS_RUNTIME_SHA256
    )
      throw new SavingsReadError("UnsupportedRole", "savings.runtime");
    let wallet: SavingsReadValue<SavingsWallet>;
    try {
      const balance = scalar(value("wallet.balanceOf"), "wallet.balanceOf");
      if (balance > supply) throw new SavingsReadError("TopologyMismatch", "wallet.balanceOf");
      wallet = available({
        principalReceipts: amount("sMUSD", balance),
        yield: calculateSavingsYield({
          balance,
          yieldIndex,
          supplyYieldIndex: scalar(value("wallet.supplyYieldIndex"), "wallet.supplyYieldIndex"),
          storedClaimableYield: scalar(value("wallet.claimableYield"), "wallet.claimableYield"),
        }),
      });
    } catch (error) {
      wallet = unavailable(error, "wallet");
    }
    const context = { config, coordinate, savings, musd: musd.address, voter: voter.address };
    const [strategy, converter, gauge] = await Promise.all([
      optional("strategy", () => readStrategy(context, strategyAddress)),
      optional("converter", () => readConverter(context, converterAddress)),
      optional("gauge", () => readGauge(context, gaugeAddress, account, supply)),
    ]);
    const principal =
      wallet.status === "available" && gauge.status === "available"
        ? available(
            beneficialPrincipal(
              wallet.value.principalReceipts.baseUnits,
              gauge.value.beneficialReceipts.baseUnits,
            ),
          )
        : unavailable<ReturnType<typeof beneficialPrincipal>>(
            new SavingsReadError("ReadUnavailable", "beneficialPrincipal.inputs"),
            "beneficialPrincipal",
          );
    if (principal.status === "available" && principal.value.baseUnits > supply)
      throw new SavingsReadError("TopologyMismatch", "beneficialPrincipal");
    await core.assertChain();
    const finalBlock = await config.transport.getBlock(blockNumber);
    if (
      finalBlock?.number !== blockNumber ||
      typeof finalBlock.hash !== "string" ||
      finalBlock.hash.toLowerCase() !== coordinate.blockHash.toLowerCase()
    )
      throw new SavingsReadError("InconsistentCoordinate", "block changed during read");
    return Object.freeze({
      coordinate,
      account,
      savings: savings.address,
      evidence: Object.freeze({ inputDigest: SAVINGS_INPUT_DIGEST, ...SAVINGS_EVIDENCE }),
      global: Object.freeze({
        principalSupply: amount("sMUSD", supply),
        pendingYield,
        yieldIndex,
        gaugeYieldClaimCap,
      }),
      wallet,
      strategy,
      converter,
      gauge,
      beneficialPrincipal: principal,
    });
  }
  return Object.freeze({
    read: async (input: Parameters<SavingsReader["read"]>[0]) => {
      try {
        return await read(input);
      } catch (cause) {
        if (
          cause instanceof SavingsReadError ||
          cause instanceof CoreReadError ||
          cause instanceof ContractRegistryError
        )
          throw cause;
        throw new SavingsReadError("ReadUnavailable", "snapshot", { cause });
      }
    },
  });
}
