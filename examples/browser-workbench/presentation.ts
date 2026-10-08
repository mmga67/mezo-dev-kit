import { formatUnitsExact } from "@mezo-dev-kit/evm";

export type DisplayLocale = "en-US" | "de-DE";

/** Display-only truncation; exact copy/input values never pass through Number. */
export function presentAmount(
  units: bigint,
  decimals: number,
  locale: DisplayLocale,
  places = 4,
): Readonly<{ exact: string; display: string; shortened: boolean }> {
  const exact = formatUnitsExact(units, decimals);
  if (!Number.isInteger(places) || places < 0 || places > decimals)
    throw new Error("Display places must be within asset precision");
  const [whole = "0", fraction = ""] = exact.split(".");
  const kept = fraction.slice(0, places);
  const shortened = /[1-9]/.test(fraction.slice(places));
  const decimal = locale === "de-DE" ? "," : ".";
  const grouped = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(BigInt(whole));
  const tiny = units > 0n && whole === "0" && !/[1-9]/.test(kept) && shortened;
  const threshold = places === 0 ? "1" : `0${decimal}${"0".repeat(places - 1)}1`;
  return {
    exact,
    display: tiny ? `<${threshold}` : grouped + (kept ? decimal + kept : ""),
    shortened,
  };
}

export function freshness(observedAt: number, now: number, maxAgeMs: number): string {
  if (observedAt > now) return "Clock mismatch";
  return now - observedAt > maxAgeMs ? "Stale fixture" : "Fresh fixture";
}
