#!/usr/bin/env node

import { runPromptRoutingEvaluation } from '../src/prompt-routing-eval.js';

try {
  const evaluation = runPromptRoutingEvaluation();
  console.log(
    `Prompt routing live evaluation passed (${evaluation.results.length}/${evaluation.results.length}, attempts=${evaluation.attempts}, model=${evaluation.model}, reasoning=${evaluation.reasoningEffort})`
  );
  for (const result of evaluation.results) {
    console.log(`${result.caseId}: ${result.route}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
