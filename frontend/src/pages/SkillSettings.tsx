import { useState, useEffect, useCallback } from 'react';
import { Wrench, Plus, Trash2, ToggleLeft, ToggleRight, RefreshCw, X } from 'lucide-react';
import apiClient from '../api/client';

interface Skill {
  id: string;
  name: string;
  description: string;
  category: string;
  type: 'builtin' | 'custom';
  config: Record<string, unknown>;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

interface NewSkillForm {
  name: string;
  description: string;
  category: string;
  type: 'builtin' | 'custom';
}

const EMPTY_FORM: NewSkillForm = { name: '', description: '', category: 'general', type: 'custom' };

const CAT_LABELS: Record<string, string> = {
  all: '全部', search: '搜索', code: '代码', data: '数据',
  vision: '视觉', memory: '记忆', text: '文本',
  planning: '规划', automation: '自动化', general: '通用',
};

export function SkillSettings() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState('all');
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<NewSkillForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await apiClient.get('/skills');
      setSkills(res.data.data as Skill[]);
    } catch (e: any) {
      setError(e?.response?.data?.error || e.message || '加载失败');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const categories = ['all', ...Array.from(new Set(skills.map(s => s.category)))];
  const filtered = activeCategory === 'all' ? skills : skills.filter(s => s.category === activeCategory);
  const enabledCount = skills.filter(s => s.enabled).length;

  async function handleToggle(skill: Skill) {
    if (busyId) return;
    setBusyId(skill.id);
    try {
      await apiClient.patch(`/skills/${skill.id}/enabled`, { enabled: !skill.enabled });
      setSkills(prev => prev.map(s => s.id === skill.id ? { ...s, enabled: !s.enabled } : s));
    } catch (e: any) { alert('操作失败：' + (e?.response?.data?.error || e.message)); }
    finally { setBusyId(null); }
  }

  async function handleDelete(skill: Skill) {
    if (busyId) return;
    if (!confirm(`确定删除技能「${skill.name}」？`)) return;
    setBusyId(skill.id);
    try {
      await apiClient.delete(`/skills/${skill.id}`);
      setSkills(prev => prev.filter(s => s.id !== skill.id));
    } catch (e: any) { alert('删除失败：' + (e?.response?.data?.error || e.message)); }
    finally { setBusyId(null); }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { alert('技能名称不能为空'); return; }
    setSaving(true);
    try {
      const res = await apiClient.post('/skills', { ...form, config: {}, enabled: true });
      setSkills(prev => [res.data.data, ...prev]);
      setShowAdd(false); setForm(EMPTY_FORM);
    } catch (e: any) { alert('创建失败：' + (e?.response?.data?.error || e.message)); }
    finally { setSaving(false); }
  }

  const catLabel = (c: string) => CAT_LABELS[c] || c;

  return (
    <>
      <style>{`
        .ss-wrap{width:100%;flex:1;min-height:0;display:flex;flex-direction:column;
          font-family:"Microsoft YaHei","Segoe UI",sans-serif;background:#f5f7fa;
          padding:16px;box-sizing:border-box;overflow:hidden}
        .ss-shell{flex:1;min-height:0;display:flex;flex-direction:column;
          background:#fafbfc;border:1px solid #e5e6eb;border-radius:12px;
          box-shadow:0 1px 4px rgba(0,0,0,.05);overflow:hidden}
        .ss-header{padding:16px 32px;min-height:58px;border-bottom:1px solid #e5e6eb;background:#fff;
          display:flex;align-items:center;justify-content:space-between;flex-shrink:0;box-sizing:border-box}
        .ss-header-left{display:flex;align-items:center;gap:10px}
        .ss-btn{display:flex;align-items:center;gap:6px;padding:8px 16px;border-radius:8px;
          border:none;background:#2a3b4d;color:#fff;font-weight:600;font-size:13px;
          cursor:pointer;font-family:inherit;transition:background .15s}
        .ss-btn:hover{background:#1e2d3d}
        .ss-btn-icon{background:none;border:none;cursor:pointer;color:#aaa;padding:4px;
          display:flex;align-items:center;transition:color .15s}
        .ss-btn-icon:hover{color:#2a3b4d}
        .ss-filter{display:flex;align-items:center;gap:8px;padding:12px 32px;
          border-bottom:1px solid #f0f0f0;background:#fff;flex-shrink:0;flex-wrap:wrap}
        .ss-cat{padding:5px 14px;border-radius:20px;font-size:13px;cursor:pointer;
          border:1px solid #e5e7eb;background:#fff;color:#4a5568;
          transition:all .15s;user-select:none}
        .ss-cat.active{background:#2a3b4d;border-color:#2a3b4d;color:#fff}
        .ss-cat:hover:not(.active){border-color:#2a3b4d;color:#2a3b4d}
        .ss-scroll{flex:1;overflow-y:auto;padding:20px 32px}
        .ss-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}
        @media(max-width:640px){.ss-grid{grid-template-columns:1fr}}
        .ss-card{display:flex;align-items:center;gap:16px;padding:16px 20px;
          background:#fff;border:1px solid #e5e5e5;border-radius:12px;
          transition:border-color .15s,box-shadow .15s}
        .ss-card:hover{border-color:#b0b0b0;box-shadow:0 2px 10px rgba(0,0,0,.05)}
        .ss-card-info{flex:1;min-width:0}
        .ss-card-name{font-size:14px;font-weight:600;color:#333;
          display:flex;align-items:center;gap:8px;margin-bottom:4px}
        .ss-card-cat{font-size:11px;padding:2px 8px;border-radius:4px;
          background:#f0f4f8;color:#4a5568;font-weight:400}
        .ss-card-type{font-size:11px;padding:2px 8px;border-radius:4px;
          background:#e8f5e9;color:#388e3c;font-weight:400}
        .ss-card-desc{font-size:13px;color:#666;line-height:1.5;
          white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .ss-card-actions{display:flex;align-items:center;gap:12px;flex-shrink:0}
        .ss-toggle{cursor:pointer;display:flex;align-items:center;opacity:1;
          transition:opacity .15s}
        .ss-toggle.busy{opacity:.4;pointer-events:none}
        .ss-del{cursor:pointer;color:#ccc;transition:color .15s;
          display:flex;align-items:center;background:none;border:none;padding:0}
        .ss-del:hover{color:#e53e3e}
        .ss-del:disabled{opacity:.4;pointer-events:none}
        /* Add modal */
        .ss-overlay{position:fixed;inset:0;background:rgba(0,0,0,.45);
          display:flex;align-items:center;justify-content:center;z-index:1000}
        .ss-modal{background:#fff;border-radius:12px;width:420px;max-width:95vw;
          padding:24px;box-shadow:0 8px 40px rgba(0,0,0,.2)}
        .ss-modal-title{font-size:16px;font-weight:700;color:#1a202c;margin-bottom:16px;
          display:flex;justify-content:space-between;align-items:center}
        .ss-field{margin-bottom:14px}
        .ss-label{font-size:13px;font-weight:600;color:#374151;margin-bottom:6px;display:block}
        .ss-input,.ss-textarea,.ss-select{
          width:100%;padding:8px 12px;border:1px solid #d1d5db;border-radius:8px;
          font-size:14px;font-family:inherit;box-sizing:border-box;color:#1f2937;outline:none}
        .ss-input:focus,.ss-textarea:focus,.ss-select:focus{border-color:#2a3b4d}
        .ss-textarea{min-height:72px;resize:vertical}
        .ss-modal-btns{display:flex;gap:10px;justify-content:flex-end;margin-top:20px}
        .ss-btn-cancel{padding:8px 18px;border-radius:8px;border:1px solid #d1d5db;
          background:#fff;color:#374151;font-size:13px;cursor:pointer;font-family:inherit}
        .ss-btn-cancel:hover{background:#f9fafb}
        .ss-empty{text-align:center;color:#aaa;padding:40px 0;font-size:14px}
        .ss-error{color:#e53e3e;font-size:13px;padding:12px 0}
        .ss-loading{display:flex;align-items:center;justify-content:center;
          padding:40px 0;color:#6b7280;gap:8px}
        @media(max-width:768px){.ss-scroll{padding:16px}
          .ss-header{padding:14px 16px}.ss-filter{padding:10px 16px}}
      `}</style>

      <div className="ss-wrap">
        <div className="ss-shell">
          {/* Header */}
          <div className="ss-header">
            <div className="ss-header-left">
              <Wrench size={18} color="#2a3b4d" />
              <div>
                <span style={{ fontWeight: 700, fontSize: 16, color: '#1a202c' }}>技能设置</span>
                <span style={{ fontSize: 12, color: '#9ca3af', marginLeft: 10 }}>
                  共 {skills.length} 个 · 已启用 {enabledCount} 个
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button className="ss-btn-icon" onClick={load} title="刷新">
                <RefreshCw size={15} />
              </button>
              <button className="ss-btn" onClick={() => setShowAdd(true)}>
                <Plus size={14} /> 添加技能
              </button>
            </div>
          </div>

          {/* Category filter */}
          <div className="ss-filter">
            {categories.map(cat => (
              <span
                key={cat}
                className={`ss-cat${activeCategory === cat ? ' active' : ''}`}
                onClick={() => setActiveCategory(cat)}
              >
                {catLabel(cat)}
              </span>
            ))}
          </div>

          {/* Skill list */}
          <div className="ss-scroll">
            {loading ? (
              <div className="ss-loading">
                <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} />
                加载中…
              </div>
            ) : error ? (
              <div className="ss-error">⚠ {error}
                <button onClick={load} style={{ marginLeft: 10, color: '#2a3b4d', cursor: 'pointer', background: 'none', border: 'none', fontSize: 13 }}>重试</button>
              </div>
            ) : (
              <div className="ss-grid">
                {filtered.length === 0 ? (
                  <div className="ss-empty" style={{ gridColumn: '1/-1' }}>
                    {activeCategory === 'all' ? '暂无技能，点击「添加技能」创建第一个' : '该分类下暂无技能'}
                  </div>
                ) : filtered.map(skill => (
                  <div key={skill.id} className="ss-card">
                    <div className="ss-card-info">
                      <div className="ss-card-name">
                        {skill.name}
                        <span className="ss-card-cat">{catLabel(skill.category)}</span>
                        {skill.type === 'custom' && (
                          <span className="ss-card-type">自定义</span>
                        )}
                      </div>
                      <div className="ss-card-desc" title={skill.description}>
                        {skill.description || '暂无描述'}
                      </div>
                    </div>
                    <div className="ss-card-actions">
                      <span
                        className={`ss-toggle${busyId === skill.id ? ' busy' : ''}`}
                        onClick={() => handleToggle(skill)}
                        title={skill.enabled ? '点击禁用' : '点击启用'}
                      >
                        {skill.enabled
                          ? <ToggleRight size={26} color="#4299e1" />
                          : <ToggleLeft size={26} color="#cbd5e0" />
                        }
                      </span>
                      <button
                        className="ss-del"
                        onClick={() => handleDelete(skill)}
                        disabled={!!busyId}
                        title="删除技能"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add skill modal */}
      {showAdd && (
        <div className="ss-overlay" onClick={e => { if (e.target === e.currentTarget) { setShowAdd(false); setForm(EMPTY_FORM); } }}>
          <div className="ss-modal">
            <div className="ss-modal-title">
              添加技能
              <button className="ss-btn-icon" onClick={() => { setShowAdd(false); setForm(EMPTY_FORM); }}>
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="ss-field">
                <label className="ss-label">技能名称 <span style={{ color: '#e53e3e' }}>*</span></label>
                <input
                  className="ss-input"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="例：搜索增强、代码审查…"
                  maxLength={50}
                  autoFocus
                />
              </div>
              <div className="ss-field">
                <label className="ss-label">描述</label>
                <textarea
                  className="ss-textarea"
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="描述该技能的功能和适用场景…"
                  maxLength={300}
                />
              </div>
              <div className="ss-field">
                <label className="ss-label">分类</label>
                <select
                  className="ss-select"
                  value={form.category}
                  onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                >
                  <option value="general">通用</option>
                  <option value="search">搜索</option>
                  <option value="code">代码</option>
                  <option value="data">数据</option>
                  <option value="text">文本</option>
                  <option value="vision">视觉</option>
                  <option value="memory">记忆</option>
                  <option value="planning">规划</option>
                  <option value="automation">自动化</option>
                </select>
              </div>
              <div className="ss-modal-btns">
                <button type="button" className="ss-btn-cancel" onClick={() => { setShowAdd(false); setForm(EMPTY_FORM); }}>
                  取消
                </button>
                <button type="submit" className="ss-btn" disabled={saving}>
                  {saving ? '创建中…' : '创建技能'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
      `}</style>
    </>
  );
}
