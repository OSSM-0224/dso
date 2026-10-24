import React, { useMemo } from 'react';

interface TableProps<T> {
  columns: Array<{
    key: string;
    header: string;
    render: (row: T) => React.ReactNode;
    width?: string;
    align?: 'left' | 'right' | 'center';
  }>;
  rows: T[];
  rowKey: (row: T) => string;
  emptyState?: React.ReactNode;
  onRowClick?: (row: T) => void;
  className?: string;
}

/**
 * Responsive table: real table with sticky header on md+, plain stacked
 * card-rows on mobile. Same semantic content everywhere.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  emptyState,
  onRowClick,
  className = '',
}: TableProps<T>) {
  const colAlign = useMemo(
    () =>
      Object.fromEntries(columns.map((c) => [c.key, c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left'])),
    [columns]
  );

  if (rows.length === 0 && emptyState) {
    return <>{emptyState}</>;
  }

  return (
    <>
      {/* Desktop table */}
      <div className={`hidden md:block overflow-x-auto border border-hairline rounded-[12px] bg-surface ${className}`}>
        <table className="w-full text-[13px]">
          <thead>
            <tr className="sticky top-0 z-10 bg-canvas/95 backdrop-blur-sm border-b border-hairline">
              {columns.map((c) => (
                <th
                  key={c.key}
                  style={c.width ? { width: c.width } : undefined}
                  className={`px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-muted ${colAlign[c.key]}`}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={`${onRowClick ? 'cursor-pointer ' : ''}transition-colors duration-150 hover:bg-canvas/60`}
              >
                {columns.map((c) => (
                  <td key={c.key} className={`px-4 py-3 align-middle ${colAlign[c.key]}`}>
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile stacked list */}
      <div className={`md:hidden flex flex-col gap-2 ${className}`}>
        {rows.map((row) => (
          <div
            key={rowKey(row)}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
            className={`rounded-[12px] border border-hairline bg-surface p-4 shadow-rest ${onRowClick ? 'cursor-pointer active:scale-[0.99] transition-transform duration-150' : ''}`}
          >
            {columns[0] && (
              <div className={`text-sm font-semibold text-ink pb-2 mb-1 border-b border-hairline ${colAlign[columns[0].key]}`}>
                {columns[0].render(row)}
              </div>
            )}
            {columns.slice(1).map((c) => (
              <div key={c.key} className="flex items-start justify-between gap-3 py-1.5">
                <span className="text-[11px] uppercase tracking-[0.05em] text-muted pt-0.5 shrink-0">{c.header}</span>
                <span className={`text-right text-[13px] text-ink min-w-0 ${colAlign[c.key]}`}>{c.render(row)}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}
