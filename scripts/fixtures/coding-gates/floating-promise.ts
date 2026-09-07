export function loseFailure(): void {
  Promise.reject(new Error("unobserved"));
}
