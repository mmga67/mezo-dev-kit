import { parseUint } from "@mezo-dev-kit/evm";
/** Underlying native BTC also pays execution gas; MEZO's token ledger does not. */
export function lockWalletBalance(input: {
  readonly before: bigint;
  readonly deposit: bigint;
  readonly withdraw: bigint;
  readonly tokenGasFee: bigint;
}): bigint {
  const moved = parseUint(
    parseUint(parseUint(input.before) - parseUint(input.deposit)) + parseUint(input.withdraw),
  );
  return parseUint(moved - parseUint(input.tokenGasFee));
}
