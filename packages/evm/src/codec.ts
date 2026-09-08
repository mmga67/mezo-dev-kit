import * as AbiFunction from "ox/AbiFunction";
import * as AbiEvent from "ox/AbiEvent";
import { parseAddress } from "./address.ts";
import { EvmValueError } from "./errors.ts";
import { parseHash32, parseHexData } from "./hex.ts";
import { parseUint } from "./integer.ts";
import type { HexData } from "./types.ts";

export type AbiValue = bigint | boolean | `0x${string}` | readonly AbiValue[];
export interface AbiCodec {
  encodeFunction(entry: unknown, args?: readonly AbiValue[]): HexData;
  decodeFunction(entry: unknown, data: unknown): readonly AbiValue[];
  decodeEvent(
    entry: unknown,
    log: { readonly data: unknown; readonly topics: readonly unknown[] },
  ): readonly AbiValue[] | null;
}
interface Parameter {
  readonly type: string;
  readonly components?: readonly Parameter[];
}
const MAX_BYTES = 1_048_576;
const MAX_ARRAY = 4096;
function invalid(field: string): never {
  throw new EvmValueError("InvalidAbi", field);
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid("definition");
  return value as Record<string, unknown>;
}
function parameter(value: unknown, depth = 0): Parameter {
  if (depth > 8) return invalid("nesting limit");
  const entry = object(value);
  if (typeof entry.type !== "string") return invalid("parameter type");
  const array = /^(.*)\[([0-9]*)\]$/.exec(entry.type);
  if (array) {
    const size = array[2] === "" ? null : Number(array[2]);
    if (size !== null && (!Number.isSafeInteger(size) || size < 1 || size > MAX_ARRAY))
      return invalid("array limit");
    const child = parameter({ ...entry, type: array[1] }, depth + 1);
    return { ...child, type: `${child.type}[${size ?? ""}]` };
  }
  if (entry.type === "tuple") {
    if (
      !Array.isArray(entry.components) ||
      entry.components.length === 0 ||
      entry.components.length > 128
    )
      return invalid("tuple components");
    return {
      type: "tuple",
      components: entry.components.map((part: unknown) => parameter(part, depth + 1)),
    };
  }
  if (["address", "bool", "bytes"].includes(entry.type)) return { type: entry.type };
  const bytes = /^bytes([1-9][0-9]*)$/.exec(entry.type);
  if (bytes && Number(bytes[1]) <= 32) return { type: entry.type };
  const integer = /^(u?int)([1-9][0-9]*)$/.exec(entry.type);
  const bits = Number(integer?.[2]);
  if (!integer || bits < 8 || bits > 256 || bits % 8 !== 0) return invalid("unsupported type");
  return { type: entry.type };
}
function parameters(value: unknown): readonly Parameter[] {
  if (!Array.isArray(value) || value.length > 128) return invalid("parameters");
  return value.map((part: unknown) => parameter(part));
}
function name(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z_][A-Za-z0-9_]{0,255}$/.test(value))
    return invalid("name");
  return value;
}
function definition(value: unknown): AbiFunction.AbiFunction {
  const entry = object(value);
  if (entry.type !== "function") return invalid("function");
  const state = entry.stateMutability;
  if (state !== "view" && state !== "pure" && state !== "payable" && state !== "nonpayable")
    return invalid("mutability");
  return {
    type: "function",
    name: name(entry.name),
    stateMutability: state,
    inputs: parameters(entry.inputs),
    outputs: parameters(entry.outputs),
  };
}
function bytes(value: unknown): HexData {
  const data = parseHexData(value);
  if ((data.length - 2) / 2 > MAX_BYTES) return invalid("byte limit");
  return data;
}
function normalize(param: Parameter, value: unknown, budget = { remaining: MAX_BYTES }): AbiValue {
  // Bound aggregate work before the ABI library allocates encoded output. This
  // conservative overhead also covers container offsets and length words.
  budget.remaining -= 64;
  if (budget.remaining < 0) return invalid("aggregate byte limit");
  const array = /^(.*)\[([0-9]*)\]$/.exec(param.type);
  if (array) {
    if (
      !Array.isArray(value) ||
      value.length > MAX_ARRAY ||
      (array[2] !== "" && value.length !== Number(array[2]))
    )
      return invalid("array value");
    const type = array[1];
    if (!type) return invalid("array type");
    return Object.freeze(value.map((item: unknown) => normalize({ ...param, type }, item, budget)));
  }
  if (param.type === "tuple") {
    const components = param.components ?? invalid("missing tuple components");
    if (!Array.isArray(value) || value.length !== components.length) return invalid("tuple value");
    return Object.freeze(components.map((part, i) => normalize(part, value[i], budget)));
  }
  if (param.type === "address") return parseAddress(value);
  if (param.type === "bool") {
    if (typeof value !== "boolean") return invalid("boolean");
    return value;
  }
  if (param.type.startsWith("bytes")) {
    const data = bytes(value);
    budget.remaining -= (data.length - 2) / 2;
    if (budget.remaining < 0) return invalid("aggregate byte limit");
    if (param.type !== "bytes" && data.length !== 2 + Number(param.type.slice(5)) * 2)
      return invalid("fixed bytes length");
    return data;
  }
  const number = typeof value === "number" && Number.isSafeInteger(value) ? BigInt(value) : value;
  if (param.type.startsWith("uint"))
    return parseUint(number, Number(param.type.slice(4)), "ABI integer");
  const bound = 1n << BigInt(Number(param.type.slice(3)) - 1);
  if (typeof number !== "bigint" || number < -bound || number >= bound)
    return invalid("signed integer");
  return number;
}

/** Bounded positional tuples/arrays and bytes; strings and hashed indexed complex values are excluded. */
export function createAbiCodec(): Readonly<AbiCodec> {
  function encodeFunction(entry: unknown, args: readonly AbiValue[] = []): HexData {
    const abi = definition(entry);
    if (!Array.isArray(args) || args.length !== abi.inputs.length) return invalid("argument count");
    try {
      const budget = { remaining: MAX_BYTES };
      return bytes(
        AbiFunction.encodeData(
          abi,
          abi.inputs.map((part, i) => normalize(part, args[i], budget)),
        ),
      );
    } catch (error) {
      if (error instanceof EvmValueError) throw error;
      return invalid("encoding");
    }
  }
  function decodeFunction(entry: unknown, data: unknown): readonly AbiValue[] {
    const abi = definition(entry);
    const encoded = bytes(data);
    try {
      const result: unknown = AbiFunction.decodeResult(abi, encoded);
      const values = abi.outputs.length === 0 ? [] : abi.outputs.length === 1 ? [result] : result;
      if (!Array.isArray(values) || values.length !== abi.outputs.length)
        return invalid("result count");
      const normalized = Object.freeze(abi.outputs.map((part, i) => normalize(part, values[i])));
      const canonical = encodeFunction(
        { ...abi, name: "validateResult", inputs: abi.outputs, outputs: [] },
        normalized,
      );
      if (canonical.slice(10) !== encoded.slice(2)) return invalid("noncanonical result");
      return normalized;
    } catch (error) {
      if (error instanceof EvmValueError) throw error;
      return invalid("decoding");
    }
  }
  function decodeEvent(
    entry: unknown,
    log: { readonly data: unknown; readonly topics: readonly unknown[] },
  ): readonly AbiValue[] | null {
    const event = object(entry);
    if (
      event.type !== "event" ||
      event.anonymous !== false ||
      !Array.isArray(event.inputs) ||
      event.inputs.length > 128
    )
      return invalid("event");
    const inputs = event.inputs.map((value: unknown) => {
      const input = object(value);
      if (typeof input.indexed !== "boolean") return invalid("indexed");
      const part = parameter(input);
      if (
        input.indexed &&
        (part.type.includes("[") || part.type === "tuple" || part.type === "bytes")
      )
        return invalid("hashed indexed value");
      return { ...part, indexed: input.indexed };
    });
    const abi: AbiEvent.AbiEvent = {
      type: "event",
      name: name(event.name),
      anonymous: false,
      inputs,
    };
    if (!log || !Array.isArray(log.topics)) return invalid("topics");
    if (parseHash32(log.topics[0]) !== AbiEvent.getSelector(abi)) return null;
    if (log.topics.length !== 1 + inputs.filter((part) => part.indexed).length)
      return invalid("topic count");
    const decode = (outputs: readonly Parameter[], data: unknown) =>
      decodeFunction(
        { type: "function", name: "decode", stateMutability: "pure", inputs: [], outputs },
        data,
      );
    const values = [
      ...decode(
        inputs.filter((part) => !part.indexed),
        log.data,
      ),
    ];
    let topic = 1;
    return Object.freeze(
      inputs.map((part) => {
        const value = part.indexed
          ? decode([part], parseHash32(log.topics[topic++]))[0]
          : values.shift();
        if (value === undefined) return invalid("missing event value");
        return value;
      }),
    );
  }
  return Object.freeze({ encodeFunction, decodeFunction, decodeEvent });
}
