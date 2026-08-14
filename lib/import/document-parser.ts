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

export type DocumentChunk = {
  text: string;
  chunkIndex: number;
  totalChunks: number;
  metadata?: {
    pageNumber?: number;
    sheetName?: string;
    rowRange?: string;
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

/**
 * Parse a document into chunks for processing large files
 * Each chunk is sized to fit within LLM context limits (~10k chars)
 */
export async function parseDocumentChunked(
  buffer: Buffer,
  fileName: string,
  maxChunkSize: number = 10000
): Promise<DocumentChunk[]> {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';

  switch (ext) {
    case 'pdf':
      return parsePDFChunked(buffer, maxChunkSize);
    case 'docx':
      return parseDOCXChunked(buffer, maxChunkSize);
    case 'xlsx':
    case 'xls':
      return parseExcelChunked(buffer, maxChunkSize);
    case 'csv':
      return parseCSVChunked(buffer, maxChunkSize);
    default:
      throw new Error(`Unsupported file type: ${ext}`);
  }
}

async function parsePDFChunked(buffer: Buffer, maxChunkSize: number): Promise<DocumentChunk[]> {
  return new Promise((resolve, reject) => {
    const pdfParser = new (PDFParser as any)(null, 1);

    pdfParser.on('pdfParser_dataError', (errData: any) => {
      reject(new Error(`Failed to parse PDF: ${errData.parserError}`));
    });

    pdfParser.on('pdfParser_dataReady', (pdfData: any) => {
      try {
        const chunks: DocumentChunk[] = [];
        const pages = pdfData.Pages || [];

        // Extract text per page
        const pageTexts: string[] = pages.map((page: any) => {
          let pageText = '';
          if (page.Texts) {
            page.Texts.forEach((textItem: any) => {
              if (textItem.R) {
                textItem.R.forEach((r: any) => {
                  if (r.T) {
                    pageText += decodeURIComponent(r.T) + ' ';
                  }
                });
              }
            });
          }
          return pageText.trim();
        });

        // Group pages into chunks that fit within maxChunkSize
        let currentChunk = '';
        let chunkStartPage = 1;
        let currentStartPage = 1;

        pageTexts.forEach((pageText, index) => {
          const pageNum = index + 1;

          if (currentChunk.length + pageText.length > maxChunkSize && currentChunk.length > 0) {
            // Save current chunk and start new one
            chunks.push({
              text: currentChunk.trim(),
              chunkIndex: chunks.length,
              totalChunks: 0, // Will be set at the end
              metadata: {
                pageRange: `${chunkStartPage}-${pageNum - 1}`,
              },
            });
            currentChunk = pageText + '\n\n';
            chunkStartPage = pageNum;
          } else {
            currentChunk += pageText + '\n\n';
          }
        });

        // Don't forget the last chunk
        if (currentChunk.trim().length > 0) {
          chunks.push({
            text: currentChunk.trim(),
            chunkIndex: chunks.length,
            totalChunks: 0,
            metadata: {
              pageRange: `${chunkStartPage}-${pageTexts.length}`,
            },
          });
        }

        // Update totalChunks
        chunks.forEach(c => c.totalChunks = chunks.length);

        // If no chunks created, create one empty chunk
        if (chunks.length === 0) {
          chunks.push({
            text: '',
            chunkIndex: 0,
            totalChunks: 1,
            metadata: { pages: 0 },
          });
        }

        resolve(chunks);
      } catch (error) {
        reject(new Error(`Failed to extract text from PDF: ${(error as Error).message}`));
      }
    });

    pdfParser.parseBuffer(buffer);
  });
}

async function parseDOCXChunked(buffer: Buffer, maxChunkSize: number): Promise<DocumentChunk[]> {
  try {
    const result = await mammoth.extractRawText({ buffer });
    const text = result.value;

    // Split by paragraphs and group into chunks
    const paragraphs = text.split(/\n\n+/);
    const chunks: DocumentChunk[] = [];
    let currentChunk = '';

    paragraphs.forEach((para) => {
      if (currentChunk.length + para.length > maxChunkSize && currentChunk.length > 0) {
        chunks.push({
          text: currentChunk.trim(),
          chunkIndex: chunks.length,
          totalChunks: 0,
          metadata: {},
        });
        currentChunk = para + '\n\n';
      } else {
        currentChunk += para + '\n\n';
      }
    });

    if (currentChunk.trim().length > 0) {
      chunks.push({
        text: currentChunk.trim(),
        chunkIndex: chunks.length,
        totalChunks: 0,
        metadata: {},
      });
    }

    chunks.forEach(c => c.totalChunks = chunks.length);

    if (chunks.length === 0) {
      chunks.push({ text: '', chunkIndex: 0, totalChunks: 1, metadata: {} });
    }

    return chunks;
  } catch (error) {
    throw new Error(`Failed to parse DOCX: ${(error as Error).message}`);
  }
}

async function parseExcelChunked(buffer: Buffer, maxChunkSize: number): Promise<DocumentChunk[]> {
  try {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const chunks: DocumentChunk[] = [];

    // Each sheet becomes at least one chunk
    workbook.SheetNames.forEach((sheetName) => {
      const sheet = workbook.Sheets[sheetName];
      const csv = XLSX.utils.sheet_to_csv(sheet);
      const rows = csv.split('\n');

      // Get header row
      const header = rows[0] || '';
      let currentChunk = `=== Sheet: ${sheetName} ===\n${header}\n`;
      let startRow = 2;

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (currentChunk.length + row.length > maxChunkSize && currentChunk.length > header.length + 50) {
          chunks.push({
            text: currentChunk.trim(),
            chunkIndex: chunks.length,
            totalChunks: 0,
            metadata: {
              sheetName,
              rowRange: `${startRow}-${i}`,
            },
          });
          // Start new chunk with header for context
          currentChunk = `=== Sheet: ${sheetName} (continued) ===\n${header}\n${row}\n`;
          startRow = i + 1;
        } else {
          currentChunk += row + '\n';
        }
      }

      if (currentChunk.trim().length > 0) {
        chunks.push({
          text: currentChunk.trim(),
          chunkIndex: chunks.length,
          totalChunks: 0,
          metadata: {
            sheetName,
            rowRange: `${startRow}-${rows.length}`,
          },
        });
      }
    });

    chunks.forEach(c => c.totalChunks = chunks.length);

    if (chunks.length === 0) {
      chunks.push({ text: '', chunkIndex: 0, totalChunks: 1, metadata: {} });
    }

    return chunks;
  } catch (error) {
    throw new Error(`Failed to parse Excel: ${(error as Error).message}`);
  }
}

async function parseCSVChunked(buffer: Buffer, maxChunkSize: number): Promise<DocumentChunk[]> {
  try {
    const text = buffer.toString('utf-8');
    const rows = text.split('\n');
    const header = rows[0] || '';
    const chunks: DocumentChunk[] = [];

    let currentChunk = header + '\n';
    let startRow = 2;

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (currentChunk.length + row.length > maxChunkSize && currentChunk.length > header.length + 10) {
        chunks.push({
          text: currentChunk.trim(),
          chunkIndex: chunks.length,
          totalChunks: 0,
          metadata: {
            rowRange: `${startRow}-${i}`,
          },
        });
        // Start new chunk with header for context
        currentChunk = `${header}\n${row}\n`;
        startRow = i + 1;
      } else {
        currentChunk += row + '\n';
      }
    }

    if (currentChunk.trim().length > 0) {
      chunks.push({
        text: currentChunk.trim(),
        chunkIndex: chunks.length,
        totalChunks: 0,
        metadata: {
          rowRange: `${startRow}-${rows.length}`,
        },
      });
    }

    chunks.forEach(c => c.totalChunks = chunks.length);

    if (chunks.length === 0) {
      chunks.push({ text: '', chunkIndex: 0, totalChunks: 1, metadata: {} });
    }

    return chunks;
  } catch (error) {
    throw new Error(`Failed to parse CSV: ${(error as Error).message}`);
  }
}
