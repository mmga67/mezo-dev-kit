import * as AbiFunction from "ox/AbiFunction";
import * as AbiEvent from "ox/AbiEvent";

import { parseAddress } from "./address.ts";
import { EvmValueError } from "./errors.ts";
import { parseHash32, parseHexData } from "./hex.ts";
import { parseUint } from "./integer.ts";
import type { HexData } from "./types.ts";

/** Deliberately bounded to scalar functions used by the direct borrowing slice. */
export type AbiScalar = bigint | boolean | `0x${string}`;

function parameter(value: unknown): { readonly type: string } {
  if (!value || typeof value !== "object" || !("type" in value) || typeof value.type !== "string")
    throw new EvmValueError("InvalidAbi", "parameter");
  const type = value.type;
  if (type !== "address" && type !== "bool") {
    const integer = /^(u?int)([1-9][0-9]*)$/.exec(type);
    const bits = Number(integer?.[2]);
    if (!integer || bits < 8 || bits > 256 || bits % 8 !== 0)
      throw new EvmValueError("InvalidAbi", "unsupported scalar type");
  }
  return { type };
}

function definition(value: unknown): AbiFunction.AbiFunction {
  if (
    !value ||
    typeof value !== "object" ||
    !("type" in value) ||
    value.type !== "function" ||
    !("name" in value) ||
    typeof value.name !== "string" ||
    !/^[A-Za-z_][A-Za-z0-9_]*$/.test(value.name) ||
    !("inputs" in value) ||
    !Array.isArray(value.inputs) ||
    !("outputs" in value) ||
    !Array.isArray(value.outputs) ||
    !("stateMutability" in value) ||
    !["view", "pure", "payable", "nonpayable"].includes(String(value.stateMutability))
  )
    throw new EvmValueError("InvalidAbi", "function");
  const stateMutability = value.stateMutability;
  if (
    stateMutability !== "view" &&
    stateMutability !== "pure" &&
    stateMutability !== "payable" &&
    stateMutability !== "nonpayable"
  )
    throw new EvmValueError("InvalidAbi", "stateMutability");
  return {
    type: "function",
    name: value.name,
    inputs: value.inputs.map(parameter),
    outputs: value.outputs.map(parameter),
    stateMutability,
  };
}

function scalar(type: string, value: unknown): AbiScalar {
  if (type === "address") return parseAddress(value);
  if (type === "bool") {
    if (typeof value !== "boolean") throw new EvmValueError("InvalidAbi", "boolean");
    return value;
  }
  // Ox represents narrow uint outputs as safe JS numbers; normalize them to bigint.
  const normalized =
    typeof value === "number" && Number.isSafeInteger(value) ? BigInt(value) : value;
  if (type.startsWith("uint")) return parseUint(normalized, Number(type.slice(4)), "ABI integer");
  const bound = 1n << BigInt(Number(type.slice(3)) - 1);
  if (typeof normalized !== "bigint" || normalized < -bound || normalized >= bound)
    throw new EvmValueError("InvalidAbi", "signed integer");
  return normalized;
}

export function encodeFunctionData(entry: unknown, args: readonly AbiScalar[] = []): HexData {
  const abi = definition(entry);
  if (!Array.isArray(args) || args.length !== abi.inputs.length)
    throw new EvmValueError("InvalidAbi", "argument count");
  try {
    return parseHexData(
      AbiFunction.encodeData(
        abi,
        args.map((arg, i) => scalar(abi.inputs[i]?.type ?? "", arg)),
      ),
    );
  } catch (cause) {
    if (cause instanceof EvmValueError) throw cause;
    throw new EvmValueError("InvalidAbi", "encoding");
  }
}

/** Always returns an array, including zero and one-output functions. */
export function decodeFunctionResult(entry: unknown, data: unknown): readonly AbiScalar[] {
  const abi = definition(entry);
  const hex = parseHexData(data);
  if (hex.length !== 2 + abi.outputs.length * 64)
    throw new EvmValueError("InvalidAbi", "result length");
  try {
    const decoded: unknown = AbiFunction.decodeResult(abi, hex);
    const values: readonly unknown[] =
      abi.outputs.length === 0
        ? []
        : abi.outputs.length === 1
          ? [decoded]
          : Array.isArray(decoded)
            ? decoded
            : [];
    if (values.length !== abi.outputs.length) throw new EvmValueError("InvalidAbi", "result count");
    const normalized = values.map((value, i) => scalar(abi.outputs[i]?.type ?? "", value));
    const encoded = AbiFunction.encodeData(
      { ...abi, name: "validateResult", inputs: abi.outputs, outputs: [] },
      normalized,
    );
    if (encoded.slice(10).toLowerCase() !== hex.slice(2))
      throw new EvmValueError("InvalidAbi", "noncanonical result");
    return Object.freeze(normalized);
  } catch (cause) {
    if (cause instanceof EvmValueError) throw cause;
    throw new EvmValueError("InvalidAbi", "decoding");
  }
}

/** Returns null for another event signature, and throws for malformed matching logs. */
export function decodeEventLog(
  entry: unknown,
  log: { readonly data: unknown; readonly topics: readonly unknown[] },
): readonly AbiScalar[] | null {
  if (
    !entry ||
    typeof entry !== "object" ||
    !("type" in entry) ||
    entry.type !== "event" ||
    !("name" in entry) ||
    typeof entry.name !== "string" ||
    !("inputs" in entry) ||
    !Array.isArray(entry.inputs) ||
    !("anonymous" in entry) ||
    entry.anonymous !== false
  )
    throw new EvmValueError("InvalidAbi", "event");
  const inputs = entry.inputs.map((value: unknown) => {
    const parsed = parameter(value);
    if (
      !value ||
      typeof value !== "object" ||
      !("indexed" in value) ||
      typeof value.indexed !== "boolean"
    )
      throw new EvmValueError("InvalidAbi", "event parameter");
    return { ...parsed, indexed: value.indexed };
  });
  const abi: AbiEvent.AbiEvent = { type: "event", name: entry.name, anonymous: false, inputs };
  if (!log || !Array.isArray(log.topics)) throw new EvmValueError("InvalidAbi", "event topics");
  if (parseHash32(log.topics[0]) !== AbiEvent.getSelector(abi)) return null;
  const topics = log.topics.map((topic) => parseHash32(topic));
  if (topics.length !== 1 + inputs.filter((input) => input.indexed).length)
    throw new EvmValueError("InvalidAbi", "event topics");
  const definition = {
    type: "function",
    name: "decode",
    stateMutability: "pure",
    inputs: [],
    outputs: inputs.filter((input) => !input.indexed),
  };
  const data = [...decodeFunctionResult(definition, log.data)];
  let index = 1;
  return Object.freeze(
    inputs
      .map((input) =>
        input.indexed
          ? decodeFunctionResult({ ...definition, outputs: [input] }, topics[index++])[0]
          : data.shift(),
      )
      .map((value) => {
        if (value === undefined) throw new EvmValueError("InvalidAbi", "missing event value");
        return value;
      }),
  );
}
