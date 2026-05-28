/**
 * AI eval suite — entry point.
 *
 * This is the harness that `pnpm eval` invokes. In Phase 2 it iterates every
 * agent's `golden.ts` cases, runs them against the real OpenAI API, scores
 * outputs against expected schemas + rubric checks (e.g. "Recommendation
 * Agent's returned itemIds must all exist in the retrieved candidate set"),
 * and writes a pass/fail table to `docs/eval-results.md`.
 *
 * Phase 0 ships this as an explicit no-op so CI is green from day one.
 */

async function main(): Promise<void> {
  console.info('[eval] Phase 0 stub — no agents implemented yet.');
  console.info('[eval] Suite will activate in Phase 2 once agents land.');
  console.info('[eval] Exit code 0 (no regressions to catch).');
  process.exit(0);
}

void main();
