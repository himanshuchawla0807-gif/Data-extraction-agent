
export function shortId() {
  return '_' + Math.random().toString(36).substr(2, 9);
}

export function randomColor() {
  return `hsl(${Math.floor(Math.random() * 360)}, 95%, 90%)`;
}

// ✅ PHASE 3.3: Strip citations from text for clean downloads
export function stripCitations(text) {
  if (!text || typeof text !== 'string') return text;

  // Remove all citation markers: ||CITE:...||
  return text.replace(/\|\|CITE:.*?\|\|/g, '').trim();
}

// ✅ NEW: Strip markdown symbols for clean Excel export
export function stripMarkdown(text) {
  if (!text || typeof text !== 'string') return text;

  let cleaned = text;
  // Remove markdown headers (## ### ####)
  cleaned = cleaned.replace(/^#{1,4}\s*/gm, '');
  // Remove bold markers (**text**)
  cleaned = cleaned.replace(/\*\*([^*]+)\*\*/g, '$1');
  // Remove italic markers (*text* or _text_)
  cleaned = cleaned.replace(/\*([^*]+)\*/g, '$1');
  cleaned = cleaned.replace(/_([^_]+)_/g, '$1');
  // Remove bullet points at start of lines (- or *)
  cleaned = cleaned.replace(/^\s*[-*]\s+/gm, '• ');
  // Clean up extra whitespace
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim();
  return cleaned;
}

// ✅ NEW: Clean text for Excel (both citations and markdown)
export function cleanForExcel(text) {
  if (!text || typeof text !== 'string') return text;
  return stripMarkdown(stripCitations(text));
}

// ✅ PHASE 3.3: Download data as CSV without citations
export function downloadAsCSV(data, columns, filename = 'oriplex_data.csv') {
  if (!data || data.length === 0) {
    alert('No data to download');
    return;
  }

  const csvContent = buildExportRows(data, columns).map(row => row.map(value => {
    let text = String(value ?? '');
    // Spreadsheet programs evaluate formula-like CSV text, including attacker-supplied headers.
    if (/^[=+@\-\t\r]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  }).join(',')).join('\r\n');

  // Create download link
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 0);

  console.log('✅ Downloaded clean CSV without citations');
}

// ✅ NEW: Download data as styled Excel (.xlsx) with professional formatting
// Option to include analysis column (reasoning data)
export function buildExportRows(data, columns, includeAnalysis = false) {
  const fields = columns.filter(column => column.accessor && !column.label?.startsWith('+'));
  const valueOf = value => {
    if (value && typeof value === 'object') value = value.value ?? value.content ?? value.extracted_value ?? value;
    if (value && typeof value === 'object') value = JSON.stringify(value);
    return typeof value === 'string' ? cleanForExcel(value) : value ?? '';
  };
  const headers = fields.map(column => column.label);
  if (includeAnalysis) headers.push('Analysis');
  return [headers, ...data.map(row => {
    const values = fields.map(column => valueOf(row[column.accessor]));
    if (includeAnalysis) values.push(valueOf(row.reasoning ?? row.analysis));
    return values;
  })];
}

export async function downloadAsExcel(data, columns, includeAnalysis = false, filename = 'oriplex_extracted_data.xlsx') {
  if (!data?.length) return;
  const XLSX = await import('xlsx');
  const rows = buildExportRows(data, columns, includeAnalysis);
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet['!cols'] = rows[0].map(header => ({ wch: Math.min(60, Math.max(15, header.length + 5)) }));
  sheet['!autofilter'] = { ref: sheet['!ref'] };
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Extracted Data');
  XLSX.writeFile(workbook, filename, { compression: true });
}

export async function downloadAsPDF(data, columns, filename = 'oriplex_data.pdf') {
  if (!data?.length) return;
  try {
    const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
    const doc = new jsPDF({ orientation: 'landscape' });
    const fields = columns.filter(column => column.accessor);
    autoTable(doc, { head: [fields.map(column => column.label)],
      body: data.map(row => fields.map(column => {
        const cell = row[column.accessor];
        return cleanForExcel(String(cell?.value ?? cell ?? ''));
      })), styles: { fontSize: 8 }, margin: 12 });
    doc.save(filename);
  } catch {
    alert('PDF could not be exported. Please try again.');
  }
}

export const ActionTypes = Object.freeze({
  ADD_OPTION_TO_COLUMN: 'add_option_to_column',
  ADD_ROW: 'add_row',
  ADD_MULTIPLE_ROWS: 'add_multiple_rows',
  UPDATE_COLUMN_TYPE: 'update_column_type',
  UPDATE_COLUMN_HEADER: 'update_column_header',
  UPDATE_CELL: 'update_cell',
  ADD_COLUMN_TO_LEFT: 'add_column_to_left',
  ADD_COLUMN_TO_RIGHT: 'add_column_to_right',
  DELETE_COLUMN: 'delete_column',
  RENAME_COLUMN: 'rename_column',
  DELETE_ROWS: 'delete_rows',
  ENABLE_RESET: 'enable_reset',
  TOGGLE_COLUMN_CITATIONS: 'toggle_column_citations',
  RESTORE_TABLE_STATE: 'restore_table_state',
  SET_EXTRACTING_CELLS: 'set_extracting_cells',
  HIDE_COLUMN: 'hide_column',       // ✅ NEW: Hide column (recoverable)
  SHOW_COLUMN: 'show_column',       // ✅ NEW: Show hidden column
});

export const DataTypes = Object.freeze({
  NUMBER: 'number',
  TEXT: 'text',
  SELECT: 'select',
  FILE: 'file',
});

export const Constants = Object.freeze({
  ADD_COLUMN_ID: 999999,
});
