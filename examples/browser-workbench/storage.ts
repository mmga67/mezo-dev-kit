import type { DisplayLocale } from "./presentation.ts";

export interface TextStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
export type Restored<T> = Readonly<{
  value: T;
  status: "restored" | "default" | "invalid" | "unavailable";
}>;

export function restore<T>(
  storage: TextStorage | null,
  key: string,
  parse: (value: unknown) => T,
  fallback: T,
): Restored<T> {
  if (storage === null) return { value: fallback, status: "unavailable" };
  let text: string | null;
  try {
    text = storage.getItem(key);
  } catch {
    return { value: fallback, status: "unavailable" };
  }
  if (text === null) return { value: fallback, status: "default" };
  try {
    return { value: parse(JSON.parse(text)), status: "restored" };
  } catch {
    return { value: fallback, status: "invalid" };
  }
}

export function save(
  storage: TextStorage | null,
  key: string,
  value: unknown,
): "saved" | "memory-only" {
  if (storage === null) return "memory-only";
  try {
    storage.setItem(key, JSON.stringify(value));
    return "saved";
  } catch {
    return "memory-only";
  }
}

export function parsePreference(value: unknown): DisplayLocale {
  if (
    typeof value !== "object" ||
    value === null ||
    !("version" in value) ||
    value.version !== 1 ||
    !("locale" in value) ||
    (value.locale !== "en-US" && value.locale !== "de-DE")
  )
    throw new Error("Unsupported display preference");
  return value.locale;
}
