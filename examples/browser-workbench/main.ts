import { EvmValueError, formatUnitsExact, parseUnitsExact } from "@mezo-dev-kit/evm";
import { createAccountLoader } from "./accounts.ts";
import type { AccountContext, AccountState, SourceValue } from "./accounts.ts";
import { freshness, presentAmount } from "./presentation.ts";
import { parsePreference, restore, save } from "./storage.ts";
import type { TextStorage } from "./storage.ts";
import {
  advanceDemo,
  demoProgress,
  encodeCheckpoint,
  parseCheckpoint,
  parseScenario,
} from "./transaction.ts";
import type { DemoCheckpoint } from "./transaction.ts";

function element<T extends Element>(id: string, type: new () => T): T {
  const value = document.getElementById(id);
  if (!(value instanceof type)) throw new Error(`Missing workbench element: ${id}`);
  return value;
}
const text = (id: string, value: string): void => {
  element(id, HTMLElement).textContent = value;
};
const failure = (error: unknown): void => {
  text(
    "application-error",
    error instanceof Error ? error.message : "Unexpected application failure",
  );
};
let storage: TextStorage | null;
try {
  storage = window.localStorage;
} catch {
  storage = null;
}
const preference = restore(storage, "mdk-demo-preference", parsePreference, "en-US");
const localeSelect = element("locale", HTMLSelectElement);
localeSelect.value = preference.value;
text("preference-status", `Display preference: ${preference.status}.`);
const locale = () => parsePreference({ version: 1, locale: localeSelect.value });

function convert(): void {
  try {
    const decimals = element("precision", HTMLInputElement).valueAsNumber;
    const units = parseUnitsExact(element("amount-input", HTMLInputElement).value, decimals);
    const amount = presentAmount(units, decimals, locale(), Math.min(4, decimals));
    text(
      "amount-result",
      `${amount.display} DEMO${amount.shortened ? " · display truncated" : " · exact display"}`,
    );
    element("exact", HTMLTextAreaElement).value = amount.exact;
    text("base-units", `${units} base units`);
  } catch (error) {
    if (!(error instanceof EvmValueError)) throw error;
    text("amount-result", `Check the amount or decimals: ${error.code}.`);
    element("exact", HTMLTextAreaElement).value = "";
    text("base-units", "");
  }
}
element("amount-form", HTMLFormElement).addEventListener("submit", (event) => {
  event.preventDefault();
  convert();
});
localeSelect.addEventListener("change", () => {
  text(
    "preference-status",
    `Display preference: ${save(storage, "mdk-demo-preference", { version: 1, locale: locale() })}.`,
  );
  convert();
  renderAccount();
});
convert();

const dialog = element("detail-dialog", HTMLDialogElement);
const detailButton = element("details", HTMLButtonElement);
let opener: Element | null = null;
function closeDetail(): void {
  if (dialog.open) dialog.close();
}
dialog.addEventListener("close", () => {
  if (opener instanceof HTMLElement && opener.isConnected && !detailButton.disabled) opener.focus();
});
element("close-detail", HTMLButtonElement).addEventListener("click", closeDetail);
dialog.addEventListener("keydown", (event) => {
  // This detail dialog has one tabbable control. Keep Tab in the modal rather
  // than allowing browser chrome to receive focus at the end of the sequence.
  if (event.key === "Tab") {
    event.preventDefault();
    element("close-detail", HTMLButtonElement).focus();
  }
});
let accountState: AccountState | null = null;
let calls = 0;
const held: (() => void)[] = [];
const readSource = (
  source: "balance" | "valuation",
  context: AccountContext,
): Promise<SourceValue> => {
  calls++;
  text("read-count", `Fixture source calls: ${calls}`);
  const unavailable = source === "valuation" && element("fail-valuation", HTMLInputElement).checked;
  return new Promise((resolve, reject) => {
    const complete = () => {
      if (unavailable) {
        reject(new Error("Synthetic source unavailable"));
        return;
      }
      resolve({
        units:
          source === "valuation"
            ? 2500000n
            : context.account === "alice"
              ? 9007199254740993000001n
              : context.chain === "demo-a"
                ? 1n
                : 0n,
        source: `Synthetic ${source} / ${context.chain}`,
        observedAt: Date.now(),
      });
    };
    if (element("hold", HTMLInputElement).checked) held.push(complete);
    else complete();
  });
};
function renderAccount(): void {
  for (const source of ["balance", "valuation"] as const) {
    const state = accountState?.[source];
    const units = source === "balance" ? "DEMO" : "demo USD";
    text(
      `${source}-value`,
      state?.value ? `${presentAmount(state.value.units, 6, locale()).display} ${units}` : "—",
    );
    text(
      `${source}-status`,
      state
        ? `${state.status}${state.value ? ` · ${freshness(state.value.observedAt, Date.now(), 60000)} · ${new Date(state.value.observedAt).toISOString()}` : ""}`
        : "Not loaded",
    );
  }
  detailButton.disabled = !accountState?.balance.value;
  if (accountState)
    text(
      "account-status",
      `${accountState.context.account} / ${accountState.context.chain} · ${accountState.balance.status === "available" && accountState.valuation.status === "unavailable" ? "Partial data — valuation unavailable." : "Sources report independently."}`,
    );
}
const loader = createAccountLoader(
  {
    balance: (context) => readSource("balance", context),
    valuation: (context) => readSource("valuation", context),
  },
  (state) => {
    accountState = state;
    renderAccount();
  },
);
function selectedContext(): AccountContext | null {
  const account = element("account-select", HTMLSelectElement).value;
  const chain = element("chain-select", HTMLSelectElement).value;
  if (account === "") return null;
  if ((account !== "alice" && account !== "bob") || (chain !== "demo-a" && chain !== "demo-b"))
    throw new Error("Unknown fixture context");
  return { account, chain };
}
function refreshAccount(): void {
  closeDetail();
  const context = selectedContext();
  if (!context) {
    loader.cancel();
    accountState = null;
    renderAccount();
    text("account-status", "Disconnected — no account data.");
    return;
  }
  loader.refresh(context).catch(failure);
}
for (const id of ["account-select", "chain-select"])
  element(id, HTMLSelectElement).addEventListener("change", refreshAccount);
element("refresh", HTMLButtonElement).addEventListener("click", refreshAccount);
element("release", HTMLButtonElement).addEventListener("click", () => {
  for (const complete of held.splice(0).reverse()) complete();
});
detailButton.addEventListener("click", () => {
  const value = accountState?.balance.value;
  if (!value || !accountState) return;
  text(
    "detail-content",
    `${accountState.context.account} / ${accountState.context.chain}\nExact: ${formatUnitsExact(value.units, 6)} DEMO\nBase units: ${value.units}\n${value.source}\nObserved: ${new Date(value.observedAt).toISOString()}`,
  );
  opener = document.activeElement;
  dialog.showModal();
  element("detail-title", HTMLElement).focus();
});

const restored = restore<DemoCheckpoint | null>(
  storage,
  "mdk-demo-checkpoint",
  parseCheckpoint,
  null,
);
let checkpoint = restored.value;
text("recovery-status", `Demo checkpoint: ${restored.status}.`);
function renderProgress(): void {
  const progress = checkpoint ? demoProgress(checkpoint) : null;
  if (checkpoint) element("scenario", HTMLSelectElement).value = checkpoint.scenario;
  text("transaction-status", progress?.label ?? "No demo started.");
  text(
    "transaction-identity",
    checkpoint
      ? `Fixture operation: offline-demo · ${formatUnitsExact(checkpoint.amount, 6)} DEMO · Hash: ${progress?.hash ?? "not known"}`
      : "",
  );
  element("start-demo", HTMLButtonElement).disabled = checkpoint !== null;
  element("scenario", HTMLSelectElement).disabled = checkpoint !== null;
  element("advance-demo", HTMLButtonElement).disabled = progress === null || progress.finished;
  text(
    "advance-demo",
    progress?.phase === "refresh-failed" ? "Retry fixture read" : "Advance fixture",
  );
}
function persistProgress(): void {
  text(
    "recovery-status",
    `Demo checkpoint: ${save(storage, "mdk-demo-checkpoint", encodeCheckpoint(checkpoint))}.`,
  );
  renderProgress();
}
element("start-demo", HTMLButtonElement).addEventListener("click", () => {
  if (checkpoint !== null) return;
  checkpoint = {
    version: 1,
    scenario: parseScenario(element("scenario", HTMLSelectElement).value),
    step: 0,
    amount: 1250000n,
  };
  persistProgress();
});
element("advance-demo", HTMLButtonElement).addEventListener("click", () => {
  if (checkpoint) {
    checkpoint = advanceDemo(checkpoint);
    persistProgress();
  }
});
element("reset-demo", HTMLButtonElement).addEventListener("click", () => {
  checkpoint = null;
  persistProgress();
});
renderProgress();

const views = ["amount", "account", "transaction"] as const;
function navigate(): void {
  const selected = views.find((view) => location.hash === `#${view}`) ?? "amount";
  closeDetail();
  for (const view of views) {
    element(view, HTMLElement).hidden = view !== selected;
    const link = document.querySelector(`[data-view="${view}"]`);
    if (view === selected) link?.setAttribute("aria-current", "page");
    else link?.removeAttribute("aria-current");
  }
  if (selected === "account") refreshAccount();
  else loader.cancel();
}
window.addEventListener("hashchange", navigate);
window.addEventListener("pagehide", () => {
  loader.cancel();
  for (const complete of held.splice(0)) complete();
});
navigate();
