# MDK TypeScript application

This private starter uses locally packed MDK artifacts. Keep the artifact files,
`pnpm-lock.yaml`, `mdk.config.json`, `mdk.lock.json`, and generated guidance with
the project so another checkout can restore the same versions.

If the guided setup completed, run `pnpm mdk` to open this project's console.
Choose **Run the local demo**, **Check setup**, **Browse documentation**, or
**Add capabilities or skills**. The default set includes foundation packages,
TypeScript/foundation skills and a project memory skill.
The optional AI-assistant prompt is available from the same menu. No global
MDK installation is needed. `pnpm mdk console --plain` uses numbered prompts.

For a manually created project or a restored clone, use the explicit commands:

```sh
pnpm install
pnpm mdk init --set base
pnpm start
pnpm check
pnpm mdk doctor --json
pnpm mdk docs search "borrowing"
pnpm mdk docs fetch --all --offline
pnpm mdk sets
pnpm mdk add borrowing --dry-run
pnpm mdk add borrowing
```

`src/network.ts` checks the chain identity of an injected read transport using
the SDK. `pnpm start` runs a deterministic fixture and makes no network request.
Select your provider and adapt the injected transport when adding real reads.
The example does not certify current network state or prepare transactions.

You own `AGENTS.md` and source files. Edit them for your application. Run
`pnpm mdk sync --dry-run` before guidance updates. Search the complete local
reference index; explicitly fetch a resource before asking an agent to read it.
The index retains evidence limitations and identifies excluded source artifacts.

Read the installed CLI README for commands, artifact updates and recovery.
For project memory, follow the installed `mdk-memory-application` skill or read
`pnpm mdk docs show guide:docs/guides/application_memory.md`. Memory starts empty;
the skill guides selective capture rather than recording conversations.
