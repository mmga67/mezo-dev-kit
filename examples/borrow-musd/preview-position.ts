import { createBorrowingReader, forecastBorrowing } from "@mezo-dev-kit/musd-borrowing";
import type {
  BorrowingBounds,
  BorrowingSnapshot,
  BorrowingForecast,
} from "@mezo-dev-kit/musd-borrowing";
import type { ReadConnection } from "../setup.ts";

/** Check an opening request before showing a wallet action. This needs no signer. */
export async function previewOpening(
  connection: ReadConnection,
  input: {
    readonly account: `0x${string}`;
    readonly collateral: bigint;
    readonly borrow: bigint;
    readonly bounds: BorrowingBounds;
  },
): Promise<
  Readonly<{
    coordinate: BorrowingSnapshot["coordinate"];
    minimumNetDebt: bigint;
    forecast: BorrowingForecast;
  }>
> {
  const reader = createBorrowingReader({
    networkId: "mezo-mainnet",
    registry: connection.registry,
    transport: connection.transport,
  });
  const snapshot = await reader.read({ account: input.account });
  // Minimum debt, fees and collateral requirements come from this observed state.
  // The SDK throws on an ineligible request; it never increases the user's amount.
  const forecast = forecastBorrowing(
    snapshot,
    { kind: "open", collateral: input.collateral, borrow: input.borrow },
    input.bounds,
  );
  // Opening later still requires fresh preparation and exact-call simulation.
  return { coordinate: snapshot.coordinate, minimumNetDebt: snapshot.minimumNetDebt, forecast };
}
