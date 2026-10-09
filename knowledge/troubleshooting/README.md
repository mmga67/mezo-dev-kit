# Mezo troubleshooting

A symptom is the starting point for a diagnosis. An empty RPC result, for example,
can leave a transaction's outcome unknown; it does not establish that the
transaction never happened. A source-chain receipt likewise cannot establish
bridge delivery on the destination.

This directory collects reproduced problems and the steps used to distinguish
their causes. Match the network, provider, contract version, and observed symptom
before applying a recorded mitigation.

## Find the matching problem

- [Issue reference](generated/reference.md#issue-inventory): choose the symptom and follow its prerequisites, diagnosis, and limitations.
- [Indexing and reconciliation guide](../../docs/guides/INDEXING_RECONCILIATION.md): investigate partial scans, archive gaps, and uncertain outcomes.
- [Security reporting](../../SECURITY.md): report vulnerabilities through the private reporting process.

## Use a diagnosis within its limits

Each diagnosis applies only to the conditions and evidence recorded with it.
The collected cases do not provide a supported general recovery service.
Reproduce the symptom and inspect the source evidence before applying a mitigation.

Conflicting documentation must be checked against source for the same contract
version and the observed state. Security findings belong in the
private reporting process, not in public troubleshooting records.

## Contributing

Use the [module index](index.json) for structured records, sources, and exact checks. Follow the [knowledge authoring guide](../../docs/guides/KNOWLEDGE_AUTHORING.md) to update this information and regenerate its reference.

`node scripts/checks/validate-troubleshooting-knowledge.ts --network mezo-mainnet`
checks the maintained scope under the [network baseline](../../docs/manifest#network-scope).
It excludes only the historical testnet archive diagnosis's expiry; all records
still receive structural and relationship checks. The command without a network
selection retains the full-module freshness diagnostic.
