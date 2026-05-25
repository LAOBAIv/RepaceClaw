/**
 * MobileAgentPicker — 移动端智能体选择器（底部弹框）
 *
 * 提供多选智能体的交互界面，支持勾选/取消确认。
 */
import React, { useState, useCallback } from 'react';
import { X, Check } from 'lucide-react';
import { COLORS } from './constants';
import type { MobileAgentPickerProps } from './types';

export function MobileAgentPicker({ agents, selected, onConfirm, onClose }: MobileAgentPickerProps) {
  const [draft, setDraft] = useState<Set<string>>(() => new Set(selected));

  const toggle = useCallback((id: string) => {
    setDraft(prev => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id); else s.add(id);
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
