import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { connectLocalFork } from "./runtime/local-fork.ts";
import { printReport } from "./runtime/output.ts";
import { invariant, requiredText } from "./runtime/validation.ts";
import { recipeVariants, runRecipe, validateRecipe } from "./runtime/run-recipe.ts";
import { inspectSavedSubmissions } from "./runtime/resume.ts";
import { observeBridgeFile } from "./bridge-musd/observe.ts";

const args = parseArgs({
  args: process.argv.slice(2).filter((argument) => argument !== "--"),
  allowPositionals: true,
  options: {
    mode: { type: "string" },
    variant: { type: "string" },
    "keep-state": { type: "boolean", default: false },
    input: { type: "string" },
    output: { type: "string" },
    help: { type: "boolean", short: "h", default: false },
  },
});
if (args.values.help) {
  process.stdout.write(
    "MDK examples: pnpm --filter @mezo-dev-kit/examples <recipe> --mode fork [--variant name]\n" +
      "Set MDK_SOURCE_RPC_URL and a unique MDK_RUN_ID. Local RPC defaults to http://127.0.0.1:18545.\n" +
      "Start a fresh Anvil mainnet fork first. See examples/README.md for funding, fixtures and recovery.\n" +
      Object.entries(recipeVariants)
        .map(([name, variants]) => `${name}: ${variants.join(", ")}`)
        .join("\n") +
      "\n" +
      "resume --mode observe inspects a saved journal. bridge-musd --mode observe --input receipts.json --output observation.json [--variant native]\n",
  );
} else {
  const abort = new AbortController();
  const cancel = () => {
    abort.abort(new Error("Example cancelled"));
  };
  process.once("SIGINT", cancel);
  try {
    invariant(args.positionals.length === 1, "Choose exactly one recipe");
    const recipe = requiredText(args.positionals[0], "recipe");
    const variant = args.values.variant ?? "default";
    if (args.values.mode === "observe" && recipe === "bridge-musd") {
      invariant(
        variant === "default" || variant === "native",
        "Observation variant must be default or native",
      );
      await observeBridgeFile({
        sourceUrl: requiredText(process.env.MDK_SOURCE_RPC_URL, "MDK_SOURCE_RPC_URL"),
        destinationUrl: requiredText(
          process.env.MDK_DESTINATION_RPC_URL,
          "MDK_DESTINATION_RPC_URL",
        ),
        ...(args.values.input ? { inputFile: args.values.input } : {}),
        repositoryRoot: resolve(import.meta.dirname, "../.."),
        outputFile: requiredText(args.values.output, "--output"),
        native: variant === "native",
        report: printReport,
      });
    } else {
      const runId = requiredText(process.env.MDK_RUN_ID, "MDK_RUN_ID");
      invariant(
        /^[a-zA-Z0-9_-]{1,64}$/.test(runId),
        "Use a run ID with 1–64 letters, digits, underscores or hyphens",
      );
      const repositoryRoot = resolve(import.meta.dirname, "../..");
      const directory = resolve(repositoryRoot, "local", "examples", runId);
      const url = process.env.MDK_LOCAL_RPC_URL ?? "http://127.0.0.1:18545";
      if (recipe === "resume") {
        invariant(
          args.values.mode === "observe" && variant === "default",
          "Resume requires --mode observe",
        );
        await inspectSavedSubmissions({
          url,
          directory,
          report: printReport,
          signal: abort.signal,
        });
      } else {
        invariant(
          args.values.mode === "fork",
          "Select --mode fork explicitly for a transaction example",
        );
        validateRecipe(recipe, variant, process.env);
        const sourceUrl = requiredText(process.env.MDK_SOURCE_RPC_URL, "MDK_SOURCE_RPC_URL");
        const fork = await connectLocalFork({
          url,
          sourceUrl,
          runId,
          directory,
          repositoryRoot,
          keepState: args.values["keep-state"],
          gasPriceWei: recipe === "lock-and-vote" ? 0n : 1n,
          report: printReport,
          signal: abort.signal,
        });
        try {
          await runRecipe(fork, recipe, variant, directory, process.env);
        } finally {
          await fork.close();
        }
      }
    }
  } catch (error) {
    const code = error instanceof Error && "code" in error ? error.code : undefined;
    printReport("Example stopped", {
      error: error instanceof Error ? error.name : "UnknownError",
      code,
      message: error instanceof Error ? error.message : "Inspect the local run",
      next: "Inspect the persisted submission before retrying a write.",
    });
    process.exitCode = 1;
  } finally {
    process.removeListener("SIGINT", cancel);
  }
}
