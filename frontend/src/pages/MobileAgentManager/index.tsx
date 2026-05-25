/**
 * MobileAgentManager 主组件
 * 移动端智能体管理页面 - 暗色主题，竖向列表卡片布局
 * 支持编辑、删除、过滤平台助手
 */
import { useEffect, useState, useCallback } from 'react';
import { ArrowLeft, Trash2, AlertTriangle, Pencil, Plus, Bot, Cpu } from 'lucide-react';
import { useAgentStore } from '@/stores/agentStore';
import { Agent } from '@/types';
import { COLORS, AGENT_TYPE_OPTIONS } from './constants';
import { Props } from './types';
import { AgentAvatar } from './AgentAvatar';

/* ─────────────────────────────────────────────
 * 主组件
 * ───────────────────────────────────────────── */
export function MobileAgentManager({ onBack, onEdit, onCreate }: Props) {
  const { agents, loading, fetchAgents, deleteAgent } = useAgentStore();
  
  // 删除确认弹窗状态
  const [deleteTarget, setDeleteTarget] = useState<Agent | null>(null);
  const [deleting, setDeleting] = useState(false);
  
  // Toast 状态
  const [showToast, setShowToast] = useState<string | null>(null);

  // 初始化加载
  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  // 过滤掉平台助手
  const agentList = agents.filter(a =>
    !(a.id === '24cf6cc5-da0d-48df-814e-11582e398007'
      || a.id === 'platform-assistant'
      || a.id === 'repaceclaw-platform-assistant'
      || a.id === 'rc-wechat-agent'
      || (a.name && a.name.toLowerCase().includes('platform-assistant'))
      || (a.name && a.name === '微信助手'))
  );

  // 显示 Toast
  const toast = useCallback((msg: string) => {
    setShowToast(msg);
    setTimeout(() => setShowToast(null), 2000);
  }, []);

  // 删除智能体
  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteAgent(deleteTarget.id);
      toast('智能体已删除');
    } catch {
      toast('删除失败');
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }, [deleteTarget, deleteAgent, toast]);

  // 编辑智能体 - 跳转到编辑页面或使用回调
  const handleEdit = useCallback((agent: Agent) => {
    if (onEdit) {
      onEdit(agent.id);
    } else {
      // 默认跳转到创建页面带id参数
      window.location.href = `/mobile-agent-create?id=${agent.id}`;
    }
  }, [onEdit]);

  // 新建智能体
  const handleCreate = useCallback(() => {
    if (onCreate) {
      onCreate();
      return;
    }
    window.location.href = '/mobile-agent-create';
  }, [onCreate]);

  return (
    <div style={{
      minHeight: '100vh',
      background: COLORS.bgPrimary,
      color: COLORS.textPrimary,
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* ═══════════════════════════════════
       * 顶部导航栏
       * ═══════════════════════════════════ */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        padding: '12px 16px',
        background: COLORS.bgSecondary,
        borderBottom: `1px solid ${COLORS.border}`,
        gap: 12,
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}>
        <button onClick={onBack} style={{
          background: 'none',
          border: 'none',
          color: COLORS.textPrimary,
          cursor: 'pointer',
          padding: 4,
          display: 'flex',
          alignItems: 'center',
        }}>
          <ArrowLeft size={20} />
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
          <Bot size={18} color={COLORS.accent} />
          <span style={{ fontSize: 16, fontWeight: 600 }}>智能体管理</span>
        </div>
        <button
          onClick={handleCreate}
          style={{
            background: COLORS.accent,
            border: 'none',
            borderRadius: 8,
            padding: '8px 12px',
            color: '#fff',
            fontSize: 13,
            fontWeight: 500,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <Plus size={16} />
          新建
        </button>
      </div>

      {/* ═══════════════════════════════════
       * 列表区域
       * ═══════════════════════════════════ */}
      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        {/* 状态提示 */}
        <div style={{
          fontSize: 12,
          color: COLORS.textMuted,
          marginBottom: 12,
          padding: '0 4px',
        }}>
          {loading ? '加载中...' : `共 ${agentList.length} 个智能体`}
        </div>

        {/* 智能体列表 */}
        {loading ? (
          <div style={{
            padding: 60,
            textAlign: 'center',
            color: COLORS.textMuted,
            fontSize: 13,
          }}>
            加载中...
          </div>
        ) : agentList.length === 0 ? (
          <div style={{
            padding: 60,
            textAlign: 'center',
            color: COLORS.textMuted,
            fontSize: 13,
            background: COLORS.bgSecondary,
            borderRadius: 12,
            border: `1px dashed ${COLORS.border}`,
          }}>
            暂无智能体，点击右上角创建
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {agentList.map(agent => (
              <div
                key={agent.id}
                style={{
                  background: COLORS.bgSecondary,
                  borderRadius: 12,
                  border: `1px solid ${COLORS.border}`,
                  padding: 14,
                  transition: 'border-color 0.2s',
                }}
              >
                {/* 顶部：头像 + 名称 + 操作按钮 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                  <AgentAvatar agent={agent} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 15,
                      fontWeight: 600,
                      color: COLORS.textPrimary,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}>
                      {agent.name}
                    </div>
                    <div style={{
                      fontSize: 12,
                      color: COLORS.textMuted,
                      marginTop: 2,
                    }}>
                      {AGENT_TYPE_OPTIONS[agent.agentType || 'general'] || agent.agentType}
                    </div>
                  </div>
                  
                  {/* 操作按钮 */}
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      onClick={() => handleEdit(agent)}
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 8,
                        border: `1px solid ${COLORS.border}`,
                        background: COLORS.bgTertiary,
                        color: COLORS.textSecondary,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.2s',
                      }}
                      title="编辑"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => setDeleteTarget(agent)}
                      disabled={!!agent.isSystem}
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 8,
                        border: `1px solid ${COLORS.border}`,
                        background: agent.isSystem ? COLORS.bgTertiary : '#2a1515',
                        color: agent.isSystem ? COLORS.textMuted : COLORS.danger,
                        cursor: agent.isSystem ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.2s',
                        opacity: agent.isSystem ? 0.5 : 1,
                      }}
                      title={agent.isSystem ? '系统智能体不可删除' : '删除'}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {/* 描述 */}
                {(agent.description || agent.systemPrompt) && (
                  <div style={{
                    fontSize: 13,
                    color: COLORS.textSecondary,
                    lineHeight: 1.5,
                    marginBottom: 10,
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}>
                    {agent.description || agent.systemPrompt}
                  </div>
                )}

                {/* 底部：模型信息 */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '8px 10px',
                  background: COLORS.bgTertiary,
                  borderRadius: 8,
                }}>
                  <Cpu size={12} color={COLORS.textMuted} />
                  {agent.tokenProvider && (
                    <span style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: COLORS.textSecondary,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      maxWidth: 80,
                    }}>
                      {agent.tokenProvider}
                    </span>
                  )}
                  {agent.tokenProvider && agent.modelName && (
                    <div style={{ width: 1, height: 10, background: COLORS.border }} />
                  )}
                  {agent.modelName && (
                    <span style={{
                      fontSize: 11,
                      color: COLORS.textMuted,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}>
                      {agent.modelName}
                    </span>
                  )}
                  {!agent.modelName && !agent.tokenProvider && (
                    <span style={{ fontSize: 11, color: COLORS.textMuted }}>
                      未配置模型
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════
       * 删除确认弹窗
       * ═══════════════════════════════════ */}
      {deleteTarget && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 1000,
          background: 'rgba(0,0,0,0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 20,
        }}>
          <div style={{
            background: COLORS.bgSecondary,
            borderRadius: 14,
            padding: 24,
            width: '100%',
            maxWidth: 320,
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}>
            {/* 图标 */}
            <div style={{
              width: 48,
              height: 48,
              borderRadius: '50%',
              background: '#2a1515',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <AlertTriangle size={24} color={COLORS.danger} />
            </div>
            
            {/* 标题 */}
            <div style={{ fontSize: 16, fontWeight: 600 }}>
              确认删除智能体
            </div>
            
            {/* 描述 */}
            <div style={{ fontSize: 13, color: COLORS.textSecondary, lineHeight: 1.6 }}>
              即将删除智能体 <strong style={{ color: COLORS.textPrimary }}>「{deleteTarget.name}」</strong>，删除后无法恢复。
            </div>
            
            {/* 按钮组 */}
            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                style={{
                  flex: 1,
                  height: 44,
                  borderRadius: 8,
                  border: `1px solid ${COLORS.border}`,
                  background: COLORS.bgTertiary,
                  color: COLORS.textPrimary,
                  fontSize: 14,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                取消
              </button>
              <button
                onClick={handleDeleteConfirm}
                disabled={deleting}
                style={{
                  flex: 1,
                  height: 44,
                  borderRadius: 8,
                  border: 'none',
                  background: COLORS.danger,
                  color: '#fff',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: deleting ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit',
                  opacity: deleting ? 0.6 : 1,
                }}
              >
                {deleting ? '删除中...' : '确认删除'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════
       * Toast 通知
       * ═══════════════════════════════════ */}
      {showToast && (
        <div style={{
          position: 'fixed',
          bottom: 80,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 300,
          background: COLORS.bgTertiary,
          borderRadius: 8,
          padding: '10px 20px',
          fontSize: 13,
          color: COLORS.textPrimary,
          boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
        }}>
          {showToast}
        </div>
      )}
    </div>
  );
}
