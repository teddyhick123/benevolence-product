import { executeRefreshCharityData } from '../tools/refresh-charity-data';
import { executeSearchSimilarCharities } from '../tools/search-similar-charities';
import { executeGetCharityFinancials } from '../tools/get-charity-financials';
import type { AssistantToolExecutorRegistry } from '../../executor-types';

export const EXTERNAL_DATA_EXECUTORS = {
  refresh_charity_data: executeRefreshCharityData,
  search_similar_charities: executeSearchSimilarCharities,
  get_charity_financials: executeGetCharityFinancials,
} satisfies AssistantToolExecutorRegistry;
