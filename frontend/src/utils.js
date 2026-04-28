import faker from 'faker';
import ExcelJS from 'exceljs';

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

  // Clean data by removing citations
  const cleanData = data.map(row => {
    const cleanRow = {};
    columns.forEach(col => {
      const value = row[col.accessor];
      cleanRow[col.label] = typeof value === 'string' ? stripCitations(value) : value;
    });
    return cleanRow;
  });

  // Convert to CSV
  const headers = columns.map(col => col.label);
  const csvContent = [
    headers.join(','),
    ...cleanData.map(row =>
      columns.map(col => {
        const value = row[col.label] || '';
        // Escape commas and quotes
        const escaped = String(value).replace(/"/g, '""');
        return `"${escaped}"`;
      }).join(',')
    )
  ].join('\n');

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

  console.log('✅ Downloaded clean CSV without citations');
}

// ✅ NEW: Download data as styled Excel (.xlsx) with professional formatting
// Option to include analysis column (reasoning data)
export async function downloadAsExcel(data, columns, includeAnalysis = false, filename = 'oriplex_extracted_data.xlsx') {
  if (!data || data.length === 0) {
    alert('No data to download');
    return;
  }

  try {
    // Use static ExcelJS import (more reliable than dynamic)
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Oriplex Data Extraction';
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet('Extracted Data', {
      views: [{ state: 'frozen', ySplit: 1 }] // Freeze header row
    });

    // ✅ Prepare column headers
    const visibleColumns = columns.filter(col =>
      col.id !== 999999 && // Skip add column button
      !col.label?.startsWith('+')
    );

    const headers = visibleColumns.map(col => col.label);
    if (includeAnalysis) {
      headers.push('Analysis'); // Add analysis column at the end
    }

    // ✅ Set up columns with proper widths
    worksheet.columns = headers.map((header, idx) => ({
      header,
      key: `col_${idx}`,
      width: header === 'Analysis' ? 60 : Math.max(header.length + 5, 15)
    }));

    // ✅ Style header row - Blue background, white text, bold (Investment Banking style)
    const headerRow = worksheet.getRow(1);
    headerRow.eachCell((cell, colNumber) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1E40AF' } // Deep blue
      };
      cell.font = {
        color: { argb: 'FFFFFFFF' }, // White text
        bold: true,
        size: 11
      };
      cell.alignment = {
        vertical: 'middle',
        horizontal: 'center',
        wrapText: true
      };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF000000' } },
        left: { style: 'thin', color: { argb: 'FF000000' } },
        bottom: { style: 'thin', color: { argb: 'FF000000' } },
        right: { style: 'thin', color: { argb: 'FF000000' } }
      };
    });
    headerRow.height = 28;

    // ✅ Add data rows with light gray alternating style
    data.forEach((row, rowIndex) => {
      const rowData = {};
      visibleColumns.forEach((col, colIdx) => {
        let value = row[col.accessor];

        // ✅ CLEAN VALUE EXTRACTION: Handle complex objects
        if (value && typeof value === 'object') {
          // Extract the actual value from nested structures
          if (value.value !== undefined) {
            value = value.value;
          } else if (value.content !== undefined) {
            value = value.content;
          } else if (value.extracted_value !== undefined) {
            value = value.extracted_value;
          }

          // If still an object (like structured summary), convert to readable text
          if (value && typeof value === 'object') {
            if (value.title && value.content) {
              // Structured summary - just use title + content
              value = `${value.title}: ${value.content}`;
            } else {
              // Other objects - extract text content only
              value = JSON.stringify(value);
            }
          }
        }

        // ✅ Strip citations AND markdown from text values for clean Excel
        if (typeof value === 'string') {
          value = cleanForExcel(value);
        }

        rowData[`col_${colIdx}`] = value || '';
      });

      // Add analysis/reasoning if requested
      if (includeAnalysis) {
        const reasoning = row.reasoning || row.analysis || '';
        let reasoningText = '';
        if (typeof reasoning === 'string') {
          reasoningText = cleanForExcel(reasoning);
        } else if (reasoning && typeof reasoning === 'object') {
          reasoningText = cleanForExcel(reasoning.content || reasoning.text || JSON.stringify(reasoning));
        }
        rowData[`col_${visibleColumns.length}`] = reasoningText;
      }

      const excelRow = worksheet.addRow(rowData);

      // ✅ Style data cells - Alternating white/light gray for readability
      const isEvenRow = rowIndex % 2 === 0;
      excelRow.eachCell((cell, colNumber) => {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: isEvenRow ? 'FFFFFFFF' : 'FFF3F4F6' } // White / Light gray
        };
        cell.font = {
          color: { argb: 'FF1F2937' }, // Dark gray text
          size: 10
        };
        cell.alignment = {
          vertical: 'top',
          horizontal: 'left',
          wrapText: true
        };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          right: { style: 'thin', color: { argb: 'FFE5E7EB' } }
        };
      });
    });

    // ✅ Auto-fit column widths (approximate)
    worksheet.columns.forEach((column, idx) => {
      let maxLength = column.header?.length || 10;
      worksheet.eachRow((row, rowNum) => {
        if (rowNum > 1) { // Skip header
          const cell = row.getCell(idx + 1);
          const cellValue = cell.value?.toString() || '';
          maxLength = Math.max(maxLength, Math.min(cellValue.length, 50));
        }
      });
      column.width = Math.max(maxLength + 2, 12);
    });

    // ✅ Generate buffer and download
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });

    // ✅ RELIABLE DOWNLOAD for modern browsers (Chrome, Firefox, Edge)
    // Using msSaveBlob for IE, or link with proper event dispatch for others
    if (window.navigator && window.navigator.msSaveOrOpenBlob) {
      // IE/Edge legacy
      window.navigator.msSaveOrOpenBlob(blob, filename);
    } else {
      // Modern browsers - use link with forced click via MouseEvent
      const link = document.createElement('a');
      const blobUrl = URL.createObjectURL(blob);

      link.href = blobUrl;
      link.download = filename;
      link.style.display = 'none';

      // Must append to body for Firefox
      document.body.appendChild(link);

      // Use MouseEvent for more reliable triggering
      const clickEvent = new MouseEvent('click', {
        view: window,
        bubbles: true,
        cancelable: true
      });
      link.dispatchEvent(clickEvent);

      // Cleanup
      setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(blobUrl);
      }, 250);
    }

    console.log(`✅ Downloaded Excel file: ${filename} ${includeAnalysis ? '(with analysis)' : '(data only)'}`);
  } catch (error) {
    console.error('❌ Excel export error:', error);
    alert('Failed to export Excel file. Please try again.');
  }
}

// ✅ NEW: Download data as PDF without citations (TEMPORARILY DISABLED - Vite module resolution issue)
export function downloadAsPDF(data, columns, filename = 'oriplex_data.pdf') {
  alert('PDF download temporarily disabled due to a technical issue. Please use CSV download for now. We are working on fixing this!');
  console.log('PDF download feature temporarily disabled');

  // TODO: Re-enable once Vite module resolution issue is fixed
  // The jspdf packages are installed but Vite cannot resolve the dynamic imports
}

export function makeData(count) {
  let data = [];
  let options = [];
  for (let i = 0; i < count; i++) {
    let row = {
      ID: faker.mersenne.rand(),
      firstName: faker.name.firstName(),
      lastName: faker.name.lastName(),
      email: faker.internet.email(),
      age: Math.floor(20 + Math.random() * 20),
      music: faker.music.genre(),
    };
    options.push({ label: row.music, backgroundColor: randomColor() });

    data.push(row);
  }

  options = options.filter(
    (a, i, self) => self.findIndex(b => b.label === a.label) === i
  );

  let columns = [
    {
      id: 'firstName',
      label: 'First Name',
      accessor: 'firstName',
      minWidth: 100,
      dataType: DataTypes.TEXT,
      options: [],
    },
    {
      id: 'lastName',
      label: 'Last Name',
      accessor: 'lastName',
      minWidth: 100,
      dataType: DataTypes.TEXT,
      options: [],
    },
    {
      id: 'age',
      label: 'Age',
      accessor: 'age',
      width: 80,
      dataType: DataTypes.NUMBER,
      options: [],
    },
    {
      id: 'email',
      label: 'E-Mail',
      accessor: 'email',
      width: 300,
      dataType: DataTypes.TEXT,
      options: [],
    },
    {
      id: 'music',
      label: 'Music Preference',
      accessor: 'music',
      dataType: DataTypes.SELECT,
      width: 200,
      options: options,
    },
    {
      id: Constants.ADD_COLUMN_ID,
      width: 100,
      label: '+',
      disableResizing: true,
      dataType: 'null',
    },
  ];
  return { columns: columns, data: data, skipReset: false };
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
