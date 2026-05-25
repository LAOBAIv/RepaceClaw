/**
 * FileHistoryModal.tsx
 * [2026-05-19] 浏览历史文件弹窗，支持筛选并添加到当前会话
 */
import { useState, useEffect, useCallback } from 'react';
import { filesApi, FileAsset } from '../../api/files';

interface Props {
  visible: boolean;
  onClose: () => void;
  onConfirm: (fileIds: string[]) => void;
  excludeIds?: string[]; // 当前会话已有的文件ID，不显示
}

const TIME_FILTERS = [
  { label: '全部', value: '' },
  { label: '今天', value: 'today' },
  { label: '近7天', value: '7d' },
  { label: '近30天', value: '30d' },
];

const TYPE_FILTERS = [
  { label: '全部', value: '' },
  { label: '图片', value: 'image' },
  { label: '文档', value: 'document' },
];

function getDateRange(filter: string): { startDate?: string; endDate?: string } {
  if (!filter) return {};
  const now = new Date();
  const end = now.toISOString().slice(0, 10);
  if (filter === 'today') return { startDate: end, endDate: end };
  if (filter === '7d') {
    const start = new Date(now.getTime() - 7 * 86400000);
    return { startDate: start.toISOString().slice(0, 10), endDate: end };
  }
  if (filter === '30d') {
    const start = new Date(now.getTime() - 30 * 86400000);
    return { startDate: start.toISOString().slice(0, 10), endDate: end };
  }
  return {};
}

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const yesterday = new Date(now.getTime() - 86400000).toISOString().slice(0, 10);
  const fileDate = d.toISOString().slice(0, 10);
  if (fileDate === today) return '今天';
  if (fileDate === yesterday) return '昨天';
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + 'B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + 'KB';
  return (bytes / 1024 / 1024).toFixed(1) + 'MB';
}

function groupByDate(files: FileAsset[]): { date: string; label: string; files: FileAsset[] }[] {
  const map = new Map<string, FileAsset[]>();
  for (const f of files) {
    const date = f.createdAt.slice(0, 10);
    if (!map.has(date)) map.set(date, []);
    map.get(date)!.push(f);
  }
  return Array.from(map.entries()).map(([date, files]) => ({
    date,
    label: formatDateLabel(date + 'T00:00:00Z'),
    files,
  }));
}

export function FileHistoryModal({ visible, onClose, onConfirm, excludeIds = [] }: Props) {
  const [files, setFiles] = useState<FileAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [timeFilter, setTimeFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState<'' | 'image' | 'document'>('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const loadFiles = useCallback(async () => {
    setLoading(true);
    try {
      const { startDate, endDate } = getDateRange(timeFilter);
      const rows = await filesApi.list({ startDate, endDate, type: typeFilter || '' });
      setFiles(rows.filter(f => !excludeIds.includes(f.id)));
    } catch (e) { console.warn("[RC]", e); } finally { setLoading(false); }
  }, [timeFilter, typeFilter, excludeIds]);

  useEffect(() => { if (visible) { loadFiles(); setSelected(new Set()); } }, [visible, loadFiles]);

  const filtered = search
    ? files.filter(f => f.originalName.toLowerCase().includes(search.toLowerCase()))
    : files;
  const groups = groupByDate(filtered);

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  if (!visible) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.4)' }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 14, width: 420, maxHeight: '70vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }} onClick={e => e.stopPropagation()}>
        {/* 头部 */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#1f2937' }}>📂 浏览历史文件</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#9ca3af' }}>✕</button>
        </div>

        {/* 搜索 + 筛选 */}
        <div style={{ padding: '12px 20px 8px', borderBottom: '1px solid #f9fafb' }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索文件名..." style={{ width: '100%', padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
          <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
            {TYPE_FILTERS.map(t => (
              <button key={t.value} onClick={() => setTypeFilter(t.value as '' | 'image' | 'document')} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid ' + (typeFilter === t.value ? '#3b82f6' : '#e5e7eb'), background: typeFilter === t.value ? '#eff6ff' : '#fff', color: typeFilter === t.value ? '#3b82f6' : '#6b7280', fontSize: 12, cursor: 'pointer' }}>{t.label}</button>
            ))}
            <span style={{ width: 1, background: '#e5e7eb', margin: '0 4px' }} />
            {TIME_FILTERS.map(t => (
              <button key={t.value} onClick={() => setTimeFilter(t.value)} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid ' + (timeFilter === t.value ? '#3b82f6' : '#e5e7eb'), background: timeFilter === t.value ? '#eff6ff' : '#fff', color: timeFilter === t.value ? '#3b82f6' : '#6b7280', fontSize: 12, cursor: 'pointer' }}>{t.label}</button>
            ))}
          </div>
        </div>

        {/* 文件列表 */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px' }}>
          {loading && <div style={{ textAlign: 'center', color: '#9ca3af', fontSize: 13, padding: 20 }}>加载中...</div>}
          {!loading && groups.length === 0 && <div style={{ textAlign: 'center', color: '#d1d5db', fontSize: 13, padding: 20 }}>暂无文件</div>}
          {groups.map(g => (
            <div key={g.date} style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600, marginBottom: 6 }}>{g.label}</div>
              {g.files.map(f => (
                <div key={f.id} onClick={() => toggle(f.id)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, cursor: 'pointer', background: selected.has(f.id) ? '#eff6ff' : 'transparent', border: '1px solid ' + (selected.has(f.id) ? '#bfdbfe' : 'transparent'), marginBottom: 4, transition: 'all 0.1s' }}>
                  <input type="checkbox" checked={selected.has(f.id)} readOnly style={{ accentColor: '#3b82f6' }} />
                  <span style={{ fontSize: 16 }}>{f.extension?.match(/\.(png|jpg|jpeg|gif|webp|svg|bmp)/) ? '🖼️' : '📄'}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.originalName}</div>
                  </div>
                  <span style={{ fontSize: 11, color: '#9ca3af', flexShrink: 0 }}>{formatFileSize(f.sizeBytes)}</span>
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* 底部 */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: '#6b7280' }}>已选 {selected.size} 个文件</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', color: '#6b7280', fontSize: 13, cursor: 'pointer' }}>取消</button>
            <button onClick={() => { onConfirm(Array.from(selected)); onClose(); }} disabled={selected.size === 0} style={{ padding: '6px 14px', borderRadius: 6, border: 'none', background: selected.size > 0 ? '#3b82f6' : '#e5e7eb', color: selected.size > 0 ? '#fff' : '#9ca3af', fontSize: 13, cursor: selected.size > 0 ? 'pointer' : 'not-allowed', fontWeight: 500 }}>添加到会话</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default FileHistoryModal;
