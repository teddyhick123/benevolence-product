import { executeAddHolding } from '../tools/add-holding';
import { executeUpdateHolding } from '../tools/update-holding';
import { executeRemoveHolding } from '../tools/remove-holding';
import { executeListHoldings } from '../tools/list-holdings';
import { executeSearchHoldings } from '../tools/search-holdings';
import { executeGetPortfolioSummary } from '../tools/get-portfolio-summary';
import { executeGetHoldingDetails } from '../tools/get-holding-details';
import type { AssistantToolExecutorRegistry } from '../../executor-types';

export const CORE_EXECUTORS = {
  add_holding: executeAddHolding,
  update_holding: executeUpdateHolding,
  remove_holding: executeRemoveHolding,
  list_holdings: executeListHoldings,
  search_holdings: executeSearchHoldings,
  get_portfolio_summary: executeGetPortfolioSummary,
  get_holding_details: executeGetHoldingDetails,
} satisfies AssistantToolExecutorRegistry;
