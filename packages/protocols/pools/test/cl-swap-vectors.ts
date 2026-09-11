// Synthetic cases compared with retained SwapMath compiled by Solidity 0.7.6.
// Source provenance: the generated POOL_MODEL.cl.swapSourceDigest; see the owning source retrieval tool.
export const clSwapVectors = [
  {
    label: "partial-down",
    input: {
      sqrtPriceX96: 79228162514264337593543950336n,
      sqrtTargetX96: 78990846045029531151608375686n,
      liquidity: 1000000000000000000n,
      amountRemaining: 1000000000000000n,
      fee: 3000n,
    },
    result: {
      sqrtPriceX96: 79149250711305166342700278159n,
      amountIn: 997000000000000n,
      amountOut: 996006981039903n,
      feeAmount: 3000000000000n,
    },
  },
  {
    label: "partial-up",
    input: {
      sqrtPriceX96: 79228162514264337593543950336n,
      sqrtTargetX96: 79466191966197645195421774833n,
      liquidity: 1000000000000000000n,
      amountRemaining: 1000000000000000n,
      fee: 3000n,
    },
    result: {
      sqrtPriceX96: 79307152992291059138124713654n,
      amountIn: 997000000000000n,
      amountOut: 996006981039903n,
      feeAmount: 3000000000000n,
    },
  },
  {
    label: "target-down",
    input: {
      sqrtPriceX96: 79228162514264337593543950336n,
      sqrtTargetX96: 78990846045029531151608375686n,
      liquidity: 1000000000000000000n,
      amountRemaining: 1000000000000000000n,
      fee: 3000n,
    },
    result: {
      sqrtPriceX96: 78990846045029531151608375686n,
      amountIn: 3004354062741926n,
      amountOut: 2995354955910780n,
      feeAmount: 9040182736436n,
    },
  },
  {
    label: "target-up",
    input: {
      sqrtPriceX96: 79228162514264337593543950336n,
      sqrtTargetX96: 79466191966197645195421774833n,
      liquidity: 1000000000000000000n,
      amountRemaining: 1000000000000000000n,
      fee: 3000n,
    },
    result: {
      sqrtPriceX96: 79466191966197645195421774833n,
      amountIn: 3004354062741926n,
      amountOut: 2995354955910780n,
      feeAmount: 9040182736436n,
    },
  },
  {
    label: "fee-only",
    input: {
      sqrtPriceX96: 79228162514264337593543950336n,
      sqrtTargetX96: 78990846045029531151608375686n,
      liquidity: 1000000000000000000n,
      amountRemaining: 1n,
      fee: 3000n,
    },
    result: {
      sqrtPriceX96: 79228162514264337593543950336n,
      amountIn: 0n,
      amountOut: 0n,
      feeAmount: 1n,
    },
  },
  {
    label: "empty-range",
    input: {
      sqrtPriceX96: 79228162514264337593543950336n,
      sqrtTargetX96: 79466191966197645195421774833n,
      liquidity: 0n,
      amountRemaining: 1000000000000000n,
      fee: 3000n,
    },
    result: {
      sqrtPriceX96: 79466191966197645195421774833n,
      amountIn: 0n,
      amountOut: 0n,
      feeAmount: 0n,
    },
  },
  {
    label: "overflow-fallback",
    input: {
      sqrtPriceX96: 18611883644907511909590774894315720731532604461n,
      sqrtTargetX96: 4295343490n,
      liquidity: 340282366920938463463374607431768211455n,
      amountRemaining: 1532495540865888858358347027150309183618739122183602176n,
      fee: 0n,
    },
    result: {
      sqrtPriceX96: 17592186044416n,
      amountIn: 1532495540865888858358347027150307735080213845105972711n,
      amountOut: 79937431571835040596422886914383801282503091205295450168n,
      feeAmount: 1448538525277077629465n,
    },
  },
  {
    label: "near-full-fee",
    input: {
      sqrtPriceX96: 79228162514264337593543950336n,
      sqrtTargetX96: 78990846045029531151608375686n,
      liquidity: 1000000000000000000n,
      amountRemaining: 1000000000000000n,
      fee: 999999n,
    },
    result: {
      sqrtPriceX96: 79228162435036175158507775178n,
      amountIn: 1000000000n,
      amountOut: 999999999n,
      feeAmount: 999999000000000n,
    },
  },
] as const;
