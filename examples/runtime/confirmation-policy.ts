import { setTimeout } from "node:timers/promises";

/** Local-example observation budget. A timeout preserves the submission for inspection. */
export const confirmationPolicy = {
  attempts: 20,
  pause: async (): Promise<void> => {
    await setTimeout(250);
  },
};
