import { useState } from 'react';
import { Loader2, TestTube2, CheckCircle2, XCircle, Pencil, Star, Trash2, ToggleLeft, ToggleRight, Plus } from 'lucide-react';
import { Channel, TestResult, actBtn, inp } from './constants';

interface Model {
  id: string;
  name: string;
  displayName: string;
  providerId: string;
  providerBaseUrl?: string;
  contextWindow: number;
  maxTokens: number;
  enabled: boolean;
}

interface Props {
  channels: Channel[];
  models: Model[];
  testResults: Record<string, TestResult & { loading?: boolean }>;
  onTest: (ch: Channel) => void;
  onEdit: (ch: Channel) => void;
  onTogglePreset: (ch: Channel) => void;
  onToggleEnabled: (ch: Channel) => void;
  onDelete: (provider: string) => void;
  onToggleModel: (model: Model) => void;
  onDeleteModel: (model: Model) => void;
  onEditModel: (model: Model) => void;
  onAddModel: (channelBaseUrl: string, modelName: string) => void;
}

export function ChannelList({ channels, models, testResults, onTest, onEdit, onTogglePreset, onToggleEnabled, onDelete, onToggleModel, onDeleteModel, onEditModel, onAddModel }: Props) {
  const [addingFor, setAddingFor] = useState<string | null>(null);
  const [newModelName, setNewModelName] = useState('');

  if (!channels.length) return null;

  const handleAdd = (baseUrl: string) => {
    if (!newModelName.trim()) return;
    onAddModel(baseUrl, newModelName.trim());
    setNewModelName('');
    setAddingFor(null);
  };

  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        已配置渠道与模型
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {channels.map(ch => {
          const tr = testResults[ch.id];
          const chBase = ch.baseUrl.replace(/\/$/, '');
          const chModels = models.filter(m => (m.providerBaseUrl || '').replace(/\/$/, '') === chBase);
          return (
            <div key={ch.id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
              {/* 渠道头部 */}
              <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: ch.enabled ? '#22c55e' : '#d1d5db' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)' }}>{ch.provider}</span>
                    <span style={{ fontSize: 12, background: ch.enabled ? '#dcfce7' : '#f3f4f6', color: ch.enabled ? '#16a34a' : '#9ca3af', padding: '2px 8px', borderRadius: 20 }}>{ch.enabled ? '启用' : '禁用'}</span>
                    {ch.isPreset && <span style={{ fontSize: 12, background: '#fef3c7', color: '#d97706', padding: '2px 8px', borderRadius: 20 }}>⭐ 预设</span>}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
                    {ch.baseUrl || 'OpenAI 默认'}{ch.apiKey && <span style={{ marginLeft: 8 }}>Key: {ch.apiKey.slice(0, 8)}...</span>}
                  </div>
                  {tr && (
                    <div style={{ marginTop: 6, fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, color: tr.loading ? '#6b7280' : tr.connected ? '#16a34a' : '#dc2626' }}>
                      {tr.loading ? <><Loader2 size={12} className="animate-spin" /> 测试中...</> : tr.connected ? <><CheckCircle2 size={12} /> {tr.note}{tr.latencyMs != null ? ` · ${tr.latencyMs}ms` : ''}</> : <><XCircle size={12} /> {tr.note}</>}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
                  <button onClick={() => onTest(ch)} style={actBtn('#f0fdf4', '#16a34a')} title="测试渠道连通性（请求 baseUrl/models 验证 API Key 是否有效）">{tr?.loading ? <Loader2 size={14} /> : <TestTube2 size={14} />}<span>测试</span></button>
                  <button onClick={() => onEdit(ch)} style={actBtn('#f5f3ff', '#7c3aed')}><Pencil size={14} /><span>编辑</span></button>
                  <button onClick={() => onTogglePreset(ch)} style={ch.isPreset ? actBtn('#fef3c7', '#d97706') : actBtn('#f5f3ff', '#7c3aed')}><Star size={14} fill={ch.isPreset ? '#d97706' : 'none'} /><span>{ch.isPreset ? '已预设' : '设预设'}</span></button>
                  <button onClick={() => onToggleEnabled(ch)} style={actBtn('#eff6ff', '#2563eb')}>{ch.enabled ? '禁用' : '启用'}</button>
                  <button onClick={() => onDelete(ch.provider)} style={actBtn('#fef2f2', '#dc2626')}><Trash2 size={14} /></button>
                </div>
              </div>
              {/* 模型列表 */}
              <div style={{ borderTop: '1px solid #f3f4f6', padding: '10px 18px', background: '#fafbfc' }}>
                <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>模型 ({chModels.length})</span>
                  <button onClick={() => setAddingFor(addingFor === ch.id ? null : ch.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#2563eb', fontSize: 11, display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Plus size={12} /> 添加模型
                  </button>
                </div>
                {addingFor === ch.id && (
                  <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                    <input value={newModelName} onChange={e => setNewModelName(e.target.value)} placeholder="输入模型 ID，如 qwen-plus" style={{ ...inp, flex: 1, padding: '5px 8px', fontSize: 12 }} onKeyDown={e => e.key === 'Enter' && handleAdd(ch.baseUrl)} />
                    <button onClick={() => handleAdd(ch.baseUrl)} style={{ padding: '5px 12px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>添加</button>
                  </div>
                )}
                {chModels.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {chModels.map(m => (
                      <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12, cursor: 'pointer' }} onClick={() => onEditModel(m)}>
                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: m.enabled ? '#22c55e' : '#d1d5db' }} />
                        <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{m.name}</span>
                        <button onClick={e => { e.stopPropagation(); onToggleModel(m); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: m.enabled ? '#16a34a' : '#9ca3af', display: 'flex' }}>
                          {m.enabled ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                        </button>
                        <button onClick={e => { e.stopPropagation(); onDeleteModel(m); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#dc2626', display: 'flex' }}>
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {chModels.length === 0 && !addingFor && <div style={{ fontSize: 11, color: '#d1d5db' }}>暂无模型</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
