/**
 * MobileTable 移动端表格组件
 *
 * 小屏（≤420px）自动切换为竖排卡片视图，大屏兜底横向滚动。
 */
import React, { useEffect, useRef, useState } from 'react';

interface MobileTableProps {
  children?: React.ReactNode;
  isUser: boolean;
  [key: string]: unknown;
}

export function MobileTable({ children, ...props }: MobileTableProps) {
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const thEls = containerRef.current.querySelectorAll('th');
    const trEls = containerRef.current.querySelectorAll('tbody tr');
    if (thEls.length > 0 && trEls.length > 0) {
      setHeaders(Array.from(thEls).map(th => th.textContent || ''));
      const tableRows: string[][] = [];
      trEls.forEach(tr => {
        const tds = tr.querySelectorAll('td');
        tableRows.push(Array.from(tds).map(td => td.textContent || ''));
      });
      setRows(tableRows);
    }
  }, [children]);

  return (
    <div className="mobile-table-wrapper" ref={containerRef} style={{ margin: '8px 0' }}>
      {/* 兜底：横向滚动表格（>420px 显示） */}
      <div className="mobile-table-scroll" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <table className="mobile-table" {...props}>{children}</table>
      </div>
      {/* 小屏卡片视图（≤420px 显示） */}
      <div className="mobile-table-cards">
        <div className="mobile-table-cards-inner">
          {rows.map((row, i) => (
            <div key={i} className="mobile-table-card">
              {row.map((cell, j) => (
                <div key={j} className="mobile-table-card-row">
                  <span className="mobile-table-card-label">{headers[j]}</span>
                  <span className="mobile-table-card-value">{cell}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
