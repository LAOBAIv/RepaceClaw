/**
 * AgentChannelOverview — 智能体通道管理页面
 *
 * [2026-05-23] 重构：列表形式展示 OC agent 通道
 * 列：执行通道(类型) | OC 智能体通道 | 模型渠道 | 模型 ID | 关联 RC 智能体 | 操作
 */
import { useState, useEffect } from 'react';
import apiClient from '@/api/client';

interface RcAgent { id: string; name: string; color: string; }
interface Channel {
  ocAgentId: string; type: string; label: string;
  model: string; rcAgents: RcAgent[]; rcAgentCount: number;
  isSystem: boolean; editable: boolean;
}
interface ModelOption { id: string; label: string; provider: string; }

export function AgentChannelOverview() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [editId, setEditId] = useState<string | null>(null);
  const [editModel, setEditModel] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      const res = await apiClient.get('/agents/channel-overview');
      setChannels(res.data?.data || []);
    } catch (err) { console.error('[ChannelOverview]', err); }
    finally { setLoading(false); }
  }

  async function loadModels() {
    try {
      const [mRes, pRes] = await Promise.all([
        apiClient.get('/models'), apiClient.get('/model-providers'),
      ]);
      const provs = pRes.data?.data || [];
      const list = (mRes.data?.data || []).filter((m: { enabled?: boolean }) => m.enabled).map((m: { providerId?: string; name?: string }) => { // [2026-05-24] 类型安全
        const p = provs.find((x: { id?: string; name?: string }) => x.id === m.providerId);
        return { id: `${p?.name || ''}/${m.name}`, label: m.name, provider: p?.name || '' };
      });
      setModels(list);
    } catch (e) { console.warn("[RC]", e); }
  }

  useEffect(() => { load(); loadModels(); }, []);

  async function handleSave(ocAgentId: string) {
    setSaving(true);
    try {
      await apiClient.put(`/agents/channel/${ocAgentId}/model`, { model: editModel || 'auto' });
      setEditId(null);
      await load();
    } catch (err: unknown) { alert('保存失败: ' + ((err as { response?: { data?: { error?: string } } })?.response?.data?.error || (err as Error).message)); } // [2026-05-24] 类型安全
    finally { setSaving(false); }
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>加载通道数据...</div>;

  // 统计
  const systemChannels = channels.filter(c => c.isSystem);
  const userChannels = channels.filter(c => !c.isSystem);
  const totalRcAgents = channels.reduce((sum, c) => sum + c.rcAgents.filter(() => !c.isSystem).length, 0);
  // 置顶：系统通道在前
  const sortedChannels = [...systemChannels, ...userChannels];

  const th: React.CSSProperties = { padding: '10px 14px', textAlign: 'left', fontSize: 12, color: '#64748b', borderBottom: '1px solid #e5e7eb', fontWeight: 600 };
  const td: React.CSSProperties = { padding: '12px 14px', borderBottom: '1px solid #f1f5f9', fontSize: 13, verticalAlign: 'middle' };

  return (
    <div>
      <div style={{ padding: '12px 16px', borderRadius: 10, background: '#f8fafc', border: '1px solid #e2e8f0', marginBottom: 16, fontSize: 12, color: '#64748b', lineHeight: 1.7 }}>
        <b style={{ color: '#334155' }}>智能体通道管理</b>：管理执行通道与 OC 智能体的映射关系，平台级设置每个通道的模型渠道和模型 ID。
      </div>

      {/* 统计卡片 */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        {[
          { label: '总通道数', count: channels.length, color: '#475569', bg: '#f1f5f9' },
          { label: '系统通道', count: systemChannels.length, color: '#7c3aed', bg: '#faf5ff' },
          { label: '执行通道', count: userChannels.length, color: '#1d4ed8', bg: '#eff6ff' },
          { label: 'RC 智能体(非系统)', count: totalRcAgents, color: '#059669', bg: '#ecfdf5' },
        ].map(s => (
          <div key={s.label} style={{ flex: '1 1 100px', padding: '10px 14px', borderRadius: 10, background: s.bg, border: `1px solid ${s.color}22`, textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: s.color }}>{s.count}</div>
            <div style={{ fontSize: 11, color: s.color + 'aa', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f8fafc' }}>
              <th style={th}>执行通道</th>
              <th style={th}>OC 智能体通道</th>
              <th style={th}>模型渠道</th>
              <th style={th}>模型 ID</th>
              <th style={th}>关联 RC 智能体</th>
              <th style={{ ...th, textAlign: 'center' }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {sortedChannels.map(ch => {
              const [provider, modelId] = ch.model?.includes('/') ? ch.model.split('/', 2) : ['', ch.model || ''];
              const isEditing = editId === ch.ocAgentId;
              return (
                <tr key={ch.ocAgentId} style={{ background: ch.isSystem ? '#faf5ff08' : undefined }}>
                  <td style={td}>
                    <div style={{ fontWeight: 600, color: '#1e293b' }}>{ch.label}</div>
                    {ch.isSystem && <span style={{ fontSize: 10, color: '#7c3aed' }}>系统</span>}
                  </td>
                  <td style={td}>
                    <code style={{ fontSize: 11, color: '#475569', background: '#f1f5f9', padding: '2px 6px', borderRadius: 4 }}>{ch.ocAgentId}</code>
                  </td>
                  <td style={td}>
                    {isEditing ? null : <span style={{ color: '#1d4ed8', fontWeight: 500 }}>{provider || '-'}</span>}
                  </td>
                  <td style={td}>
                    {isEditing ? (
                      <select value={editModel} onChange={e => setEditModel(e.target.value)}
                        style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #e5e7eb', fontSize: 12 }}>
                        <option value="auto">自动选择</option>
                        {models.map(m => <option key={m.id} value={m.id}>{m.provider}/{m.label}</option>)}
                      </select>
                    ) : <span style={{ fontWeight: 500, color: '#334155' }}>{modelId || '-'}</span>}
                  </td>
                  <td style={td}>
                    {ch.rcAgentCount === 0 ? (
                      <span style={{ color: '#d1d5db', fontSize: 11 }}>暂无</span>
                    ) : (
                      <span style={{ fontSize: 12, color: '#334155' }}>
                        <b>{ch.rcAgentCount}</b> 个智能体
                        <span style={{ color: '#9ca3af', marginLeft: 6 }}>
                          {new Set(ch.rcAgents.map((a: { userId?: string }) => a.userId).filter(Boolean)).size} 个用户 // [2026-05-24] 类型安全
                        </span>
                      </span>
                    )}
                  </td>
                  <td style={{ ...td, textAlign: 'center' }}>
                    {isEditing ? (
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                        <button onClick={() => setEditId(null)} style={{ padding: '4px 10px', borderRadius: 5, border: '1px solid #e5e7eb', background: '#fff', fontSize: 11, cursor: 'pointer' }}>取消</button>
                        <button onClick={() => handleSave(ch.ocAgentId)} disabled={saving}
                          style={{ padding: '4px 10px', borderRadius: 5, border: 'none', background: '#3b82f6', color: '#fff', fontSize: 11, cursor: 'pointer' }}>
                          {saving ? '...' : '保存'}</button>
                      </div>
                    ) : (
                      <button onClick={() => { setEditId(ch.ocAgentId); setEditModel(ch.model); }}
                        style={{ padding: '4px 10px', borderRadius: 5, border: '1px solid #e5e7eb', background: '#fff', fontSize: 11, cursor: 'pointer', color: '#374151' }}>编辑</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
