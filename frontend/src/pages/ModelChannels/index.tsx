import { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { apiClient } from '../../api/client';
import { Channel, TestResult, PRESETS, emptyForm, FormState } from './constants';
import { ChannelList } from './ChannelList';
import { ChannelModal } from './ChannelModal';

interface ModelItem {
  id: string;
  modelId: string;
  providerId: string;
  enabled: boolean;
  providerName?: string;
  providerBaseUrl?: string;
}

interface Provider {
  id: string;
  name: string;
  baseUrl: string;
}

export function ModelChannels() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<FormState>({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [testResults, setTestResults] = useState<Record<string, TestResult & { loading?: boolean }>>({});
  const [hint, setHint] = useState('');
  const [saveMsg, setSaveMsg] = useState('');
  const [editingProvider, setEditingProvider] = useState<string | null>(null);
  const [showApiKey, setShowApiKey] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [, setIsCustom] = useState(false);
  const [models, setModels] = useState<ModelItem[]>([]);
  const [editingModel, setEditingModel] = useState<ModelItem | null>(null);
  const [showModelModal, setShowModelModal] = useState(false);

  const fetchChannels = async () => {
    try { const res = await apiClient.get('/token-channels'); setChannels(res.data.data || []); }
    catch { setChannels([]); } finally { setLoading(false); }
  };
  const fetchModels = async () => {
    try {
      const [mRes, pRes] = await Promise.all([apiClient.get('/models'), apiClient.get('/model-providers')]);
      const provs = pRes.data.data || [];
      // 建立 provider baseUrl -> channel id 的映射
      setModels((mRes.data.data || []).map((m: Record<string, unknown>) => {
        const prov = provs.find((p: Provider) => p.id === m.providerId);
        return { ...m, providerName: prov?.name || '', providerBaseUrl: prov?.baseUrl || '' };
      }));
    } catch { setModels([]); }
  };
  useEffect(() => { fetchChannels(); fetchModels(); }, []);

  const openAddModal = (presetIdx?: number) => {
    setEditingProvider(null); setForm({ ...emptyForm }); setSaveMsg('');
    setShowAdvanced(false); setShowApiKey(true);
    if (presetIdx !== undefined) {
      const p = PRESETS[presetIdx];
      setIsCustom(!p.provider);
      setForm(f => ({ ...f, provider: p.provider, modelName: p.modelName, baseUrl: p.baseUrl, authType: p.authType }));
      setHint(p.hint);
    } else { setIsCustom(true); setHint(''); }
    setShowModal(true);
  };

  const openEditModal = (ch: Channel) => {
    setEditingProvider(ch.provider); setHint(''); setShowAdvanced(false);
    setIsCustom(true); setShowApiKey(true);
    setForm({ provider: ch.provider, modelName: ch.modelName, baseUrl: ch.baseUrl, apiKey: ch.apiKey, authType: ch.authType, enabled: ch.enabled, priority: ch.priority, temperature: ch.temperature ?? 0.7, maxTokens: ch.maxTokens ?? 4096, topP: ch.topP ?? 1, frequencyPenalty: ch.frequencyPenalty ?? 0, presencePenalty: ch.presencePenalty ?? 0 });
    setSaveMsg(''); setShowModal(true);
  };

  const closeModal = () => { setShowModal(false); setEditingProvider(null); setForm({ ...emptyForm }); setSaveMsg(''); };

  const handleSave = async () => {
    if (!form.provider || !form.apiKey) { setSaveMsg('❌ 提供商和 API Key 不能为空'); return; }
    setSaving(true); setSaveMsg('');
    try {
      await apiClient.post('/token-channels', form); await fetchChannels();
      closeModal(); setSaveMsg('✅ 保存成功'); setTimeout(() => setSaveMsg(''), 3000);
    } catch (e: unknown) { // [2026-05-24] 类型安全
      const msg = (e as { response?: { data?: { error?: string } }; message?: string })?.response?.data?.error
        || (e as { message?: string })?.message || '未知错误';
      setSaveMsg(`❌ 保存失败：${msg}`);
    }
    finally { setSaving(false); }
  };

  const handleDelete = async (provider: string) => {
    if (!confirm(`确定删除渠道 "${provider}" 吗？`)) return;
    await apiClient.delete(`/token-channels/${provider}`); await fetchChannels();
  };

  const handleTest = async (ch: Channel) => {
    setTestResults(r => ({ ...r, [ch.id]: { loading: true, connected: false, statusCode: 0, latencyMs: null, note: '测试中...' } }));
    try { const res = await apiClient.post(`/token-channels/${ch.id}/test`); setTestResults(r => ({ ...r, [ch.id]: res.data.data })); }
    catch (e: unknown) { // [2026-05-24] 类型安全
      const msg = (e as { message?: string })?.message || '未知错误';
      setTestResults(r => ({ ...r, [ch.id]: { connected: false, statusCode: 0, latencyMs: null, note: msg } }));
    }
  };

  const toggleEnabled = async (ch: Channel) => {
    await apiClient.post('/token-channels', { ...ch, enabled: !ch.enabled }); fetchChannels();
  };

  const togglePreset = async (ch: Channel) => {
    try {
      await apiClient.post('/token-channels', { ...ch, isPreset: !ch.isPreset, enabled: true });
      await fetchChannels();
      setSaveMsg(ch.isPreset ? '✅ 已取消预设' : '✅ 已设为预设渠道');
      setTimeout(() => setSaveMsg(''), 2500);
    } catch (err: unknown) { // [2026-05-24] 类型安全
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        || (err as { message?: string })?.message || '未知错误';
      setSaveMsg('❌ 操作失败：' + msg);
      setTimeout(() => setSaveMsg(''), 4000);
    }
  };

  const handleToggleModel = async (model: ModelItem) => {
    try { await apiClient.put(`/models/${model.id}`, { enabled: !model.enabled }); fetchModels(); } catch (e) { console.warn("[ModelChannels]", e); }
  };
  const handleDeleteModel = async (model: ModelItem) => {
    if (!confirm(`确定删除模型 "${model.displayName || model.name}" 吗？`)) return;
    try { await apiClient.delete(`/models/${model.id}`); fetchModels(); } catch (e) { console.warn("[ModelChannels]", e); }
  };
  const handleEditModel = (model: ModelItem) => {
    setEditingModel(model);
    setShowModelModal(true);
  };
  const handleAddModel = async (channelBaseUrl: string, modelName: string) => {
    // 找到对应的 model_provider
    try {
      const pRes = await apiClient.get('/model-providers');
      const provs = pRes.data.data || [];
      const prov = provs.find((p: Provider) => p.baseUrl.replace(/\/$/, '') === channelBaseUrl.replace(/\/$/, ''));
      if (!prov) { setSaveMsg('❌ 找不到对应的 Provider'); setTimeout(() => setSaveMsg(''), 3000); return; }
      await apiClient.post('/models', { providerId: prov.id, name: modelName, displayName: modelName, contextWindow: 128000, maxTokens: 8192, capabilities: ['text'], enabled: true });
      fetchModels();
      setSaveMsg('✅ 模型已添加'); setTimeout(() => setSaveMsg(''), 2500);
    } catch (e: unknown) { // [2026-05-24] 类型安全
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error
        || (e as { message?: string })?.message || '未知错误';
      setSaveMsg('❌ 添加失败：' + msg); setTimeout(() => setSaveMsg(''), 4000);
    }
  };
  const handleSaveModel = async () => {
    if (!editingModel) return;
    try {
      await apiClient.put(`/models/${editingModel.id}`, { name: editingModel.name, displayName: editingModel.displayName, contextWindow: editingModel.contextWindow, maxTokens: editingModel.maxTokens, enabled: editingModel.enabled });
      fetchModels(); setShowModelModal(false); setEditingModel(null);
      setSaveMsg('✅ 模型已更新'); setTimeout(() => setSaveMsg(''), 2500);
    } catch (e: unknown) { // [2026-05-24] 类型安全
      const err = (e as { response?: { data?: { error?: unknown } } })?.response?.data?.error;
      const msg = typeof err === 'string' ? err : JSON.stringify(err);
      setSaveMsg('❌ 更新失败：' + msg);
      setTimeout(() => setSaveMsg(''), 4000);
    }
  };

  return (
    <div style={{ height: '100%', overflow: 'auto', padding: '28px 32px', background: 'var(--body-bg)' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>模型渠道</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '6px 0 0' }}>配置大模型 API 接入渠道</p>
        </div>
        <button onClick={() => openAddModal()} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
          <Plus size={15} /> 添加渠道
        </button>
      </div>

      {saveMsg && !showModal && <div style={{ marginBottom: 16, padding: '10px 16px', borderRadius: 8, fontSize: 13, fontWeight: 500, background: saveMsg.includes('✅') ? '#f0fdf4' : '#fef2f2', color: saveMsg.includes('✅') ? '#16a34a' : '#dc2626', border: `1px solid ${saveMsg.includes('✅') ? '#bbf7d0' : '#fecaca'}` }}>{saveMsg}</div>}

      {/* 快速添加卡片 */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 10 }}>快速添加</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10 }}>
          {PRESETS.map((p, idx) => (
            <button key={idx} onClick={() => openAddModal(idx)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '16px 12px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, cursor: 'pointer' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#2563eb'; e.currentTarget.style.background = '#eff6ff'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.background = '#fff'; }}>
              <span style={{ fontSize: 24 }}>{p.icon}</span>
              <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{p.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 渠道列表 */}
      {!loading && <ChannelList channels={channels} models={models} testResults={testResults} onTest={handleTest} onEdit={openEditModal} onTogglePreset={togglePreset} onToggleEnabled={toggleEnabled} onDelete={handleDelete} onToggleModel={handleToggleModel} onDeleteModel={handleDeleteModel} onEditModel={handleEditModel} onAddModel={handleAddModel} />}
      {!loading && channels.length === 0 && <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)', fontSize: 13 }}>还没有配置任何渠道，从上方预设中选择一个开始吧</div>}

      {/* Channel Modal */}
      {showModal && <ChannelModal form={form} setForm={setForm} editingProvider={editingProvider} hint={hint} showApiKey={showApiKey} setShowApiKey={setShowApiKey} showAdvanced={showAdvanced} setShowAdvanced={setShowAdvanced} saving={saving} saveMsg={saveMsg} onSave={handleSave} onClose={closeModal} />}

      {/* Model Edit Modal */}
      {showModelModal && editingModel && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => { setShowModelModal(false); setEditingModel(null); }}>
          <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 400, padding: '24px 28px' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>编辑模型</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div><label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#6b7280', marginBottom: 4 }}>模型 ID</label><input value={editingModel.name || ''} onChange={e => setEditingModel({ ...editingModel, name: e.target.value, displayName: e.target.value })} style={{ width: '100%', padding: '8px 11px', fontSize: 13, border: '1px solid #e5e7eb', borderRadius: 8, boxSizing: 'border-box' as const }} /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div><label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#6b7280', marginBottom: 4 }}>上下文窗口</label><input type="number" value={editingModel.contextWindow} onChange={e => setEditingModel({ ...editingModel, contextWindow: Number(e.target.value) })} style={{ width: '100%', padding: '8px 11px', fontSize: 13, border: '1px solid #e5e7eb', borderRadius: 8, boxSizing: 'border-box' as const }} /></div>
                <div><label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#6b7280', marginBottom: 4 }}>Max Tokens</label><input type="number" value={editingModel.maxTokens} onChange={e => setEditingModel({ ...editingModel, maxTokens: Number(e.target.value) })} style={{ width: '100%', padding: '8px 11px', fontSize: 13, border: '1px solid #e5e7eb', borderRadius: 8, boxSizing: 'border-box' as const }} /></div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button onClick={handleSaveModel} style={{ padding: '9px 20px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>保存</button>
              <button onClick={() => { setShowModelModal(false); setEditingModel(null); }} style={{ padding: '9px 16px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, cursor: 'pointer', fontSize: 14, color: '#6b7280' }}>取消</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
