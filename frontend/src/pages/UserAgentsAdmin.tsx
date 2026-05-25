/**
 * UserAgentsAdmin — 用户会话管理页面
 * [2026-05-23] 会话维度 + 列选择器
 */
import { useState, useEffect } from 'react';
import { MessageSquare, Search, RefreshCw, Trash2, Settings2 } from 'lucide-react';
import apiClient from '@/api/client';

const TYPE_LABELS: Record<string, string> = {
  dev: '工程开发', data: '数据分析', creative: '内容生成',
  pm: '项目管理', research: '知识推理', ops: '平台策略',
  decision: '决策支持', general: '通用助手', wechat: '微信助手', platform: '平台助手',
};
const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  active: { label: '活跃', color: '#059669', bg: '#ecfdf5' },
  in_progress: { label: '进行中', color: '#d97706', bg: '#fef3c7' },
  closed: { label: '已关闭', color: '#6b7280', bg: '#f3f4f6' },
  archived: { label: '已归档', color: '#9ca3af', bg: '#f9fafb' },
};
const ALL_COLUMNS = [
  { key: 'username', label: '用户', default: true },
  { key: 'agentName', label: '智能体', default: true },
  { key: 'title', label: '会话标题', default: false },
  { key: 'agentType', label: '执行通道', default: true },
  { key: 'openclawAgentId', label: 'OC 通道', default: true },
  { key: 'modelProvider', label: '模型渠道', default: true },
  { key: 'modelName', label: '模型ID', default: true },
  { key: 'status', label: '状态', default: true },
  { key: 'messageCount', label: '消息数', default: true },
  { key: 'totalTokens', label: 'Token消耗', default: false },
  { key: 'lastMessageAt', label: '最后活跃', default: true },
  { key: 'createdAt', label: '创建时间', default: false },
  { key: 'conversationType', label: '会话类型', default: false },
  { key: 'scopeType', label: '作用域', default: false },
  { key: 'memoryPolicy', label: '记忆策略', default: false },
  { key: 'email', label: '用户邮箱', default: false },
  { key: 'userRole', label: '用户角色', default: false },
  { key: 'temperature', label: '温度', default: false },
  { key: 'maxTokens', label: '最大Token', default: false },
  { key: 'agentVisibility', label: '可见性', default: false },
  { key: 'tokenUsed', label: '累计Token', default: false },
] as const;

export function UserAgentsAdmin() {
  const [data, setData] = useState<Record<string, unknown>[]>([]);
  const [stats, setStats] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterUser, setFilterUser] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterType, setFilterType] = useState('');
  const [showCols, setShowCols] = useState(false);
  const [cols, setCols] = useState<Set<string>>(new Set(ALL_COLUMNS.filter(c => c.default).map(c => c.key)));

  async function load() {
    setLoading(true);
    try {
      const res = await apiClient.get('/admin/user-agents');
      setData(res.data?.data || []); setStats(res.data?.stats || null);
    } catch (e) { console.warn("[RC]", e); } setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function handleDelete(id: string) {
    if (!confirm('确定删除该会话？')) return;
    try { await apiClient.delete(`/admin/user-agents/${id}`); load(); } catch (e) { console.warn("[RC]", e); }
  }

  const userIds = [...new Set(data.map(c => c.userId).filter(Boolean))];
  const types = [...new Set(data.map(c => c.agentType).filter(Boolean))];
  const filtered = data.filter(c => {
    const s = search.toLowerCase();
    if (s && ![c.username, c.agentName, c.title, c.email].some(v => (v||'').toLowerCase().includes(s))) return false;
    if (filterUser && c.userId !== filterUser) return false;
    if (filterStatus && c.status !== filterStatus) return false;
    if (filterType && c.agentType !== filterType) return false;
    return true;
  });

  function toggleCol(k: string) { setCols(p => { const n = new Set(p); if (n.has(k)) n.delete(k); else n.add(k); return n; }); }
  const active = ALL_COLUMNS.filter(c => cols.has(c.key));

  function cell(c: Record<string, unknown>, k: string) { // [2026-05-24] 类型安全
    const r = c as Record<string, string | undefined>; // [2026-05-24] 类型安全
    switch (k) {
      case 'username': return <b>{r.username || (r.userId as string)?.slice(0,8) || '-'}</b>;
      case 'agentName': return <span style={{ color: r.agentColor || '#6366f1', fontWeight: 500 }}>{r.agentName || '已删除'}</span>;
      case 'title': return r.title || '-';
      case 'agentType': return TYPE_LABELS[r.agentType as string] || r.agentType || '-';
      case 'openclawAgentId': return <code style={{ fontSize: 11, background: '#f1f5f9', padding: '1px 5px', borderRadius: 3 }}>{r.openclawAgentId || '-'}</code>;
      case 'modelProvider': return <span style={{ color: '#1d4ed8', fontWeight: 500 }}>{r.modelProvider || '-'}</span>;
      case 'modelName': return <b>{r.modelName || '-'}</b>;
      case 'status': { const si = STATUS_MAP[r.status as string] || STATUS_MAP.in_progress; return <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 4, background: si.bg, color: si.color, fontWeight: 500 }}>{si.label}</span>; }
      case 'messageCount': return r.messageCount;
      case 'totalTokens': return (c.totalTokens as number)?.toLocaleString() || '0';
      case 'lastMessageAt': return r.lastMessageAt ? new Date(r.lastMessageAt).toLocaleString('zh-CN', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' }) : '-';
      case 'createdAt': return r.createdAt ? new Date(r.createdAt).toLocaleDateString('zh-CN') : '-';
      case 'conversationType': return r.conversationType || '-';
      case 'scopeType': return r.scopeType || '-';
      case 'memoryPolicy': return r.memoryPolicy || '-';
      case 'email': return r.email || '-';
      case 'userRole': return r.userRole || '-';
      case 'temperature': return r.temperature ?? '-';
      case 'maxTokens': return r.maxTokens ?? '-';
      case 'agentVisibility': return r.agentVisibility || '-';
      case 'tokenUsed': return (c.tokenUsed as number)?.toLocaleString() || '0';
      default: return '-';
    }
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>加载中...</div>;

  const ss: React.CSSProperties = { padding: '5px 10px', borderRadius: 7, border: '1px solid #e5e7eb', fontSize: 12, background: '#fff' };

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h2 style={{ fontSize: 17, fontWeight: 600, color: '#1a202c', display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
          <MessageSquare size={18} color="#d97706" /> 用户会话管理
        </h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setShowCols(!showCols)} style={{ ...ss, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, background: showCols ? '#eff6ff' : '#fff', color: showCols ? '#2563eb' : '#374151' }}><Settings2 size={13} /> 列设置</button>
          <button onClick={load} style={{ ...ss, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}><RefreshCw size={13} /> 刷新</button>
        </div>
      </div>

      {/* 统计 */}
      {stats && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 12 }}>
        {[{ l: '总会话', v: stats.totalConversations, c: '#3b82f6' }, { l: '活跃用户', v: stats.totalUsers, c: '#8b5cf6' }, { l: '总消息', v: stats.totalMessages, c: '#059669' }, { l: '活跃会话', v: stats.activeConversations, c: '#d97706' }].map(s => (
          <div key={s.l} style={{ background: '#fff', borderRadius: 8, border: '1px solid #e5e7eb', padding: '10px 14px', textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: s.c }}>{s.v}</div>
            <div style={{ fontSize: 11, color: '#6b7280' }}>{s.l}</div>
          </div>
        ))}
      </div>}

      {/* 列选择器 */}
      {showCols && <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '10px 14px', marginBottom: 12, display: 'flex', flexWrap: 'wrap', gap: 5 }}>
        {ALL_COLUMNS.map(col => (
          <label key={col.key} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, cursor: 'pointer', padding: '2px 7px', borderRadius: 4, background: cols.has(col.key) ? '#eff6ff' : '#f9fafb', border: `1px solid ${cols.has(col.key) ? '#bfdbfe' : '#e5e7eb'}` }}>
            <input type="checkbox" checked={cols.has(col.key)} onChange={() => toggleCol(col.key)} style={{ width: 12, height: 12 }} />{col.label}
          </label>
        ))}
      </div>}

      {/* 筛选 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, ...ss }}>
          <Search size={12} color="#9ca3af" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索" style={{ border: 'none', outline: 'none', fontSize: 12, width: 150, background: 'transparent' }} />
        </div>
        <select value={filterUser} onChange={e => setFilterUser(e.target.value)} style={ss}>
          <option value="">全部用户</option>
          {userIds.map(uid => { const c = data.find(x => x.userId === uid); return <option key={uid} value={uid}>{c?.username || uid.slice(0,8)}</option>; })}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={ss}>
          <option value="">全部状态</option>
          <option value="active">活跃</option><option value="in_progress">进行中</option>
          <option value="closed">已关闭</option><option value="archived">已归档</option>
        </select>
        <select value={filterType} onChange={e => setFilterType(e.target.value)} style={ss}>
          <option value="">全部通道</option>
          {types.map(t => <option key={t} value={t}>{TYPE_LABELS[t] || t}</option>)}
        </select>
        <span style={{ fontSize: 11, color: '#9ca3af' }}>{filtered.length}/{data.length}</span>
      </div>

      {/* 表格 */}
      <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb', overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: active.length * 90 }}>
          <thead><tr style={{ background: '#f9fafb' }}>
            {active.map(col => <th key={col.key} style={{ padding: '9px 11px', textAlign: 'left', fontSize: 11, color: '#6b7280', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>{col.label}</th>)}
            <th style={{ padding: '9px 11px', textAlign: 'center', fontSize: 11, color: '#6b7280', borderBottom: '1px solid #e5e7eb' }}>操作</th>
          </tr></thead>
          <tbody>
            {filtered.map(c => <tr key={c.conversationId}>
              {active.map(col => <td key={col.key} style={{ padding: '9px 11px', fontSize: 12, color: '#334155', borderBottom: '1px solid #f5f5f5' }}>{cell(c, col.key)}</td>)}
              <td style={{ padding: '9px 11px', textAlign: 'center', borderBottom: '1px solid #f5f5f5' }}>
                <button onClick={() => handleDelete(c.conversationId)} style={{ padding: '3px 6px', borderRadius: 4, background: '#fef2f2', color: '#dc2626', border: 'none', cursor: 'pointer' }}><Trash2 size={12} /></button>
              </td>
            </tr>)}
          </tbody>
        </table>
        {filtered.length === 0 && <div style={{ padding: 28, textAlign: 'center', color: '#9ca3af', fontSize: 12 }}>无匹配数据</div>}
      </div>
    </div>
  );
}
