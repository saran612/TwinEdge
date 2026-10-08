import React, { useState, useMemo } from 'react';
import { ChevronUp, ChevronDown, Download, Search, AlertCircle } from 'lucide-react';
import { Button } from './Button';
import { Input } from './Input';

/**
 * TableShell Component
 * Spec:
 * Header height: 40px, font xs, uppercase tracking-wider, text-text-2
 * Row height: 48px, font sm, text-text-main, tabular-nums on numbers
 * Selected row: selected-row background with 3px solid accent left bar
 * Radius: lg (12px) container, md (8px) row focus
 */
export function TableShell({
  columns = [],
  data = [],
  keyField = 'id',
  onRowClick,
  selectedKey,
  exportFileName,
  emptyMessage = 'No data available',
  errorMessage,
  isLoading = false,
  className = '',
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState(null);
  const [sortAsc, setSortAsc] = useState(true);

  const filteredData = useMemo(() => {
    if (!searchTerm.trim()) return data;
    const lower = searchTerm.toLowerCase();
    return data.filter((row) =>
      columns.some((col) => {
        const val = row[col.field];
        return val !== undefined && val !== null && String(val).toLowerCase().includes(lower);
      })
    );
  }, [data, searchTerm, columns]);

  const sortedData = useMemo(() => {
    if (!sortField) return filteredData;
    return [...filteredData].sort((a, b) => {
      const va = a[sortField];
      const vb = b[sortField];
      if (va === vb) return 0;
      if (va === null || va === undefined) return 1;
      if (vb === null || vb === undefined) return -1;
      return (va > vb ? 1 : -1) * (sortAsc ? 1 : -1);
    });
  }, [filteredData, sortField, sortAsc]);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  const handleExport = () => {
    if (!data.length) return;
    const headers = columns.map((c) => c.header).join(',');
    const rows = sortedData.map((row) =>
      columns.map((c) => JSON.stringify(row[c.field] ?? '')).join(',')
    );
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers, ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', exportFileName || 'export.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className={`bg-surface border border-border rounded-lg flex flex-col h-full overflow-hidden ${className}`}>
      {/* Controls Bar */}
      <div className="p-4 border-b border-border flex items-center justify-between gap-3 bg-surface-2/50">
        <div className="relative w-64">
          <Input
            type="text"
            placeholder="Search rows..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 h-8 text-sm"
          />
          <Search className="w-4 h-4 text-text-muted absolute left-3 top-2 pointer-events-none" />
        </div>

        {exportFileName && (
          <Button
            size="sm"
            variant="secondary"
            onClick={handleExport}
            className="text-xs"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </Button>
        )}
      </div>

      {/* Table Container */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-left border-collapse text-sm">
          <thead className="bg-surface-2 sticky top-0 border-b border-border text-text-2 select-none z-10">
            <tr className="h-10">
              {columns.map((col) => (
                <th
                  key={col.field}
                  style={{ width: col.width }}
                  onClick={() => handleSort(col.field)}
                  className="px-4 py-2 font-semibold text-xs tracking-wider uppercase cursor-pointer hover:text-text-main transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    <span>{col.header}</span>
                    {sortField === col.field && (
                      sortAsc ? <ChevronUp className="w-3.5 h-3.5 text-accent" /> : <ChevronDown className="w-3.5 h-3.5 text-accent" />
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border font-sans">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="h-12 animate-pulse bg-surface-2/20">
                  <td colSpan={columns.length} className="px-4 py-3">
                    <div className="h-4 bg-border/40 rounded-sm w-3/4"></div>
                  </td>
                </tr>
              ))
            ) : errorMessage ? (
              <tr>
                <td colSpan={columns.length} className="text-center py-8 text-status-critical-text font-medium">
                  <div className="flex items-center justify-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    <span>{errorMessage}</span>
                  </div>
                </td>
              </tr>
            ) : sortedData.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="text-center py-8 text-text-muted">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              sortedData.map((row) => {
                const rowKey = `${row.split || 'VAL'}:${row[keyField]}`;
                const isSelected = selectedKey !== undefined && (row[keyField] === selectedKey || rowKey === selectedKey);
                return (
                  <tr
                    key={rowKey}
                    onClick={() => onRowClick && onRowClick(row)}
                    className={`h-12 transition-colors ${
                      onRowClick ? 'cursor-pointer hover:bg-surface-2' : ''
                    } ${
                      isSelected
                        ? 'bg-selected-row border-l-[3px] border-l-accent'
                        : 'border-l-[3px] border-l-transparent'
                    }`}
                  >
                    {columns.map((col) => (
                      <td key={col.field} className="px-4 py-2 text-text-main tabular-nums">
                        {col.render ? col.render(row[col.field], row) : (row[col.field] ?? '—')}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
export default TableShell;
