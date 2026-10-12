import { describe, expect, it } from 'vitest';
import { buildExportRows } from './utils';

describe('spreadsheet export', () => {
  it('retains zero, false and structured extraction values and omits action columns', () => {
    const rows = buildExportRows([{ a: 0, b: false, c: { value: '**Revenue** ||CITE:source||' }, analysis: 'Verified' }],
      [{ accessor: 'a', label: 'Amount' }, { accessor: 'b', label: 'Present' }, { accessor: 'c', label: 'Name' }, { label: '+' }], true);
    expect(rows).toEqual([['Amount', 'Present', 'Name', 'Analysis'], [0, false, 'Revenue', 'Verified']]);
  });
});
