/** Every selected file has one runner; stale entries and silent omissions are errors. */
export function validateTestSelections(
  files: readonly string[],
  suites: Readonly<Record<string, readonly string[]>>,
): readonly string[] {
  const diagnostics: string[] = [];
  const discovered = new Set(files);
  const owners = new Map<string, string>();
  for (const [suite, selected] of Object.entries(suites)) {
    for (const file of selected) {
      if (!discovered.has(file)) diagnostics.push(`${suite}: selected test is absent: ${file}`);
      const prior = owners.get(file);
      if (prior !== undefined) diagnostics.push(`${file}: selected by both ${prior} and ${suite}`);
      owners.set(file, suite);
    }
  }
  for (const file of discovered) {
    if (!owners.has(file))
      diagnostics.push(
        `${file}: select its runner in the quality/browser config or documented Node runner`,
      );
  }
  return diagnostics.sort();
}

// Runtime projections use generate-*-package.ts. These three existing generators
// predate that convention; human reference generators remain module-owned checks.
const OTHER_RUNTIME_GENERATORS = new Set([
  "scripts/generate/generate-core-transaction-model.ts",
  "scripts/generate/generate-protocol-operations.ts",
  "scripts/generate/generate-cli-schemas.ts",
]);
export function validateGeneratorSelection(
  files: readonly string[],
  command: string,
): readonly string[] {
  const expected = new Set(
    files.filter((file) => file.endsWith("-package.ts") || OTHER_RUNTIME_GENERATORS.has(file)),
  );
  const selected = [...command.matchAll(/scripts\/generate\/[a-z0-9-]+\.ts(?=\s+--check\b)/g)].map(
    (match) => match[0],
  );
  const diagnostics: string[] = [];
  for (const file of expected) {
    if (!selected.includes(file))
      diagnostics.push(`${file}: missing --check registration in generate:check`);
  }
  for (const file of selected) {
    if (!files.includes(file))
      diagnostics.push(`${file}: generate:check names an absent generator`);
    if (selected.indexOf(file) !== selected.lastIndexOf(file))
      diagnostics.push(`${file}: duplicate generate:check registration`);
  }
  return [...new Set(diagnostics)].sort();
}
