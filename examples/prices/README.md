# Normalize and inspect a price

[normalize.ts](normalize.ts) keeps normalization, freshness and confidence as
separate results. A synthetic raw `12345n` with exponent `-2`, normalized to 6
decimals, becomes `123450000n`. With `publishedAt: 1000n`, `asOf: 1060n` and
`maxAgeSeconds: 60n`, freshness is valid; one second later it is stale.
Missing confidence remains unsupported/null.

Run those inputs through the offline [foundation program](../foundations.ts).
`validAmountAndTime` describes only those two checks; source selection and
confidence acceptance remain application decisions.

[read-skip.ts](read-skip.ts) shows construction of the direct Skip reader from a
registry and transport. The caller supplies Unix-second observation time,
evaluation time, maximum age and scaling policy. Keep its source identity,
coordinate, status and limitations with the result. This observation is separate
from the oracle state used by Borrowing or Lending.

[Package reference](../../packages/prices/REFERENCE.md).
