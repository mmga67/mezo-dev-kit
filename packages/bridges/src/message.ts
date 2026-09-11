import { keccak256, parseHash32, parseHexData, parseUint } from "@mezo-dev-kit/evm";
import type { Hash32 } from "@mezo-dev-kit/evm";
import { NttObserverError } from "./errors.ts";

/** Pinned TransceiverStructs: uint16 chain || id[32] || sender[32] || length[2] || payload. */
export function messageDigest(chainId: bigint, value: unknown): Hash32 {
  const chain = parseUint(chainId, 16);
  const encoded = parseHexData(value);
  const length = (encoded.length - 2) / 2;
  if (chain === 0n || length < 66 || length > 65535)
    throw new NttObserverError("InvalidEvidence", "source-message", "invalid NTT message envelope");
  const payloadLength = Number.parseInt(encoded.slice(130, 134), 16);
  if (length !== 66 + payloadLength)
    throw new NttObserverError("InvalidEvidence", "source-message", "NTT payload length mismatch");
  return parseHash32(keccak256(`0x${chain.toString(16).padStart(4, "0")}${encoded.slice(2)}`));
}
