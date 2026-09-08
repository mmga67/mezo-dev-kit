// Generated from canonical lending/Contracts/Bridges evidence. Do not edit.
export const LENDING_MODEL = {
  "networkId": "mezo-mainnet",
  "marketId": "0x6f88e79e8acb3a3ac2f990dcfb83b42ddae96ef406cd735f1721b2a2e1b733db",
  "loanToken": "0x04671c72aab5ac02a03c1098314b1bb6b560c197",
  "collateralToken": "0x7b7c000000000000000000000000000000000000",
  "lltv": "860000000000000000",
  "oracle": {
    "loanDecimals": 6,
    "collateralDecimals": 18,
    "scaleFactor": "1000000"
  },
  "constants": {
    "WAD": "1000000000000000000",
    "ORACLE_PRICE_SCALE": "1000000000000000000000000000000000000",
    "VIRTUAL_SHARES": "1000000",
    "VIRTUAL_ASSETS": "1",
    "LIQUIDATION_CURSOR": "300000000000000000",
    "MAX_LIQUIDATION_INCENTIVE_FACTOR": "1150000000000000000"
  },
  "roots": {
    "lending.morpho": {
      "runtimeSha256": "503b1a0be404a21efd01e9491e6b1a132fd506352936c84db3e3aa38aa69e746",
      "implementationSha256": null,
      "implementationSlot": null
    },
    "lending.adaptive-curve-irm": {
      "runtimeSha256": "8e56a873ea5e23559aeb47f87ff3e745fb24e9f6909387e0febd62e86b75076c",
      "implementationSha256": null,
      "implementationSlot": null
    },
    "lending.musdc-btc-oracle": {
      "runtimeSha256": "4fd4e53e1f1ba95dc73aa7ddb779546561ecfb66e5e8854b8c1354b0683d9651",
      "implementationSha256": "21e60b2c114a8e5cf0e55cd0c2b9304bfe07959df96a5181391abaa88c9b9acd",
      "implementationSlot": "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc"
    },
    "oracle.skip-btc-usd": {
      "runtimeSha256": "10d7d913916ae90441383a41ebb131605db79d4fd72267d6f8dd5b4e885241c7",
      "implementationSha256": null,
      "implementationSlot": null
    }
  },
  "verifiedAt": "2026-08-23T20:17:37Z",
  "reviewAfter": "2026-09-23T00:00:00Z",
  "inputDigest": "e66406e70f793b7f748c09b605964b0469cd6e0bd78bc947ae9ee9e00d5bda11"
} as const;
