import { useState } from 'react';

/**
 * Format a metric value based on viewMode and percentageBase.
 * Matches HTML dashboard's fmtVal() behavior.
 */
function fmtVal(val, baseVal, prevVal, mode) {
  const v = val || 0;
  const pct = baseVal > 0 ? ((v / baseVal) * 100).toFixed(1) : '0.0';
  const drillPct = prevVal > 0 ? ((v / prevVal) * 100).toFixed(1) : '0.0';

  if (mode === 'numbers') return v.toLocaleString();
  if (mode === 'drilldown') {
    return <>{v.toLocaleString()} <span className="drill-pct">({drillPct}%&darr;)</span></>;
  }
  // 'percentage' and 'both' both show value + pct
  return <>{v.toLocaleString()} <span className="pct-val">({pct}%)</span></>;
}

const DataTable = ({
  title,
  data = [],
  columns = [],
  sortable = true,
  defaultSort = { field: null, dir: 'desc' },
  onSort,
  onRowClick,
  totals,
  pagination,
  onPageChange,
  filterInput = false,
  viewMode = 'numbers',
  percentageBase = 'users',
  rowClassName
}) => {
  const [sort, setSort] = useState(defaultSort);
  const [filter, setFilter] = useState('');

  const handleSort = (field) => {
    if (!sortable) return;
    const newSort = {
      field,
      dir: sort.field === field && sort.dir === 'desc' ? 'asc' : 'desc'
    };
    setSort(newSort);
    if (onSort) onSort(newSort);
  };

  const getSortIcon = (field) => {
    if (sort.field !== field) return '↕';
    return sort.dir === 'desc' ? '↓' : '↑';
  };

  // Filter data locally if filterInput is enabled
  let displayData = data;
  if (filter && filterInput) {
    const lowerFilter = filter.toLowerCase();
    displayData = data.filter(row => {
      return columns.some(col => {
        const val = row[col.key];
        return val && String(val).toLowerCase().includes(lowerFilter);
      });
    });
  }

  // Sort data locally if no external onSort
  if (sortable && !onSort && sort.field) {
    displayData = [...displayData].sort((a, b) => {
      const aVal = a[sort.field];
      const bVal = b[sort.field];
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      if (typeof aVal === 'number') {
        return sort.dir === 'desc' ? bVal - aVal : aVal - bVal;
      }
      return sort.dir === 'desc'
        ? String(bVal).localeCompare(String(aVal))
        : String(aVal).localeCompare(String(bVal));
    });
  }

  // Identify metric columns (columns with metric: true flag)
  const metricColIndices = columns.reduce((acc, col, idx) => {
    if (col.metric) acc.push(idx);
    return acc;
  }, []);

  // Render a cell value with viewMode formatting
  const renderCell = (col, colIdx, row) => {
    const rawVal = row[col.key];

    // If column has a custom render, use it (takes priority)
    if (col.render) return col.render(rawVal, row);

    // If this is a metric column and viewMode is not 'numbers', apply fmtVal
    if (col.metric && viewMode !== 'numbers') {
      const val = rawVal || 0;
      const baseVal = row[percentageBase] || 0;
      // For drilldown: find the previous metric column's value
      const metricIdx = metricColIndices.indexOf(colIdx);
      let prevVal;
      if (metricIdx > 0) {
        const prevColKey = columns[metricColIndices[metricIdx - 1]].key;
        prevVal = row[prevColKey] || baseVal;
      } else {
        prevVal = baseVal;
      }
      return fmtVal(val, baseVal, prevVal, viewMode);
    }

    return rawVal != null ? rawVal : '-';
  };

  // Render totals row cell
  const renderTotalsCell = (col, colIdx) => {
    const rawVal = totals[col.key];

    if (col.render && col.key !== Object.keys(totals)[0]) {
      return col.render(rawVal, totals);
    }

    // First column in totals is the label
    if (colIdx === 0) {
      return <strong>{rawVal || 'TOTAL'}</strong>;
    }

    if (col.metric && viewMode !== 'numbers') {
      const val = rawVal || 0;
      const baseVal = totals[percentageBase] || 0;
      const metricIdx = metricColIndices.indexOf(colIdx);
      let prevVal;
      if (metricIdx > 0) {
        const prevColKey = columns[metricColIndices[metricIdx - 1]].key;
        prevVal = totals[prevColKey] || baseVal;
      } else {
        prevVal = baseVal;
      }
      return fmtVal(val, baseVal, prevVal, viewMode);
    }

    return rawVal != null ? (typeof rawVal === 'number' ? rawVal.toLocaleString() : rawVal) : '-';
  };

  return (
    <div className="table-wrapper">
      <div className="table-header">
        <h3>{title} {data.length > 0 && `(${data.length})`}</h3>
        {filterInput && (
          <input
            type="text"
            placeholder="Filter..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{
              padding: '6px 12px',
              border: '1px solid #ddd',
              borderRadius: '6px',
              fontSize: '12px',
              width: '100%',
              maxWidth: '180px'
            }}
          />
        )}
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {columns.map(col => (
                <th
                  key={col.key}
                  className={sortable && col.sortable !== false ? 'sortable' : ''}
                  onClick={() => col.sortable !== false && handleSort(col.key)}
                  style={col.style}
                >
                  {col.label} {sortable && col.sortable !== false && getSortIcon(col.key)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayData.length === 0 ? (
              <tr>
                <td colSpan={columns.length} style={{ textAlign: 'center', color: '#888' }}>
                  No data available
                </td>
              </tr>
            ) : (
              displayData.map((row, idx) => (
                <tr
                  key={row.id || idx}
                  className={rowClassName ? rowClassName(row) : undefined}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  style={onRowClick ? { cursor: 'pointer' } : undefined}
                >
                  {columns.map((col, colIdx) => (
                    <td key={col.key} style={col.cellStyle}>
                      {renderCell(col, colIdx, row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
            {/* Totals row */}
            {totals && (
              <tr className="total-row">
                {columns.map((col, colIdx) => (
                  <td key={col.key} style={col.cellStyle}>
                    {renderTotalsCell(col, colIdx)}
                  </td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {pagination && (
        <div className="pagination">
          <button
            className="btn btn-sm btn-secondary"
            disabled={pagination.current_page === 1}
            onClick={() => onPageChange(1)}
          >
            &laquo; First
          </button>
          <button
            className="btn btn-sm btn-secondary"
            disabled={!pagination.has_prev}
            onClick={() => onPageChange(pagination.current_page - 1)}
          >
            &lsaquo; Prev
          </button>
          <span>
            Page <strong>{pagination.current_page}</strong> of{' '}
            <strong>{pagination.total_pages || 1}</strong>
            {pagination.total_count && (
              <span style={{ color: '#888', marginLeft: '8px' }}>
                ({pagination.total_count} total)
              </span>
            )}
          </span>
          <button
            className="btn btn-sm btn-secondary"
            disabled={!pagination.has_next}
            onClick={() => onPageChange(pagination.current_page + 1)}
          >
            Next &rsaquo;
          </button>
          <button
            className="btn btn-sm btn-secondary"
            disabled={pagination.current_page === pagination.total_pages}
            onClick={() => onPageChange(pagination.total_pages)}
          >
            Last &raquo;
          </button>
        </div>
      )}
    </div>
  );
};

export default DataTable;
