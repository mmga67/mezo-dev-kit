# Mezo knowledge

This directory collects Mezo network, contract, and protocol information with
the sources used to check it. Use it to understand how Mezo works, look up a
deployment, or find the rules behind an SDK workflow.

For the whole picture, start with
[how Mezo's Bitcoin economy fits together](../docs/architecture/mezo-economic-system-composition.md):
BTC custody and entry routes, borrowing, products, fees, voting, and emissions.
Follow its domain references for the evidence behind each relationship.
The [generated relationship inventory](generated/economic-relationships.md)
provides a structured route to each owner, including candidate records and
explicit evidence gaps.

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
a recorded observation may not describe current state.

### Evidence, review, and support

These labels answer different questions:

| Term              | What it tells you                                                                                                                                                           |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Verified evidence | A claim was checked against identified sources for a stated network, version, block, or time. The cited evidence shows what was checked.                                    |
| Accepted review   | The required review approved the particular work and its stated scope.                                                                                                      |
| Qualified review  | A human with relevant expertise reviewed protocol-sensitive evidence and behavior. The [review policy](../CONTRIBUTING.md#qualified-human-review) defines the expectations. |
| Supported         | MDK makes a support commitment for the use identified by that record or package. Check the named operation and its limits.                                                  |

The structured fields `status`, `reviewStatus`, and `supportStatus` record these
separate decisions. A support value of `none` records no support commitment for
that scope; `proposed` means support is awaiting acceptance. Neither value tells
you whether code exists or whether Mezo itself provides the feature. Use the
package documentation for implemented SDK methods and their support limits.

For example, checking an RPC endpoint at a recorded block establishes what that
request returned. Accepting the observation does not promise that the endpoint
will answer a new request today. Review dates help identify when evidence needs
another check; editing documentation does not refresh it.

### Find exact records

For structured lookup, start with the [machine-readable index](index.json).
Its module catalog resolves the subject and resource identifiers.
Catalog completeness describes the maintained modules, not complete coverage of
Mezo. Published design, recorded deployments, and supported SDK operations have
different scopes; a missing route or API does not mean Mezo lacks that function.

From an MDK checkout, `pnpm context catalog` and `pnpm context find --query
'<topic>'` provide offline discovery. Read individual records, fields, source
files or interfaces using IDs from the results. See the
[retrieval manual](../scripts/agents/CONTEXT.md) for commands, coverage and
supporting memory lookup.

## Quick links

| Link                                                                               | What you will find                                                             |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| [Mezo's Bitcoin economy](../docs/architecture/mezo-economic-system-composition.md) | How custody, credit, products, revenue and voting connect.                     |
| [Subject directory](#find-a-subject)                                               | Choose a network, protocol or workflow to learn about.                         |
| [Relationship inventory](generated/economic-relationships.md)                      | Follow a relationship to its owning records, evidence and known gaps.          |
| [Module index](index.json)                                                         | Resolve exact modules and resources for structured lookup.                     |
| [SDK reference](../docs/reference/sdk.md)                                          | Find implemented methods, required inputs and integration examples.            |
| [Evidence, review and support](#evidence-review-and-support)                       | Understand what a recorded check or approval establishes.                      |
| [Retrieval manual](../scripts/agents/CONTEXT.md)                                   | Look up selected records, fields, interfaces and saved source from a checkout. |

## Contributing knowledge

Use the [knowledge authoring guide](../docs/guides/KNOWLEDGE_AUTHORING.md) to
add or update information. It walks through choosing the right module,
capturing sources, updating records, and checking the result, with a working
synthetic example and an optional coding-agent workflow.
