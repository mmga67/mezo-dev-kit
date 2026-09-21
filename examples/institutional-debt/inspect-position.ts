import {
  createInstitutionalReader,
  calculateInstitutionalRepayment,
} from "@mezo-dev-kit/musd-institutional-debt";
import type { ContractRegistry } from "@mezo-dev-kit/contracts";
import type { RpcTransport } from "@mezo-dev-kit/core";
import type { Hash32 } from "@mezo-dev-kit/evm";
import type {
  InstitutionalSnapshot,
  InstitutionalRepayment,
} from "@mezo-dev-kit/musd-institutional-debt";

/** Inspect one known position; a requested subset is not an inventory of every position. */
export async function inspectInstitutionalPosition(
  registry: ContractRegistry,
  transport: RpcTransport,
  positionId: Hash32,
): Promise<Readonly<InstitutionalSnapshot>> {
  const reader = createInstitutionalReader({ networkId: "mezo-mainnet", registry, transport });
  const snapshot = await reader.read({ positionIds: [positionId] });
  // Keep optional health-unavailable results alongside verified debt and collateral.
  return snapshot;
}

/** Illustrate fee-first repayment allocation in MUSD base units. This package has no partner writer. */
export function allocateRepayment(input: {
  readonly principal: bigint;
  readonly totalFees: bigint;
  readonly payment: bigint;
}): InstitutionalRepayment {
  const allocation = calculateInstitutionalRepayment(input);
  // Economic rejection is a typed result (for example payment-below-fees), not an exception.
  return allocation;
}
