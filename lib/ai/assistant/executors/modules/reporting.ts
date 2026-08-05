import { executeGenerateHoldingReport } from '../tools/generate-holding-report';
import { executeGenerateCustomReport } from '../tools/generate-custom-report';
import { executeSaveReportTemplate } from '../tools/save-report-template';
import { executeListReportTemplates } from '../tools/list-report-templates';
import { executeExportData } from '../tools/export-data';
import type { AssistantToolExecutorRegistry } from '../../executor-types';

export const REPORTING_EXECUTORS = {
  generate_holding_report: executeGenerateHoldingReport,
  generate_custom_report: executeGenerateCustomReport,
  save_report_template: executeSaveReportTemplate,
  list_report_templates: executeListReportTemplates,
  export_data: executeExportData,
} satisfies AssistantToolExecutorRegistry;
