import type { AssistantToolExecutor } from '../../executor-types';
import { ValidationError } from '../../helpers';

export const executeExportData: AssistantToolExecutor = async (runtime) => {
  const { db: supabase, args, portfolioId } = runtime;
  {
    const dataType = args.data_type;
    const format = args.format || 'csv';
    const holdingId = args.holding_id;
    const dateFrom = args.date_from;
    const dateTo = args.date_to;

    let data: any[] = [];
    let filename = '';

    switch (dataType) {
      case 'holdings': {
        let query = supabase
          .from('holdings')
          .select(
            'id, name, sector, country, status, funds_allocated, asset_type, description, created_at',
          )
          .eq('portfolio_id', portfolioId);

        if (holdingId) {
          query = query.eq('id', holdingId);
        }

        const { data: holdings, error } = await query;
        if (error)
          throw new Error(`Failed to fetch holdings: ${error.message}`);
        data = holdings || [];
        filename = `holdings_export_${new Date().toISOString().split('T')[0]}`;
        break;
      }

      case 'metrics': {
        let query = supabase
          .from('metric_facts')
          .select(
            `
                  id,
                  holding_id,
                  holdings!inner(name, portfolio_id),
                  metric_code,
                  value,
                  unit,
                  period_start,
                  period_end,
                  created_at
                `,
          )
          .eq('holdings.portfolio_id', portfolioId);

        if (holdingId) {
          query = query.eq('holding_id', holdingId);
        }
        if (dateFrom) {
          query = query.gte('period_start', dateFrom);
        }
        if (dateTo) {
          query = query.lte('period_end', dateTo);
        }

        const { data: metrics, error } = await query.order('period_start', {
          ascending: false,
        });
        if (error) throw new Error(`Failed to fetch metrics: ${error.message}`);

        // Flatten the data
        data = (metrics || []).map((m: any) => ({
          id: m.id,
          holding_id: m.holding_id,
          holding_name: m.holdings?.name,
          metric_code: m.metric_code,
          value: m.value,
          unit: m.unit,
          period_start: m.period_start,
          period_end: m.period_end,
          created_at: m.created_at,
        }));
        filename = `metrics_export_${new Date().toISOString().split('T')[0]}`;
        break;
      }

      case 'contributions': {
        const { data: contributions, error } = await supabase
          .from('tax_contributions')
          .select('*')
          .eq('portfolio_id', portfolioId)
          .order('contribution_date', { ascending: false });

        if (error)
          throw new Error(`Failed to fetch contributions: ${error.message}`);
        data = contributions || [];
        filename = `contributions_export_${new Date().toISOString().split('T')[0]}`;
        break;
      }

      default:
        throw new ValidationError(`Unknown data type: ${dataType}`);
    }

    if (data.length === 0) {
      return {
        action: null,
        output: {
          message: `No ${dataType} data found to export`,
          count: 0,
        },
      };
    }

    // Format the data based on requested format
    let exportContent: string;
    let mimeType: string;

    if (format === 'json') {
      exportContent = JSON.stringify(data, null, 2);
      mimeType = 'application/json';
    } else if (format === 'csv') {
      // Convert to CSV
      const headers = Object.keys(data[0]);
      const csvRows = [
        headers.join(','),
        ...data.map((row) =>
          headers
            .map((h) => {
              const val = row[h];
              if (val === null || val === undefined) return '';
              if (
                typeof val === 'string' &&
                (val.includes(',') || val.includes('"'))
              ) {
                return `"${val.replace(/"/g, '""')}"`;
              }
              return String(val);
            })
            .join(','),
        ),
      ];
      exportContent = csvRows.join('\n');
      mimeType = 'text/csv';
    } else {
      // For xlsx, return the data and let frontend handle it
      exportContent = JSON.stringify(data);
      mimeType = 'application/json';
    }

    return {
      action: null,
      output: {
        filename: `${filename}.${format}`,
        format,
        mimeType,
        content: exportContent,
        rowCount: data.length,
        message: `Exported ${data.length} ${dataType} records`,
      },
    };
  }
};
