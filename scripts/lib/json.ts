export type JsonObject = Record<string, unknown>;

export function parseJson(source: string, label: string): unknown {
  try {
    return JSON.parse(source) as unknown;
  } catch (error) {
    throw new Error(`${label} is not valid JSON`, { cause: error });
  }
}

export function object(value: unknown, label: string): JsonObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as JsonObject;
}

export function objects(value: unknown, label: string): JsonObject[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value.map((item, index) => object(item as unknown, `${label}[${index}]`));
}

export function values(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value;
}

export function text(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`${label} must be a string`);
  return value;
}

export function texts(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error(`${label} must be an array of strings`);
  }
  return value;
}

export function scalar(value: unknown, label: string): string | number | boolean | null {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null
  ) {
    return value;
  }
  throw new Error(`${label} must be a scalar JSON value`);
}

export function display(value: unknown, label: string): string {
  return String(scalar(value, label));
}

export function requiredRecord(
  records: readonly JsonObject[],
  property: string,
  expected: string,
  label: string,
): JsonObject {
  const record = records.find((candidate) => candidate[property] === expected);
  if (record === undefined) throw new Error(`${label} is missing '${expected}'`);
  return record;
}
