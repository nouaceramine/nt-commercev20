// ExcelJS-backed workbook helpers. Kept behind a dynamic import so the
// spreadsheet parser is loaded only when a user actually imports a workbook.
const MAX_WORKBOOK_BYTES = 10 * 1024 * 1024;
const MAX_WORKSHEET_ROWS = 5001;
const MAX_WORKSHEET_COLS = 200;

async function excelJs() {
  const module = await import('exceljs');
  return module.default || module;
}

function cellText(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== 'object') return value;
  if (typeof value.text === 'string') return value.text;
  if (Array.isArray(value.richText)) return value.richText.map(part => part.text || '').join('');
  if (value.result !== undefined) return cellText(value.result);
  if (value.formula) return '';
  if (value.hyperlink) return cellText(value.text || value.hyperlink);
  return String(value);
}

export async function readFirstWorksheetRows(buffer) {
  if (!buffer || buffer.byteLength > MAX_WORKBOOK_BYTES) {
    throw new Error('Workbook exceeds the 10 MB import limit');
  }
  const ExcelJS = await excelJs();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) return [];
  const rows = [];
  worksheet.eachRow({ includeEmpty: false }, (row) => {
    if (rows.length >= MAX_WORKSHEET_ROWS) {
      throw new Error(`Workbook exceeds the ${MAX_WORKSHEET_ROWS - 1} data-row import limit`);
    }
    if (row.cellCount > MAX_WORKSHEET_COLS) {
      throw new Error(`Workbook exceeds the ${MAX_WORKSHEET_COLS}-column import limit`);
    }
    const values = [];
    for (let column = 1; column <= row.cellCount; column += 1) {
      values.push(cellText(row.getCell(column).value));
    }
    rows.push(values);
  });
  return rows;
}

export async function rowsToXlsxBlob(rows, { sheetName = 'Sheet1', widths = [] } = {}) {
  const ExcelJS = await excelJs();
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(sheetName);
  worksheet.addRows(rows);
  widths.forEach((width, index) => { worksheet.getColumn(index + 1).width = width; });
  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
