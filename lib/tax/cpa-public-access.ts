/**
 * Compatibility type exports for CPA portal consumers.
 *
 * Public token resolution and elevated data access now live exclusively in
 * the typed API boundary under lib/api/repositories/cpa-share.ts.
 */
export type {
  CpaDownloadResult as CPADownloadResult,
  CpaPublicPayload as CPAPublicPayload,
  CpaPublicPermissions as CPAPublicPermissions,
  CpaPublicResult as CPAPublicResult,
  CpaShareLinkRow as CPAShareLinkRow,
} from '@/lib/api/repositories/cpa-share';
