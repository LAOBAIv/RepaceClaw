import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';

import { useProjectStore } from '@/stores/projectStore';
import { useConversationStore } from '@/stores/conversationStore';
import { useAgentStore } from '@/stores/agentStore';
import { useTaskStore } from '@/stores/taskStore';
import { useProjectKanbanStore, type ProjectPriority } from '@/stores/projectKanbanStore';
import { showToast } from '@/components/Toast';
import { SessionAgentBar } from '@/components/SessionAgentBar';
import { NewTabModal } from '@/components/NewTabModal';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { conversationsApi } from '@/api/conversations';
import filesApi, { type FileAsset } from '@/api/files';

/* ── 浏览器标签页类型（与会话绑定） ── */
interface BrowserTab {
  key: string;
  title: string;
  conversationId?: string;  // 绑定的会话 ID（有则表示此标签有活跃会话）
  agentId?: string;         // 主智能体 ID
  agentName?: string;       // 智能体名称（标题显示用）
  color?: string;           // 智能体颜色
}

/** 可用的模型列表（用于 Tab 模型切换） */
const AVAILABLE_MODELS = [
  { id: 'claude-opus-4-6', label: 'Claude Opus 4.6', provider: 'anthropic' },
  { id: 'glm-5', label: 'GLM-5', provider: 'zhipu' },
  { id: 'glm-5.1', label: 'GLM-5.1', provider: 'zhipu' },
  { id: 'qwen3-max-2026-01-23', label: 'Qwen3 Max', provider: 'alibaba' },
  { id: 'qwen3.6-plus', label: 'Qwen3.6 Plus', provider: 'alibaba' },
  { id: 'kimi-k2.5', label: 'Kimi K2.5', provider: 'moonshot' },
  { id: 'minimax-m2.5', label: 'MiniMax M2.5', provider: 'minimax' },
  { id: 'doubao-pro-32k', label: 'Doubao Pro 32K', provider: 'doubao' },
  { id: 'qwen-max', label: 'Qwen Max', provider: 'alibaba' },
  { id: 'auto', label: '自动选择', provider: 'auto' },
];
import {
  SkillPanel,
  SchedulePanel,
  ShortcutPanel,
  TaskTagPanel,
  FUNCTION_TABS,
  CHANNEL_LIST,
  PRIORITY_OPTIONS,
  TAB_META,
  CHANNEL_TABS,
  CHANNEL_LABELS,
  getProgressColor,
  getTagColor,
  type ChannelType,
} from '@/components/workspace';

/* ─── 功能标签列表 ─────────────────────────────────────────── */
type FlowNodeType = 'serial' | 'parallel';
interface FlowNode {
  id: string;
  name: string;
  nodeType: FlowNodeType;
  agentIds: string[];
  desc: string;
}
function makeFlowNode(idx: number): FlowNode {
  return { id: `fn_${Date.now()}_${idx}`, name: `流程节点 ${idx + 1}`, nodeType: 'serial', agentIds: [], desc: '' };
}

/* ── 添加节点浮层菜单（Portal 挂到 body，zIndex 99999） ── */
function AddFlowNodeMenu({
  anchorRef,
  onAdd,
  onClose,
}: {
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  onAdd: (t: FlowNodeType) => void;
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    if (anchorRef.current) {
      const r = anchorRef.current.getBoundingClientRect();
      setPos({ left: r.left + r.width / 2, top: r.top });
    }
    function handler(e: MouseEvent) {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        anchorRef.current && !anchorRef.current.contains(e.target as Node)
      ) onClose();
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [anchorRef, onClose]);

  if (!pos) return null;
  const MENU_W = 260;

  return createPortal(
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        left: Math.max(8, pos.left - MENU_W / 2),
        top: pos.top - 10,
        transform: 'translateY(-100%)',
        zIndex: 99999,
        background: '#fff',
        border: '1px solid #e5e7eb',
        borderRadius: 10,
        boxShadow: '0 6px 24px rgba(0,0,0,0.13)',
        padding: 8,
        display: 'flex',
        gap: 8,
        width: MENU_W,
      }}
    >
      {/* 小三角（朝下） */}
      <div style={{ position: 'absolute', bottom: -6, left: '50%', transform: 'translateX(-50%)', width: 10, height: 6, overflow: 'hidden' }}>
        <div style={{ width: 10, height: 10, background: '#fff', border: '1px solid #e5e7eb', transform: 'rotate(45deg) translate(-3px,-3px)' }} />
      </div>

      <button
        onClick={() => { onAdd('serial'); onClose(); }}
        style={{
          flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
          padding: '10px 0', borderRadius: 8, border: '1.5px solid #e5e7eb',
          background: '#fff', cursor: 'pointer',
          fontFamily: '"Microsoft YaHei","Segoe UI",sans-serif', transition: 'all 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = '#374151'; e.currentTarget.style.background = '#f5f7fa'; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.background = '#fff'; }}
      >
        {/* ArrowDown SVG */}
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/>
        </svg>
        <span style={{ fontSize: 12, color: '#374151', fontWeight: 600 }}>下行节点</span>
        <span style={{ fontSize: 11, color: '#9ca3af' }}>串行向下执行</span>
      </button>

      <button
        onClick={() => { onAdd('parallel'); onClose(); }}
        style={{
          flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
          padding: '10px 0', borderRadius: 8, border: '1.5px solid #e5e7eb',
          background: '#fff', cursor: 'pointer',
          fontFamily: '"Microsoft YaHei","Segoe UI",sans-serif', transition: 'all 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = '#6366f1'; e.currentTarget.style.background = '#f5f3ff'; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.background = '#fff'; }}
      >
        {/* GitBranch SVG */}
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>
        </svg>
        <span style={{ fontSize: 12, color: '#374151', fontWeight: 600 }}>并行节点</span>
        <span style={{ fontSize: 11, color: '#9ca3af' }}>与上节点并行</span>
      </button>
    </div>,
    document.body
  );
}

/* ── 智能体多选弹窗（inline，挂到 TabPanel 内的 Portal） ── */
function AgentPickerModal({
  agentList,
  selected,
  onClose,
  onConfirm,
}: {
  agentList: import('../types').Agent[];
  selected: string[];
  onClose: () => void;
  onConfirm: (ids: string[]) => void;
}) {
  const [draft, setDraft] = useState<Set<string>>(() => new Set(selected));
  function toggle(id: string) {
    setDraft(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  }
  return createPortal(
    <div
      onMouseDown={e => e.stopPropagation()}
      onClick={e => { e.stopPropagation(); if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 99999,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backdropFilter: 'blur(3px)',
        WebkitBackdropFilter: 'blur(3px)',
        overflowY: 'auto',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 12,
          width: 660, maxWidth: 'calc(100vw - 32px)', maxHeight: 'calc(100vh - 96px)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.18), 0 4px 16px rgba(0,0,0,0.08)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          fontFamily: '"Microsoft YaHei","Segoe UI",sans-serif',
          marginBottom: 32,
        }}>
        {/* 头部 */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: '#1a202c' }}>
            选择智能体
            <span style={{ fontSize: 12, color: '#9ca3af', fontWeight: 400, marginLeft: 6 }}>已选 {draft.size} 个</span>

          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 2, fontSize: 18, lineHeight: 1 }}>×</button>
        </div>
        {/* 列表 */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
          {agentList.map(agent => {
            const sel = draft.has(agent.id);
            const ac = agent.color ?? '#6366f1';
            return (
              <div
                key={agent.id}
                onClick={() => toggle(agent.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 9,
                  padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
                  border: `1.5px solid ${sel ? ac : '#e5e7eb'}`,
                  background: sel ? ac + '0d' : '#fff',
                  transition: 'all 0.12s',
                }}
              >
                <div style={{
                  width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                  background: ac + '22', border: `1.5px solid ${ac}44`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: ac, fontWeight: 700, fontSize: 11,
                }}>{agent.name.charAt(0)}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: '#1a202c' }}>{agent.name}</div>
                  {agent.modelName && (
                    <div style={{ fontSize: 11, color: '#6366f1', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {agent.modelProvider ? `${agent.modelProvider} · ` : ''}{agent.modelName}
                      {agent.temperature != null ? ` · T=${agent.temperature}` : ''}
                      {agent.maxTokens != null ? ` · ${agent.maxTokens}tk` : ''}
                    </div>
                  )}
                </div>
                <div style={{
                  width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                  border: `1.5px solid ${sel ? ac : '#d1d5db'}`,
                  background: sel ? ac : '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {sel && <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1.5 5l2.5 2.5 4.5-4.5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                </div>
              </div>
            );
          })}
        </div>
        {/* 底部按钮 */}
        <div style={{ padding: '10px 16px', borderTop: '1px solid #f0f0f0', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} style={{ padding: '6px 16px', borderRadius: 7, border: '1px solid #d1d5db', background: '#fff', color: '#6b7280', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>取消</button>
          <button onClick={() => onConfirm([...draft])} style={{ padding: '6px 18px', borderRadius: 7, border: 'none', background: '#374151', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>确认</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function AgentPanel({
  agents,
  agentStatusMap,
  taskName,
  matchedProject,
  onInject,
  incomingAgentNames,
  openPanels,
  activePanelId,
  onSwitchPanel,
  onOpenPanel,
  onSwitchAgent,
  onClosePanel,
  currentProjectId,
  collabNodes,
  setCollabNodes,
  isProject,
  participatingAgentNames,
  onUpgradeToProject,
  onDowngradeToTask,
}: {
  agents?: import('../types').Agent[];
  agentStatusMap: Record<string, { label: string; color: string }>;
  taskName?: string;
  matchedProject?: import('../stores/projectKanbanStore').KanbanProject | null;
  onInject?: (text: string) => void;
  incomingAgentNames?: string[];
  openPanels: import('../types').ConversationPanel[];
  activePanelId: string | null;
  onSwitchPanel: (panelId: string) => void;
  onOpenPanel: (agentId: string, agentName: string, agentColor: string, initialMessage?: string) => void;
  onSwitchAgent: (agentId: string, agentName: string, agentColor: string) => void;
  onClosePanel: (panelId: string) => void;
  currentProjectId?: string;
  collabNodes: FlowNode[];
  setCollabNodes: React.Dispatch<React.SetStateAction<FlowNode[]>>;
  /** 当前是项目（true）还是任务（false），任务模式显示协作Tab但带升级入口 */
  isProject: boolean;
  /** 当前参与会话的智能体名称列表 */
  participatingAgentNames?: string[];
  /** 任务升级为项目回调 */
  onUpgradeToProject?: (newAgentNames: string[]) => void;
  /** 项目降级为任务回调 */
  onDowngradeToTask?: (keptAgentName: string) => void;
}) {
  const [subTab, setSubTab] = useState<'switch'|'collab'>('switch');

  /* ── 智能体列表 ── */
  const allAgents = agents ?? [];
  // 关键规则："切换智能体"必须能看到全部可用 agent，不能被看板传入的 incomingAgentNames 限制。
  // 否则从任务/会话列表进入时，弹窗通常只会剩当前那 1 个 agent，无法在同一 session 内切换到别的 agent。
  // incomingAgentNames 只适合做展示/默认关联，不适合限制切换候选池。
  const agentList = allAgents;

  /* ══════════ 协作 Tab：FlowNode 流程节点 ══════════ */
  // nodes/setNodes 是外层持久化状态的别名，关闭弹窗后数据不会丢失
  const nodes = collabNodes;
  const setNodes = setCollabNodes;
  const [pickerNodeId, setPickerNodeId] = useState<string | null>(null);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const addBtnRef = useRef<HTMLButtonElement>(null);

  function addNode(type: FlowNodeType) {
    setNodes(prev => {
      if (type === 'parallel') {
        let count = 0;
        for (let i = prev.length - 1; i >= 0; i--) {
          if (prev[i].nodeType === 'serial') { count++; break; }
          count++;
        }
        if (count >= 3) { showToast('同一层最多并行 3 个节点', 'warning'); return prev; }
      }
      return [...prev, {
        id: `fn_${Date.now()}`,
        name: `流程节点 ${prev.length + 1}`,
        nodeType: type,
        agentIds: [],
        desc: '',
      }];
    });
  }
  function removeNode(id: string) {
    setNodes(prev => prev.filter(n => n.id !== id));
  }
  function updateNode(id: string, patch: Partial<FlowNode>) {
    setNodes(prev => prev.map(n => n.id === id ? { ...n, ...patch } : n));
  }
  function moveNode(idx: number, dir: -1 | 1) {
    setNodes(prev => {
      const arr = [...prev];
      const t = idx + dir;
      if (t < 0 || t >= arr.length) return arr;
      [arr[idx], arr[t]] = [arr[t], arr[idx]];
      return arr;
    });
  }
  function confirmAgents(nodeId: string, ids: string[]) {
    updateNode(nodeId, { agentIds: ids });
    setPickerNodeId(null);
  }

  function applyCollab() {
    // 构建协作上下文：所有节点的概览（供每个智能体了解整体分工）
    const allNodes = nodes.filter(n => n.agentIds.length > 0);
    const contextLines = allNodes.map((n, i) => {
      const assignedNames = n.agentIds
        .map(id => allAgents.find(a => a.id === id)?.name ?? id)
        .join('、');
      const type = n.nodeType === 'parallel' ? '[并行]' : '[串行]';
      const desc = n.desc ? `：${n.desc}` : '';
      return `  ${i + 1}. ${type} ${n.name}（负责：${assignedNames}）${desc}`;
    }).join('\n');

    // 关闭不在协作列表中的面板
    const allAgentIds = [...new Set(nodes.flatMap(n => n.agentIds))];
    openPanels.forEach(p => {
      if (!allAgentIds.includes(p.agentId)) onClosePanel(p.id);
    });

    // 按节点维度，为每个智能体生成专属初始消息
    nodes.forEach(node => {
      if (node.agentIds.length === 0) return;
      node.agentIds.forEach(agentId => {
        const a = allAgents.find(ag => ag.id === agentId);
        if (!a) return;

        // 构建发给该智能体的初始消息
        const lines: string[] = [];
        lines.push(`【协作任务启动】`);
        lines.push(`你被分配到节点「${node.name}」${node.nodeType === 'parallel' ? '（并行节点）' : '（串行节点）'}。`);
        if (node.desc) {
          lines.push(`\n本节点任务描述：\n${node.desc}`);
        }
        if (allNodes.length > 1) {
          lines.push(`\n整体协作流程如下：\n${contextLines}`);
        }
        lines.push(`\n请根据上述任务描述开始执行。`);
        const initialMessage = lines.join('\n');

        const existingPanel = openPanels.find(p => p.agentId === agentId);
        if (existingPanel) {
          // 面板已存在：切换激活并补发初始消息
          onSwitchPanel(existingPanel.id);
        } else {
          onOpenPanel(a.id, a.name, a.color, initialMessage);
        }
      });
    });
  }

  const pickerNode = pickerNodeId ? nodes.find(n => n.id === pickerNodeId) : null;

  // 任务和项目都有「切换」和「协作」两个 Tab
  // 任务协作Tab内有升级入口，项目协作Tab内有降级入口
  const subTabs: { key: 'switch'|'collab'; label: string }[] = [
    { key: 'switch', label: isProject ? '切换' : '切换智能体' },
    { key: 'collab', label: '协作' },
  ];

  // activeSubTab 直接等于 subTab（不再需要强制重置）
  const activeSubTab = subTab;

  return (
    <div style={{ fontFamily: '"Microsoft YaHei","Segoe UI",sans-serif' }}>

      {/* ── 子 Tab 切换条 ── */}
      <div style={{
        display: 'flex', gap: 4, marginBottom: 14,
        background: '#f3f4f6', borderRadius: 8, padding: 3,
      }}>
        {subTabs.map(t => (
          <button key={t.key} onClick={() => setSubTab(t.key)} style={{
            flex: 1, padding: '5px 0', borderRadius: 6, border: 'none',
            background: activeSubTab === t.key ? '#fff' : 'transparent',
            color: activeSubTab === t.key ? '#374151' : '#9ca3af',
            fontWeight: activeSubTab === t.key ? 700 : 400,
            fontSize: 13, cursor: 'pointer',
            boxShadow: activeSubTab === t.key ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
            transition: 'all 0.15s',
            fontFamily: '"Microsoft YaHei","Segoe UI",sans-serif',
          }}>{t.label}</button>
        ))}
      </div>

      {/* ══════════ 切换 Tab：多列网格 ══════════ */}
      {activeSubTab === 'switch' && (
        <div>
          {agentList.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 0', fontSize: 13, color: '#d1d5db' }}>
              暂无可用智能体
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: 8,
            }}>
              {agentList.map(agent => {
                const statusInfo = agentStatusMap[agent.status ?? 'idle'] ?? { label: '离线', color: '#9ca3af' };
                const currentSessionPanel = openPanels.find(p => p.id === activePanelId) ?? openPanels[0] ?? null;
                const isCurrentAgent = currentSessionPanel?.agentId === agent.id;
                const accentColor = agent.color ?? '#6366f1';
                return (
                  <button
                    key={agent.id}
                    onClick={() => {
                      onSwitchAgent(agent.id, agent.name, agent.color);
                    }}
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6,
                      padding: '10px 11px', borderRadius: 9, border: '1.5px solid',
                      borderColor: isCurrentAgent ? accentColor : '#e5e7eb',
                      background: isCurrentAgent ? accentColor + '0d' : '#fafafa',
                      cursor: 'pointer', transition: 'all 0.15s', textAlign: 'left',
                      fontFamily: '"Microsoft YaHei","Segoe UI",sans-serif',
                      width: '100%', boxSizing: 'border-box',
                      position: 'relative',
                    }}
                    onMouseEnter={e => {
                      if (!isCurrentAgent) {
                        (e.currentTarget as HTMLButtonElement).style.borderColor = accentColor + '88';
                        (e.currentTarget as HTMLButtonElement).style.background = accentColor + '08';
                      }
                    }}
                    onMouseLeave={e => {
                      if (!isCurrentAgent) {
                        (e.currentTarget as HTMLButtonElement).style.borderColor = '#e5e7eb';
                        (e.currentTarget as HTMLButtonElement).style.background = '#fafafa';
                      }
                    }}
                  >
                    {/* 右上角状态标注：仅标识当前会话正在使用的 agent */}
                    {isCurrentAgent && (
                      <span style={{
                        position: 'absolute', top: 7, right: 8,
                        fontSize: 10, padding: '1px 6px', borderRadius: 20, flexShrink: 0,
                        background: accentColor + '18',
                        color: accentColor,
                        fontWeight: 600,
                      }}>
                        当前
                      </span>
                    )}

                    {/* 头像 + 状态点 */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{
                        width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                        background: accentColor + '22', border: `1.5px solid ${accentColor}44`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: accentColor, fontWeight: 700, fontSize: 12,
                      }}>{agent.name.charAt(0)}</div>
                      <span style={{
                        width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                        background: statusInfo.color,
                        boxShadow: `0 0 0 2px ${statusInfo.color}33`,
                      }} />
                    </div>

                    {/* 名称 */}
                    <div style={{
                      fontSize: 13, fontWeight: 600, lineHeight: 1.3,
                      color: isCurrentAgent ? accentColor : '#1a202c',
                      width: '100%', paddingRight: 36,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>{agent.name}</div>

                    {/* 描述 */}
                    {agent.description && (
                      <div style={{
                        fontSize: 11, color: '#9ca3af', lineHeight: 1.4,
                        width: '100%',
                        overflow: 'hidden', display: '-webkit-box',
                        WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                      }}>{agent.description}</div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ══════════ 协作 Tab：FlowNode 流程节点 ══════════ */}
      {activeSubTab === 'collab' && (
        <div>
          {/* 提示文字 */}
          <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 10, lineHeight: 1.5 }}>
            {isProject
              ? '管理参与协作的智能体，配置流程节点分工后开启协作。'
              : '配置协作流程节点后可升级为项目，开启多智能体协同工作。'}
          </div>

          {/* ── 参与智能体管理区（项目模式：可删除；任务模式：只读展示+升级入口） ── */}
          {(() => {
            const agentsInSession = isProject
              ? (participatingAgentNames && participatingAgentNames.length > 0
                  ? (agents ?? []).filter(a => participatingAgentNames.includes(a.name))
                  : agentList)
              : agentList.filter(a => openPanels.some(p => p.agentId === a.id));

            if (agentsInSession.length === 0) return null;

            return (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 6 }}>
                  {isProject ? '参与协作的智能体' : '当前会话智能体'}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {agentsInSession.map(agent => {
                    const ac = agent.color ?? '#6366f1';
                    const canRemove = isProject && agentsInSession.length > 1;
                    const willDowngrade = isProject && agentsInSession.length === 2; // 删后只剩1个
                    return (
                      <div key={agent.id} style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        padding: '4px 8px 4px 6px', borderRadius: 20,
                        background: ac + '15', border: `1px solid ${ac}40`,
                        fontSize: 12, color: ac, fontWeight: 600,
                        userSelect: 'none',
                      }}>
                        <div style={{
                          width: 18, height: 18, borderRadius: '50%',
                          background: ac + '30', border: `1.5px solid ${ac}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 8, fontWeight: 700, flexShrink: 0,
                        }}>{agent.name.charAt(0)}</div>
                        {agent.name}
                        {canRemove && (
                          <button
                            title={willDowngrade ? '删除后降级为任务' : '移出协作'}
                            onClick={() => {
                              if (willDowngrade && onDowngradeToTask) {
                                // 找到另一个智能体
                                const keptAgent = agentsInSession.find(a => a.id !== agent.id);
                                if (keptAgent) onDowngradeToTask(keptAgent.name);
                              } else if (onUpgradeToProject) {
                                // 只是移出，更新参与列表
                                const newNames = agentsInSession
                                  .filter(a => a.id !== agent.id)
                                  .map(a => a.name);
                                onUpgradeToProject(newNames.filter(() => false)); // 触发重新计算
                                // 直接更新：通知外层减少参与智能体
                                if (onDowngradeToTask && agentsInSession.length - 1 === 1) {
                                  const kept = agentsInSession.find(a => a.id !== agent.id);
                                  if (kept) onDowngradeToTask(kept.name);
                                }
                              }
                              // 关闭该智能体的 Panel
                              const panel = openPanels.find(p => p.agentId === agent.id);
                              if (panel) onClosePanel(panel.id);
                            }}
                            style={{
                              width: 14, height: 14, borderRadius: '50%',
                              border: 'none', background: ac + '30',
                              color: ac, cursor: 'pointer', padding: 0,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 10, lineHeight: 1, flexShrink: 0,
                              transition: 'background 0.15s',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = ac + '60'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = ac + '30'; }}
                          >×</button>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* 降级提示：项目只剩1个智能体时 */}
                {isProject && agentsInSession.length === 1 && onDowngradeToTask && (
                  <div style={{
                    marginTop: 8, padding: '8px 10px', borderRadius: 8,
                    background: '#fffbeb', border: '1px solid #fde68a',
                    fontSize: 11, color: '#92400e', lineHeight: 1.5,
                  }}>
                    ⚠️ 只剩1个智能体，项目将降级为任务。
                    <button
                      onClick={() => onDowngradeToTask(agentsInSession[0].name)}
                      style={{
                        marginLeft: 8, padding: '2px 8px', borderRadius: 10,
                        border: 'none', background: '#f59e0b', color: '#fff',
                        fontSize: 11, fontWeight: 600, cursor: 'pointer',
                      }}
                    >确认降级</button>
                  </div>
                )}
              </div>
            );
          })()}



          {/* 节点渲染：分组成行（serial 开新行，parallel 并入当前行） */}
          {(() => {
            const rows: FlowNode[][] = [];
            nodes.forEach(n => {
              if (n.nodeType === 'serial' || rows.length === 0) {
                rows.push([n]);
              } else {
                rows[rows.length - 1].push(n);
              }
            });
            const globalIdx = (nodeId: string) => nodes.findIndex(n => n.id === nodeId);

            return rows.map((row, rowIdx) => (
              <div key={row[0].id + '-row'}>
                {/* 串行向下箭头 */}
                {rowIdx > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: '2px 0', color: '#d1d5db' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/>
                    </svg>
                  </div>
                )}

                {/* 一行内可能有多个节点（并行） */}
                <div style={{ display: 'flex', gap: 0, alignItems: 'stretch' }}>
                  {row.map((node, colIdx) => {
                    const gIdx = globalIdx(node.id);
                    const isParallel = node.nodeType === 'parallel';
                    return (
                      <div key={node.id} style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'stretch' }}>
                        {/* 并行节点间竖线 + 符号 */}
                        {colIdx > 0 && (
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: 22, flexShrink: 0, gap: 2 }}>
                            <div style={{ flex: 1, width: 1, background: '#c7d2fe', minHeight: 16 }} />
                            <span style={{ fontSize: 13, color: '#818cf8', fontWeight: 700, lineHeight: 1 }}>⇋</span>
                            <div style={{ flex: 1, width: 1, background: '#c7d2fe', minHeight: 16 }} />
                          </div>
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          {/* 节点卡片 */}
                          <div style={{
                            border: `1px solid ${isParallel ? '#a5b4fc' : '#e5e7eb'}`,
                            borderRadius: 9, background: '#fff', overflow: 'hidden',
                          }}>
                            {/* 节点 Header */}
                            <div style={{
                              display: 'flex', alignItems: 'center', gap: 5,
                              padding: '6px 9px', borderBottom: `1px solid ${isParallel ? '#e0e7ff' : '#f0f0f0'}`,
                              background: isParallel ? '#f5f3ff' : '#fafafa',
                            }}>
                              {/* 序号圆圈 */}
                              <div style={{
                                width: 17, height: 17, borderRadius: '50%', flexShrink: 0,
                                background: isParallel ? '#6366f1' : '#374151',
                                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 9, fontWeight: 700,
                              }}>{gIdx + 1}</div>

                              {/* 并行标签 */}
                              {isParallel && (
                                <span style={{
                                  display: 'inline-flex', alignItems: 'center', gap: 3,
                                  padding: '1px 6px', borderRadius: 20, flexShrink: 0,
                                  fontSize: 10, background: '#ede9fe', color: '#6d28d9', border: '1px solid #c4b5fd',
                                }}>
                                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>
                                  </svg>
                                  并行
                                </span>
                              )}

                              {/* 节点名称（可编辑） */}
                              <input
                                value={node.name}
                                onChange={e => updateNode(node.id, { name: e.target.value })}
                                placeholder="节点名称…"
                                style={{
                                  flex: 1, border: 'none', outline: 'none', minWidth: 0,
                                  fontSize: 12, fontWeight: 600, color: '#374151',
                                  background: 'transparent',
                                  fontFamily: '"Microsoft YaHei","Segoe UI",sans-serif',
                                }}
                                onFocus={e => { e.currentTarget.style.background = '#f9fafb'; e.currentTarget.style.borderRadius = '4px'; e.currentTarget.style.padding = '1px 4px'; }}
                                onBlur={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.padding = '0'; }}
                              />

                              {/* 上移 */}
                              <button
                                onClick={() => moveNode(gIdx, -1)}
                                disabled={gIdx === 0}
                                title="上移"
                                style={{ background: 'none', border: 'none', padding: '0 1px', cursor: gIdx === 0 ? 'default' : 'pointer', color: gIdx === 0 ? '#e5e7eb' : '#9ca3af', display: 'flex', lineHeight: 1 }}
                              >
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"/></svg>
                              </button>
                              {/* 下移 */}
                              <button
                                onClick={() => moveNode(gIdx, 1)}
                                disabled={gIdx === nodes.length - 1}
                                title="下移"
                                style={{ background: 'none', border: 'none', padding: '0 1px', cursor: gIdx === nodes.length - 1 ? 'default' : 'pointer', color: gIdx === nodes.length - 1 ? '#e5e7eb' : '#9ca3af', display: 'flex', lineHeight: 1 }}
                              >
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                              </button>
                              {/* 删除 */}
                              <button
                                onClick={() => removeNode(node.id)}
                                title="删除节点"
                                style={{ background: 'none', border: 'none', padding: '0 1px', cursor: 'pointer', color: '#d1d5db', display: 'flex', lineHeight: 1, transition: 'color 0.15s' }}
                                onMouseEnter={e => { e.currentTarget.style.color = '#ef4444'; }}
                                onMouseLeave={e => { e.currentTarget.style.color = '#d1d5db'; }}
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
                                </svg>
                              </button>
                            </div>

                            {/* 节点 Body */}
                            <div style={{ padding: '9px 10px' }}>
                              {/* 任务描述 */}
                              <div style={{ marginBottom: 8 }}>
                                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 4 }}>节点任务描述</label>
                                <input
                                  value={node.desc}
                                  onChange={e => updateNode(node.id, { desc: e.target.value })}
                                  placeholder="描述该节点需完成的任务…"
                                  style={{
                                    width: '100%', padding: '5px 8px', boxSizing: 'border-box',
                                    border: '1px solid #e5e7eb', borderRadius: 6,
                                    fontSize: 11, color: '#374151', outline: 'none',
                                    fontFamily: '"Microsoft YaHei","Segoe UI",sans-serif',
                                    transition: 'border-color 0.15s',
                                  }}
                                  onFocus={e => { e.currentTarget.style.borderColor = '#6366f1'; }}
                                  onBlur={e => { e.currentTarget.style.borderColor = '#e5e7eb'; }}
                                />
                              </div>

                              {/* 分配智能体 */}
                              <div>
                                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 6 }}>
                                  分配智能体
                                  <span style={{ color: '#9ca3af', fontWeight: 400, marginLeft: 4 }}>（可多选）</span>
                                </label>

                                {node.agentIds.length === 0 ? (
                                  /* 未选状态：全宽虚线按钮，引导选择 */
                                  <button
                                    onClick={() => setPickerNodeId(node.id)}
                                    style={{
                                      width: '100%', padding: '7px 0', borderRadius: 7,
                                      border: '1.5px dashed #d1d5db',
                                      background: 'transparent', color: '#9ca3af', fontSize: 12,
                                      cursor: 'pointer', fontFamily: '"Microsoft YaHei","Segoe UI",sans-serif',
                                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                                      transition: 'all 0.15s',
                                    }}
                                    onMouseEnter={e => {
                                      (e.currentTarget as HTMLButtonElement).style.borderColor = '#6366f1';
                                      (e.currentTarget as HTMLButtonElement).style.color = '#6366f1';
                                      (e.currentTarget as HTMLButtonElement).style.background = '#f5f3ff';
                                    }}
                                    onMouseLeave={e => {
                                      (e.currentTarget as HTMLButtonElement).style.borderColor = '#d1d5db';
                                      (e.currentTarget as HTMLButtonElement).style.color = '#9ca3af';
                                      (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                                    }}
                                  >
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
                                      <circle cx="9" cy="7" r="4"/>
                                      <line x1="19" y1="8" x2="19" y2="14"/>
                                      <line x1="22" y1="11" x2="16" y2="11"/>
                                    </svg>
                                    选择智能体
                                  </button>
                                ) : (
                                  /* 已选状态：头像列表 + 编辑按钮行 */
                                  <div style={{
                                    display: 'flex', alignItems: 'center', gap: 5,
                                    padding: '5px 8px', borderRadius: 7,
                                    border: '1px solid #e0e7ff', background: '#f5f3ff',
                                  }}>
                                    {/* 已选智能体头像 + 名字 */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1, flexWrap: 'wrap', minWidth: 0 }}>
                                      {node.agentIds.map(aid => {
                                        const a = allAgents.find(x => x.id === aid);
                                        if (!a) return null;
                                        const ac = a.color ?? '#6366f1';
                                        return (
                                          <span
                                            key={aid}
                                            style={{
                                              display: 'inline-flex', alignItems: 'center', gap: 3,
                                              padding: '1px 6px 1px 3px', borderRadius: 20,
                                              fontSize: 11, background: ac + '15',
                                              border: `1px solid ${ac}30`, color: ac, fontWeight: 500,
                                            }}
                                          >
                                            <div style={{
                                              width: 14, height: 14, borderRadius: '50%',
                                              background: ac, display: 'flex', alignItems: 'center',
                                              justifyContent: 'center', fontSize: 8, color: '#fff', fontWeight: 700,
                                            }}>{a.name.charAt(0)}</div>
                                            {a.name}
                                          </span>
                                        );
                                      })}
                                    </div>
                                    {/* 右侧编辑按钮 */}
                                    <button
                                      onClick={() => setPickerNodeId(node.id)}
                                      title="修改智能体"
                                      style={{
                                        flexShrink: 0, padding: '3px 7px', borderRadius: 5,
                                        border: 'none', background: 'rgba(99,102,241,0.12)',
                                        color: '#6366f1', fontSize: 11, cursor: 'pointer',
                                        fontFamily: '"Microsoft YaHei","Segoe UI",sans-serif',
                                        display: 'flex', alignItems: 'center', gap: 3,
                                        transition: 'background 0.12s',
                                      }}
                                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(99,102,241,0.22)'; }}
                                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(99,102,241,0.12)'; }}
                                    >
                                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                                      </svg>
                                      编辑
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ));
          })()}

          {/* 添加节点按钮 */}
          <div style={{ position: 'relative', marginTop: 10 }}>
            <button
              ref={addBtnRef}
              onClick={() => setShowAddMenu(v => !v)}
              style={{
                width: '100%', padding: '7px 0',
                border: `1.5px dashed ${showAddMenu ? '#374151' : '#d1d5db'}`,
                borderRadius: 8, background: showAddMenu ? '#f5f7fa' : 'transparent',
                color: showAddMenu ? '#374151' : '#6b7280',
                fontSize: 12, cursor: 'pointer',
                fontFamily: '"Microsoft YaHei","Segoe UI",sans-serif',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#374151'; e.currentTarget.style.color = '#374151'; e.currentTarget.style.background = '#f5f7fa'; }}
              onMouseLeave={e => {
                if (!showAddMenu) {
                  e.currentTarget.style.borderColor = '#d1d5db';
                  e.currentTarget.style.color = '#6b7280';
                  e.currentTarget.style.background = 'transparent';
                }
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              添加流程节点
            </button>
            {showAddMenu && (
              <AddFlowNodeMenu
                anchorRef={addBtnRef}
                onAdd={addNode}
                onClose={() => setShowAddMenu(false)}
              />
            )}
          </div>

          {/* 开启协作按钮 */}
          <button
            onClick={applyCollab}
            disabled={nodes.every(n => n.agentIds.length === 0)}
            style={{
              marginTop: 12, width: '100%', height: 36, borderRadius: 8, border: 'none',
              background: nodes.some(n => n.agentIds.length > 0) ? '#6366f1' : '#e5e7eb',
              color: nodes.some(n => n.agentIds.length > 0) ? '#fff' : '#9ca3af',
              fontSize: 13, fontWeight: 700,
              cursor: nodes.some(n => n.agentIds.length > 0) ? 'pointer' : 'not-allowed',
              fontFamily: '"Microsoft YaHei","Segoe UI",sans-serif',
              transition: 'background 0.15s',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            {nodes.some(n => n.agentIds.length > 0) ? '开启协作' : '请先为节点分配智能体'}
          </button>

          {/* 任务模式：升级为项目按钮 */}
          {!isProject && onUpgradeToProject && (() => {
            // 收集节点中所有已选智能体名称
            const selectedAgentIds = [...new Set(nodes.flatMap(n => n.agentIds))];
            const selectedNames = selectedAgentIds
              .map(id => agentList.find(a => a.id === id)?.name)
              .filter(Boolean) as string[];
            const canUpgrade = selectedNames.length >= 2;
            return (
              <button
                onClick={() => { if (canUpgrade) onUpgradeToProject(selectedNames); }}
                disabled={!canUpgrade}
                title={canUpgrade ? '将当前任务升级为多智能体协作项目' : '需在流程节点中分配至少2个不同智能体'}
                style={{
                  marginTop: 8, width: '100%', height: 36, borderRadius: 8,
                  border: `1.5px solid ${canUpgrade ? '#f59e0b' : '#e5e7eb'}`,
                  background: canUpgrade ? '#fffbeb' : '#f9fafb',
                  color: canUpgrade ? '#92400e' : '#9ca3af',
                  fontSize: 13, fontWeight: 700,
                  cursor: canUpgrade ? 'pointer' : 'not-allowed',
                  fontFamily: '"Microsoft YaHei","Segoe UI",sans-serif',
                  transition: 'all 0.15s',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}
                onMouseEnter={e => { if (canUpgrade) { e.currentTarget.style.background = '#fef3c7'; e.currentTarget.style.borderColor = '#d97706'; } }}
                onMouseLeave={e => { if (canUpgrade) { e.currentTarget.style.background = '#fffbeb'; e.currentTarget.style.borderColor = '#f59e0b'; } }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="17 11 12 6 7 11"/><line x1="12" y1="6" x2="12" y2="18"/>
                </svg>
                {canUpgrade ? `升级为项目（${selectedNames.length}个智能体）` : '分配≥2个智能体后可升级为项目'}
              </button>
            );
          })()}

          {/* 智能体选择弹窗 */}
          {pickerNode && (
            <AgentPickerModal
              agentList={allAgents}
              selected={pickerNode.agentIds}
              onClose={() => setPickerNodeId(null)}
              onConfirm={ids => confirmAgents(pickerNode.id, ids)}
            />
          )}
        </div>
      )}
    </div>
  );
}

function TabPanel({
  tab, onClose,
  agents, tasks, taskName,
  onInject, onSend,
  matchedProject,
  incomingAgentNames,
  openPanels,
  activePanelId,
  onSwitchPanel,
  onOpenAgentPanel,
  onSwitchAgentInSession,
  onCloseAgentPanel,
  currentProjectId,
  collabNodes,
  setCollabNodes,
  isProject,
  participatingAgentNames,
  onUpgradeToProject,
  onDowngradeToTask,
}: {
  tab: string;
  onClose: () => void;
  agents?: import('../types').Agent[];
  tasks?: import('../stores/taskStore').Task[];
  taskName?: string;
  onInject?: (text: string) => void;
  onSend?: (text: string) => void;
  matchedProject?: import('../stores/projectKanbanStore').KanbanProject | null;
  /** 来自看板跳转的智能体名称列表，透传给 AgentPanel 使用 */
  incomingAgentNames?: string[];
  openPanels: import('../types').ConversationPanel[];
  activePanelId: string | null;
  onSwitchPanel: (panelId: string) => void;
  onOpenAgentPanel: (agentId: string, agentName: string, agentColor: string, initialMessage?: string) => void;
  onSwitchAgentInSession: (agentId: string, agentName: string, agentColor: string) => void;
  onCloseAgentPanel: (panelId: string) => void;
  currentProjectId?: string;
  /** 协作流程节点（持久化，由外层维护） */
  collabNodes: FlowNode[];
  setCollabNodes: React.Dispatch<React.SetStateAction<FlowNode[]>>;
  /** 当前是项目（true）还是任务（false），控制协作 Tab 的显示 */
  isProject: boolean;
  /** 当前参与会话的智能体名称列表 */
  participatingAgentNames?: string[];
  /** 任务升级为项目回调 */
  onUpgradeToProject?: (newAgentNames: string[]) => void;
  /** 项目降级为任务回调 */
  onDowngradeToTask?: (keptAgentName: string) => void;
}) {
  /* 根据activePanelId推导当前激活的panel */
  const activePanel = (activePanelId ? openPanels.find(p => p.id === activePanelId) : null) ?? openPanels[0] ?? null;

  /* 文件快传状态（项目级关联） */
  const [uploadedFiles, setUploadedFiles] = useState<FileAsset[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  async function loadProjectFiles() {
    try {
      const rows = await filesApi.list(currentProjectId || '', activePanel?.conversationId || '');
      setUploadedFiles(rows);
    } catch (e) {
      console.error('[loadProjectFiles]', e);
    }
  }

  async function uploadRealFile(file: File) {
    setUploading(true);
    try {
      const conversationId = activePanel?.conversationId || '';
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = '';
      const chunkSize = 0x8000;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.slice(i, i + chunkSize));
      }
      const base64 = btoa(binary);
      await filesApi.upload({
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        base64,
        projectId: currentProjectId || '',
        conversationId,
      });
      await loadProjectFiles();
      showToast('文件上传成功，正在触发智能体初步分析', 'success');

      if (conversationId && onSend) {
        try {
          const prompt = await filesApi.getAutoAnalysisPrompt(conversationId);
          if (prompt.trim()) {
            onSend(prompt);
          }
        } catch (analysisError) {
          console.error('[uploadRealFile:autoAnalysis]', analysisError);
        }
      }
    } catch (e: any) {
      console.error('[uploadRealFile]', e);
      showToast(e?.response?.data?.error?.message || '文件上传失败', 'error');
    } finally {
      setUploading(false);
    }
  }

  /* 智能体状态映射 */
  const agentStatusMap: Record<string, { label: string; color: string }> = {
    active: { label: '在线', color: '#22c55e' },
    idle:   { label: '空闲', color: '#3b82f6' },
    busy:   { label: '忙碌', color: '#f59e0b' },
  };

  useEffect(() => {
    void loadProjectFiles();
  }, [currentProjectId, activePanel?.conversationId]);

  const meta = TAB_META[tab] ?? {
    gradient: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
    subtitle: '',
    icon: <svg width="19" height="19" viewBox="0 0 17 17" fill="none"><circle cx="8.5" cy="8.5" r="5.5" stroke="white" strokeWidth="1.4"/></svg>,
  };

  const itemStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '10px 12px', borderRadius: 8, background: '#f9fafb',
    marginBottom: 7, fontSize: 13, color: '#374151',
    border: '1px solid #f0f0f0',
  };

  function formatFileSize(sizeBytes: number) {
    if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return '0 B';
    if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
    return `${(sizeBytes / 1024 / 1024).toFixed(1)} MB`;
  }
  const badgeStyle = (color: string): React.CSSProperties => ({
    fontSize: 11, padding: '2px 8px', borderRadius: 4,
    background: color + '18', color,
  });

  return (
    /* 遮罩层 */
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000,
        backdropFilter: 'blur(3px)',
        WebkitBackdropFilter: 'blur(3px)',
        overflowY: 'auto',
      }}
    >
      {/* 弹窗主体 */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff',
          borderRadius: 12,
          boxShadow: '0 24px 64px rgba(0,0,0,0.18), 0 4px 16px rgba(0,0,0,0.08)',
          width: 660,
          maxWidth: 'calc(100vw - 32px)',
          fontFamily: '"Microsoft YaHei","Segoe UI",sans-serif',
          animation: 'tabPanelModalIn 0.2s cubic-bezier(0.34,1.4,0.64,1)',
          overflow: 'clip',
          marginBottom: 32,
        }}
      >
        {/* ── 头部 ── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '22px 28px 18px',
          borderBottom: '1px solid #f0f0f0',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 38, height: 38, borderRadius: 10,
              background: meta.gradient,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              {meta.icon}
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#1a202c', lineHeight: 1.3 }}>
                {tab}
              </div>
              <div style={{ fontSize: 12, color: '#666', marginTop: 3, lineHeight: 1.4 }}>
                {meta.subtitle}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 30, height: 30, borderRadius: 8,
              border: 'none', background: '#f3f4f6', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#9ca3af', fontSize: 18, lineHeight: 1,
              transition: 'background 0.15s, color 0.15s',
              flexShrink: 0,
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#e5e7eb'; e.currentTarget.style.color = '#374151'; }}
            onMouseLeave={e => { e.currentTarget.style.background = '#f3f4f6'; e.currentTarget.style.color = '#9ca3af'; }}
          >×</button>
        </div>

        {/* ── 内容区 ── */}
        <div style={{ padding: '20px 28px', maxHeight: '70vh', overflowY: 'auto' }}>

          {tab === '消息渠道' && (
            <div>
              {CHANNEL_LIST.map(ch => (
                <div key={ch.name} style={itemStyle}>
                  <span style={{ fontWeight: 500 }}>{ch.name}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={badgeStyle(ch.color)}>{ch.status}</span>
                    <button style={{
                      fontSize: 12, padding: '4px 14px', borderRadius: 6,
                      border: '1.5px solid #e5e7eb', background: '#fff',
                      cursor: 'pointer', color: '#374151',
                      fontFamily: '"Microsoft YaHei","Segoe UI",sans-serif',
                    }}>连接</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === '快捷指令' && (
            <ShortcutPanel
              taskName={taskName}
              onInject={text => { if (onInject) { onInject(text); onClose(); } }}
            />
          )}

          {tab === '文件快传' && (
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv,.pdf,.docx,.md,.txt,.json"
                style={{ display: 'none' }}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file) await uploadRealFile(file);
                  e.currentTarget.value = '';
                }}
              />
              <div
                style={{
                  border: `2px dashed ${dragOver ? '#3b82f6' : '#d1d5db'}`,
                  borderRadius: 10, padding: '28px 20px',
                  textAlign: 'center', cursor: uploading ? 'wait' : 'pointer',
                  background: dragOver ? '#f0f7ff' : 'transparent',
                  transition: 'border-color 0.15s, background 0.15s',
                  opacity: uploading ? 0.75 : 1,
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = '#3b82f6'; (e.currentTarget as HTMLDivElement).style.background = '#f0f7ff'; }}
                onMouseLeave={e => { if (!dragOver) { (e.currentTarget as HTMLDivElement).style.borderColor = '#d1d5db'; (e.currentTarget as HTMLDivElement).style.background = 'transparent'; } }}
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={async e => {
                  e.preventDefault();
                  setDragOver(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file) await uploadRealFile(file);
                }}
                onClick={() => !uploading && fileInputRef.current?.click()}
              >
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="1.5" style={{ margin: '0 auto 8px', display: 'block', opacity: 0.6 }}>
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
                <div style={{ fontSize: 13, color: '#6b7280', fontWeight: 500 }}>{uploading ? '上传中...' : '点击或拖拽文件到此处'}</div>
                <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>支持 Excel、CSV、PDF、Word、TXT、Markdown、JSON，最大 50MB；项目可为空，后续再关联</div>
              </div>
              {uploadedFiles.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 12, color: '#6b7280', fontWeight: 600, marginBottom: 8 }}>
                    已上传文件（{uploadedFiles.length}）
                  </div>
                  {uploadedFiles.map((f) => (
                    <div key={f.id} style={{ ...itemStyle, marginBottom: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                        <div style={{
                          width: 30, height: 30, borderRadius: 6, flexShrink: 0,
                          background: 'linear-gradient(135deg,#3b82f6,#06b6d4)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 9, color: '#fff', fontWeight: 700,
                        }}>{(f.extension || '').replace('.', '').toUpperCase() || 'FILE'}</div>
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 500, color: '#374151' }}>{f.originalName}</div>
                          <div style={{ fontSize: 11, color: '#9ca3af' }}>{formatFileSize(f.sizeBytes)}</div>
                        </div>
                      </div>
                      <button
                        onClick={async () => {
                          try {
                            await filesApi.remove(f.id);
                            await loadProjectFiles();
                          } catch (e) {
                            console.error('[removeProjectFile]', e);
                            showToast('删除文件失败', 'error');
                          }
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: '#9ca3af',
                          fontSize: 12,
                          lineHeight: 1,
                          padding: '4px 6px',
                          fontWeight: 500,
                        }}
                        onMouseEnter={e => { e.currentTarget.style.color = '#ef4444'; }}
                        onMouseLeave={e => { e.currentTarget.style.color = '#9ca3af'; }}
                      >删除</button>
                    </div>
                  ))}
                </div>
              )}
              {uploadedFiles.length === 0 && (
                <div style={{ textAlign: 'center', fontSize: 12, color: '#d1d5db', marginTop: 12 }}>
                  暂无上传文件，项目可后续再关联
                </div>
              )}
            </div>
          )}

          {tab === '技能应用' && (
            <SkillPanel
              taskName={taskName}
              onInject={text => { if (onInject) { onInject(text); onClose(); } }}
            />
          )}

          {tab === '定时任务' && (
            <SchedulePanel
              onFillInput={text => { if (onInject) { onInject(text); onClose(); } }}
              onSend={text => { if (onSend) { onSend(text); onClose(); } }}
            />
          )}

          {tab === '多智能体' && (
            <AgentPanel
              agents={agents}
              agentStatusMap={agentStatusMap}
              taskName={taskName}
              matchedProject={matchedProject}
              incomingAgentNames={incomingAgentNames}
              openPanels={openPanels}
              activePanelId={activePanelId}
              onSwitchPanel={panelId => { onSwitchPanel(panelId); onClose(); }}
              onOpenPanel={(agentId, agentName, agentColor, initialMessage) => { onOpenAgentPanel(agentId, agentName, agentColor, initialMessage); onClose(); }}
              onSwitchAgent={(agentId, agentName, agentColor) => { onSwitchAgentInSession(agentId, agentName, agentColor); onClose(); }}
              onClosePanel={onCloseAgentPanel}
              currentProjectId={currentProjectId}
              onInject={text => { if (onInject) { onInject(text); onClose(); } }}
              collabNodes={collabNodes}
              setCollabNodes={setCollabNodes}
              isProject={isProject}
              participatingAgentNames={participatingAgentNames}
              onUpgradeToProject={onUpgradeToProject}
              onDowngradeToTask={onDowngradeToTask}
            />
          )}

          {tab === '任务标签' && <TaskTagPanel conversationId={activePanel?.conversationId} taskName={taskName} />}

        </div>


      </div>

      <style>{`
        @keyframes tabPanelModalIn {
          from { opacity: 0; transform: scale(0.9) translateY(12px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  );
}

/* ─── 优先级 Modal 弹窗 ────────────────────────────────────── */
function PriorityModal({
  priority, onSetPriority, onClose,
}: {
  priority: ProjectPriority | null;
  onSetPriority: (p: ProjectPriority) => void;
  onClose: () => void;
}) {
  return (
    /* 遮罩层 */
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000,
        backdropFilter: 'blur(3px)',
        WebkitBackdropFilter: 'blur(3px)',
        overflowY: 'auto',
      }}
    >
      {/* 弹窗主体 */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff',
          borderRadius: 12,
          boxShadow: '0 24px 64px rgba(0,0,0,0.18), 0 4px 16px rgba(0,0,0,0.08)',
          width: 660,
          maxWidth: 'calc(100vw - 32px)',
          fontFamily: '"Microsoft YaHei","Segoe UI",sans-serif',
          animation: 'priorityModalIn 0.2s cubic-bezier(0.34,1.4,0.64,1)',
          overflow: 'hidden',
          position: 'relative',
          marginBottom: 32,
        }}
      >
        {/* ── 头部标题栏 ── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '22px 28px 18px',
          borderBottom: '1px solid #f0f0f0',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 38, height: 38, borderRadius: 10,
              background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <svg width="19" height="19" viewBox="0 0 16 16" fill="none">
                <path d="M3 2h10l-2.5 4.5L13 11H3V2Z" fill="white" fillOpacity="0.95"/>
                <rect x="3" y="13" width="1.8" height="1.8" rx="0.5" fill="white"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#1a202c', lineHeight: 1.3 }}>
                设置优先级
              </div>
              <div style={{ fontSize: 12, color: '#666', marginTop: 3, lineHeight: 1.4 }}>
                同步至项目看板列表
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 30, height: 30, borderRadius: 8,
              border: 'none', background: '#f3f4f6', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#9ca3af', fontSize: 18, lineHeight: 1,
              transition: 'background 0.15s, color 0.15s',
              flexShrink: 0,
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#e5e7eb'; e.currentTarget.style.color = '#374151'; }}
            onMouseLeave={e => { e.currentTarget.style.background = '#f3f4f6'; e.currentTarget.style.color = '#9ca3af'; }}
          >×</button>
        </div>

        {/* ── 内容区：优先级标签与选项并排 ── */}
        <div style={{ padding: '24px 28px 32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {/* 左侧标签 */}
            <div style={{
              fontSize: 13, fontWeight: 600, color: '#374151',
              whiteSpace: 'nowrap', width: 56, flexShrink: 0,
            }}>
              优先级
            </div>
            {/* 右侧三个选项按钮并排 */}
            <div style={{ display: 'flex', gap: 10, flex: 1 }}>
              {PRIORITY_OPTIONS.map(opt => {
                const isActive = priority === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => { onSetPriority(opt.value); onClose(); }}
                    style={{
                      flex: 1, padding: '9px 0', borderRadius: 8, border: '1.5px solid',
                      borderColor: isActive ? opt.color : '#e5e7eb',
                      background: isActive ? opt.bg : '#fff',
                      color: isActive ? opt.color : '#9ca3af',
                      fontSize: 13, fontWeight: isActive ? 700 : 400,
                      cursor: 'pointer', transition: 'all 0.15s',
                      fontFamily: '"Microsoft YaHei","Segoe UI",sans-serif',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    }}
                    onMouseEnter={e => {
                      if (!isActive) {
                        e.currentTarget.style.borderColor = opt.color;
                        e.currentTarget.style.background = opt.bg;
                        e.currentTarget.style.color = opt.color;
                      }
                    }}
                    onMouseLeave={e => {
                      if (!isActive) {
                        e.currentTarget.style.borderColor = '#e5e7eb';
                        e.currentTarget.style.background = '#fff';
                        e.currentTarget.style.color = '#9ca3af';
                      }
                    }}
                  >
                    {isActive && (
                      <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                        <path d="M1.5 5.5L4 8L9.5 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>


      </div>

      <style>{`
        @keyframes priorityModalIn {
          from { opacity: 0; transform: scale(0.9) translateY(12px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  );
}

/* ─── 消息渠道配置 Modal ───────────────────────────────────── */
function ChannelConfigModal({ onClose }: { onClose: () => void }) {
  const [channel, setChannel] = useState<ChannelType>('feishu');
  const [botId, setBotId]     = useState('');
  const [secret, setSecret]   = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [errors, setErrors]   = useState<{ botId?: string; secret?: string }>({});
  const [saved, setSaved]     = useState(false);

  function validate() {
    const e: { botId?: string; secret?: string } = {};
    if (!botId.trim())   e.botId  = 'Bot ID 不能为空';
    if (!secret.trim())  e.secret = 'Secret 不能为空';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleConfirm() {
    if (!validate()) return;
    setSaved(true);
    setTimeout(() => { setSaved(false); onClose(); }, 1200);
  }

  /* 切换渠道时清空表单 */
  function switchChannel(c: ChannelType) {
    setChannel(c);
    setBotId(''); setSecret('');
    setErrors({});
  }

  const channelLabels: Record<ChannelType, string> = {
    feishu: '飞书', wecom: '企业微信', dingtalk: '钉钉',
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000,
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
          width: 660,
          maxWidth: 'calc(100vw - 32px)',
          fontFamily: '"Microsoft YaHei","Segoe UI",sans-serif',
          animation: 'channelModalIn 0.2s cubic-bezier(0.34,1.4,0.64,1)',
          overflow: 'hidden',
          position: 'relative',
          marginBottom: 32,
        }}
      >
        {/* ── 头部标题栏 ── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '22px 28px 18px',
          borderBottom: '1px solid #f0f0f0',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {/* 图标 */}
            <div style={{
              width: 38, height: 38, borderRadius: 10,
              background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <svg width="19" height="19" viewBox="0 0 17 17" fill="none">
                <path d="M2 3.5C2 2.67 2.67 2 3.5 2H10L15 7V13.5C15 14.33 14.33 15 13.5 15H3.5C2.67 15 2 14.33 2 13.5V3.5Z"
                  fill="none" stroke="white" strokeWidth="1.4" strokeLinejoin="round"/>
                <path d="M10 2V7H15" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M5 10H12M5 12.5H9" stroke="white" strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
            </div>
            {/* 标题 + 副标题 */}
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#1a202c', lineHeight: 1.3 }}>
                消息渠道配置
              </div>
              <div style={{ fontSize: 12, color: '#666', marginTop: 3, lineHeight: 1.4 }}>
                连接后智能体可接收并回复渠道消息
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 30, height: 30, borderRadius: 8,
              border: 'none', background: '#f3f4f6', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#9ca3af', fontSize: 18, lineHeight: 1,
              transition: 'background 0.15s, color 0.15s',
              flexShrink: 0,
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#e5e7eb'; e.currentTarget.style.color = '#374151'; }}
            onMouseLeave={e => { e.currentTarget.style.background = '#f3f4f6'; e.currentTarget.style.color = '#9ca3af'; }}
          >×</button>
        </div>

        {/* ── 提示栏 ── */}
        <div style={{
          margin: '18px 28px 0',
          padding: '11px 14px',
          borderRadius: 8,
          background: '#f0f7ff',
          border: '1px solid #c8e0ff',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <svg width="15" height="15" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
            <circle cx="7" cy="7" r="6" fill="#3b82f6" fillOpacity="0.15" stroke="#3b82f6" strokeWidth="1.2"/>
            <path d="M7 6V10M7 4.5V5" stroke="#3b82f6" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
          <span style={{ fontSize: 13, color: '#333', flex: 1, lineHeight: 1.5 }}>
            配置机器人 Token 后，智能体可在渠道中自动收发消息。
          </span>
          <a
            href="#"
            onClick={e => e.preventDefault()}
            style={{
              fontSize: 13, color: '#1d6ef5', fontWeight: 600,
              textDecoration: 'underline', whiteSpace: 'nowrap',
              textUnderlineOffset: 2,
            }}
          >实践教程 →</a>
        </div>

        {/* ── 渠道标签页 ── */}
        <div style={{ padding: '20px 28px 0' }}>
          <div style={{ fontSize: 13, color: '#555', marginBottom: 10, fontWeight: 500 }}>
            选择渠道
          </div>
          <div style={{ display: 'flex', gap: 0, border: '1px solid #e5e7eb', borderRadius: 9, overflow: 'hidden' }}>
            {CHANNEL_TABS.map((tab, idx) => {
              const active = channel === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => switchChannel(tab.key)}
                  style={{
                    flex: 1,
                    height: 48,
                    padding: '0 12px',
                    borderRadius: 0,
                    border: 'none',
                    borderLeft: idx === 0 ? 'none' : '1px solid #e5e7eb',
                    background: active ? '#3b82f6' : '#ffffff',
                    cursor: 'pointer',
                    display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
                    transition: 'all 0.15s',
                    fontFamily: '"Microsoft YaHei","Segoe UI",sans-serif',
                    outline: active ? '2px solid #3b82f6' : 'none',
                    outlineOffset: -2,
                    position: 'relative',
                  }}
                  onMouseEnter={e => {
                    if (!active) { e.currentTarget.style.background = '#f0f7ff'; }
                  }}
                  onMouseLeave={e => {
                    if (!active) { e.currentTarget.style.background = '#ffffff'; }
                  }}
                >
                  <span style={{ fontSize: 18, lineHeight: 1 }}>{tab.icon}</span>
                  <span style={{
                    fontSize: 13, fontWeight: active ? 600 : 400,
                    color: active ? '#ffffff' : '#6b7280',
                  }}>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── 表单区域 ── */}
        <div style={{ padding: '22px 28px 12px' }}>
          {/* 分割线 + 渠道名 */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20,
          }}>
            <div style={{ flex: 1, height: 1, background: '#f0f0f0' }}/>
            <span style={{ fontSize: 12, color: '#aaa', whiteSpace: 'nowrap' }}>
              {channelLabels[channel]} Bot 配置
            </span>
            <div style={{ flex: 1, height: 1, background: '#f0f0f0' }}/>
          </div>

          {/* Bot ID */}
          <div style={{ marginBottom: 18 }}>
            <label style={{
              display: 'flex', alignItems: 'center', gap: 2,
              fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 7,
            }}>
              Bot ID<span style={{ color: '#ef4444', fontSize: 13, lineHeight: 1, marginLeft: 2 }}>*</span>
            </label>
            <input
              value={botId}
              onChange={e => { setBotId(e.target.value); if (errors.botId) setErrors(v => ({ ...v, botId: undefined })); }}
              placeholder={`请输入 ${channelLabels[channel]} Bot ID`}
              style={{
                width: '100%', height: 44, padding: '0 16px',
                border: errors.botId ? '1.5px solid #ef4444' : '1.5px solid #e5e7eb',
                borderRadius: 8, fontSize: 13, outline: 'none',
                background: '#fff', color: '#1a202c',
                fontFamily: '"Microsoft YaHei","Segoe UI",sans-serif',
                boxSizing: 'border-box',
                transition: 'border-color 0.15s, box-shadow 0.15s',
              }}
              onFocus={e => {
                e.currentTarget.style.borderColor = errors.botId ? '#ef4444' : '#3b82f6';
                e.currentTarget.style.boxShadow = errors.botId
                  ? '0 0 0 3px rgba(239,68,68,0.12)'
                  : '0 0 0 3px rgba(59,130,246,0.12)';
              }}
              onBlur={e => {
                e.currentTarget.style.borderColor = errors.botId ? '#ef4444' : '#e5e7eb';
                e.currentTarget.style.boxShadow = 'none';
              }}
            />
            <style>{`input::placeholder { color: #999 !important; }`}</style>
            {errors.botId && (
              <div style={{ fontSize: 12, color: '#ef4444', marginTop: 5, display: 'flex', alignItems: 'center', gap: 4 }}>
                <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                  <circle cx="5.5" cy="5.5" r="4.5" fill="#ef4444" fillOpacity="0.15" stroke="#ef4444" strokeWidth="1"/>
                  <path d="M5.5 3.5V6M5.5 7.5V8" stroke="#ef4444" strokeWidth="1.2" strokeLinecap="round"/>
                </svg>
                {errors.botId}
              </div>
            )}
          </div>

          {/* Secret */}
          <div style={{ marginBottom: 8 }}>
            <label style={{
              display: 'flex', alignItems: 'center', gap: 2,
              fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 7,
            }}>
              Secret<span style={{ color: '#ef4444', fontSize: 13, lineHeight: 1, marginLeft: 2 }}>*</span>
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showSecret ? 'text' : 'password'}
                value={secret}
                onChange={e => { setSecret(e.target.value); if (errors.secret) setErrors(v => ({ ...v, secret: undefined })); }}
                placeholder="请输入 Secret"
                style={{
                  width: '100%', height: 44, padding: '0 48px 0 16px',
                  border: errors.secret ? '1.5px solid #ef4444' : '1.5px solid #e5e7eb',
                  borderRadius: 8, fontSize: 13, outline: 'none',
                  background: '#fff', color: '#1a202c',
                  fontFamily: '"Microsoft YaHei","Segoe UI",sans-serif',
                  boxSizing: 'border-box',
                  transition: 'border-color 0.15s, box-shadow 0.15s',
                }}
                onFocus={e => {
                  e.currentTarget.style.borderColor = errors.secret ? '#ef4444' : '#3b82f6';
                  e.currentTarget.style.boxShadow = errors.secret
                    ? '0 0 0 3px rgba(239,68,68,0.12)'
                    : '0 0 0 3px rgba(59,130,246,0.12)';
                }}
                onBlur={e => {
                  e.currentTarget.style.borderColor = errors.secret ? '#ef4444' : '#e5e7eb';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              />
              {/* 眼睛图标：点击切换显示/隐藏，默认隐藏(password) */}
              <button
                type="button"
                onClick={() => setShowSecret(v => !v)}
                tabIndex={-1}
                style={{
                  position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer',
                  padding: 4, display: 'flex', alignItems: 'center',
                  color: showSecret ? '#3b82f6' : '#9ca3af',
                  transition: 'color 0.15s', borderRadius: 4,
                }}
                onMouseEnter={e => { if (!showSecret) e.currentTarget.style.color = '#6b7280'; }}
                onMouseLeave={e => { if (!showSecret) e.currentTarget.style.color = '#9ca3af'; }}
                title={showSecret ? '点击隐藏密码' : '点击显示密码'}
              >
                {showSecret ? (
                  /* 眼睛睁开：密码可见状态，图标蓝色 */
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                ) : (
                  /* 眼睛关闭：密码隐藏状态，图标灰色 */
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                    <line x1="1" y1="1" x2="23" y2="23"/>
                  </svg>
                )}
              </button>
            </div>
            {errors.secret && (
              <div style={{ fontSize: 12, color: '#ef4444', marginTop: 5, display: 'flex', alignItems: 'center', gap: 4 }}>
                <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                  <circle cx="5.5" cy="5.5" r="4.5" fill="#ef4444" fillOpacity="0.15" stroke="#ef4444" strokeWidth="1"/>
                  <path d="M5.5 3.5V6M5.5 7.5V8" stroke="#ef4444" strokeWidth="1.2" strokeLinecap="round"/>
                </svg>
                {errors.secret}
              </div>
            )}
          </div>
        </div>

        {/* ── 底部按钮 ── */}
        <div style={{
          display: 'flex', gap: 10, justifyContent: 'flex-end', alignItems: 'center',
          padding: '16px 28px 24px',
          borderTop: '1px solid #f0f0f0',
        }}>
          {/* 取消：白底灰边，hover 边框加深 */}
          <button
            onClick={onClose}
            style={{
              height: 40, padding: '0 24px', fontSize: 14, borderRadius: 8,
              border: '1.5px solid #e5e7eb', background: '#fff', cursor: 'pointer',
              color: '#6b7280', fontWeight: 500,
              fontFamily: '"Microsoft YaHei","Segoe UI",sans-serif',
              transition: 'border-color 0.15s, color 0.15s, background 0.15s',
              display: 'inline-flex', alignItems: 'center',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = '#9ca3af';
              e.currentTarget.style.color = '#374151';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = '#e5e7eb';
              e.currentTarget.style.color = '#6b7280';
            }}
          >取消</button>

          {/* 确定：紫色实底，hover 加深，保存后变绿 */}
          <button
            onClick={handleConfirm}
            style={{
              height: 40, padding: '0 28px', fontSize: 14, borderRadius: 8,
              border: 'none',
              background: saved ? '#22c55e' : '#6366f1',
              cursor: 'pointer', color: '#fff', fontWeight: 600,
              fontFamily: '"Microsoft YaHei","Segoe UI",sans-serif',
              transition: 'background 0.15s, box-shadow 0.15s',
              boxShadow: saved ? '0 2px 8px rgba(34,197,94,0.25)' : '0 2px 8px rgba(99,102,241,0.25)',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = saved ? '#16a34a' : '#4f46e5';
              e.currentTarget.style.boxShadow = saved
                ? '0 4px 12px rgba(34,197,94,0.35)'
                : '0 4px 12px rgba(79,70,229,0.35)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = saved ? '#22c55e' : '#6366f1';
              e.currentTarget.style.boxShadow = saved
                ? '0 2px 8px rgba(34,197,94,0.25)'
                : '0 2px 8px rgba(99,102,241,0.25)';
            }}
          >
            {saved ? (
              <>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M2.5 7L5.5 10L11.5 4" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                已保存
              </>
            ) : '确 定'}
          </button>
        </div>

        {/* 成功提示 toast */}
        {saved && (
          <div style={{
            position: 'absolute', bottom: 88, left: '50%', transform: 'translateX(-50%)',
            background: '#1a202c', color: '#fff', borderRadius: 8, padding: '8px 18px',
            fontSize: 12, whiteSpace: 'nowrap', pointerEvents: 'none',
            boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
            animation: 'toastIn 0.2s ease',
          }}>
            ✓ 渠道配置已保存
          </div>
        )}
      </div>

      <style>{`
        @keyframes channelModalIn {
          from { opacity: 0; transform: scale(0.9) translateY(16px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes toastIn {
          from { opacity: 0; transform: translateX(-50%) translateY(8px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>
    </div>
  );
}
export function ProjectWorkspace() {
  const location = useLocation();
  type NavState = { projectName?: string; projectId?: string; taskId?: string; agentNames?: string[]; sessionId?: string; precreatedTabId?: string; navNonce?: number } | null;
  const navState = location.state as NavState;
  /** 从项目协作页跳转时携带的项目名（任务/项目通用） */
  const incomingProjectName = navState?.projectName;
  /** 从项目看板卡片跳转时携带的项目 id */
  const incomingProjectId = navState?.projectId;
  /** 从任务看板卡片跳转时携带的任务 id */
  const incomingTaskId = navState?.taskId;
  /**
   * 从任务/项目看板卡片点击跳转时携带的智能体名称列表
   * 用于 AgentPanel 只展示该任务/项目关联的智能体
   * 若为空/未传入，则 AgentPanel 展示所有智能体
   */
  const incomingAgentNames = navState?.agentNames;

  /* ── Store 接入 ─────────────────────────────────────────── */
  const { currentProject, projects, fetchProjects } = useProjectStore();
  const { openPanels, openPanel, sendMessage, connect, closePanel, wsConnected, restoreFromPersist,
    sessionTabs: storeSessionTabs, activeTabId: storeActiveTabId } = useConversationStore();
  // 统一 Tab 管理（方案 A：sessionTabs 作为唯一数据源）
  const rawSessionTabs = useConversationStore(s => s.sessionTabs);
  const getTabs = useConversationStore(s => s.getTabs);
  const storeActiveId = useConversationStore(s => s.activeTabId);
  const switchTab = useConversationStore(s => s.switchTab);
  const closeTabFn = useConversationStore(s => s.closeTab);
  const renameTab = useConversationStore(s => s.renameTab);
  const createSessionTabFn = useConversationStore(s => s.createSessionTab);
  const switchAgentFn = useConversationStore(s => s.switchAgent);
  const allTabs = React.useMemo(() => getTabs(), [rawSessionTabs, getTabs]);
  const activeTab = allTabs.find(t => t.id === storeActiveId);
  const { agents, fetchAgents } = useAgentStore();
  const { addTaskFromChat, tasks, updateTask } = useTaskStore();
  const { projects: kanbanProjects, updateProject: updateKanbanProject, addProject: addKanbanProject } = useProjectKanbanStore();

  /* ── 本地状态 ────────────────────────────────────────────── */
  const [activeSideTab, setActiveSideTab] = useState<string | null>(null);
  const [showPriorityModal, setShowPriorityModal] = useState(false);
  const [showChannelModal, setShowChannelModal] = useState(false);
  const [inputValue, setInputValue] = useState('');
  /** 当前激活的对话 panel id（用于智能体面板高亮显示） */
  const [activePanelId, setActivePanelId] = useState<string | null>(null);
  /** 协作流程节点（提升到顶层，防止 TabPanel 关闭时丢失） */
  const [collabNodes, setCollabNodes] = useState<FlowNode[]>(() => [makeFlowNode(0)]);
  /** 当前是否为项目模式（可动态升级/降级） */
  const [isProjectMode, setIsProjectMode] = useState<boolean>(() => !!incomingProjectId);
  /** 当前参与会话的智能体名称列表（项目模式下可增删，任务模式下只有1个） */
  const [participatingAgentNames, setParticipatingAgentNames] = useState<string[]>(
    () => incomingAgentNames ?? []
  );
  /** 顶部优先级下拉是否展开 */
  const [showPriorityDropdown, setShowPriorityDropdown] = useState(false);
  const priorityDropdownRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  /** 已自动建任务的 panelId 集合，避免同一会话重复创建 */
  const createdTaskPanels = useRef<Set<string>>(new Set());

  /** 浏览器网络是否在线 */
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const handleOnline  = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online',  handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online',  handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  /** 顶部状态徽标：离线 > 忙碌 > 运行中 */
  const isAnyStreaming = openPanels.some(p => p.isStreaming);
  type AppStatus = 'running' | 'offline' | 'busy';
  const appStatus: AppStatus = !isOnline || !wsConnected ? 'offline' : isAnyStreaming ? 'busy' : 'running';
  const STATUS_CONFIG: Record<AppStatus, { label: string; bg: string; color?: string; border: string; dotColor: string }> = {
    running: { label: '运行中', bg: '#e8f5e9', color: '#2e7d32', border: '#dcedc8', dotColor: '#22c55e' },
    offline: { label: '离线',   bg: '#fef2f2', color: '#b91c1c', border: '#fecaca', dotColor: '#ef4444' },
    busy:    { label: '忙碌',   bg: '#fffbeb', color: '#b45309', border: '#fde68a', dotColor: '#f59e0b' },
  };

  /* ── 取当前工作台的会话 panel（按 activePanelId 查找，兜底取第一个） ── */
  const activePanel = (activePanelId ? openPanels.find(p => p.id === activePanelId) : null) ?? openPanels[0] ?? null;

  /* ── 动态数据：优先用跳转传入的项目名 > currentProject > 第一个项目 ── */
  const taskName = incomingProjectName ?? currentProject?.title ?? (projects[0]?.title ?? 'WorkBuddy');

  /* ── 标签页重命名状态 ── */
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editingTabTitle, setEditingTabTitle] = useState('');

  /** 新建标签页弹窗状态 */
  const [showNewTabModal, setShowNewTabModal] = useState(false);
  const [restoreReady, setRestoreReady] = useState(false);

  /** 模型切换下拉状态 */
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [modelDropdownTabId, setModelDropdownTabId] = useState<string | null>(null);
  const modelDropdownRef = useRef<HTMLDivElement>(null);

  /** 点击外部关闭模型切换下拉 */
  useEffect(() => {
    if (!showModelDropdown) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(e.target as Node)) {
        setShowModelDropdown(false);
        setModelDropdownTabId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showModelDropdown]);

  const taskProgress = 68; // 真实进度字段后端暂无，保留占位

  /* ── 上下文使用量计算（仅前端估算，不代表模型真实 usage） ── */
  const activeAgent = activePanel?.agentId ? agents.find(a => a.id === activePanel.agentId) : null;
  const activeModelName = activeAgent?.modelName || 'GLM-5';
  const panelMessages = activePanel?.messages || [];
  const totalChars = panelMessages.reduce((sum, msg) => sum + (msg.content?.length || 0), 0);
  const messageCount = panelMessages.length;
  const draftChars = inputValue.length;
  // 改为按实际字符长度粗估：
  // - 中文/混合文本按约 1~1.2 char/token 做保守估算
  // - 每条消息补少量结构开销
  // - 再加一小段系统提示/路由开销
  const estimatedTokens = Math.max(
    1000,
    Math.round(totalChars * 1.1 + draftChars * 1.1 + messageCount * 80 + 1500)
  );
  const contextLimit = 200000; // 默认 200k
  const contextUsedK = estimatedTokens >= 1000 ? (estimatedTokens / 1000).toFixed(1).replace(/\.0$/, '') : '1';
  const contextMaxK = Math.round(contextLimit / 1000);
  const contextPct = Math.min(100, Math.max(1, Math.round((estimatedTokens / contextLimit) * 100)));

  const formatMessageTime = (value?: string) => {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  };

  /* ── 找到 kanban 中对应的项目（项目模式用来读写 tags/priority）── */
  const allKanbanProjects = [...kanbanProjects.progress, ...kanbanProjects.done];
  const matchedKanbanProject =
    (incomingProjectId ? allKanbanProjects.find(p => p.id === incomingProjectId) : undefined)
    ?? (incomingProjectName && !incomingTaskId ? allKanbanProjects.find(p => p.title === incomingProjectName) : undefined)
    ?? null;

  /* ── 找到 taskStore 中对应的任务（任务模式用来读写 tags/priority）── */
  const allTasks = [...tasks.progress, ...tasks.done];
  const matchedTask = incomingTaskId ? allTasks.find(t => t.id === incomingTaskId) ?? null : null;

  /* ── 统一的 tags / priority 数据源：任务模式用 taskStore，项目模式用 kanbanStore ── */
  const currentTags: string[] = matchedTask?.tags ?? matchedKanbanProject?.tags ?? [];
  const currentPriority: ProjectPriority | null = (matchedTask?.priority as ProjectPriority | undefined) ?? matchedKanbanProject?.priority ?? null;

  /* ── 优先级读写 ──────────────────────────────────────────── */
  function setPriority(p: ProjectPriority) {
    if (matchedTask) {
      updateTask(matchedTask.id, { priority: p as 'high' | 'mid' | 'low' });
    } else if (matchedKanbanProject) {
      updateKanbanProject(matchedKanbanProject.id, { priority: p });
    }
  }

  /* ── 任务升级为项目 ─────────────────────────────────────── */
  function upgradeToProject(newAgentNames: string[]) {
    // 将新增的智能体 Panel 打开
    const allNames = [...new Set([...participatingAgentNames, ...newAgentNames])];
    setParticipatingAgentNames(allNames);
    setIsProjectMode(true);
    // 在看板 store 新建一条项目记录（如果还没有匹配项目）
    if (!matchedKanbanProject || matchedKanbanProject.agents.length < 2) {
      const participantAgents = agents
        .filter(a => allNames.includes(a.name))
        .map(a => ({ name: a.name, color: a.color ?? '#6366f1' }));
      const dueDate30 = new Date(Date.now() + 30 * 86400000);
      const mm = String(dueDate30.getMonth() + 1).padStart(2, '0');
      const dd = String(dueDate30.getDate()).padStart(2, '0');
      addKanbanProject({
        id: matchedKanbanProject?.id ?? `proj_upgrade_${Date.now()}`,
        title: taskName,
        description: '',
        tags: currentTags,
        priority: currentPriority ?? 'low',
        agent: participantAgents[0]?.name ?? '策划助手',
        agentColor: participantAgents[0]?.color ?? '#6366f1',
        agents: participantAgents.length >= 2 ? participantAgents : [
          ...(participantAgents.length > 0 ? participantAgents : [{ name: '策划助手', color: '#6366f1' }]),
          { name: allNames[1] ?? allNames[0] ?? '研究员', color: '#3b82f6' },
        ],
        progress: 0,
        dueDate: `${mm}/${dd}`,
        updatedAt: '刚刚',
        taskCount: collabNodes.length,
        memberCount: allNames.length,
      }, 'progress');
    } else {
      // 已有项目记录则只更新 agents 列表
      const participantAgents = agents
        .filter(a => allNames.includes(a.name))
        .map(a => ({ name: a.name, color: a.color ?? '#6366f1' }));
      updateKanbanProject(matchedKanbanProject.id, { agents: participantAgents, memberCount: allNames.length });
    }
  }

  /* ── 项目降级为任务 ─────────────────────────────────────── */
  function downgradeToTask(keptAgentName: string) {
    setParticipatingAgentNames([keptAgentName]);
    setIsProjectMode(false);
    // 关闭非保留智能体的所有 Panel
    openPanels.forEach(p => {
      if (p.agentName !== keptAgentName) closePanel(p.id);
    });
    setActivePanelId(prev => {
      const kept = openPanels.find(p => p.agentName === keptAgentName);
      return kept ? kept.id : prev;
    });
    // 清空协作节点，回到初始单节点
    setCollabNodes([makeFlowNode(0)]);
  }

  /* ── 点击空白处关闭优先级下拉 ──────────────────────────── */
  useEffect(() => {
    if (!showPriorityDropdown) return;
    function handleClickOutside(e: MouseEvent) {
      if (priorityDropdownRef.current && !priorityDropdownRef.current.contains(e.target as Node)) {
        setShowPriorityDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showPriorityDropdown]);

  /* ── 初始化：加载项目 + 智能体列表 + WS 连接 + 恢复会话 ── */
  // Day 2 修复:taskStore 和 projectKanbanStore 的 restoreFromPersist() 此前从未被调用，
  // 导致任务看板/项目看板刷新后始终为空（数据源只靠 addTask/addProject 局部写入，不拉后端存量数据）。
  // 现在在 conversationStore 恢复完成后，链式触发任务和项目看板的数据恢复。
  useEffect(() => {
    fetchProjects();
    fetchAgents();
    connect();
    restoreFromPersist().then(() => {
      const panels = useConversationStore.getState().openPanels;
      const tabs = useConversationStore.getState().sessionTabs;
      const activeTabId = useConversationStore.getState().activeTabId;

      // 设置激活的面板：优先通过 activeTab -> panelId 映射，避免多 tab 场景下按 tabId 误查 panel
      if (activeTabId) {
        const activeTab = tabs.find(t => t.id === activeTabId);
        if (activeTab?.panelId) {
          setActivePanelId(activeTab.panelId);
        } else if (panels.length > 0) {
          setActivePanelId(panels[0].id);
        }
      } else if (panels.length > 0) {
        setActivePanelId(panels[0].id);
      }

      setRestoreReady(true);
    }).catch(() => {
      setRestoreReady(true);
    });

    // Day 2: 任务看板恢复（此前从未调用，刷新后任务列表丢失）
    useTaskStore.getState().restoreFromPersist().catch(() => {});
    // Day 2: 项目看板恢复（此前从未调用，刷新后项目看板为空）
    useProjectKanbanStore.getState().restoreFromPersist().catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── 从会话列表/kanban 进入工作区：会话列表页已创建 tab，这里只负责激活它 ── */
  const handledNavKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!restoreReady || !navState?.sessionId) return;

    const navKey = `${location.key}:${navState.sessionId}:${navState.precreatedTabId || ''}:${navState.navNonce || ''}`;
    if (handledNavKeyRef.current === navKey) return;
    handledNavKeyRef.current = navKey;

    if (navState.precreatedTabId) {
      switchTab(navState.precreatedTabId);
      const tabs = useConversationStore.getState().sessionTabs;
      const hitTab = tabs.find(t => t.id === navState.precreatedTabId);
      if (hitTab?.panelId) {
        setActivePanelId(hitTab.panelId);
      }
      return;
    }

    // 兜底：其他来源未预创建 tab，仍允许在 workspace 内创建
    conversationsApi.list().then(convList => {
      const conv = convList.find(c => c.id === navState.sessionId);
      const agentId = conv?.currentAgentId || conv?.agentId || conv?.agentIds?.[0] || '';
      const agentName = conv?.title || navState.projectName || '会话';
      createSessionTabFn({
        agentId,
        agentName,
        agentColor: '#6366f1',
        title: agentName,
        conversationId: navState.sessionId!,
        forceNewTab: true,
      }).then((newTabId) => {
        const tabs = useConversationStore.getState().sessionTabs;
        const hitTab = tabs.find(t => t.id === newTabId);
        if (hitTab?.panelId) {
          setActivePanelId(hitTab.panelId);
        }
        switchTab(newTabId);
      });
    }).catch(() => {});
  }, [restoreReady, location.key, navState?.sessionId, navState?.projectName, navState?.precreatedTabId, navState?.navNonce, createSessionTabFn, switchTab]);

  /* ── activeTab 变化时同步 activePanel，避免标签切换后仍指向旧面板 ── */
  useEffect(() => {
    const tab = allTabs.find(t => t.id === storeActiveId);
    if (tab?.panelId) {
      setActivePanelId(tab.panelId);
    }
  }, [allTabs, storeActiveId]);

  /* ── 消息列表滚动到底部 ─────────────────────────────────── */
  const welcomeAreaRef = useRef<HTMLDivElement | null>(null);
  const prevMsgCountRef = useRef(0);
  const lastScrollHeightRef = useRef(0);

  useEffect(() => {
    const msgCount = activePanel?.messages?.length || 0;
    const isStreaming = activePanel?.isStreaming;
    const scrollContainer = welcomeAreaRef.current;

    // 流式输出时：持续跟随到底部（用 scrollTop 直接设置，避免 smooth scroll 与内容增长打架）
    // 每次内容增长最多只触发一次滚动，不会高频抖动
    if (isStreaming && scrollContainer) {
      const currentScrollHeight = scrollContainer.scrollHeight;
      // 只在 scrollHeight 真正增长时滚动，避免无意义重复调用
      if (currentScrollHeight > lastScrollHeightRef.current + 20) {
        scrollContainer.scrollTop = currentScrollHeight;
        lastScrollHeightRef.current = currentScrollHeight;
      }
    }

    // 新消息完成时：平滑滚动到底部
    if (msgCount > prevMsgCountRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      if (scrollContainer) lastScrollHeightRef.current = scrollContainer.scrollHeight;
    } else if (msgCount < prevMsgCountRef.current) {
      // 消息减少（如清除/重新加载）时瞬间滚动
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
      if (scrollContainer) lastScrollHeightRef.current = scrollContainer.scrollHeight;
    }

    prevMsgCountRef.current = msgCount;
  }, [activePanel?.messages, activePanel?.isStreaming]);

  /* ── 发送消息 ─────────────────────────────────────────────── */
  async function handleSend() {
    const text = inputValue.trim();
    if (!text) return;

    let panelId: string | undefined;
    let agentName = '';
    let agentColor = '#9ca3af';

    if (activePanel && !activePanel.id.startsWith('local-')) {
      // 已有有效会话 panel，直接发消息
      sendMessage(activePanel.id, text);
      panelId = activePanel.id;
      agentName = activePanel.agentName;
      agentColor = activePanel.agentColor ?? '#9ca3af';
    } else if (!activePanel || activePanel.id.startsWith('local-')) {
      // 没有 panel 或 panel 是本地临时面板：必须通过 createSessionTabFn 建会话。
      //
      // ⚠️ 关键回归 BUG（2026-05-06）：
      // 之前这里直接调用 openPanel，只会创建 openPanels，不会创建 sessionTabs。
      // 而刷新恢复的 UI 真相源恰恰是 sessionTabs（openPanels 不再持久化）。
      // 结果就是：用户首条消息能正常聊，但因为没有持久化 tab，刷新后看起来像“会话全丢”。
      const defaultAgent = agents[0];
      if (defaultAgent) {
        const newTabId = await createSessionTabFn({
          agentId: defaultAgent.id,
          agentName: defaultAgent.name,
          agentColor: defaultAgent.color,
          title: defaultAgent.name,
        });
        const state = useConversationStore.getState();
        const hitTab = state.sessionTabs.find(t => t.id === newTabId);
        const freshPanel = hitTab?.panelId
          ? state.openPanels.find(p => p.id === hitTab.panelId)
          : state.openPanels[0];
        if (freshPanel) {
          setActivePanelId(freshPanel.id);
          sendMessage(freshPanel.id, text);
          panelId = freshPanel.id;
        }
        agentName = defaultAgent.name;
        agentColor = defaultAgent.color ?? '#9ca3af';
      }
    }

    // 每个会话只自动建一次任务（第一条消息触发）
    if (panelId && !createdTaskPanels.current.has(panelId)) {
      createdTaskPanels.current.add(panelId);
      addTaskFromChat({
        title: text,
        agentName: agentName || '智能体',
        agentColor,
        panelId,
      });
    }

    setInputValue('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.ctrlKey) { e.preventDefault(); handleSend(); }
  }

  function handleTabClick(tab: string) {
    if (tab === '消息渠道') {
      setActiveSideTab(null);
      setShowChannelModal(true);
    } else {
      setActiveSideTab(activeSideTab === tab ? null : tab);
    }
  }

  const progressColor = getProgressColor(taskProgress);

  /* ── 渲染消息列表 ──────────────────────────────────────── */
  const messages = activePanel?.messages ?? [];

  return (
    <>
      <style>{`
        .workspace-body {
          width: 100%; height: 100%; background: #f5f7fa;
          padding: 0 16px 16px; box-sizing: border-box; display: flex; flex-direction: column;
        }
        .layout-container {
          flex: 1; min-height: 0;
          display: flex; flex-direction: column;
          background: #fafbfc; border: 1px solid #e5e6eb;
          border-radius: 12px; box-shadow: 0 1px 4px rgba(0,0,0,0.05);
          font-family: "Microsoft YaHei", "Segoe UI", sans-serif;
          overflow: hidden;
        }
        .content-header {
          display: flex; align-items: center; gap: 10px;
          padding: 16px 32px; border-bottom: 1px solid #ebedf0;
          flex-shrink: 0; background: #ffffff;
        }
        .content-header .brand-name {
          font-size: 16px; font-weight: 700; color: #1a1d23;
        }
        .status-badge {
          font-size: 12px; padding: 2px 8px; border-radius: 20px;
          white-space: nowrap; display: inline-flex; align-items: center; gap: 5px;
          font-weight: 500; transition: background 0.3s, color 0.3s;
          border: 1px solid;
        }
        .welcome-area {
          flex: 1; min-height: 0; background: #ffffff; overflow-y: auto; overflow-x: hidden;
          scroll-behavior: auto; /* 流式输出时用 scrollTop 直接控制，不要 CSS smooth */
        }
        .function-tabs {
          display: flex; gap: 8px; padding: 10px 20px; flex-wrap: wrap;
          border-bottom: 1px solid #ebedf0; flex-shrink: 0; background: #fafbfc;
        }
        .function-tab {
          padding: 4px 10px; background: #ffffff; border: 1px solid #d9d9d9;
          border-radius: 4px; font-size: 12px; color: #333; cursor: pointer;
          transition: all 0.15s; user-select: none;
        }
        .function-tab:hover { border-color: #1890ff; color: #1890ff; }
        .function-tab.active { background: #e6f4ff; border-color: #1890ff; color: #1890ff; }
        .input-container {
          position: relative; padding: 16px 20px 12px; flex-shrink: 0;
          background: #fafbfc; border-top: 1px solid #ebedf0;
        }
        .resize-bar {
          display: flex; align-items: center; justify-content: center;
          height: 10px; cursor: ns-resize; border-radius: 6px 6px 0 0;
          background: rgba(140,111,255,0.06); transition: background 0.15s;
          margin-bottom: -1px;
        }
        .resize-bar:hover { background: rgba(140,111,255,0.15); }
        .resize-bar::after {
          content: ''; width: 48px; height: 4px; border-radius: 999px;
          background: #c4b5fd; transition: background 0.15s;
        }
        .resize-bar:hover::after { background: #8c6fff; }
        .main-input {
          width: 100%; padding: 12px 50px 12px 14px; border: 1px solid #d9d9d9;
          border-radius: 0 0 8px 8px; min-height: 96px; max-height: 300px; resize: none; background: #ffffff;
          font-size: 14px; font-family: "Microsoft YaHei", "Segoe UI", sans-serif;
          color: #1a1d23; line-height: 1.6; box-sizing: border-box; outline: none;
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .main-input:focus { border-color: #1890ff; box-shadow: 0 0 0 2px rgba(24,144,255,0.2); }
        .send-btn {
          position: absolute; right: 30px; bottom: 22px;
          width: 32px; height: 32px; border-radius: 50%;
          background: #8c6fff; border: none; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          transition: background 0.15s, transform 0.1s;
        }
        .send-btn:hover { background: #7c5ef0; transform: scale(1.08); }
        .send-btn:active { transform: scale(0.95); }
        .send-btn svg { display: block; }
        .progress-bar-area {
          flex-shrink: 0; padding: 10px 20px 14px;
          border-bottom-left-radius: 12px; border-bottom-right-radius: 12px;
          background: #fafbfc;
        }
        .progress-bar-header {
          display: flex; align-items: center; justify-content: space-between; margin-bottom: 7px;
        }
        .progress-bar-label { font-size: 12px; color: #8c8f9a; }
        .progress-bar-pct { font-size: 12px; font-weight: 600; }
        .progress-track {
          width: 100%; height: 5px; border-radius: 99px;
          background: #ebedf0; overflow: hidden; box-sizing: border-box;
        }
        .progress-fill { height: 100%; border-radius: 99px; transition: width 0.6s ease; }
        .workspace-tabbar {
          display: flex; align-items: flex-end; min-height: 46px; padding: 0; flex-shrink: 0;
          overflow-x: auto; gap: 4px; background: #fafbfc; box-sizing: border-box;
          scrollbar-width: none; -ms-overflow-style: none;
        }
        .workspace-tabbar::-webkit-scrollbar { display: none; }
        .workspace-tab {
          display: flex; align-items: center; gap: 8px;
        }
        .workspace-tab-title {
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 160px;
        }
        .workspace-tab-close {
          display: flex; align-items: center; justify-content: center;
          width: 20px; height: 20px; border-radius: 6px; opacity: 0.4;
          cursor: pointer; transition: all 0.15s; margin-left: 4px;
        }
        .workspace-tab-add {
          display: flex; align-items: center; justify-content: center;
          width: 36px; height: 36px; background: transparent; border: 1px dashed #d1d5db;
          border-radius: 8px; cursor: pointer; color: #9ca3af; flex-shrink: 0;
          transition: all 0.2s; margin-bottom: 4px;
        }
        .workspace-message-row { display: flex; margin-bottom: 12px; }
        .workspace-message-row.is-user { justify-content: flex-end; }
        .workspace-message-row.is-agent { justify-content: flex-start; }
        .workspace-message-wrap { max-width: 72%; }
        .workspace-message-meta {
          display: flex; align-items: center; gap: 6px; margin-bottom: 4px;
          font-size: 11px; color: #9ca3af;
        }
        .workspace-message-bubble {
          max-width: 100%; padding: 8px 14px; font-size: 13px; line-height: 1.6;
          word-break: break-word; overflow-wrap: break-word;
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.4); }
        }
        /* Markdown 渲染样式 */
        .markdown-body table {
          border-collapse: collapse;
          width: 100%;
          margin: 8px 0;
          font-size: 12px;
        }
        .markdown-body th, .markdown-body td {
          border: 1px solid #d1d5db;
          padding: 6px 10px;
          text-align: left;
        }
        .markdown-body th {
          background: #f3f4f6;
          font-weight: 600;
        }
        .markdown-body code {
          background: rgba(0,0,0,0.08);
          padding: 1px 5px;
          border-radius: 3px;
          font-size: 12px;
          font-family: 'Menlo','Consolas','Courier New',monospace;
        }
        .markdown-body pre {
          background: #f5f5f5;
          border: 1px solid #e5e5e5;
          color: #1a1a1a;
          padding: 12px;
          border-radius: 6px;
          overflow-x: auto;
          font-size: 12px;
          margin: 8px 0;
        }
        .markdown-body pre code {
          background: none;
          padding: 0;
          color: inherit;
        }
        .markdown-body strong { font-weight: 700; }
        .markdown-body em { font-style: italic; }
        .markdown-body ul, .markdown-body ol {
          padding-left: 20px;
          margin: 6px 0;
        }
        .markdown-body li { margin: 3px 0; }
        .markdown-body h1, .markdown-body h2, .markdown-body h3, .markdown-body h4 {
          margin: 10px 0 6px;
          font-weight: 700;
          line-height: 1.4;
        }
        .markdown-body h1 { font-size: 16px; }
        .markdown-body h2 { font-size: 15px; }
        .markdown-body h3 { font-size: 14px; }
        .markdown-body h4 { font-size: 13px; }
        .markdown-body blockquote {
          border-left: 3px solid #d1d5db;
          padding-left: 12px;
          color: #6b7280;
          margin: 6px 0;
        }
        /* 深色背景下的 markdown */
        .bubble-dark .markdown-body code {
          background: rgba(255,255,255,0.15);
        }
        .bubble-dark .markdown-body pre {
          background: rgba(255,255,255,0.1);
          border-color: rgba(255,255,255,0.2);
          color: #f0f0f0;
        }
        .bubble-dark .markdown-body blockquote {
          border-left-color: rgba(255,255,255,0.3);
          color: rgba(255,255,255,0.7);
        }
        @media (max-width: 768px) {
          .workspace-body { padding: 0 !important; }
          .layout-container { border-radius: 0 !important; min-height: 100%; }
          .content-header {
            flex-direction: column; align-items: flex-start; gap: 6px;
            padding: 12px 14px !important;
          }
          .workspace-tabbar {
            min-height: 42px !important;
            padding: 0 8px !important;
            gap: 6px !important;
          }
          .workspace-tab {
            min-width: 96px !important;
            max-width: 180px;
            padding: 10px 12px 8px !important;
            gap: 6px !important;
            font-size: 13px !important;
          }
          .workspace-tab-title { max-width: 92px !important; }
          .workspace-tab-close {
            opacity: 1 !important;
            width: 18px !important;
            height: 18px !important;
            margin-left: 0 !important;
          }
          .workspace-tab-add {
            width: 32px !important;
            height: 32px !important;
            margin: 0 0 4px 0 !important;
          }
          .welcome-area.has-messages { padding: 12px 12px 20px !important; }
          .workspace-message-row { margin-bottom: 10px !important; }
          .workspace-message-wrap { max-width: 88% !important; }
          .workspace-message-meta { flex-wrap: wrap !important; gap: 4px 6px !important; }
          .workspace-message-bubble {
            padding: 8px 10px !important;
            font-size: 13px !important;
          }
          .function-tabs {
            gap: 6px !important;
            padding: 8px 10px !important;
            flex-wrap: nowrap !important;
            overflow-x: auto !important;
            scrollbar-width: none;
            -ms-overflow-style: none;
          }
          .function-tabs::-webkit-scrollbar { display: none; }
          .function-tab {
            flex-shrink: 0;
            white-space: nowrap;
          }
          .input-container {
            padding: 12px 10px calc(10px + env(safe-area-inset-bottom)) !important;
          }
          .resize-bar { display: none !important; }
          .main-input {
            min-height: 84px !important;
            max-height: 180px !important;
            font-size: 16px !important;
            padding: 12px 46px 12px 12px !important;
            border-radius: 10px !important;
          }
          .send-btn {
            right: 20px !important;
            bottom: calc(18px + env(safe-area-inset-bottom)) !important;
            width: 34px !important;
            height: 34px !important;
          }
          .progress-bar-area {
            padding: 8px 10px calc(10px + env(safe-area-inset-bottom)) !important;
          }
          .progress-bar-header {
            gap: 8px !important;
            align-items: flex-start !important;
          }
          .progress-bar-label {
            font-size: 11px !important;
            line-height: 1.4;
          }
          .progress-bar-pct {
            font-size: 11px !important;
            flex-shrink: 0;
          }
          .markdown-body table {
            display: block;
            overflow-x: auto;
            white-space: nowrap;
          }
        }
      `}</style>

      <div className="workspace-body">
        <div className="layout-container">

          {/* ── 浏览器风格多标签栏 ── */}
          <div className="workspace-tabbar" style={{ display: 'flex', alignItems: 'flex-end', minHeight: 46, padding: '0', flexShrink: 0, overflowX: 'auto', gap: 4, background: '#fafbfc', boxSizing: 'border-box' }}>
            {allTabs.map((tab) => {
              const isActive = tab.id === storeActiveId;
              const hasSession = tab.type === 'session' && !!tab.panelId;
              return (
                <div
                  key={tab.id}
                  className="workspace-tab"
                  onClick={() => switchTab(tab.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: isActive ? '14px 20px 10px' : '12px 18px 10px',
                    background: isActive ? '#fff' : 'transparent',
                    borderRadius: '8px 8px 0 0',
                    border: isActive ? '1px solid #e5e7eb' : '1px solid transparent',
                    borderBottom: 'none',
                    cursor: 'pointer', minWidth: 120, flexShrink: 0,
                    color: isActive ? '#1f2937' : '#6b7280',
                    fontSize: 14, fontWeight: isActive ? 600 : 500,
                    transition: 'all 0.2s ease',
                    boxShadow: isActive ? '0 -2px 8px rgba(0,0,0,0.06)' : 'none',
                    position: 'relative',
                    marginBottom: isActive ? -3 : -1,
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.background = '#f3f4f6';
                      e.currentTarget.style.color = '#374151';
                      e.currentTarget.style.boxShadow = '0 -2px 8px rgba(0,0,0,0.06)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.color = '#6b7280';
                      e.currentTarget.style.boxShadow = 'none';
                    }
                  }}
                >
                  {/* 会话状态指示器 */}
                  {hasSession ? (
                    <div style={{
                      width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                      background: tab.color || '#6366f1',
                      boxShadow: `0 0 6px ${tab.color || '#6366f1'}66`,
                    }} />
                  ) : (
                    <div style={{
                      width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                      background: '#d1d5db',
                    }} />
                  )}

                  {editingTabId === tab.id ? (
                    <input
                      type="text"
                      value={editingTabTitle}
                      onChange={(e) => setEditingTabTitle(e.target.value)}
                      onBlur={() => {
                        if (editingTabTitle.trim()) renameTab(tab.id, editingTabTitle.trim());
                        setEditingTabId(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && editingTabTitle.trim()) { renameTab(tab.id, editingTabTitle.trim()); setEditingTabId(null); }
                        if (e.key === 'Escape') { setEditingTabId(null); setEditingTabTitle(''); }
                      }}
                      onClick={(e) => e.stopPropagation()}
                      autoFocus
                      style={{
                        border: 'none', outline: 'none', background: 'transparent',
                        fontSize: 14, fontWeight: 'inherit', color: 'inherit',
                        width: 120, padding: 0, fontFamily: 'inherit',
                      }}
                    />
                  ) : (
                    <span
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        setEditingTabId(tab.id);
                        setEditingTabTitle(tab.title);
                      }}
                      className="workspace-tab-title"
                      style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}
                      title="双击重命名"
                    >{tab.title}</span>
                  )}
                  {tab.type !== 'home' && (
                    <span
                      className="workspace-tab-close"
                      onClick={(e) => { e.stopPropagation(); closeTabFn(tab.id); }}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, borderRadius: 6, opacity: 0.4, cursor: 'pointer', transition: 'all 0.15s', marginLeft: 4 }}
                    onMouseEnter={(e) => { e.stopPropagation(); e.currentTarget.style.background = '#fee2e2'; e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = '#ef4444'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.opacity = '0.4'; e.currentTarget.style.color = 'inherit'; }}
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 3L9 9M9 3L3 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
                    </span>
                  )}
                </div>
              );
            })}
            <button
              className="workspace-tab-add"
              onClick={() => setShowNewTabModal(true)}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, background: 'transparent', border: '1px dashed #d1d5db', borderRadius: 8, cursor: 'pointer', color: '#9ca3af', flexShrink: 0, transition: 'all 0.2s', marginBottom: 4 }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#f3f4f6'; e.currentTarget.style.borderColor = '#9ca3af'; e.currentTarget.style.color = '#6b7280'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = '#d1d5db'; e.currentTarget.style.color = '#9ca3af'; }}
              title="新增标签页"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 3V13M3 8H13" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
            </button>

            {/* 模型切换下拉选择 */}
            {showModelDropdown && modelDropdownTabId && (() => {
              const targetTab = allTabs.find(t => t.id === modelDropdownTabId);
              const targetAgent = targetTab?.agentId ? agents.find(a => a.id === targetTab.agentId) : null;
              if (!targetAgent) return null;
              return createPortal(
                <div
                  ref={modelDropdownRef}
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    position: 'fixed', top: 60, left: '50%', transform: 'translateX(-50%)',
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
                              await fetch(`/api/agents/${targetAgent.id}`, {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ modelName: model.id }),
                              });
                              await fetchAgents();
                              setShowModelDropdown(false);
                              setModelDropdownTabId(null);
                              showToast('模型已更新为 ' + model.label);
                            } catch (err) {
                              showToast('更新模型失败');
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
                    onClick={() => { setShowModelDropdown(false); setModelDropdownTabId(null); }}
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

          {/* ══════════ 对话工作台 ══════════ */}

          {/* 多智能体 Agent 栏（仅跟随当前激活 tab 对应的 panel） */}
          {activePanel && (
            <SessionAgentBar
              conversationId={activePanel.conversationId}
              participants={(agents ?? []).filter(a => activePanel.agentIds.includes(a.id)).map(a => ({ id: a.id, name: a.name, color: a.color }))}
              onParticipantsChange={async (updatedConversation) => {
                // 这里只同步参与者列表/agent 元数据，绝不能新开 tab。
                // “切换 agent”应始终留在当前会话、当前 panel、当前 tab 内完成。
                await fetchAgents();
                if (!updatedConversation) return;
                useConversationStore.setState((state) => ({
                  openPanels: state.openPanels.map((panel) =>
                    panel.conversationId === activePanel.conversationId || panel.id === activePanel.conversationId
                      ? {
                          ...panel,
                          sessionCode: (updatedConversation as any).sessionCode || panel.sessionCode,
                          agentId: updatedConversation.currentAgentId || panel.agentId,
                          currentAgentCode: (updatedConversation as any).currentAgentCode || panel.currentAgentCode,
                          agentIds: updatedConversation.agentIds?.length ? updatedConversation.agentIds : panel.agentIds,
                        }
                      : panel
                  ),
                  sessionTabs: state.sessionTabs.map((tab) =>
                    tab.conversationId === activePanel.conversationId || tab.panelId === activePanel.conversationId
                      ? {
                          ...tab,
                          sessionCode: (updatedConversation as any).sessionCode || tab.sessionCode,
                          agentId: updatedConversation.currentAgentId || tab.agentId,
                          currentAgentCode: (updatedConversation as any).currentAgentCode || tab.currentAgentCode,
                        }
                      : tab
                  ),
                }));
              }}
            />
          )}
          {/*
            2. 消息展示区：panel 层叠保留，但只展示当前激活 tab 对应的 panel
            关键体验修复（2026-05-06）：
            - 底部保留适度留白，避免最后一条消息紧贴输入区
            - 消息恢复显示“智能体名称 + 时间”元信息
            - 流式输出时恢复可见光标反馈，避免误以为流式失效
          */}
          <div ref={welcomeAreaRef} className={`welcome-area ${messages.length ? 'has-messages' : 'is-empty'}`} style={{ padding: messages.length ? '16px 24px 32px' : 0, position: 'relative' }}>
            {openPanels.map((panel) => {
              const isActivePanel = activePanel?.id === panel.id;
              const panelMessages = panel.messages ?? [];
              return (
                <div
                  key={panel.id}
                  style={{
                    position: isActivePanel ? 'relative' : 'absolute',
                    inset: isActivePanel ? 'auto' : 0,
                    display: isActivePanel ? 'block' : 'none',
                    height: '100%',
                    width: '100%',
                  }}
                >
                  {panelMessages.length === 0 && (
                    <div style={{
                      height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexDirection: 'column', gap: 8, color: '#c0c4ce',
                    }}>
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                      </svg>
                      <span style={{ fontSize: 13 }}>输入消息与智能体开始对话</span>
                    </div>
                  )}
                  {panelMessages.map((msg) => {
                    const isStreamingMessage = Boolean(msg.streaming || panel.streamingMessageId === msg.id);
                    const msgAgent = msg.role === 'user'
                      ? null
                      : (msg.agentId ? agents.find(a => a.id === msg.agentId) : null) || { name: panel.agentName, color: panel.agentColor, modelName: undefined as string | undefined };
                    const metaLabel = msg.role === 'user' ? '你' : (msgAgent?.name || panel.agentName || '智能体');
                    const metaTime = formatMessageTime(msg.createdAt);

                    return (
                      <div key={msg.id} className={`workspace-message-row ${msg.role === 'user' ? 'is-user' : 'is-agent'}`} style={{
                        display: 'flex',
                        justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                        marginBottom: 12,
                      }}>
                        <div className="workspace-message-wrap" style={{ maxWidth: '72%' }}>
                          <div className="workspace-message-meta" style={{
                            display: 'flex',
                            justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                            alignItems: 'center',
                            gap: 6,
                            marginBottom: 4,
                            fontSize: 11,
                            color: '#9ca3af',
                          }}>
                            <span style={{ color: msg.role === 'user' ? '#6b7280' : (msgAgent?.color || '#6b7280'), fontWeight: 600 }}>
                              {metaLabel}
                            </span>
                            {msg.role !== 'user' && msgAgent?.modelName && (
                              <span style={{
                                display: 'inline-flex', alignItems: 'center', gap: 2,
                                padding: '1px 6px', borderRadius: 8,
                                background: '#f3f4f6', border: '1px solid #e5e7eb',
                                fontSize: 10, color: '#6b7280', fontWeight: 500,
                              }}>
                                {msgAgent.modelName}
                              </span>
                            )}
                            {metaTime && <span>{metaTime}</span>}
                          </div>
                          <div className="workspace-message-bubble" style={{
                            maxWidth: '100%', padding: '8px 14px',
                            borderRadius: msg.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                            background: msg.role === 'user' ? '#2a3b4d' : '#f3f4f6',
                            color: msg.role === 'user' ? '#fff' : '#1a202c',
                            fontSize: 13, lineHeight: 1.6,
                            wordBreak: 'break-word',
                            overflowWrap: 'break-word',
                          }}>
                            {msg.content ? (
                              <div className={`markdown-body${msg.role === 'user' ? ' bubble-dark' : ''}`} style={{ ...(msg.role === 'user' ? { color: '#fff' } : {}) }}>
                                <ReactMarkdown
                                  remarkPlugins={[remarkGfm]}
                                  components={{
                                    code: ({ node, inline, className, children, ...props }: any) => {
                                      const match = /language-(\w+)/.exec(className || '');
                                      const language = match ? match[1] : 'text';
                                      if (inline) {
                                        return <code className={className} {...props}>{children}</code>;
                                      }
                                      return (
                                        <SyntaxHighlighter
                                          style={oneLight}
                                          language={language}
                                          PreTag="div"
                                          {...props}
                                        >
                                          {String(children).trimEnd()}
                                        </SyntaxHighlighter>
                                      );
                                    }
                                  }}
                                >
                                  {msg.content}
                                </ReactMarkdown>
                                {isStreamingMessage && (
                                  <span style={{ display: 'inline-block', marginLeft: 4, opacity: 0.7, color: '#8c6fff', fontWeight: 700 }}>|</span>
                                )}
                              </div>
                            ) : (
                              <span style={{ opacity: 0.45 }}>{isStreamingMessage ? '正在生成...' : '●●●'}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {isActivePanel && (
                    <>
                      {/* 真实底部留白：保留一点呼吸感即可，避免最后一条消息贴输入区 */}
                      <div style={{ height: 6, flexShrink: 0 }} />
                      <div ref={messagesEndRef} />
                    </>
                  )}
                </div>
              );
            })}
          </div>

          {/* 3. 功能标签栏 */}
          <div className="function-tabs">
            {FUNCTION_TABS.map(tab => (
              <button
                key={tab}
                className={`function-tab${activeSideTab === tab ? ' active' : ''}`}
                onClick={() => handleTabClick(tab)}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* 4. 输入区 */}
          <div className="input-container">
            <div
              className="resize-bar"
              onMouseDown={e => {
                e.preventDefault();
                const startY = e.clientY;
                const ta = textareaRef.current;
                if (!ta) return;
                const startH = ta.offsetHeight;
                const onMove = (ev: MouseEvent) => {
                  const delta = startY - ev.clientY;
                  // 关键修复：之前最小高度锁在 140，首屏默认高度本身就接近这个值，
                  // 实际效果就是“只能往上拉，几乎不能往下压”。
                  const newH = Math.min(300, Math.max(96, startH + delta));
                  ta.style.height = newH + 'px';
                };
                const onUp = () => {
                  document.removeEventListener('mousemove', onMove);
                  document.removeEventListener('mouseup', onUp);
                };
                document.addEventListener('mousemove', onMove);
                document.addEventListener('mouseup', onUp);
              }}
            />
            <textarea
              ref={textareaRef}
              className="main-input"
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入消息，Enter 发送，Ctrl+Enter 换行"
            />
            <button className="send-btn" onClick={handleSend} title="发送">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M7 11.5V2.5M7 2.5L3 6.5M7 2.5L11 6.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>

          {/* 5. 上下文使用进度条 */}
          <div className="progress-bar-area">
            <div className="progress-bar-header">
              <span className="progress-bar-label">{activeModelName} · 估算上下文 约 {contextUsedK}k / {contextMaxK}k</span>
              <span className="progress-bar-pct" style={{ color: progressColor }}>{contextPct}%</span>
            </div>
            <div className="progress-track">
              <div
                className="progress-fill"
                style={{
                  width: `${contextPct}%`,
                  background: `linear-gradient(90deg, ${progressColor}88, ${progressColor})`,
                }}
              />
            </div>
          </div>

        </div>
      </div>

      {/* 优先级弹窗 */}
      {showPriorityModal && (
        <PriorityModal
          priority={currentPriority}
          onSetPriority={setPriority}
          onClose={() => setShowPriorityModal(false)}
        />
      )}

      {/* Tab 面板弹窗（标签管理、快捷指令、技能应用、定时任务、多智能体等） */}
      {activeSideTab && activeSideTab !== '消息渠道' && (
        <TabPanel
          tab={activeSideTab}
          onClose={() => setActiveSideTab(null)}
          agents={agents}
          tasks={[...tasks.progress, ...tasks.done]}
          taskName={taskName}
          matchedProject={matchedKanbanProject}
          incomingAgentNames={incomingAgentNames}
          onInject={text => setInputValue(text)}
          onSend={text => { setInputValue(text); setTimeout(() => handleSend(), 0); }}
          openPanels={openPanels}
          activePanelId={activePanelId ?? activePanel?.id ?? null}
          onSwitchPanel={panelId => setActivePanelId(panelId)}
          onOpenAgentPanel={async (agentId, agentName, agentColor, initialMessage) => {
            const existing = openPanels.find(p => p.agentId === agentId);
            if (existing) {
              const isNewTab = !activePanel;
              if (isNewTab) {
                closePanel(existing.id);
                const newPanelId = await openPanel({ agentId, agentName, agentColor, projectId: currentProject?.id, initialMessage, forceNew: true });
                if (newPanelId) {
                  setActivePanelId(newPanelId);
                  createSessionTabFn({ agentId, agentName, agentColor, title: agentName, conversationId: newPanelId });
                }
              } else {
                setActivePanelId(existing.id);
              }
            } else {
              const newPanelId = await openPanel({ agentId, agentName, agentColor, projectId: currentProject?.id, initialMessage });
              const fresh = useConversationStore.getState().openPanels.find(p => p.agentId === agentId);
              if (fresh) {
                setActivePanelId(fresh.id);
                createSessionTabFn({ agentId, agentName, agentColor, title: agentName, conversationId: fresh.id });
              }
            }
          }}
          onSwitchAgentInSession={async (agentId, agentName, agentColor) => {
            const current = activePanel ?? openPanels.find(p => p.id === activePanelId) ?? openPanels[0] ?? null;
            if (!current?.conversationId) return;

            // 会话内切换智能体的业务规则：
            // 1) sessionId / conversationId 不变
            // 2) 不新开 tab，不新建 panel
            // 3) 新 agent 继承当前 conversationId 下的全部历史消息
            // 4) 当前展示 panel 只反映“当前激活 agent”，不能把旧 agent 一起挂在 UI 上
            //
            // 也就是说，记忆继承依赖的是同一个 conversationId，
            // 不是“同时保留多个 agent chip / 多个 panel”。
            await switchAgentFn(current.conversationId, agentId);
            setParticipatingAgentNames(prev => prev.includes(agentName) ? prev : [...prev, agentName]);
            setActivePanelId(current.id);
          }}
          onCloseAgentPanel={panelId => {
            closePanel(panelId);
            setActivePanelId(prev => prev === panelId ? (openPanels.find(p => p.id !== panelId)?.id ?? null) : prev);
          }}
          // 文件快传必须拿“当前工作区项目真值”，不能只依赖 matchedKanbanProject。
          // 否则用户明明已在项目工作区中，但如果当前视图没有命中看板项目对象，上传层会误判为“未进入项目”。
          currentProjectId={currentProject?.id || matchedKanbanProject?.id}
          collabNodes={collabNodes}
          setCollabNodes={setCollabNodes}
          isProject={isProjectMode}
          participatingAgentNames={participatingAgentNames}
          onUpgradeToProject={upgradeToProject}
          onDowngradeToTask={downgradeToTask}
        />
      )}

      {showChannelModal && (
        <ChannelConfigModal onClose={() => setShowChannelModal(false)} />
      )}

      {/* 首页 + 号新建标签页弹窗 */}
      {showNewTabModal && (
        <NewTabModal
          open={showNewTabModal}
          onClose={() => setShowNewTabModal(false)}
          onCreated={(convId, agentName, agentColor, tabTitle) => {
            setActivePanelId(convId);
            createSessionTabFn({ agentId: '', agentName, agentColor, title: tabTitle, conversationId: convId });
          }}
        />
      )}
    </>
  );
}
