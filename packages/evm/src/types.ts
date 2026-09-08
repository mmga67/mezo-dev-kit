declare const evmValue: unique symbol;

/** A 20-byte EVM representation; does not establish checksum, deployment, or ownership. */
export type Address = `0x${string}` & { readonly [evmValue]: "Address" };
/** Exactly 32 bytes. The consuming domain determines what the hash identifies. */
export type Hash32 = `0x${string}` & { readonly [evmValue]: "Hash32" };
/** Complete byte pairs, including empty data. */
export type HexData = `0x${string}` & { readonly [evmValue]: "HexData" };
/** Canonical JSON-RPC integer encoding, distinct from byte data. */
export type RpcQuantity = `0x${string}` & { readonly [evmValue]: "RpcQuantity" };
