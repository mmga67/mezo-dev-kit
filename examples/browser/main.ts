import { EvmValueError, formatUnitsExact, parseUnitsExact, sha256 } from "@mezo-dev-kit/evm";

const form = document.querySelector("form");
const output = document.querySelector("output");
if (!form || !output) throw new Error("The amount form and result output are required");

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const values = new FormData(form);
  const amount = values.get("amount");
  const decimals = Number(values.get("decimals"));
  try {
    const units = parseUnitsExact(amount, decimals);
    const display = formatUnitsExact(units, decimals);
    const digest = sha256(new TextEncoder().encode(display));
    output.textContent = `${display} = ${units} base units. Text SHA-256: ${digest}`;
  } catch (error) {
    if (!(error instanceof EvmValueError)) throw error;
    output.textContent = `Check the amount and precision: ${error.code}.`;
  }
});
