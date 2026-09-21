import assert from "node:assert/strict";
import { createAbiCodec, parseAddress, parseHash32, parseRpcQuantity } from "@mezo-dev-kit/evm";
import { object, objects, text } from "../../../scripts/lib/json.ts";

/** Validate the retained mapped-token minter call using Contracts' declared EVM dependency. */
export function validateNativeMinterProbe(input: {
  readonly probe: unknown;
  readonly functionAbi: unknown;
  readonly tokenAddress: unknown;
  readonly mintAuthority: unknown;
}): void {
  const minter = object(input.probe, "minter probe");
  const request = object(minter.request, "minter request");
  assert.equal(request.method, "eth_call");
  assert(Array.isArray(request.params));
  assert.equal(
    parseAddress(object(request.params[0], "minter call").to),
    parseAddress(input.tokenAddress),
  );
  const codec = createAbiCodec();
  assert.equal(
    object(request.params[0], "minter call").data,
    codec.encodeFunction(input.functionAbi, []),
  );
  assert.equal(
    parseRpcQuantity(request.params[1]),
    BigInt(text(object(minter.coordinate, "minter coordinate").blockNumber, "minter block")),
  );
  const response = object(JSON.parse(text(minter.body, "minter response")), "minter response");
  assert.equal(response.error, undefined);
  assert.equal(minter.status, 200);
  const anchors = objects(minter.anchors, "minter block anchors");
  assert.equal(anchors.length, 2);
  for (const anchor of anchors) {
    const block = object(
      object(JSON.parse(text(anchor.body, "block response")), "response").result,
      "block",
    );
    assert.equal(
      parseHash32(block.hash),
      parseHash32(object(minter.coordinate, "coordinate").blockHash),
    );
    assert.equal(parseRpcQuantity(block.number), parseRpcQuantity(request.params[1]));
  }
  assert.equal(
    codec.decodeFunction(input.functionAbi, response.result)[0],
    parseAddress(input.mintAuthority),
  );
}
