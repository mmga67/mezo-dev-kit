/** Validate application envelopes here; EVM owns addresses, bytes and integer parsing. */
export function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new TypeError("Expected an object");
  return value as Record<string, unknown>;
}

export function requiredText(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value)
    throw new TypeError(`Supply ${label} as nonempty text`);
  return value;
}

export function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
