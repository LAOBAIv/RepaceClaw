/**
 * 向量记忆管理页面
 *
 * 功能：
 * - 记忆列表（表格，支持分页和筛选）
 * - 手动添加记忆（弹窗表单）
 * - 语义检索测试（输入框 → 展示结果 + 相似度分数）
 * - 统计面板（总记忆数/分类分布/高频召回）
 */

import { useState, useEffect, useCallback } from 'react';
import { Brain, Plus, Search, Trash2, Edit3 } from 'lucide-react';
import { memoriesApi, type MemoryRecord, type MemoryStats } from '@/api/memories';
import { showToast } from '@/components/Toast';

const CATEGORY_LABELS: Record<string, string> = {
  preference: '偏好',
  context: '上下文',
  fact: '事实',
  skill: '技能',
  other: '其他',
};

const SOURCE_LABELS: Record<string, string> = {
  manual: '手动',
  auto_extract: '自动提取',
  system: '系统',
};

const CATEGORY_COLORS: Record<string, string> = {
  preference: '#8b5cf6',
  context: '#3b82f6',
  fact: '#10b981',
  skill: '#f59e0b',
  other: '#6b7280',
};

export function MemoryManager() {
  const [memories, setMemories] = useState<MemoryRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<MemoryStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{ memoryId: string; score: number; content: string; title: string | null; category: string; importance: number }>>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingMemory, setEditingMemory] = useState<MemoryRecord | null>(null);
  const [page, setPage] = useState(1);
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [sourceFilter, setSourceFilter] = useState<string>('');

  const pageSize = 20;

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [memRes, statsRes] = await Promise.all([
        memoriesApi.list({
          limit: pageSize,
          offset: (page - 1) * pageSize,
          category: categoryFilter || undefined,
          source: sourceFilter || undefined,
        }),
        memoriesApi.getStats(),
      ]);
      setMemories(memRes.memories);
      setTotal(memRes.total);
      setStats(statsRes);
    } catch {
      showToast('加载失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [page, categoryFilter, sourceFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleSearch() {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    try {
      const res = await memoriesApi.search(searchQuery, { topK: 10 });
      setSearchResults(res.results);
    } catch {
      showToast('检索失败', 'error');
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('确定删除这条记忆吗？')) return;
    try {
      await memoriesApi.delete(id);
      showToast('已删除', 'success');
      loadData();
    } catch {
      showToast('删除失败', 'error');
    }
  }

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      {/* 页面标题 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Brain size={28} color="#6366f1" />
          <h2 style={{ margin: 0 }}>向量记忆管理</h2>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 16px', borderRadius: 8,
            background: '#6366f1', color: '#fff', border: 'none', cursor: 'pointer',
          }}
        >
          <Plus size={16} /> 添加记忆
        </button>
      </div>

      {/* 统计卡片 */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
          <StatCard label="总记忆数" value={stats.totalMemories} icon="🧠" />
          <StatCard label="已向量化" value={stats.totalVectors} icon="📊" />
          <StatCard label="分类数" value={stats.byCategory.length} icon="🏷️" />
          <StatCard label="来源数" value={stats.bySource.length} icon="📝" />
        </div>
      )}

      {/* 语义检索 */}
      <div style={{ marginBottom: 24, padding: 16, background: '#f8fafc', borderRadius: 12 }}>
        <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="输入查询文本进行语义检索..."
            style={{
              flex: 1, padding: '10px 14px', borderRadius: 8,
              border: '1px solid #e2e8f0', fontSize: 14,
            }}
          />
          <button
            onClick={handleSearch}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '10px 20px', borderRadius: 8,
              background: '#10b981', color: '#fff', border: 'none', cursor: 'pointer',
            }}
          >
            <Search size={16} /> 检索
          </button>
        </div>
        {searchResults.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {searchResults.map((r) => (
              <div key={r.memoryId} style={{
                padding: 12, background: '#fff', borderRadius: 8,
                border: '1px solid #e2e8f0',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{
                    padding: '2px 8px', borderRadius: 4, fontSize: 12,
                    background: CATEGORY_COLORS[r.category] || '#6b7280',
                    color: '#fff',
                  }}>
                    {CATEGORY_LABELS[r.category] || r.category}
                  </span>
                  <span style={{ fontSize: 12, color: '#6b7280' }}>
                    相关度: {(r.score * 100).toFixed(1)}%
                  </span>
                </div>
                <div style={{ fontSize: 14 }}>{r.title || r.content.slice(0, 100)}...</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 筛选栏 */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <select
          value={categoryFilter}
          onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0' }}
        >
          <option value="">全部分类</option>
          {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <select
          value={sourceFilter}
          onChange={(e) => { setSourceFilter(e.target.value); setPage(1); }}
          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0' }}
        >
          <option value="">全部来源</option>
          {Object.entries(SOURCE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>

      {/* 记忆列表 */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#6b7280' }}>加载中...</div>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {memories.map((m) => (
              <div key={m.id} style={{
                padding: 16, background: '#fff', borderRadius: 10,
                border: '1px solid #e2e8f0',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                      <span style={{
                        padding: '2px 8px', borderRadius: 4, fontSize: 12,
                        background: CATEGORY_COLORS[m.category] || '#6b7280',
                        color: '#fff',
                      }}>
                        {CATEGORY_LABELS[m.category] || m.category}
                      </span>
                      <span style={{
                        padding: '2px 8px', borderRadius: 4, fontSize: 12,
                        background: '#f1f5f9', color: '#64748b',
                      }}>
                        {SOURCE_LABELS[m.source] || m.source}
                      </span>
                      <span style={{ fontSize: 12, color: '#6b7280' }}>
                        重要性: {m.importance}/10
                      </span>
                    </div>
                    <div style={{ fontSize: 14, marginBottom: 4 }}>
                      {m.title || m.content.slice(0, 120)}{m.content.length > 120 ? '...' : ''}
                    </div>
                    <div style={{ fontSize: 12, color: '#94a3b8' }}>
                      召回 {m.accessCount} 次 · {new Date(m.createdAt).toLocaleDateString('zh-CN')}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => setEditingMemory(m)}
                      style={{ padding: 6, borderRadius: 6, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer' }}
                    >
                      <Edit3 size={14} />
                    </button>
                    <button
                      onClick={() => handleDelete(m.id)}
                      style={{ padding: 6, borderRadius: 6, border: '1px solid #fecaca', background: '#fff', cursor: 'pointer', color: '#ef4444' }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* 分页 */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 24 }}>
              <button
                disabled={page === 1}
                onClick={() => setPage(p => p - 1)}
                style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', cursor: page === 1 ? 'not-allowed' : 'pointer', opacity: page === 1 ? 0.5 : 1 }}
              >
                上一页
              </button>
              <span style={{ padding: '8px 16px', color: '#6b7280' }}>
                {page} / {totalPages}
              </span>
              <button
                disabled={page === totalPages}
                onClick={() => setPage(p => p + 1)}
                style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', cursor: page === totalPages ? 'not-allowed' : 'pointer', opacity: page === totalPages ? 0.5 : 1 }}
              >
                下一页
              </button>
            </div>
          )}
        </>
      )}

      {/* 添加/编辑弹窗 */}
      {(showAddModal || editingMemory) && (
        <MemoryModal
          memory={editingMemory}
          onClose={() => { setShowAddModal(false); setEditingMemory(null); }}
          onSave={() => {
            setShowAddModal(false);
            setEditingMemory(null);
            loadData();
          }}
        />
      )}
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: number; icon: string }) {
  return (
    <div style={{
      padding: 16, background: '#fff', borderRadius: 12,
      border: '1px solid #e2e8f0', textAlign: 'center',
    }}>
      <div style={{ fontSize: 24, marginBottom: 4 }}>{icon}</div>
      <div style={{ fontSize: 24, fontWeight: 600 }}>{value}</div>
      <div style={{ fontSize: 12, color: '#6b7280' }}>{label}</div>
    </div>
  );
}

function MemoryModal({ memory, onClose, onSave }: { memory: MemoryRecord | null; onClose: () => void; onSave: () => void }) {
  const [title, setTitle] = useState(memory?.title || '');
  const [content, setContent] = useState(memory?.content || '');
  const [category, setCategory] = useState(memory?.category || 'other');
  const [importance, setImportance] = useState(memory?.importance || 5);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!content.trim()) {
      showToast('内容不能为空', 'warning');
      return;
    }
    setSaving(true);
    try {
      if (memory) {
        await memoriesApi.update(memory.id, { title, content, category, importance });
        showToast('更新成功', 'success');
      } else {
        await memoriesApi.create({ title, content, category, importance });
        showToast('创建成功', 'success');
      }
      onSave();
    } catch {
      showToast(memory ? '更新失败' : '创建失败', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }} onClick={onClose}>
      <div style={{
        background: '#fff', borderRadius: 16, padding: 24,
        width: '100%', maxWidth: 500, maxHeight: '80vh', overflow: 'auto',
      }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 20px' }}>{memory ? '编辑记忆' : '添加记忆'}</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ display: 'block', marginBottom: 4, fontSize: 14, color: '#64748b' }}>标题</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="简短描述（可选）"
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #e2e8f0', boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 4, fontSize: 14, color: '#64748b' }}>内容 *</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="记忆内容..."
              rows={4}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #e2e8f0', resize: 'vertical', boxSizing: 'border-box' }}
            />
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', marginBottom: 4, fontSize: 14, color: '#64748b' }}>分类</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #e2e8f0', boxSizing: 'border-box' }}
              >
                {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', marginBottom: 4, fontSize: 14, color: '#64748b' }}>重要性</label>
              <input
                type="range"
                min={1}
                max={10}
                value={importance}
                onChange={(e) => setImportance(parseInt(e.target.value))}
                style={{ width: '100%' }}
              />
              <div style={{ textAlign: 'center', fontSize: 14 }}>{importance}/10</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <button onClick={onClose} style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer' }}>取消</button>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                padding: '10px 20px', borderRadius: 8, border: 'none',
                background: '#6366f1', color: '#fff', cursor: saving ? 'not-allowed' : 'pointer',
                opacity: saving ? 0.7 : 1,
              }}
            >
              {saving ? '保存中...' : (memory ? '更新' : '创建')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
