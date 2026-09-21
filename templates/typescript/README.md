# MDK TypeScript application

This private starter uses locally packed MDK artifacts. Keep the artifact files,
`pnpm-lock.yaml`, `mdk.config.json`, `mdk.lock.json`, and generated guidance with
the project so another checkout can restore the same versions.

```sh
pnpm install
pnpm mdk init --domains typescript,foundation
pnpm start
pnpm check
pnpm mdk doctor --json
pnpm mdk docs search "borrowing"
pnpm mdk docs fetch --all --offline
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
