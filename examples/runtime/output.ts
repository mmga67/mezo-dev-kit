export type Report = (step: string, value: unknown) => void;

/** JSON-safe amounts keep their exact base units; recipes select meaningful fields. */
export const printReport: Report = (step, value) => {
  process.stdout.write(
    `${step}\n${JSON.stringify(
      value,
      (_key, item: unknown) => (typeof item === "bigint" ? item.toString() : item),
      2,
    )}\n`,
  );
};
