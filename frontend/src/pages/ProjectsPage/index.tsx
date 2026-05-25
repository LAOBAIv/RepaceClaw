/**
 * 项目列表页面
 * 包含项目列表展示、搜索筛选、创建/编辑/删除/归档功能
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { projectsApi } from '../../api/projects';
import { Project } from '../../types';
import { Plus, Search, Archive, Edit3, Trash2, Tag, Clock, Flag, ChevronRight } from 'lucide-react';
import { STATUS_MAP, PRIORITY_MAP } from './constants';
import { formatDate } from './utils';
import { ProjectModal } from './ProjectModal';

export function ProjectsPage() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [modal, setModal] = useState<{ type: 'create' | 'edit'; project?: Project } | null>(null);

  const fetchProjects = async () => {
    setLoading(true);
    try {
      const data = await projectsApi.list();
      setProjects(data);
    } catch (e: unknown) { // [2026-05-24] 类型安全
      console.error('获取项目列表失败', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchProjects(); }, []);

  const filtered = projects.filter(p => {
    if (filterStatus !== 'all' && p.status !== filterStatus) return false;
    if (search) {
      const q = search.toLowerCase();
      return p.title.toLowerCase().includes(q) || p.description.toLowerCase().includes(q) || p.tags.some(t => t.toLowerCase().includes(q));
    }
    return true;
  });

  const handleCreate = async (data: Partial<Project>) => {
    await projectsApi.create(data);
    fetchProjects();
  };

  const handleEdit = async (data: Partial<Project>) => {
    if (!modal?.project) return;
    await projectsApi.update(modal.project.id, data);
    fetchProjects();
  };

  const handleDelete = async (project: Project) => {
    if (!confirm(`确定要删除项目「${project.title}」吗？`)) return;
    try {
      await projectsApi.delete(project.id);
      fetchProjects();
    } catch { // [2026-05-24] 类型安全
      alert('删除失败');
    }
  };

  const handleArchive = async (project: Project) => {
    try {
      await projectsApi.update(project.id, { status: project.status === 'archived' ? 'active' : 'archived' });
      fetchProjects();
    } catch { // [2026-05-24] 类型安全
      alert('操作失败');
    }
  };

  return (
    <div style={{ padding: '20px 24px', overflowY: 'auto', height: '100%' }}>
      {/* 头部 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#111827' }}>项目列表</h1>
        <button
          onClick={() => setModal({ type: 'create' })}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 16px', borderRadius: 8, border: 'none',
            background: '#3b82f6', color: '#fff', fontSize: 14, fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <Plus size={16} /> 创建项目
        </button>
      </div>

      {/* 搜索 + 筛选 */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'center' }}>
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 8, background: '#fff',
        }}>
          <Search size={16} color="#9ca3af" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="搜索项目名称、描述、标签..."
            style={{ flex: 1, border: 'none', outline: 'none', fontSize: 14, background: 'transparent' }}
          />
        </div>
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          style={{
            padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 8,
            fontSize: 14, outline: 'none', background: '#fff', cursor: 'pointer',
          }}
        >
          <option value="all">全部状态</option>
          <option value="active">进行中</option>
          <option value="archived">已归档</option>
        </select>
      </div>

      {/* 统计 */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
        <div style={{
          flex: 1, padding: '14px 16px', borderRadius: 10, background: '#eff6ff',
          border: '1px solid #bfdbfe',
        }}>
          <div style={{ fontSize: 12, color: '#3b82f6', fontWeight: 600 }}>全部项目</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#1e40af' }}>{projects.length}</div>
        </div>
        <div style={{
          flex: 1, padding: '14px 16px', borderRadius: 10, background: '#f0fdf4',
          border: '1px solid #bbf7d0',
        }}>
          <div style={{ fontSize: 12, color: '#16a34a', fontWeight: 600 }}>进行中</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#166534' }}>{projects.filter(p => p.status === 'active').length}</div>
        </div>
        <div style={{
          flex: 1, padding: '14px 16px', borderRadius: 10, background: '#f3f4f6',
          border: '1px solid #e5e7eb',
        }}>
          <div style={{ fontSize: 12, color: '#6b7280', fontWeight: 600 }}>已归档</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#374151' }}>{projects.filter(p => p.status === 'archived').length}</div>
        </div>
      </div>

      {/* 列表 */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af' }}>加载中...</div>
      ) : filtered.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: 60, color: '#9ca3af',
          border: '2px dashed #d1d5db', borderRadius: 12,
        }}>
          {projects.length === 0 ? (
            <>
              <div style={{ fontSize: 16, marginBottom: 8 }}>还没有项目</div>
              <button
                onClick={() => setModal({ type: 'create' })}
                style={{
                  padding: '8px 20px', borderRadius: 8, border: 'none',
                  background: '#3b82f6', color: '#fff', fontSize: 14, cursor: 'pointer',
                }}
              >
                创建第一个项目
              </button>
            </>
          ) : (
            <div style={{ fontSize: 14 }}>没有匹配的项目</div>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filtered.map(project => {
            const st = STATUS_MAP[project.status] || STATUS_MAP.active;
            const pr = PRIORITY_MAP[project.priority || 'mid'];
            return (
              <div
                key={project.id}
                style={{
                  padding: '16px 20px', borderRadius: 12,
                  border: '1px solid #e5e7eb', background: '#fff',
                  cursor: 'pointer', transition: 'all 0.15s',
                  opacity: project.status === 'archived' ? 0.7 : 1,
                }}
                onClick={() => navigate(`/group-chat?projectId=${project.id}`)}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#93c5fd'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(59,130,246,0.1)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.boxShadow = 'none'; }}
              >
                {/* 第一行：标题 + 状态 + 操作 */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                    <span style={{
                      fontSize: 16, fontWeight: 700, color: '#111827',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {project.title}
                    </span>
                    <span style={{
                      fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 6,
                      color: st.color, background: st.bg, flexShrink: 0,
                    }}>
                      {st.label}
                    </span>
                    <span style={{
                      fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 6,
                      color: pr.color, background: '#fff', border: `1px solid ${pr.color}40`, flexShrink: 0,
                    }}>
                      <Flag size={10} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 2 }} />
                      {pr.label}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 4, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => setModal({ type: 'edit', project })}
                      title="编辑"
                      style={{
                        padding: '4px 8px', borderRadius: 6, border: 'none',
                        background: 'transparent', cursor: 'pointer', color: '#6b7280',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = '#f3f4f6'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      <Edit3 size={14} />
                    </button>
                    <button
                      onClick={() => handleArchive(project)}
                      title={project.status === 'archived' ? '恢复' : '归档'}
                      style={{
                        padding: '4px 8px', borderRadius: 6, border: 'none',
                        background: 'transparent', cursor: 'pointer', color: '#6b7280',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = '#f3f4f6'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      <Archive size={14} />
                    </button>
                    <button
                      onClick={() => handleDelete(project)}
                      title="删除"
                      style={{
                        padding: '4px 8px', borderRadius: 6, border: 'none',
                        background: 'transparent', cursor: 'pointer', color: '#ef4444',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = '#fef2f2'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {/* 第二行：描述 */}
                {project.description && (
                  <div style={{
                    fontSize: 13, color: '#6b7280', marginBottom: 8,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {project.description}
                  </div>
                )}

                {/* 第三行：标签 + 时间 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                  {project.tags.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Tag size={12} color="#9ca3af" />
                      {project.tags.map(tag => (
                        <span key={tag} style={{
                          fontSize: 11, padding: '1px 6px', borderRadius: 4,
                          background: '#f3f4f6', color: '#6b7280',
                        }}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#9ca3af' }}>
                    <Clock size={12} />
                    <span>更新于 {formatDate(project.updatedAt)}</span>
                  </div>
                  <ChevronRight size={14} color="#9ca3af" style={{ marginLeft: 'auto' }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 弹窗 */}
      {modal && (
        <ProjectModal
          initial={modal.type === 'edit' ? modal.project : undefined}
          onSave={modal.type === 'edit' ? handleEdit : handleCreate}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
