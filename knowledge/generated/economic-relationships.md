# Mezo economic relationships

> Generated from domain-owned economic relationship collections. Do not edit manually.

This inventory connects economic actors and quantities. It does not qualify live routes,
current balances, transaction support or a profitable strategy. Each row retains its
collection review state and source qualification; recorded-model rows inherit the
referenced model's generation and evidence limitations. Unqualified rows are owned gaps.

## protocols/musd

Owner: [economic-relationships](../protocols/musd/records/economic-relationships.json). Status: candidate; review: accepted.

| Relationship                            | From → to                                            | Quantity | Basis          |
| --------------------------------------- | ---------------------------------------------------- | -------- | -------------- |
| MUSD protocol revenue to protocol funds | MUSD loan activity → Protocol-controlled funds       | fees     | recorded-model |
| Bootstrap loan revenue allocation       | Protocol-controlled funds → Bootstrap loan repayment | fees     | unqualified    |

Follow the owning collection for exact logical references, accounting boundaries and limitations.

## protocols/musd/borrowing

Owner: [economic-relationships](../protocols/musd/borrowing/records/economic-relationships.json). Status: candidate; review: accepted.

| Relationship                       | From → to                                                              | Quantity   | Basis          |
| ---------------------------------- | ---------------------------------------------------------------------- | ---------- | -------------- |
| BTC secures classic MUSD borrowing | Native BTC on Mezo → Classic loan collateral                           | collateral | recorded-model |
| Classic MUSD issuance              | BTC-backed borrowing position → Borrower MUSD balance                  | asset      | recorded-model |
| Borrower MUSD debt                 | Classic loan position → Borrower repayment obligation                  | debt       | recorded-model |
| Classic MUSD debt repayment        | Borrower MUSD repayment → Reduced classic loan debt                    | debt       | recorded-model |
| Classic liquidation settlement     | Undercollateralized classic position → Protocol liquidation settlement | collateral | recorded-model |

Follow the owning collection for exact logical references, accounting boundaries and limitations.

## protocols/musd/redemptions

Owner: [economic-relationships](../protocols/musd/redemptions/records/economic-relationships.json). Status: candidate; review: accepted.

| Relationship                          | From → to                                              | Quantity   | Basis          |
| ------------------------------------- | ------------------------------------------------------ | ---------- | -------------- |
| MUSD redemption against eligible debt | Redeemer MUSD → Eligible classic position debt         | debt       | recorded-model |
| Redemption collateral settlement      | Eligible position collateral → Redeemer BTC settlement | collateral | recorded-model |

Follow the owning collection for exact logical references, accounting boundaries and limitations.

## protocols/musd/institutional-debt

Owner: [economic-relationships](../protocols/musd/institutional-debt/records/economic-relationships.json). Status: candidate; review: accepted.

| Relationship                             | From → to                                                              | Quantity          | Basis          |
| ---------------------------------------- | ---------------------------------------------------------------------- | ----------------- | -------------- |
| Explicit institutional collateral pledge | Enclave-custodied veBTC position → Institutional debt collateral claim | collateral-pledge | recorded-model |
| Institutional MUSD credit                | Institutional credit position → Institutional borrower debt            | debt              | recorded-model |

Follow the owning collection for exact logical references, accounting boundaries and limitations.

## protocols/musd/savings

Owner: [economic-relationships](../protocols/musd/savings/records/economic-relationships.json). Status: candidate; review: accepted.

| Relationship                               | From → to                                                  | Quantity | Basis          |
| ------------------------------------------ | ---------------------------------------------------------- | -------- | -------------- |
| Savings principal claim                    | Deposited MUSD principal → sMUSD holder                    | receipt  | recorded-model |
| Protocol-fund conversion and Savings yield | Protocol funds and conversion → Savings yield accounting   | yield    | recorded-model |
| Unstaked Savings yield                     | Savings yield accounting → Direct receipt holder           | yield    | recorded-model |
| Staked Savings yield to voters             | Gauge-custodied Savings receipts → Associated veBTC voters | yield    | recorded-model |

Follow the owning collection for exact logical references, accounting boundaries and limitations.

## protocols/lending/musdc

Owner: [economic-relationships](../protocols/lending/musdc/records/economic-relationships.json). Status: candidate; review: accepted.

| Relationship                           | From → to                                        | Quantity   | Basis          |
| -------------------------------------- | ------------------------------------------------ | ---------- | -------------- |
| BTC secures the mUSDC market           | Native BTC on Mezo → Morpho borrower position    | collateral | recorded-model |
| Existing mUSDC is lent to borrowers    | Supplied mUSDC market liquidity → mUSDC borrower | asset      | recorded-model |
| Market repayment and supplier interest | mUSDC borrower interest → Market suppliers       | yield      | recorded-model |

Follow the owning collection for exact logical references, accounting boundaries and limitations.

## protocols/vaults/usdc-lending

Owner: [economic-relationships](../protocols/vaults/usdc-lending/records/economic-relationships.json). Status: candidate; review: accepted.

| Relationship                                         | From → to                                                                   | Quantity  | Basis          |
| ---------------------------------------------------- | --------------------------------------------------------------------------- | --------- | -------------- |
| USDC vault depositor claim                           | Deposited mUSDC → Vault depositor shares                                    | receipt   | recorded-model |
| Vault allocates mUSDC to the market                  | Vault assets → Morpho market supply                                         | principal | recorded-model |
| Vault wrapper claim for gauge custody                | Vault shares → Wrapped vault receipt                                        | receipt   | recorded-model |
| Configured wrapper yield through the gauge to voters | Wrapper-held vault shares with a configured gauge → Associated veBTC voters | yield     | recorded-model |

Follow the owning collection for exact logical references, accounting boundaries and limitations.

## protocols/incentives

Owner: [economic-relationships](../protocols/incentives/records/economic-relationships.json). Status: candidate; review: accepted.

| Relationship                                      | From → to                                                               | Quantity     | Basis          |
| ------------------------------------------------- | ----------------------------------------------------------------------- | ------------ | -------------- |
| Separate BTC voting lock                          | Native BTC allocated to a lock → veBTC lock custody                     | collateral   | recorded-model |
| MEZO lock custody                                 | MEZO allocated to a lock → veMEZO lock custody                          | asset        | recorded-model |
| veMEZO boosts veBTC influence                     | veMEZO boost allocation → veBTC voting power                            | voting-power | recorded-model |
| veBTC product allocation votes                    | veBTC voting power → Product gauge allocation                           | voting-power | recorded-model |
| Independent validator allocation votes            | veBTC voting power → Validator gauge allocation                         | voting-power | recorded-model |
| Independent veMEZO external allocation            | veMEZO voting power → External MEZO Gauge allocation                    | voting-power | recorded-model |
| Rebase share of one emission budget               | Epoch MEZO emission budget → veMEZO rebase allocation                   | emissions    | recorded-model |
| Reward allocation in the Mezo Earn flywheel       | Epoch MEZO emission budget → Validator and ecosystem reward allocations | emissions    | recorded-model |
| Product-gauge MEZO rewards                        | Allocated product-gauge rewards → Eligible product stakers              | emissions    | recorded-model |
| Published passive chain and bridge revenue        | Chain and bridge activity → Eligible veBTC revenue claim                | fees         | unqualified    |
| External pool incentive delivery                  | MEZO Gauge allocation on Mezo → Destination pool beneficiaries          | emissions    | unqualified    |
| Current splitter and protocol parameter authority | Authorized protocol controller → Governed splitter parameters           | control      | unqualified    |

Follow the owning collection for exact logical references, accounting boundaries and limitations.

## protocols/pools

Owner: [economic-relationships](../protocols/pools/records/economic-relationships.json). Status: candidate; review: accepted.

| Relationship                     | From → to                                                         | Quantity  | Basis          |
| -------------------------------- | ----------------------------------------------------------------- | --------- | -------------- |
| Assets supplied to trading pools | Liquidity provider assets → Trading pool liquidity                | principal | recorded-model |
| Liquidity position claim         | Pool liquidity → LP token or concentrated position                | receipt   | recorded-model |
| Staked pool position fees        | Associated pool trading activity → Gauge-associated voter revenue | fees      | recorded-model |

Follow the owning collection for exact logical references, accounting boundaries and limitations.

## workflows/bridges

Owner: [economic-relationships](../workflows/bridges/records/economic-relationships.json). Status: candidate; review: accepted.

| Relationship                           | From → to                                                 | Quantity | Basis                 |
| -------------------------------------- | --------------------------------------------------------- | -------- | --------------------- |
| Bitcoin entry and Threshold custody    | BTC on Bitcoin → Threshold tBTC wallets                   | asset    | published-description |
| tBTC backing on Ethereum               | Threshold tBTC wallets → tBTC on Ethereum                 | asset    | published-description |
| Ethereum tBTC entry to Mezo native BTC | tBTC on Ethereum → Native BTC on Mezo                     | asset    | published-description |
| Native BTC exit to Ethereum tBTC       | Native BTC on Mezo → tBTC recipient on Ethereum           | asset    | recorded-model        |
| tBTC redemption to Bitcoin             | tBTC on Ethereum → Recipient BTC on Bitcoin               | asset    | published-description |
| Ethereum USDC mapped representation    | USDC on Ethereum → mUSDC on Mezo                          | asset    | recorded-model        |
| Wider Native Bridge assets             | Eligible Ethereum tokens → Mapped representations on Mezo | asset    | published-description |
| MUSD NTT circulation                   | MUSD on Mezo → MUSD on Ethereum and Base                  | asset    | recorded-model        |
| MEZO Wormhole circulation              | MEZO on Mezo → MEZO on Ethereum, Base, BSC and Solana     | asset    | published-description |

Follow the owning collection for exact logical references, accounting boundaries and limitations.
