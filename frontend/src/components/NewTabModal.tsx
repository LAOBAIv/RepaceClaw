/**
 * 新建标签页弹窗（首页顶部 + 号触发）
 * 收集任务名称 + 选择智能体 → 创建全新会话
 */
import { useState } from 'react';
import { showToast } from '@/components/Toast';
import { useAgentStore } from '@/stores/agentStore';
import { useConversationStore } from '@/stores/conversation';
import { conversationsApi } from '@/api/conversations';

interface NewTabModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (convId: string, agentName: string, agentColor: string, title: string) => void;
}

export function NewTabModal({ open, onClose, onCreated }: NewTabModalProps) {
  const [taskName, setTaskName] = useState('');
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const { agents: allAgents } = useAgentStore();
  // ⚠️ 平台助手不在标签栏可选范围内（仅侧边栏入口可用）
  // ⚠️ 微信助手为全局智能体，不在新建会话列表中显示
  // [2026-05-23] 修复：用 isSystem + agentCode 多条件过滤，避免 UUID 不匹配
  const agents = allAgents.filter(a =>
    !a.isSystem &&
    !(a.id === '24cf6cc5-da0d-48df-814e-11582e398007'
      || a.id === 'platform-assistant'
      || a.id === 'repaceclaw-platform-assistant'
      || a.id === 'rc-wechat-agent'
      || a.agentCode === 'rc-wechat-agent')
  );

  if (!open) return null;

  const isProject = selectedAgentIds.length >= 2;

  function toggleAgent(agentId: string) {
    setSelectedAgentIds(prev =>
      prev.includes(agentId)
        ? prev.filter(id => id !== agentId)
        : [...prev, agentId]
    );
  }

  async function handleCreate() {
    if (!taskName.trim()) {
      showToast('请输入任务名称', 'warning');
      return;
    }
    if (selectedAgentIds.length === 0) {
      showToast('请至少选择一个智能体', 'warning');
      return;
    }

    setCreating(true);
    try {
      const selectedAgents = agents.filter(a => selectedAgentIds.includes(a.id));
      const mainAgent = selectedAgents[0];

      if (selectedAgentIds.length === 1 && (mainAgent.id === '24cf6cc5-da0d-48df-814e-11582e398007' || mainAgent.id === 'platform-assistant' || mainAgent.id === 'repaceclaw-platform-assistant')) {
        const panelId = await useConversationStore.getState().openPanel({
          agentId: mainAgent.id,
          agentName: mainAgent.name,
          agentColor: mainAgent.color ?? '#2563eb',
          initialMessage: taskName.trim(),
          forceNew: true,
        });
        if (panelId) {
          onCreated(panelId, mainAgent.name, mainAgent.color ?? '#2563eb', taskName.trim());
          showToast('平台助手会话创建成功', 'success');
        }
        resetAndClose();
      } else {
        // 调用后端创建会话+概述
        const result = await conversationsApi.createWithOverview({
          title: taskName.trim(),
          agentIds: selectedAgentIds,
          description: '',
        });

        // 创建前端 Panel（直接 setState）
        const panel = {
          id: result.id,
          conversationId: result.id,
          sessionCode: result.sessionCode,
          agentId: result.currentAgentId || mainAgent.id,
          currentAgentCode: result.currentAgentCode,
          agentIds: result.agentIds?.length ? result.agentIds : selectedAgentIds,
          agentName: mainAgent.name,
          agentColor: mainAgent.color ?? '#6366f1',
          messages: result.messages || [],
          isStreaming: false,
        };
        useConversationStore.setState(state => ({ openPanels: [...state.openPanels, panel] }));

        onCreated(result.id, mainAgent.name, mainAgent.color ?? '#6366f1', taskName.trim());
        showToast(`${isProject ? '协作项目' : '会话'}创建成功`, 'success');
        resetAndClose();
      }
    } catch (err: unknown) { // [2026-05-24] 类型安全
      console.error('[NewTabModal] 创建失败:', err);
      const apiErr = err as { response?: { data?: { error?: string } } };
      showToast('创建失败：' + (apiErr?.response?.data?.error || (err as Error)?.message || '未知错误'), 'error');
    } finally {
      setCreating(false);
    }
  }

  function resetAndClose() {
    setTaskName('');
    setSelectedAgentIds([]);
    onClose();
  }

  return (
    <div
      onClick={resetAndClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1200,
        backdropFilter: 'blur(3px)',
        WebkitBackdropFilter: 'blur(3px)',
        overflowY: 'auto',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff',
          borderRadius: 12,
          boxShadow: '0 24px 64px rgba(0,0,0,0.18), 0 4px 16px rgba(0,0,0,0.08)',
          width: 520,
          maxWidth: 'calc(100vw - 32px)',
          fontFamily: '"Microsoft YaHei","Segoe UI",sans-serif',
          animation: 'newTabModalIn 0.2s cubic-bezier(0.34,1.4,0.64,1)',
          overflow: 'hidden',
          position: 'relative',
          marginBottom: 32,
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '22px 28px 18px',
          borderBottom: '1px solid #f0f0f0',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 38, height: 38, borderRadius: 10,
              background: isProject
                ? 'linear-gradient(135deg,#8b5cf6,#6366f1)'
                : 'linear-gradient(135deg,#3b82f6,#06b6d4)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.8">
                <path d="M12 5v14M5 12h14"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#1a202c', lineHeight: 1.3 }}>
                新建{isProject ? '协作项目' : '会话'}
              </div>
              <div style={{ fontSize: 12, color: '#666', marginTop: 3, lineHeight: 1.4 }}>
                {isProject ? `${selectedAgentIds.length} 个智能体协作` : '选择智能体开始对话'}
              </div>
            </div>
          </div>
          <button
            onClick={resetAndClose}
            style={{
              width: 30, height: 30, borderRadius: 8,
              border: 'none', background: '#f3f4f6', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#9ca3af', fontSize: 18, lineHeight: 1,
              transition: 'background 0.15s, color 0.15s',
              flexShrink: 0,
            }}
          >×</button>
        </div>

        {/* Form */}
        <div style={{ padding: '24px 28px', maxHeight: '55vh', overflowY: 'auto' }}>
          {/* Title */}
          <div style={{ marginBottom: 16 }}>
            <label style={{
              display: 'flex', alignItems: 'center', gap: 2,
              fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 7,
            }}>
              任务名称<span style={{ color: '#ef4444', fontSize: 13, lineHeight: 1, marginLeft: 2 }}>*</span>
            </label>
            <input
              value={taskName}
              onChange={e => setTaskName(e.target.value)}
              placeholder="请输入任务名称"
              autoFocus
              style={{
                width: '100%', height: 44, padding: '0 16px',
                border: '1.5px solid #e5e7eb',
                borderRadius: 8, fontSize: 13, outline: 'none',
                background: '#fff', color: '#1a202c',
                fontFamily: '"Microsoft YaHei","Segoe UI",sans-serif',
                boxSizing: 'border-box',
                transition: 'border-color 0.15s, box-shadow 0.15s',
              }}
              onFocus={e => {
                e.currentTarget.style.borderColor = '#3b82f6';
                e.currentTarget.style.boxShadow = '0 0 0 3px rgba(59,130,246,0.12)';
              }}
              onBlur={e => {
                e.currentTarget.style.borderColor = '#e5e7eb';
                e.currentTarget.style.boxShadow = 'none';
              }}
            />
          </div>

          {/* Agent Selection */}
          <div>
            <label style={{
              fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 7,
              display: 'block',
            }}>
              选择智能体<span style={{ color: '#ef4444' }}>*</span>
              <span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 400, marginLeft: 6 }}>
                选2个自动升级为协作项目
              </span>
            </label>
            <div style={{
              display: 'flex', flexWrap: 'wrap', gap: 8,
              padding: '12px', background: '#f9fafb',
              borderRadius: 8, border: '1.5px solid #e5e7eb',
            }}>
              {agents.length === 0 ? (
                <div style={{ fontSize: 12, color: '#9ca3af', padding: '8px 0' }}>暂无可用智能体</div>
              ) : agents.map(agent => {
                const isSelected = selectedAgentIds.includes(agent.id);
                const ac = agent.color ?? '#6366f1';
                return (
                  <button
                    key={agent.id}
                    onClick={() => toggleAgent(agent.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '6px 12px', borderRadius: 20,
                      border: `1.5px solid ${isSelected ? ac : '#e5e7eb'}`,
                      background: isSelected ? ac + '15' : '#fff',
                      color: isSelected ? ac : '#6b7280',
                      fontSize: 12, fontWeight: isSelected ? 600 : 400,
                      cursor: 'pointer', transition: 'all 0.15s',
                      fontFamily: '"Microsoft YaHei","Segoe UI",sans-serif',
                    }}
                  >
                    <div style={{
                      width: 18, height: 18, borderRadius: '50%',
                      background: ac, display: 'flex', alignItems: 'center',
                      justifyContent: 'center', fontSize: 9, color: '#fff', fontWeight: 700,
                    }}>{agent.name.charAt(0)}</div>
                    {agent.name}
                    {isSelected && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                    )}
                  </button>
                );
              })}
            </div>
            {selectedAgentIds.length > 0 && (
              <div style={{
                marginTop: 8, fontSize: 12, fontWeight: 500,
                color: isProject ? '#7c3aed' : '#0369a1',
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '2px 8px', borderRadius: 4,
                  background: isProject ? '#ede9fe' : '#e0f2fe',
                }}>
                  已选 {selectedAgentIds.length} 个{isProject && '（协作模式）'}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', gap: 10, justifyContent: 'flex-end', alignItems: 'center',
          padding: '16px 28px 24px',
          borderTop: '1px solid #f0f0f0',
        }}>
          <button
            onClick={resetAndClose}
            style={{
              height: 40, padding: '0 24px', fontSize: 14, borderRadius: 8,
              border: '1.5px solid #e5e7eb', background: '#fff', cursor: 'pointer',
              color: '#6b7280', fontWeight: 500,
              fontFamily: '"Microsoft YaHei","Segoe UI",sans-serif',
            }}
          >取消</button>

          <button
            onClick={handleCreate}
            disabled={!taskName.trim() || selectedAgentIds.length === 0 || creating}
            style={{
              height: 40, padding: '0 28px', fontSize: 14, borderRadius: 8,
              border: 'none',
              background: isProject ? '#6366f1' : '#3b82f6',
              cursor: (!taskName.trim() || selectedAgentIds.length === 0 || creating) ? 'not-allowed' : 'pointer',
              color: '#fff', fontWeight: 600,
              fontFamily: '"Microsoft YaHei","Segoe UI",sans-serif',
              opacity: (!taskName.trim() || selectedAgentIds.length === 0 || creating) ? 0.6 : 1,
              boxShadow: isProject
                ? '0 2px 8px rgba(99,102,241,0.25)'
                : '0 2px 8px rgba(59,130,246,0.25)',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}
          >
            {creating ? (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" strokeDasharray="60" strokeDashoffset="20" style={{ animation: 'spin 1s linear infinite' }}/>
                </svg>
                创建中...
              </>
            ) : (
              <>创建{isProject ? '项目' : '会话'}</>
            )}
          </button>
        </div>

        <style>{`
          @keyframes newTabModalIn {
            from { opacity: 0; transform: scale(0.9) translateY(16px); }
            to   { opacity: 1; transform: scale(1) translateY(0); }
          }
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    </div>
  );
}
