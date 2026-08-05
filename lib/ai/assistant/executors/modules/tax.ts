import { executeRunTaxScenario } from '../tools/run-tax-scenario';
import { executeCalculateDeduction } from '../tools/calculate-deduction';
import { executeGetCarryforward } from '../tools/get-carryforward';
import type { AssistantToolExecutorRegistry } from '../../executor-types';

export const TAX_EXECUTORS = {
  run_tax_scenario: executeRunTaxScenario,
  calculate_deduction: executeCalculateDeduction,
  get_carryforward: executeGetCarryforward,
} satisfies AssistantToolExecutorRegistry;
