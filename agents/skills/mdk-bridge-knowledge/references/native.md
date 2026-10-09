# Native operation and observation review

Inspect the current Bridges package README, reference and exports for the
selected operation; source preparation and destination observation are separate.

For Native observation, inspect the separate Native API. Resolve historical generations explicitly through Contracts;
never backdate the current resolver or infer delivery from system success.
Use the indexed Native qualification for consensus-block attribution limits;
an EVM-only block list or synthetic pseudo trace does not prove a mint.
For private Native source work, inspect the Native reader/writer, token target
resolver and current delivery observer separately from historical observation.
Apply `native-transfer-qualification-2026-09-15`: current runtime/proxy identity,
reported Mezo client version, mappings, mint authority, minima, capacity and fee
estimates are required. BTC EVM approval creates native bank authorization;
compose Tokens explicitly and prepare again after confirmation. The source call
cannot enforce a future destination fee. `WithdrawalFailed` with the complete
confirmed tuple and consistent settlement yields `governance-recovery-required`;
do not invent an automatic retry or governance writer. A Mezo wrapper hash or
reported version is not cryptographic proof of its native execution engine.
