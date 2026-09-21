# Mezo knowledge

This directory collects Mezo network, contract, and protocol information with
the sources used to check it. Use it to understand how Mezo works, look up a
deployment, or find the rules behind an SDK workflow.

## Find a subject

| Subject                             | Start here                                                                                                                  |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Networks and connections            | [Networks](networks/README.md)                                                                                              |
| Contract deployments and interfaces | [Contracts](contracts/README.md) · [Deployment reference](contracts/generated/reference.md)                                 |
| MUSD system and terminology         | [MUSD explanation](../docs/reference/musd-system.md) · [Shared MUSD knowledge](protocols/musd/README.md)                    |
| MUSD borrowing and redemptions      | [Borrowing](protocols/musd/borrowing/README.md) · [Redemptions](protocols/musd/redemptions/README.md)                       |
| MUSD Savings                        | [Savings](protocols/musd/savings/README.md)                                                                                 |
| Institutional MUSD debt             | [Institutional debt](protocols/musd/institutional-debt/README.md)                                                           |
| BTC/mUSDC lending                   | [Lending market](protocols/lending/musdc/README.md)                                                                         |
| USDC vaults                         | [Lending vault](protocols/vaults/usdc-lending/README.md)                                                                    |
| Prices and oracle sources           | [Prices](prices/README.md) · [Choosing price observations and DEX quotes](../docs/guides/price-selection-and-dex-quotes.md) |
| Pools and liquidity                 | [Pools](protocols/pools/README.md)                                                                                          |
| Locks, voting, and rewards          | [Incentives](protocols/incentives/README.md)                                                                                |
| Swaps and bridges                   | [Swaps](workflows/swaps/README.md) · [Bridges](workflows/bridges/README.md)                                                 |
| Transaction outcomes                | [Transaction lifecycle](../docs/reference/transaction-lifecycle.md)                                                         |
| Diagnosing a problem                | [Troubleshooting](troubleshooting/README.md)                                                                                |

Each subject page links its detailed records and references. For executable
methods, integration requirements, and examples, use the
[SDK reference](../docs/reference/sdk.md).

## Using this information

Records identify the network, deployment, source, and observation they
describe. Check their dates, scope, and limitations before relying on them;
a recorded observation may not describe current state. Evidence, review,
and SDK support are separate, and the cited sources establish what a record
can prove.

For structured lookup, start with the [machine-readable index](index.json).
Its module catalog resolves the subject and resource identifiers.

From an MDK checkout, `pnpm context catalog` and `pnpm context find --query
'<topic>'` provide offline discovery. Read individual records, fields, source
files or interfaces using IDs from the results. See the
[retrieval manual](../scripts/agents/CONTEXT.md) for commands, coverage and
supporting memory lookup.

## Contributing knowledge

Use the [knowledge authoring guide](../docs/guides/KNOWLEDGE_AUTHORING.md) to
add or update information. It walks through choosing the right module,
capturing sources, updating records, and checking the result, with a working
synthetic example and an optional coding-agent workflow.
