/**
 * Substantiation Validator
 *
 * Validates that charitable contributions meet IRS substantiation requirements
 * based on contribution amount and type.
 */

export interface SubstantiationRequirements {
  requiresReceipt: boolean;
  requiresAcknowledgment: boolean;
  requiresAppraisal: boolean;
  requiresForm8283: boolean;
  form8283Section: 'none' | 'section_a' | 'section_b';
  requiresQualifiedAppraisal: boolean;
  minDocumentation: string;
  missingDocuments: string[];
  complianceScore: number; // 0-100
  complianceStatus: 'compliant' | 'warning' | 'non_compliant';
}

export interface TaxContributionForValidation {
  id: string;
  amount_usd: number;
  contribution_type: string;
  receipt_storage_path: string | null;
  acknowledgment_received: boolean;
  acknowledgment_storage_path: string | null;
  appraisal_storage_path: string | null;
  requires_appraisal: boolean;
  appraiser_name: string | null;
  quid_pro_quo_value: number;
}

/**
 * Validate substantiation requirements for a single contribution
 */
export function validateSubstantiation(
  contribution: TaxContributionForValidation
): SubstantiationRequirements {
  const amount = contribution.amount_usd;
  const isNonCash =
    !['cash', 'check', 'wire'].includes(contribution.contribution_type);

  // Initialize requirements
  const requirements: SubstantiationRequirements = {
    requiresReceipt: false,
    requiresAcknowledgment: false,
    requiresAppraisal: false,
    requiresForm8283: false,
    form8283Section: 'none',
    requiresQualifiedAppraisal: false,
    minDocumentation: '',
    missingDocuments: [],
    complianceScore: 100,
    complianceStatus: 'compliant',
  };

  // Determine requirements based on amount and type
  if (amount < 250) {
    // < $250: Bank record or receipt from charity
    requirements.requiresReceipt = true;
    requirements.minDocumentation = 'Bank record or receipt from charity';

    if (!contribution.receipt_storage_path) {
      requirements.missingDocuments.push('Bank record or receipt');
      requirements.complianceScore -= 40;
    }
  } else if (amount >= 250 && amount < 500) {
    // $250 - $499: Written acknowledgment from charity
    requirements.requiresAcknowledgment = true;
    requirements.minDocumentation = 'Written acknowledgment letter from charity';

    if (
      !contribution.acknowledgment_received ||
      !contribution.acknowledgment_storage_path
    ) {
      requirements.missingDocuments.push('Written acknowledgment letter');
      requirements.complianceScore -= 50;
    }
  } else if (amount >= 500 && amount < 5000) {
    // $500 - $4,999: Written acknowledgment + additional records
    requirements.requiresAcknowledgment = true;

    if (isNonCash) {
      // Non-cash: Form 8283 Section A
      requirements.requiresForm8283 = true;
      requirements.form8283Section = 'section_a';
      requirements.minDocumentation =
        'Written acknowledgment + Form 8283 Section A + records of how/when property acquired';

      if (
        !contribution.acknowledgment_received ||
        !contribution.acknowledgment_storage_path
      ) {
        requirements.missingDocuments.push('Written acknowledgment letter');
        requirements.complianceScore -= 30;
      }
    } else {
      requirements.minDocumentation = 'Written acknowledgment letter from charity';

      if (
        !contribution.acknowledgment_received ||
        !contribution.acknowledgment_storage_path
      ) {
        requirements.missingDocuments.push('Written acknowledgment letter');
        requirements.complianceScore -= 40;
      }
    }
  } else {
    // >= $5,000: Qualified appraisal required for non-cash
    requirements.requiresAcknowledgment = true;

    if (isNonCash) {
      requirements.requiresAppraisal = true;
      requirements.requiresQualifiedAppraisal = true;
      requirements.requiresForm8283 = true;
      requirements.form8283Section = 'section_b';
      requirements.minDocumentation =
        'Written acknowledgment + Form 8283 Section B + Qualified appraisal + Appraiser declaration';

      if (
        !contribution.acknowledgment_received ||
        !contribution.acknowledgment_storage_path
      ) {
        requirements.missingDocuments.push('Written acknowledgment letter');
        requirements.complianceScore -= 20;
      }

      if (!contribution.appraisal_storage_path || !contribution.requires_appraisal) {
        requirements.missingDocuments.push('Qualified appraisal');
        requirements.complianceScore -= 40;
      }

      if (!contribution.appraiser_name) {
        requirements.missingDocuments.push('Appraiser information');
        requirements.complianceScore -= 20;
      }
    } else {
      requirements.minDocumentation = 'Written acknowledgment letter from charity';

      if (
        !contribution.acknowledgment_received ||
        !contribution.acknowledgment_storage_path
      ) {
        requirements.missingDocuments.push('Written acknowledgment letter');
        requirements.complianceScore -= 40;
      }
    }
  }

  // Check for quid pro quo disclosure (required if value > $75 and goods/services provided)
  if (contribution.quid_pro_quo_value > 75) {
    requirements.minDocumentation += '. Note: Charity must provide quid pro quo disclosure.';
  }

  // Ensure score doesn't go below 0
  requirements.complianceScore = Math.max(0, requirements.complianceScore);

  // Determine compliance status
  if (requirements.complianceScore >= 80) {
    requirements.complianceStatus = 'compliant';
  } else if (requirements.complianceScore >= 50) {
    requirements.complianceStatus = 'warning';
  } else {
    requirements.complianceStatus = 'non_compliant';
  }

  return requirements;
}

/**
 * Generate compliance report for multiple contributions
 */
export interface ComplianceReport {
  totalContributions: number;
  compliantCount: number;
  warningCount: number;
  nonCompliantCount: number;
  overallScore: number;
  overallStatus: 'compliant' | 'warning' | 'non_compliant';
  actionItems: ActionItem[];
  summary: string;
}

export interface ActionItem {
  priority: 'high' | 'medium' | 'low';
  contributionId: string;
  contributionDate: string;
  recipientName: string;
  amount: number;
  issue: string;
  action: string;
  deadline?: string;
}

export function generateComplianceReport(
  contributions: Array<
    TaxContributionForValidation & {
      contribution_date: string;
      recipient_name: string;
    }
  >,
  taxYear: number
): ComplianceReport {
  const validations = contributions.map((c) => ({
    contribution: c,
    validation: validateSubstantiation(c),
  }));

  const compliantCount = validations.filter(
    (v) => v.validation.complianceStatus === 'compliant'
  ).length;
  const warningCount = validations.filter(
    (v) => v.validation.complianceStatus === 'warning'
  ).length;
  const nonCompliantCount = validations.filter(
    (v) => v.validation.complianceStatus === 'non_compliant'
  ).length;

  const overallScore =
    validations.reduce((sum, v) => sum + v.validation.complianceScore, 0) /
    validations.length;

  let overallStatus: 'compliant' | 'warning' | 'non_compliant' = 'compliant';
  if (overallScore < 80) overallStatus = 'warning';
  if (overallScore < 50) overallStatus = 'non_compliant';

  // Generate action items
  const actionItems: ActionItem[] = [];

  validations.forEach(({ contribution, validation }) => {
    if (validation.complianceStatus !== 'compliant') {
      validation.missingDocuments.forEach((doc) => {
        let priority: 'high' | 'medium' | 'low' = 'medium';
        let action = `Request ${doc} from ${contribution.recipient_name}`;

        // High priority for large contributions or appraisals
        if (contribution.amount_usd >= 5000 && doc.includes('appraisal')) {
          priority = 'high';
          action = `Obtain qualified appraisal for ${contribution.contribution_type} donation of $${contribution.amount_usd.toLocaleString()}`;
        } else if (contribution.amount_usd >= 5000) {
          priority = 'high';
        } else if (contribution.amount_usd < 1000) {
          priority = 'low';
        }

        actionItems.push({
          priority,
          contributionId: contribution.id,
          contributionDate: contribution.contribution_date,
          recipientName: contribution.recipient_name,
          amount: contribution.amount_usd,
          issue: `Missing: ${doc}`,
          action,
          deadline: `Dec 31, ${taxYear}`, // Must obtain before filing
        });
      });
    }
  });

  // Sort by priority
  actionItems.sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });

  // Generate summary
  let summary = '';
  if (overallStatus === 'compliant') {
    summary = `Excellent! All ${contributions.length} contributions meet IRS substantiation requirements.`;
  } else if (overallStatus === 'warning') {
    summary = `${warningCount + nonCompliantCount} of ${contributions.length} contributions need attention. Address missing documentation before filing.`;
  } else {
    summary = `${nonCompliantCount} contributions are not compliant. Immediate action required to meet IRS requirements.`;
  }

  return {
    totalContributions: contributions.length,
    compliantCount,
    warningCount,
    nonCompliantCount,
    overallScore,
    overallStatus,
    actionItems,
    summary,
  };
}

/**
 * Get user-friendly explanation of substantiation requirements
 */
export function explainSubstantiationRequirements(
  amount: number,
  contributionType: string
): string {
  const isNonCash = !['cash', 'check', 'wire'].includes(contributionType);

  if (amount < 250) {
    return 'For contributions under $250, keep a bank record, payroll deduction record, or written communication from the charity showing the name of the charity, date, and amount.';
  } else if (amount >= 250 && amount < 500) {
    return 'For contributions of $250 or more, you need a written acknowledgment from the charity that includes: (1) amount of cash or description of property, (2) whether you received any goods or services in return, and (3) description and good faith estimate of the value of any goods/services received.';
  } else if (amount >= 500 && amount < 5000 && isNonCash) {
    return 'For non-cash contributions of $500-$5,000, you need: (1) written acknowledgment from charity, (2) Form 8283 Section A, and (3) records showing how and when you acquired the property and your cost basis.';
  } else if (amount >= 5000 && isNonCash) {
    return 'For non-cash contributions over $5,000, you need: (1) written acknowledgment from charity, (2) Form 8283 Section B with charity and appraiser signatures, (3) qualified appraisal by an independent appraiser, and (4) records of acquisition and basis.';
  } else {
    return 'For cash contributions of $500 or more, you need a written acknowledgment from the charity showing the date and amount contributed, and whether you received anything in return.';
  }
}
