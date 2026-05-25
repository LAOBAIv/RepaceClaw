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
import { Plus, Trash2, ChevronDown, ArrowDown } from 'lucide-react';
import { COLORS } from './constants';
import { makeFlowNode } from './types';
import type { FlowNode, MobileMultiAgentPanelProps, MobileAgentPickerProps } from './types';
import { MobileAgentPicker } from './MobileAgentPicker';

// Re-export for backward compatibility (external consumers import from './MobileMultiAgentPanel')
export type { FlowNode, MobileMultiAgentPanelProps, MobileAgentPickerProps };
export { makeFlowNode };

export function MobileMultiAgentPanel({
  agents, currentAgentIds, currentAgentId,
  collabNodes, setCollabNodes,
  onInject, onSwitchAgent,
}: MobileMultiAgentPanelProps) {
  const [pickerNode, setPickerNode] = useState<{ nodeId: string } | null>(null);
  const [showNodes, setShowNodes] = useState(false);

  const participatingAgents = useMemo(() => {
    const ids = currentAgentIds || (currentAgentId ? [currentAgentId] : []);
    return agents.filter(a => ids.includes(a.id));
  }, [agents, currentAgentIds, currentAgentId]);

  const handleSwitchAgent = useCallback((agent: { id: string; name: string; color?: string }) => { // [2026-05-24] 类型安全
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
