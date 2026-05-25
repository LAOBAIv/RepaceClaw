/**
 * AgentPanel/AgentPickerModal — 智能体多选弹窗
 *
 * 职责：在协作流程节点中为节点分配智能体，支持多选。
 * 使用 Portal 挂载到 document.body，点击遮罩层关闭。
 */
import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import type { Agent } from '@/types';

export function AgentPickerModal({
  agentList,
  selected,
  onClose,
  onConfirm,
}: {
  agentList: Agent[];
  selected: string[];
  onClose: () => void;
  onConfirm: (ids: string[]) => void;
}) {
  // 使用 draft 集合暂存选择，确认后才提交
  const [draft, setDraft] = useState<Set<string>>(() => new Set(selected));

  function toggle(id: string) {
    setDraft(prev => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id); else s.add(id);
      return s;
    });
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
        {/* 智能体列表：2列网格 */}
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
                {/* 头像 */}
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
                {/* 选中指示器 */}
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
