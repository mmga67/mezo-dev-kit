# Prices gaps

- oracle evidence review qualified Level 3 review accepted the module review and Contract
  roots; feed/current support remains proposed.
- oracle re-verification qualified Level 3 review accepted the post-upgrade Pyth proxy,
  implementation, ABI, and bounded feed evidence without promoting liveness.
- Both post-upgrade one-hour Pyth reads remained stale, so the evidence does
  not establish live feed support.
- No supported public reader API has been designed or implemented.
- No updater, pusher, credential, subscription, route, trading path, or writer is in scope.
- Off-chain market providers have a source class but no provider instance in the bounded bootstrap.
- DEX observations and quotes require their owning Pools/routing modules and are not produced here.

These gaps prevent support promotion; they do not invalidate the accepted
ownership model or either immutable fixed-block evidence generation.

## September 13 refresh disposition

The current mainnet full-history observation matches the accepted source pins,
ABIs, runtime, implementation history and feed outcomes. Earlier evidence stays
immutable and the new Contracts observation retains its supersession reference.
Fresh current-state captures for both networks still distinguish usable Skip
observations from stale Pyth diagnostics under the explicit one-hour policy.

Testnet's original proxy creation-state storage could not be reread through the
indexed public RPC or the assessed dRPC alternative. Its recent upgrade boundary
is available; that partial history does not satisfy the complete historical
refresh. Other assessed public endpoints failed availability checks. Testnet
full-history evidence remains expired, and unscoped Contracts/Prices checks
continue to reject it. An archive source covering the original creation boundary
is required to finish that separate scope. Current-state captures cannot replace
those requests or qualify testnet reader support.
