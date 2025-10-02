import PDFParser from 'pdf2json';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';

export type ParsedDocument = {
  text: string;
  metadata?: {
    pages?: number;
    author?: string;
    title?: string;
    [key: string]: any;
  };
};

/**
 * Parse a document file (PDF, DOCX, XLSX, CSV) and extract text content
 */
export async function parseDocument(
  buffer: Buffer,
  fileName: string
): Promise<ParsedDocument> {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';

  switch (ext) {
    case 'pdf':
      return parsePDF(buffer);
    case 'docx':
      return parseDOCX(buffer);
    case 'xlsx':
    case 'xls':
      return parseExcel(buffer);
    case 'csv':
      return parseCSV(buffer);
    default:
      throw new Error(`Unsupported file type: ${ext}`);
  }
}

async function parsePDF(buffer: Buffer): Promise<ParsedDocument> {
  return new Promise((resolve, reject) => {
    const pdfParser = new (PDFParser as any)(null, 1);

    pdfParser.on('pdfParser_dataError', (errData: any) => {
      reject(new Error(`Failed to parse PDF: ${errData.parserError}`));
    });

    pdfParser.on('pdfParser_dataReady', (pdfData: any) => {
      try {
        // Extract text from all pages
        let text = '';
        if (pdfData.Pages) {
          pdfData.Pages.forEach((page: any) => {
            if (page.Texts) {
              page.Texts.forEach((textItem: any) => {
                if (textItem.R) {
                  textItem.R.forEach((r: any) => {
                    if (r.T) {
                      text += decodeURIComponent(r.T) + ' ';
                    }
                  });
                }
              });
            }
            text += '\n';
          });
        }

        resolve({
          text: text.trim(),
          metadata: {
            pages: pdfData.Pages?.length || 0,
          },
        });
      } catch (error) {
        reject(new Error(`Failed to extract text from PDF: ${(error as Error).message}`));
      }
    });

    pdfParser.parseBuffer(buffer);
  });
}

async function parseDOCX(buffer: Buffer): Promise<ParsedDocument> {
  try {
    const result = await mammoth.extractRawText({ buffer });
    return {
      text: result.value,
      metadata: {},
    };
  } catch (error) {
    throw new Error(`Failed to parse DOCX: ${(error as Error).message}`);
  }
}

async function parseExcel(buffer: Buffer): Promise<ParsedDocument> {
  try {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    let text = '';

    // Process each sheet
    workbook.SheetNames.forEach((sheetName) => {
      const sheet = workbook.Sheets[sheetName];
      text += `\n\n=== Sheet: ${sheetName} ===\n`;

      // Convert to CSV format for text extraction
      const csv = XLSX.utils.sheet_to_csv(sheet);
      text += csv;
    });

    return {
      text: text.trim(),
      metadata: {
        sheets: workbook.SheetNames.length,
        sheetNames: workbook.SheetNames,
      },
    };
  } catch (error) {
    throw new Error(`Failed to parse Excel: ${(error as Error).message}`);
  }
}

async function parseCSV(buffer: Buffer): Promise<ParsedDocument> {
  try {
    const text = buffer.toString('utf-8');
    return {
      text,
      metadata: {
        rows: text.split('\n').length,
      },
    };
  } catch (error) {
    throw new Error(`Failed to parse CSV: ${(error as Error).message}`);
  }
}
