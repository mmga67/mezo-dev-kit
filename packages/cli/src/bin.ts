#!/usr/bin/env node
import { runTerminal } from "./entry.ts";

process.exitCode = await runTerminal(process.argv.slice(2), process.cwd());
