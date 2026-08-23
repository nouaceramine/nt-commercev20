import React from 'react';

// p276 — جدول متجاوب: جدول حقيقي على md+ وبطاقات مكدسة على الجوال.
// columns: [{ header, key?, render?(row), className?, thClassName?, cardHidden?, cardFull? }]
//   - render(row): محتوى الخلية (بديل عن key)
//   - cardHidden: لا يظهر في بطاقة الجوال
//   - cardFull: يظهر بعرض كامل بدون تسمية (للأزرار مثلاً)
export function ResponsiveTable({
  columns,
  rows,
  keyFn,
  onRowClick,
  emptyText,
  tableClassName = 'data-table',
  theadClassName = '',
  thClassName = '',
  tdClassName = '',
  rowClassName = '',
}) {
  if (!rows || rows.length === 0) {
    return <div className="text-center py-12 text-muted-foreground">{emptyText || '—'}</div>;
  }
  const cell = (c, row) => (c.render ? c.render(row) : row[c.key]);
  const cardCols = columns.filter(c => !c.cardHidden);

  return (
    <>
      {/* سطح المكتب والتابلت: الجدول الأصلي */}
      <div className="hidden md:block overflow-x-auto">
        <table className={tableClassName}>
          <thead className={theadClassName || undefined}>
            <tr>
              {columns.map((c, i) => (
                <th key={i} className={c.thClassName || thClassName || undefined}>{c.header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr
                key={keyFn(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={`${rowClassName} ${onRowClick ? 'cursor-pointer' : ''}`.trim() || undefined}
              >
                {columns.map((c, i) => (
                  <td key={i} className={c.className || tdClassName || undefined}>{cell(c, row)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* الجوال: بطاقات مكدسة */}
      <div className="md:hidden space-y-3 p-3" data-testid="responsive-cards">
        {rows.map(row => (
          <div
            key={keyFn(row)}
            data-testid={`row-card-${keyFn(row)}`}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
            className={`border rounded-lg p-3 space-y-2 bg-card ${onRowClick ? 'cursor-pointer active:bg-muted/40' : ''}`}
          >
            <div className="font-medium">{cell(cardCols[0], row)}</div>
            {cardCols.slice(1).map((c, i) => (
              c.cardFull ? (
                <div key={i} className="pt-1">{cell(c, row)}</div>
              ) : (
                <div key={i} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-muted-foreground shrink-0">{c.header}</span>
                  <span className="text-left">{cell(c, row)}</span>
                </div>
              )
            ))}
          </div>
        ))}
      </div>
    </>
  );
}
