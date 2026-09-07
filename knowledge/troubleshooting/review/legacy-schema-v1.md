# Legacy troubleshooting record notes

This review-only document records the pre-v0.4 contract retained for migration
audit. Current structural schemas are indexed under `schema/v1/`; the semantic
validator owns cross-record and evidence checks.

The issue records use record-kind schema version `1`. The dependency-free
validator in `scripts/validate-troubleshooting-knowledge.ts` is the executable
contract.

Each issue requires:

- stable ID, category, status, severity, review status, and dates;
- one scoped symptom and affected environment/version;
- prerequisites plus deterministic diagnostic steps;
- expected, observed, and control outcomes;
- a verified cause, or an explicit statement that deeper cause is unknown;
- a safe mitigation that does not conceal failure or bypass validation;
- canonical owner links or v0.4 logical references and exact evidence locators;
- at least two repeated cases, or an explicit stronger deterministic
  source/test basis;
- limitations and review/expiry guidance.

The issue record may explain the diagnosis but must not become a second owner
for addresses, ABIs, formulas, or governed parameter values. Human guides route
to stable issue resources and canonical domain owners.
