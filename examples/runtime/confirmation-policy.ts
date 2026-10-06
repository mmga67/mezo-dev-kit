/** Illustrative bounded polling. Applications choose their own delay and cancellation policy. */
export const confirmationPolicy = {
  attempts: 20,
  pause: (): Promise<void> => new Promise((resolve) => globalThis.setTimeout(resolve, 250)),
};
