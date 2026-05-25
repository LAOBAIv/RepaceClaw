/**
 * @file AgentConsole 通用 UI 组件
 * 包含 SectionTitle、Modal、AgentPicker、DecisionPicker、AddNodeMenu
 * 这些组件在多个地方复用，独立出来保持主文件简洁
 */

import { useState, useEffect, useRef } from 'react';
import { X, Check, UserCircle2, ArrowDown, GitBranch } from 'lucide-react';
import { Agent } from '@/types';
import { AgentAvatar } from './constants';
import type { DecisionMaker, NodeType } from './constants';

/* ─── 分区标题 ───────────────────────────────────────────────── */
/** 通用分区标题：带底部分隔线 */
export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 13, fontWeight: 700, color: '#374151',
      marginBottom: 12, paddingBottom: 8,
      borderBottom: '1px solid #f0f0f0',
      display: 'flex', alignItems: 'center', gap: 6,
    }}>{children}</div>
  );
}

/* ─── 通用弹窗容器 ───────────────────────────────────────────── */
/** 点击遮罩层关闭的通用 Modal 容器 */
export function Modal({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div ref={ref} onClick={e => { if (e.target === ref.current) onClose(); }} style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(3px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {children}
    </div>
  );
}

/* ─── 智能体多选弹窗 ─────────────────────────────────────────── */
/** 智能体多选弹窗：网格布局，支持勾选/取消 */
export function AgentPicker({ agentList, selected, onClose, onConfirm }: {
  agentList: Agent[]; selected: string[];
  onClose: () => void; onConfirm: (ids: string[]) => void;
}) {
  const [draft, setDraft] = useState<Set<string>>(new Set(selected));
  const toggle = (id: string) =>
    setDraft(prev => { const s = new Set(prev); if (s.has(id)) s.delete(id); else s.add(id); return s; });
  return (
    <Modal onClose={onClose}>
      <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.14)', width: 660, maxWidth: 'calc(100vw - 32px)', maxHeight: '70vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', marginBottom: 32 }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: '#1a202c' }}>
            选择智能体
            <span style={{ fontSize: 12, color: '#9ca3af', fontWeight: 400, marginLeft: 8 }}>已选 {draft.size} 个</span>
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', display: 'flex', padding: 2 }}><X size={16} /></button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 7 }}>
          {agentList.map(agent => {
            const sel = draft.has(agent.id);
            return (
              <div key={agent.id} onClick={() => toggle(agent.id)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8, cursor: 'pointer', border: `1.5px solid ${sel ? '#2a3b4d' : '#e5e7eb'}`, background: sel ? '#2a3b4d08' : '#fff', transition: 'all 0.15s' }}>
                <AgentAvatar agent={agent} size={32} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: '#1a202c' }}>{agent.name}</div>
                  {agent.modelName ? (
                    <div style={{ fontSize: 11, color: '#6366f1', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {agent.modelProvider ? `${agent.modelProvider} · ` : ''}{agent.modelName}
                      {agent.temperature != null ? ` · T=${agent.temperature}` : ''}
                      {agent.maxTokens != null ? ` · ${agent.maxTokens}tk` : ''}
                    </div>
                  ) : (
                    <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>Auto</div>
                  )}
                </div>
                <div style={{ width: 18, height: 18, borderRadius: '50%', flexShrink: 0, border: `1.5px solid ${sel ? '#2a3b4d' : '#d1d5db'}`, background: sel ? '#2a3b4d' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {sel && <Check size={10} color="#fff" strokeWidth={3} />}
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ padding: '12px 18px', borderTop: '1px solid #f0f0f0', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} style={{ padding: '7px 18px', borderRadius: 7, border: '1px solid #d1d5db', background: '#fff', color: '#6b7280', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>取消</button>
          <button onClick={() => onConfirm([...draft])} style={{ padding: '7px 20px', borderRadius: 7, border: 'none', background: '#2a3b4d', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>确认</button>
        </div>
      </div>
    </Modal>
  );
}

/* ─── 决策人单选弹窗 ─────────────────────────────────────────── */
/** 决策人单选弹窗：支持选择「用户」或某个智能体 */
export function DecisionPicker({ agentList, current, onClose, onConfirm }: {
  agentList: Agent[]; current: DecisionMaker | null;
  onClose: () => void; onConfirm: (v: DecisionMaker) => void;
}) {
  const [draft, setDraft] = useState<DecisionMaker | null>(current);
  return (
    <Modal onClose={onClose}>
      <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.14)', width: 660, maxWidth: 'calc(100vw - 32px)', maxHeight: '70vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', marginBottom: 32 }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: '#1a202c' }}>选择决策人</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', display: 'flex', padding: 2 }}><X size={16} /></button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 7 }}>
          {/* 用户选项 */}
          {(['user'] as const).map(() => {
            const sel = draft === 'user';
            return (
              <div key="user" onClick={() => setDraft('user')} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8, cursor: 'pointer', border: `1.5px solid ${sel ? '#2a3b4d' : '#e5e7eb'}`, background: sel ? '#2a3b4d08' : '#fff', transition: 'all 0.15s' }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <UserCircle2 size={18} color="#6b7280" />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: '#1a202c' }}>用户</div>
                  <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>由人工用户负责决策</div>
                </div>
                <div style={{ width: 18, height: 18, borderRadius: '50%', border: `1.5px solid ${sel ? '#2a3b4d' : '#d1d5db'}`, background: sel ? '#2a3b4d' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {sel && <Check size={10} color="#fff" strokeWidth={3} />}
                </div>
              </div>
            );
          })}
          {/* 智能体选项 */}
          {agentList.map(agent => {
            const sel = draft === agent.id;
            return (
              <div key={agent.id} onClick={() => setDraft(agent.id)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8, cursor: 'pointer', border: `1.5px solid ${sel ? '#2a3b4d' : '#e5e7eb'}`, background: sel ? '#2a3b4d08' : '#fff', transition: 'all 0.15s' }}>
                <AgentAvatar agent={agent} size={32} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: '#1a202c' }}>{agent.name}</div>
                  <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>{agent.writingStyle}</div>
                </div>
                <div style={{ width: 18, height: 18, borderRadius: '50%', border: `1.5px solid ${sel ? '#2a3b4d' : '#d1d5db'}`, background: sel ? '#2a3b4d' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {sel && <Check size={10} color="#fff" strokeWidth={3} />}
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ padding: '12px 18px', borderTop: '1px solid #f0f0f0', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} style={{ padding: '7px 18px', borderRadius: 7, border: '1px solid #d1d5db', background: '#fff', color: '#6b7280', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>取消</button>
          <button disabled={!draft} onClick={() => draft && onConfirm(draft)} style={{ padding: '7px 20px', borderRadius: 7, border: 'none', background: draft ? '#2a3b4d' : '#9ca3af', color: '#fff', fontSize: 13, fontWeight: 600, cursor: draft ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>确认</button>
        </div>
      </div>
    </Modal>
  );
}

/* ─── 添加节点选项弹出菜单 ───────────────────────────────────── */
/** 添加节点时的弹出菜单：提供「下行节点」和「并行节点」两个选项 */
export function AddNodeMenu({ anchorRef, onAdd, onClose }: {
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  onAdd: (type: NodeType) => void;
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node) &&
          anchorRef.current && !anchorRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [anchorRef, onClose]);

  return (
    <div ref={menuRef} style={{
      position: 'absolute', bottom: '110%', left: '50%', transform: 'translateX(-50%)',
      background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10,
      boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
      padding: '8px', display: 'flex', gap: 8, zIndex: 100,
      whiteSpace: 'nowrap',
    }}>
      {/* 小三角 */}
      <div style={{ position: 'absolute', bottom: -6, left: '50%', transform: 'translateX(-50%)', width: 10, height: 6, overflow: 'hidden' }}>
        <div style={{ width: 10, height: 10, background: '#fff', border: '1px solid #e5e7eb', transform: 'rotate(45deg) translate(-3px,-3px)' }} />
      </div>
      <button onClick={() => { onAdd('serial'); onClose(); }} style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
        padding: '10px 18px', borderRadius: 8, border: '1.5px solid #e5e7eb',
        background: '#fff', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
      }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = '#2a3b4d'; e.currentTarget.style.background = '#f5f7fa'; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.background = '#fff'; }}
      >
        <ArrowDown size={18} color="#2a3b4d" />
        <span style={{ fontSize: 12, color: '#374151', fontWeight: 600 }}>下行节点</span>
        <span style={{ fontSize: 11, color: '#9ca3af' }}>串行向下执行</span>
      </button>
      <button onClick={() => { onAdd('parallel'); onClose(); }} style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
        padding: '10px 18px', borderRadius: 8, border: '1.5px solid #e5e7eb',
        background: '#fff', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
      }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = '#2a3b4d'; e.currentTarget.style.background = '#f5f7fa'; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.background = '#fff'; }}
      >
        <GitBranch size={18} color="#6366f1" />
        <span style={{ fontSize: 12, color: '#374151', fontWeight: 600 }}>并行节点</span>
        <span style={{ fontSize: 11, color: '#9ca3af' }}>与上节点并行</span>
      </button>
    </div>
  );
}
