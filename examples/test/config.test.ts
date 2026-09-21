import { expect, test } from "vitest";
import { validateRecipe } from "../runtime/run-recipe.ts";

test("recipe selection fails before connecting a fork when a required integration is absent", () => {
  expect(() => {
    validateRecipe("swap-tokens", "typo", {});
  }).toThrow("Unknown recipe or variant");
  expect(() => {
    validateRecipe("bridge-musd", "default", {});
  }).toThrow("MDK_DESTINATION_RPC_URL");
  expect(() => {
    validateRecipe("lend-and-borrow-musdc", "borrower", {});
  }).toThrow("MDK_NATIVE_TOKEN_ARTIFACT");
  expect(() => {
    validateRecipe("lend-and-borrow-musdc", "supplier", {});
  }).not.toThrow();
});
