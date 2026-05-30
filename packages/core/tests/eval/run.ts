/**
 * AI eval suite — `pnpm eval`.
 *
 * Iterates every agent's goldens, runs them against the live OpenAI API,
 * and writes a Markdown report to docs/eval-results.md.
 *
 * Exit code:
 *   0 — all agents passed at the threshold (default 0.8)
 *   1 — at least one agent dropped below the threshold OR runtime crashed
 *
 * Threshold can be overridden via EVAL_THRESHOLD=0.9 etc.
 *
 * If OPENAI_API_KEY isn't set or is the placeholder, the runner exits 0 with
 * a clear "not configured" notice so CI doesn't fail in dev branches that
 * lack the secret.
 */

import './setup.js';

import {
  greeterAgent,
  greeterGoldens,
  groupCoordinatorAgent,
  groupCoordinatorGoldens,
  multilingualNLUAgent,
  multilingualNLUGoldens,
  recommendationAgent,
  recommendationGoldens,
  routerAgent,
  routerGoldens,
  sentimentAgent,
  sentimentGoldens,
  upsellAgent,
  upsellGoldens,
} from '../../src/agents/index.js';

import { writeReport } from './reporter.js';
import { runAgentEval } from './runner.js';
import type { AgentEvalResult, RunSummary } from './types.js';

const THRESHOLD = Number.parseFloat(process.env['EVAL_THRESHOLD'] ?? '0.8');

async function main(): Promise<void> {
  const startedAt = new Date();

  const key = process.env['OPENAI_API_KEY'];
  if (!key || key === 'sk-dummy-key-for-now' || key === 'sk-test') {
    console.info('[eval] OPENAI_API_KEY is missing or a placeholder — skipping suite.');
    console.info('[eval] Set a real key and re-run for actual scoring.');
    process.exit(0);
  }

  console.info(`[eval] Running with threshold ${(THRESHOLD * 100).toFixed(0)}%`);

  const perAgent: AgentEvalResult[] = [];

  // Order: cheap fast agents first, then expensive ones.
  const evalSet: Array<[unknown, unknown]> = [
    [multilingualNLUAgent, multilingualNLUGoldens],
    [routerAgent, routerGoldens],
    [sentimentAgent, sentimentGoldens],
    [greeterAgent, greeterGoldens],
    [upsellAgent, upsellGoldens],
    [recommendationAgent, recommendationGoldens],
    [groupCoordinatorAgent, groupCoordinatorGoldens],
  ];

  for (const [agent, goldens] of evalSet) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const a = agent as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g = goldens as any[];
    if (g.length === 0) {
      console.info(`[eval] ${a.metadata.name}: no goldens, skipping`);
      continue;
    }
    process.stdout.write(`[eval] ${a.metadata.name} (${g.length} cases) …`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await runAgentEval<any, any>(a, g);
    perAgent.push(result);
    process.stdout.write(
      ` ${result.passed}/${result.total} passed (${(result.passRate * 100).toFixed(0)} %)\n`,
    );
  }

  const finishedAt = new Date();
  const totalDurationMs = finishedAt.getTime() - startedAt.getTime();
  const totalCases = perAgent.reduce((acc, a) => acc + a.total, 0);
  const totalPassed = perAgent.reduce((acc, a) => acc + a.passed, 0);
  const overallPassRate = totalCases === 0 ? 1 : totalPassed / totalCases;
  const totalCostUsd = perAgent.reduce((acc, a) => acc + a.totalCostUsd, 0);

  const summary: RunSummary = {
    startedAt,
    finishedAt,
    totalDurationMs,
    totalCostUsd,
    overallPassRate,
    perAgent,
  };

  const outputPath = await writeReport(summary);
  console.info('');
  console.info(`[eval] Report written to ${outputPath}`);
  console.info(
    `[eval] Overall: ${totalPassed}/${totalCases} (${(overallPassRate * 100).toFixed(1)} %), cost ~$${totalCostUsd.toFixed(4)}`,
  );

  const regressions = perAgent.filter((a) => a.passRate < THRESHOLD);
  if (regressions.length > 0) {
    console.error('');
    console.error('[eval] FAIL — agents below threshold:');
    for (const r of regressions) {
      console.error(`  - ${r.agent}: ${(r.passRate * 100).toFixed(1)} %`);
    }
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('[eval] CRASH:', err);
  process.exit(1);
});
