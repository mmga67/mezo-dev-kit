/** Illustrative amounts and user bounds; the reader checks current protocol limits. */
export const borrowingConfig = {
  collateralBtc: "1",
  borrowMusd: "3000",
  addCollateralBtc: "0.1",
  repayMusd: "50",
  maxFeeMusd: "100",
  maxAnnualRateBps: 1000n,
  minCollateralRatio: "1.5",
} as const;
