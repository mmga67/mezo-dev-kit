import { parseArgs } from "node:util";

import { getNetwork, isNetworkId } from "@mezo-dev-kit/chains";
import { createContractRegistry, isContractId } from "@mezo-dev-kit/contracts";
import { CoreReadError, createCoreReadClient } from "@mezo-dev-kit/core";

import { createHttpReadTransport, hexData, RpcReadError } from "./http-transport.js";

try {
  const { values } = parseArgs({
    options: {
      network: { type: "string" },
      contract: { type: "string" },
      data: { type: "string" },
    },
  });
  const rpcUrl = process.env.MDK_RPC_URL;
  if (!rpcUrl || !isNetworkId(values.network) || !isContractId(values.contract)) {
    throw new Error("Supply MDK_RPC_URL and valid --network, --contract, and --data arguments");
  }
  const data = hexData(values.data);
  if (data.length < 10) throw new Error("--data must include a read-function selector");
  const network = getNetwork(values.network);
  const transport = createHttpReadTransport({ url: rpcUrl });
  const client = createCoreReadClient({ network, registry: createContractRegistry(), transport });
  const result = await client.readCoherent({
    calls: [{ id: "read", contractId: values.contract, data }],
  });
  await client.assertChain();
  const finalBlock = await transport.getBlock(result.coordinate.blockNumber);
  if (finalBlock?.hash !== result.coordinate.blockHash) {
    throw new Error("The block changed during verification; discard this observation");
  }
  const read = result.reads.read;
  if (read?.status !== "available") throw new Error("Required read was unavailable");
  process.stdout.write(
    `${JSON.stringify(
      {
        observedAt: new Date().toISOString(),
        networkId: network.id,
        chainId: network.evmChainId.toString(),
        blockNumber: result.coordinate.blockNumber.toString(),
        blockHash: result.coordinate.blockHash,
        contractId: read.contract.contractId,
        deploymentId: read.contract.deploymentId,
        abiSha256: read.contract.abi.abiSha256,
        evidence: read.contract.evidence,
        data,
        rawResult: hexData(read.value),
        checkedMethods: ["eth_chainId", "eth_blockNumber", "eth_getBlockByNumber", "eth_call"],
        limitations: [
          "One bounded raw contract read; decode against the resolved read ABI.",
          "No history, signing, transaction submission, or provider uptime claim.",
        ],
      },
      null,
      2,
    )}\n`,
  );
} catch (error) {
  const message =
    error instanceof CoreReadError
      ? `${error.code} at ${error.stage}`
      : error instanceof RpcReadError
        ? error.message
        : "Read failed; check arguments, build, endpoint capability, and evidence";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}
