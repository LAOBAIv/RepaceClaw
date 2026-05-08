/**
 * MobileMultiAgentPanel — 移动端多智能体协作面板
 *
 * 适配 PC 端 AgentPanel 的核心功能：
 * 1. 当前会话智能体列表 / 切换
 * 2. 协作流程节点管理（串行/并行）
 * 3. 智能体选择器（移动端底部弹框）
 * 4. 注入快捷指令到输入框
 */
import React, { useState, useCallback, useMemo } from 'react';
import { Plus, X, Trash2, ChevronDown, Check, ArrowDown } from 'lucide-react';

/* ─────────────────────────────────────────────
 * 颜色常量
 * ───────────────────────────────────────────── */
const COLORS = {
  bgPrimary: '#0f0f12',
  bgSecondary: '#1a1a1f',
  bgTertiary: '#252530',
  bgInput: '#1e1e24',
  textPrimary: '#f5f5f7',
  textSecondary: '#a0a0a8',
  textMuted: '#6b6b75',
  border: '#353540',
  accent: '#6366f1',
  accentLight: 'rgba(99,102,241,0.15)',
  danger: '#f43f5e',
  success: '#10b981',
  parallel: '#8b5cf6',
  parallelLight: 'rgba(139,92,246,0.15)',
};

/* ─────────────────────────────────────────────
 * FlowNode 类型
 * ───────────────────────────────────────────── */
export interface FlowNode {
  id: string;
  name: string;
  nodeType: 'serial' | 'parallel';
  agentIds: string[];
  desc: string;
}

function makeFlowNode(idx: number): FlowNode {
  return { id: `fn_${Date.now()}_${idx}`, name: '', nodeType: 'serial', agentIds: [], desc: '' };
}

/* ─────────────────────────────────────────────
 * Props
 * ───────────────────────────────────────────── */
interface MobileMultiAgentPanelProps {
  agents: any[];
  currentAgentIds?: string[];
  currentAgentId?: string;
  collabNodes: FlowNode[];
  setCollabNodes: React.Dispatch<React.SetStateAction<FlowNode[]>>;
  isProject?: boolean;
  onInject?: (text: string) => void;
  onSwitchAgent?: (agentId: string, agentName: string, agentColor: string) => void;
}

/* ─────────────────────────────────────────────
 * 智能体选择器（底部弹框）
 * ───────────────────────────────────────────── */
interface MobileAgentPickerProps {
  agents: any[];
  selected: string[];
  onConfirm: (ids: string[]) => void;
  onClose: () => void;
}

function MobileAgentPicker({ agents, selected, onConfirm, onClose }: MobileAgentPickerProps) {
  const [draft, setDraft] = useState<Set<string>>(() => new Set(selected));

  const toggle = useCallback((id: string) => {
    setDraft(prev => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  }, []);

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.6)' }} />
      <div style={{
        position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 301,
        background: COLORS.bgSecondary,
        borderRadius: '20px 20px 0 0',
        maxHeight: '70vh',
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{
          height: 52, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 16px', borderBottom: `1px solid ${COLORS.border}`,
        }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: COLORS.textPrimary }}>
            选择智能体
            <span style={{ fontSize: 12, color: COLORS.textMuted, fontWeight: 400, marginLeft: 6 }}>已选 {draft.size} 个</span>
          </div>
          <button onClick={onClose} style={{
            width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: COLORS.bgTertiary, border: 'none', cursor: 'pointer', borderRadius: 10,
            color: COLORS.textSecondary,
          }}>
            <X size={16} />
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {agents.map(agent => {
            const sel = draft.has(agent.id);
            const ac = agent.color ?? '#6366f1';
            return (
              <div key={agent.id} onClick={() => toggle(agent.id)} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
                border: `1.5px solid ${sel ? ac : COLORS.border}`,
                background: sel ? ac + '15' : COLORS.bgTertiary,
                transition: 'all 0.12s',
              }}>
                <div style={{
                  width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                  background: ac + '33', border: `1.5px solid ${ac}44`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: ac, fontWeight: 700, fontSize: 12,
                }}>{agent.name.charAt(0)}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: COLORS.textPrimary }}>{agent.name}</div>
                  {agent.modelName && (
                    <div style={{ fontSize: 11, color: COLORS.accent, marginTop: 1 }}>{agent.modelName}</div>
                  )}
                </div>
                <div style={{
                  width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                  border: `1.5px solid ${sel ? ac : COLORS.textMuted}`,
                  background: sel ? ac : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {sel && <Check size={12} color="#fff" />}
                </div>
              </div>
            );
          })}
        </div>
        <div style={{
          flexShrink: 0, padding: '12px 16px', borderTop: `1px solid ${COLORS.border}`,
          display: 'flex', gap: 10,
        }}>
          <button onClick={onClose} style={{
            flex: 1, height: 44, borderRadius: 10, border: `1px solid ${COLORS.border}`,
            background: 'transparent', color: COLORS.textSecondary, fontSize: 14, cursor: 'pointer',
          }}>取消</button>
          <button onClick={() => onConfirm([...draft])} style={{
            flex: 1, height: 44, borderRadius: 10, border: 'none',
            background: COLORS.accent, color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
          }}>确认</button>
        </div>
      </div>
    </>
  );
}

/* ─────────────────────────────────────────────
 * 主组件
 * ───────────────────────────────────────────── */
export function MobileMultiAgentPanel({
  agents, currentAgentIds, currentAgentId,
  collabNodes, setCollabNodes, isProject = false,
  onInject, onSwitchAgent,
}: MobileMultiAgentPanelProps) {
  const [pickerNode, setPickerNode] = useState<{ nodeId: string } | null>(null);
  const [showNodes, setShowNodes] = useState(false);

  const participatingAgents = useMemo(() => {
    const ids = currentAgentIds || (currentAgentId ? [currentAgentId] : []);
    return agents.filter(a => ids.includes(a.id));
  }, [agents, currentAgentIds, currentAgentId]);

  const handleSwitchAgent = useCallback((agent: any) => {
    if (agent.id === currentAgentId) return;
    if (onSwitchAgent) onSwitchAgent(agent.id, agent.name, agent.color || COLORS.accent);
    if (onInject) onInject(`/switch ${agent.name}`);
  }, [currentAgentId, onSwitchAgent, onInject]);

  const handleAddNode = useCallback((type: 'serial' | 'parallel') => {
    setCollabNodes(prev => [...prev, { ...makeFlowNode(prev.length), nodeType: type }]);
  }, [setCollabNodes]);

  const handleUpdateNode = useCallback((nodeId: string, patch: Partial<FlowNode>) => {
    setCollabNodes(prev => prev.map(n => n.id === nodeId ? { ...n, ...patch } : n));
  }, [setCollabNodes]);

  const handleDeleteNode = useCallback((nodeId: string) => {
    setCollabNodes(prev => prev.filter(n => n.id !== nodeId));
  }, [setCollabNodes]);

  const handlePickerConfirm = useCallback((ids: string[]) => {
    if (pickerNode) {
      handleUpdateNode(pickerNode.nodeId, { agentIds: ids });
      setPickerNode(null);
    }
  }, [pickerNode, handleUpdateNode]);

  const handleStartCollab = useCallback(() => {
    const allAgentIds = [...new Set(collabNodes.flatMap(n => n.agentIds))];
    if (allAgentIds.length === 0) return;
    const names = allAgentIds.map(id => agents.find(a => a.id === id)?.name).filter(Boolean);
    if (onInject) onInject(`/collab start ${names.join(' ')}`);
  }, [collabNodes, agents, onInject]);

  const hasAnyNode = collabNodes.some(n => n.agentIds.length > 0);

  return (
    <div style={{ padding: '4px 0' }}>
      {/* ═══ 当前会话智能体 ═══ */}
      <div style={{ padding: '0 4px 12px' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.textPrimary, marginBottom: 8 }}>
          当前会话智能体
        </div>
        {participatingAgents.length === 0 ? (
          <div style={{ fontSize: 12, color: COLORS.textMuted, padding: '8px 0' }}>暂无智能体</div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {participatingAgents.map(agent => {
              const ac = agent.color ?? '#6366f1';
              const isActive = agent.id === currentAgentId;
              return (
                <div key={agent.id} onClick={() => handleSwitchAgent(agent)} style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '4px 6px 4px 4px', borderRadius: 20,
                  background: ac + '18',
                  border: `1.5px solid ${isActive ? ac : ac + '44'}`,
                  cursor: 'pointer',
                }}>
                  <div style={{
                    width: 24, height: 24, borderRadius: '50%',
                    background: ac + '33',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: ac, fontWeight: 700, fontSize: 11,
                  }}>{agent.name.charAt(0)}</div>
                  <span style={{
                    fontSize: 12, fontWeight: isActive ? 600 : 400, color: COLORS.textPrimary,
                    maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{agent.name}</span>
                  {isActive && <span style={{ fontSize: 10, color: COLORS.success }}>●</span>}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ═══ 协作流程节点 ═══ */}
      <div style={{ borderTop: `1px solid ${COLORS.border}`, paddingTop: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px', marginBottom: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.textPrimary }}>协作流程节点</div>
          <button onClick={() => setShowNodes(!showNodes)} style={{
            display: 'flex', alignItems: 'center', gap: 4,
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: COLORS.textMuted, fontSize: 12, padding: '4px 8px',
          }}>
            {showNodes ? '收起' : '展开'}
            <ChevronDown size={14} style={{ transform: showNodes ? 'rotate(180deg)' : 'none' }} />
          </button>
        </div>

        {showNodes && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '0 4px' }}>
              {collabNodes.map((node, idx) => {
                const nodeTypeColor = node.nodeType === 'serial' ? COLORS.accent : COLORS.parallel;
                return (
                  <div key={node.id} style={{
                    background: COLORS.bgTertiary, borderRadius: 10,
                    border: `1px solid ${COLORS.border}`, padding: 10,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                      <span style={{
                        width: 20, height: 20, borderRadius: 6,
                        background: nodeTypeColor,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#fff', fontSize: 10, fontWeight: 700,
                      }}>{idx + 1}</span>
                      <span style={{ fontSize: 11, color: nodeTypeColor, fontWeight: 600 }}>
                        {node.nodeType === 'serial' ? '串行' : '并行'}
                      </span>
                      <span style={{ flex: 1 }} />
                      {collabNodes.length > 1 && (
                        <button onClick={() => handleDeleteNode(node.id)} style={{
                          width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: 'transparent', border: 'none', cursor: 'pointer',
                          color: COLORS.textMuted, borderRadius: 6,
                        }}>
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                    {node.agentIds.length === 0 ? (
                      <div onClick={() => setPickerNode({ nodeId: node.id })} style={{
                        padding: '6px 10px', borderRadius: 8,
                        background: COLORS.bgInput, border: `1px dashed ${COLORS.border}`,
                        fontSize: 12, color: COLORS.textMuted, cursor: 'pointer', textAlign: 'center',
                      }}>
                        <Plus size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
                        选择智能体
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {node.agentIds.map(aid => {
                          const a = agents.find(ag => ag.id === aid);
                          const ac = a?.color ?? '#6366f1';
                          return (
                            <div key={aid} style={{
                              display: 'flex', alignItems: 'center', gap: 4,
                              padding: '3px 8px', borderRadius: 12,
                              background: ac + '22', border: `1px solid ${ac}44`,
                            }}>
                              <div style={{
                                width: 16, height: 16, borderRadius: '50%',
                                background: ac + '33', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: ac, fontWeight: 700, fontSize: 8,
                              }}>{a?.name?.charAt(0) || '?'}</div>
                              <span style={{ fontSize: 11, color: COLORS.textPrimary }}>{a?.name || '未知'}</span>
                            </div>
                          );
                        })}
                        <button onClick={() => setPickerNode({ nodeId: node.id })} style={{
                          width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: 'transparent', border: `1px dashed ${COLORS.border}`, borderRadius: '50%',
                          cursor: 'pointer', color: COLORS.textMuted, padding: 0,
                        }}>
                          <Plus size={12} />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div style={{ display: 'flex', gap: 8, padding: '12px 4px 0' }}>
              <button onClick={() => handleAddNode('serial')} style={{
                flex: 1, height: 40, borderRadius: 8, border: `1px solid ${COLORS.accent}`,
                background: COLORS.accentLight, color: COLORS.accent,
                fontSize: 12, fontWeight: 600, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
              }}>
                <ArrowDown size={14} /> 串行节点
              </button>
              <button onClick={() => handleAddNode('parallel')} style={{
                flex: 1, height: 40, borderRadius: 8, border: `1px solid ${COLORS.parallel}`,
                background: COLORS.parallelLight, color: COLORS.parallel,
                fontSize: 12, fontWeight: 600, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
              }}>
                <ArrowDown size={14} /> 并行节点
              </button>
            </div>

            <button onClick={handleStartCollab} disabled={!hasAnyNode} style={{
              width: '100%', height: 44, borderRadius: 10, border: 'none',
              marginTop: 12, marginBottom: 4,
              background: hasAnyNode ? COLORS.accent : COLORS.bgTertiary,
              color: hasAnyNode ? '#fff' : COLORS.textMuted,
              fontSize: 14, fontWeight: 600, cursor: hasAnyNode ? 'pointer' : 'not-allowed',
            }}>
              开启协作
            </button>
          </>
        )}
      </div>

      {pickerNode && (
        <MobileAgentPicker
          agents={agents}
          selected={collabNodes.find(n => n.id === pickerNode.nodeId)?.agentIds || []}
          onConfirm={handlePickerConfirm}
          onClose={() => setPickerNode(null)}
        />
      )}
    </div>
  );
}

export default MobileMultiAgentPanel;
