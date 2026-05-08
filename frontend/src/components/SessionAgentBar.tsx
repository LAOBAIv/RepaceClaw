import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { conversationsApi } from '../api/conversations';
import apiClient from '../api/client';
import { useAgentStore } from '../stores/agentStore';

const TAG_COLOR_POOL = [
  { bg: '#eff6ff', border: '#bfdbfe', text: '#1d4ed8' },
  { bg: '#f0fdf4', border: '#bbf7d0', text: '#15803d' },
  { bg: '#fdf4ff', border: '#e9d5ff', text: '#7c3aed' },
  { bg: '#fff7ed', border: '#fed7aa', text: '#c2410c' },
  { bg: '#fef2f2', border: '#fecaca', text: '#b91c1c' },
];

/** 可用模型列表 */
const AVAILABLE_MODELS = [
  { id: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
  { id: 'glm-5', label: 'GLM-5' },
  { id: 'qwen3-max-2026-01-23', label: 'Qwen3 Max' },
  { id: 'qwen3.6-plus', label: 'Qwen3.6 Plus' },
  { id: 'kimi-k2.5', label: 'Kimi K2.5' },
  { id: 'MiniMax-M2.5', label: 'MiniMax M2.5' },
  { id: 'deepseek-chat', label: 'DeepSeek Chat' },
  { id: 'deepseek-reasoner', label: 'DeepSeek Reasoner' },
  { id: 'gpt-4o', label: 'GPT-4o' },
  { id: 'gpt-4.1', label: 'GPT-4.1' },
];

function getTagColor(tag: string) {
  let h = 0;
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) >>> 0;
  return TAG_COLOR_POOL[h % TAG_COLOR_POOL.length];
}

function getStorageKey(conversationId: string): string {
  return `repaceclaw-session-tags-${conversationId}`;
}

function loadSessionTags(conversationId: string): string[] {
  try {
    const saved = localStorage.getItem(getStorageKey(conversationId));
    return saved ? JSON.parse(saved) : [];
  } catch { return []; }
}

/**
 * 多智能体会话 Agent 栏组件
 * 显示当前会话的所有参与智能体和该会话的任务标签
 * ⚡ 标签按 conversationId 隔离
 */
export function SessionAgentBar({
  conversationId,
  participants,
  onParticipantsChange,
}: {
  conversationId: string;
  participants: { id: string; name: string; color: string }[];
  onParticipantsChange?: (conversation?: { id: string; agentIds: string[]; currentAgentId: string; agentId: string }) => void;
}) {
  const [loading, setLoading] = useState<string | null>(null);
  const [taskTags, setTaskTags] = useState<string[]>([]);

  /** 模型切换下拉状态 */
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [modelDropdownAgentId, setModelDropdownAgentId] = useState<string | null>(null);
  const modelDropdownRef = useRef<HTMLDivElement>(null);

  /** 获取 agents 数据 */
  const { agents, fetchAgents } = useAgentStore();

  // 按 conversationId 读取标签
  useEffect(() => {
    if (!conversationId) return;
    const loadTags = () => setTaskTags(loadSessionTags(conversationId));
    loadTags();
    const interval = setInterval(loadTags, 500);
    return () => clearInterval(interval);
  }, [conversationId]);

  async function handleRemoveAgent(agentId: string) {
    if (participants.length <= 1) return;
    setLoading(agentId);
    try {
      const updated = await conversationsApi.removeAgent(conversationId, agentId);
      onParticipantsChange?.(updated ? {
        id: updated.id,
        agentIds: updated.agentIds || [],
        currentAgentId: updated.currentAgentId,
        agentId: updated.agentId,
      } : undefined);
    } catch (err) {
      console.error('移除智能体失败:', err);
      alert('移除智能体失败');
    } finally {
      setLoading(null);
    }
  }

  /** 点击外部关闭模型切换下拉 */
  useEffect(() => {
    if (!showModelDropdown) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(e.target as Node)) {
        setShowModelDropdown(false);
        setModelDropdownAgentId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showModelDropdown]);

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '8px 16px', background: '#f8f9fb',
      borderBottom: '1px solid #e5e7eb', minHeight: 48, flexWrap: 'wrap',
    }}>
      {/* 参与智能体标签 */}
      <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 500, marginRight: 4 }}>
        智能体:
      </span>

      {participants.map(agent => (
        <div key={agent.id} style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '4px 6px 4px 4px', borderRadius: 20,
          background: agent.color + '18', border: `1.5px solid ${agent.color}44`,
        }}>
          <div style={{
            width: 24, height: 24, borderRadius: '50%',
            background: agent.color + '33',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: agent.color, fontWeight: 700, fontSize: 11,
          }}>
            {agent.name.charAt(0)}
          </div>
          <span style={{
            fontSize: 12, fontWeight: 500, color: '#374151',
            maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {agent.name}
          </span>
          {/* 模型标签 */}
          {(() => {
            const agentData = agents.find(a => a.id === agent.id);
            if (!agentData?.modelName) return null;
            return (
              <span
                onClick={(e) => { e.stopPropagation(); setModelDropdownAgentId(agent.id); setShowModelDropdown(true); }}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 2,
                  padding: '1px 6px', borderRadius: 8,
                  background: '#f3f4f6', border: '1px solid #e5e7eb',
                  fontSize: 10, color: '#6b7280', fontWeight: 500,
                  cursor: 'pointer', marginLeft: 4,
                  transition: 'all 0.15s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#e8f0ff'; e.currentTarget.style.borderColor = '#b8d4ff'; e.currentTarget.style.color = '#2563eb'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = '#f3f4f6'; e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.color = '#6b7280'; }}
                title="点击切换模型"
              >
                {agentData.modelName}
              </span>
            );
          })()}
          {participants.length > 1 && (
            <button
              onClick={() => handleRemoveAgent(agent.id)}
              disabled={loading === agent.id}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 18, height: 18, borderRadius: '50%', border: 'none',
                background: 'transparent', cursor: loading === agent.id ? 'not-allowed' : 'pointer',
                color: '#9ca3af', fontSize: 14, lineHeight: 1,
                transition: 'all 0.15s', opacity: loading === agent.id ? 0.5 : 1,
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#fee2e2'; e.currentTarget.style.color = '#dc2626'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#9ca3af'; }}
              title="移除此智能体"
            >
              {loading === agent.id ? '…' : '×'}
            </button>
          )}
        </div>
      ))}

      {/* 当前会话的任务标签 */}
      {taskTags.length > 0 && (
        <>
          <span style={{ width: 1, height: 20, background: '#e5e7eb', margin: '0 4px' }} />
          <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 500, marginRight: 4 }}>
            标签:
          </span>
          {taskTags.map(tag => {
            const c = getTagColor(tag);
            return (
              <span key={tag} style={{
                display: 'inline-flex', alignItems: 'center', gap: 3,
                fontSize: 11, padding: '2px 8px', borderRadius: 20,
                background: c.bg, color: c.text, border: `1px solid ${c.border}`,
                fontWeight: 500, lineHeight: 1.5,
              }}>
                {tag}
              </span>
            );
          })}
        </>
      )}

      {/* 多智能体标识 */}
      {participants.length > 1 && (
        <span style={{
          marginLeft: 'auto', fontSize: 11, padding: '2px 8px', borderRadius: 10,
          background: '#dbeafe', color: '#2563eb', fontWeight: 500,
        }}>
          多智能体协作 ({participants.length})
        </span>
      )}

      {/* 模型切换下拉 */}
      {showModelDropdown && modelDropdownAgentId && (() => {
        const targetAgent = agents.find(a => a.id === modelDropdownAgentId);
        if (!targetAgent) return null;
        return createPortal(
          <div
            ref={modelDropdownRef}
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'fixed', top: 80, left: '50%', transform: 'translateX(-50%)',
              background: '#fff', borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
              padding: 12, minWidth: 200, zIndex: 1000,
              fontFamily: 'inherit',
            }}
          >
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8, fontWeight: 500 }}>
              切换智能体模型
            </div>
            <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 10 }}>
              当前: {targetAgent.modelName || '未设置'}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {AVAILABLE_MODELS.map(model => {
                const isSelected = targetAgent.modelName === model.id;
                return (
                  <button
                    key={model.id}
                    onClick={async () => {
                      try {
                        await apiClient.put(`/agents/${targetAgent.id}`, { modelName: model.id });
                        await fetchAgents();
                        setShowModelDropdown(false);
                        setModelDropdownAgentId(null);
                      } catch (err) {
                        console.error('更新模型失败:', err);
                        alert('更新模型失败，请检查登录状态');
                      }
                    }}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '8px 12px', borderRadius: 8,
                      border: isSelected ? '1.5px solid #2563eb' : '1px solid #e5e7eb',
                      background: isSelected ? '#f0f5ff' : '#fff',
                      cursor: 'pointer', transition: 'all 0.15s',
                      fontSize: 13, color: isSelected ? '#2563eb' : '#374151',
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.background = '#f3f4f6';
                        e.currentTarget.style.borderColor = '#d1d5db';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.background = '#fff';
                        e.currentTarget.style.borderColor = '#e5e7eb';
                      }
                    }}
                  >
                    <span>{model.label}</span>
                    {isSelected && <span style={{ fontSize: 11 }}>✓</span>}
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => { setShowModelDropdown(false); setModelDropdownAgentId(null); }}
              style={{
                marginTop: 12, padding: '6px 12px', borderRadius: 8,
                border: '1px solid #e5e7eb', background: '#fff',
                fontSize: 12, color: '#6b7280', cursor: 'pointer',
                width: '100%', textAlign: 'center',
              }}
            >
              取消
            </button>
          </div>,
          document.body
        );
      })()}
    </div>
  );
}
