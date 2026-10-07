import React, { useState } from 'react';
import { ChevronUp, ChevronDown, Download } from 'lucide-react';

export default function DataTable({
  columns = [],
  data = [],
  keyField = 'id',
  onRowClick,
  selectedKey,
  exportFileName = 'data.csv',
  emptyMessage = 'No records found',
}) {
  const [sortField, setSortField] = useState(null);
  const [sortAsc, setSortAsc] = useState(true);
  const [filterText, setFilterText] = useState('');

  const handleSort = (field) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  const filteredData = data.filter((row) => {
    if (!filterText) return true;
    return Object.values(row).some((val) =>
      String(val).toLowerCase().includes(filterText.toLowerCase())
    );
  });

  const sortedData = [...filteredData].sort((a, b) => {
    if (!sortField) return 0;
    const aVal = a[sortField];
    const bVal = b[sortField];
    if (aVal === bVal) return 0;
    if (aVal === null || aVal === undefined) return 1;
    if (bVal === null || bVal === undefined) return -1;
    if (aVal < bVal) return sortAsc ? -1 : 1;
    return sortAsc ? 1 : -1;
  });

  const exportCSV = () => {
    if (sortedData.length === 0) return;
    const headers = columns.map((c) => c.header || c.field).join(',');
    const rows = sortedData.map((row) =>
      columns
        .map((c) => {
          const val = row[c.field] !== undefined ? row[c.field] : '';
          return `"${String(val).replace(/"/g, '""')}"`;
        })
        .join(',')
    );
    const csvContent = [headers, ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', exportFileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded flex flex-col h-full overflow-hidden">
      <div className="p-3 border-b border-slate-800 flex items-center justify-between gap-3 bg-slate-950/40">
        <input
          type="text"
          placeholder="Filter table rows..."
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          className="bg-slate-900 border border-slate-700 text-xs text-slate-200 rounded px-3 py-1.5 focus:outline-none focus:border-indigo-500 w-64"
        />
        <button
          onClick={exportCSV}
          className="inline-flex items-center gap-1.5 text-xs text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded transition-colors"
          title="Export CSV"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export CSV</span>
        </button>
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead className="bg-slate-950/80 sticky top-0 border-b border-slate-800 text-slate-400 select-none z-10">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.field}
                  onClick={() => col.sortable !== false && handleSort(col.field)}
                  className={`p-3 font-semibold uppercase tracking-wider text-[11px] ${
                    col.sortable !== false ? 'cursor-pointer hover:text-slate-200' : ''
                  }`}
                  style={{ width: col.width }}
                >
                  <div className="flex items-center gap-1">
                    <span>{col.header}</span>
                    {sortField === col.field && (
                      sortAsc ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 font-mono">
            {sortedData.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="text-center py-8 text-slate-500 font-sans">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              sortedData.map((row) => {
                const isSelected = selectedKey !== undefined && row[keyField] === selectedKey;
                return (
                  <tr
                    key={row[keyField]}
                    onClick={() => onRowClick && onRowClick(row)}
                    className={`transition-colors ${
                      onRowClick ? 'cursor-pointer hover:bg-slate-800/40' : ''
                    } ${isSelected ? 'bg-indigo-950/40 border-l-2 border-indigo-500' : ''}`}
                  >
                    {columns.map((col) => (
                      <td key={col.field} className="p-3 text-slate-300 tabular-nums">
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
