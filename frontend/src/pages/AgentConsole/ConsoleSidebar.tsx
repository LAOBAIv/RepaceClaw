/**
 * @file ConsoleSidebar - AgentConsole 左侧表单面板
 * 包含任务名称、描述、目标、决策人、优先级、标签、开始/结束时间等字段
 */

import { Users, UserCircle2 } from 'lucide-react';
import { Agent } from '@/types';
import { PRIORITY, getTagColor, PRESET_TAGS } from './constants';
import type { DecisionMaker } from './constants';
import { AgentAvatar } from './constants';
import { DecisionPicker } from './components';
import type { ConsoleEditTask } from './hooks/useConsoleState';

interface ConsoleSidebarProps {
  // 表单字段
  taskName: string;
  setTaskName: (v: string) => void;
  taskDesc: string;
  setTaskDesc: (v: string) => void;
  taskGoal: string;
  setTaskGoal: (v: string) => void;
  priority: string;
  setPriority: (v: string) => void;
  tags: string[];
  setTags: React.Dispatch<React.SetStateAction<string[]>>;
  tagInput: string;
  setTagInput: (v: string) => void;
  showTagPopup: boolean;
  setShowTagPopup: React.Dispatch<React.SetStateAction<boolean>>;
  tagPopupRef: React.RefObject<HTMLDivElement | null>;
  startTime: string;
  setStartTime: (v: string) => void;
  endTime: string;
  setEndTime: (v: string) => void;
  // 决策人
  decisionMaker: DecisionMaker | null;
  setDecisionMaker: React.Dispatch<React.SetStateAction<DecisionMaker | null>>;
  showDecisionPicker: boolean;
  setShowDecisionPicker: (v: boolean) => void;
  // 编辑模式
  editTask: ConsoleEditTask | null; // [2026-05-24] 类型安全
  // editProject: ConsoleEditProject | null; // reserved for future use
  // 智能体列表
  agentList: Agent[];
}

export function ConsoleSidebar({
  taskName, setTaskName,
  taskDesc, setTaskDesc,
  taskGoal, setTaskGoal,
  priority, setPriority,
  tags, setTags,
  tagInput, setTagInput,
  showTagPopup, setShowTagPopup,
  tagPopupRef,
  startTime, setStartTime,
  endTime, setEndTime,
  decisionMaker, setDecisionMaker,
  showDecisionPicker, setShowDecisionPicker,
  editTask,
  // editProject, // reserved for future use
  agentList,
}: ConsoleSidebarProps) {
  // 决策人显示名
  const decisionLabel = decisionMaker === null ? null
    : decisionMaker === 'user' ? '用户'
    : agentList.find(a => a.id === decisionMaker)?.name ?? decisionMaker;
  const decisionAgent = decisionMaker && decisionMaker !== 'user'
    ? agentList.find(a => a.id === decisionMaker) : null;

  return (
    <div className="pc-left">
      {/* 任务名称 */}
      <div className="pc-field">
        <label className="pc-label">任务名称<em>*</em></label>
        <input className="pc-input" placeholder={editTask ? '为本次任务起一个名字…' : '为本次协作项目起一个名字…'}
          value={taskName} onChange={e => setTaskName(e.target.value)} />
      </div>

      {/* 任务描述 */}
      <div className="pc-field">
        <label className="pc-label">任务描述</label>
        <textarea className="pc-textarea" style={{ height: 76 }} placeholder={editTask ? '描述任务背景与预期产出…' : '描述项目背景与预期产出…'}
          value={taskDesc} onChange={e => setTaskDesc(e.target.value)} />
      </div>

      {/* 项目目标（任务模式隐藏） */}
      {!editTask && (
        <div className="pc-field">
          <label className="pc-label">项目目标</label>
          <textarea className="pc-textarea" style={{ height: 76 }} placeholder="本次项目期望达成的核心目标…"
            value={taskGoal} onChange={e => setTaskGoal(e.target.value)} />
        </div>
      )}

      {/* 项目决策人（任务模式隐藏） */}
      {!editTask && (
        <div className="pc-field">
          <label className="pc-label">项目决策人</label>
          <button
            className={`pc-decision-btn${decisionMaker ? ' selected' : ''}`}
            onClick={() => setShowDecisionPicker(true)}
          >
            {decisionMaker === null ? (
              <><Users size={14} /> 选择决策人（智能体或用户）</>
            ) : decisionMaker === 'user' ? (
              <><UserCircle2 size={14} /> 用户</>
            ) : decisionAgent ? (
              <><AgentAvatar agent={decisionAgent} size={18} /> {decisionLabel}</>
            ) : null}
          </button>
        </div>
      )}

      {/* 优先级 */}
      <div className="pc-field">
        <label className="pc-label">优先级</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {PRIORITY.map(p => (
            <span key={p} className={`pc-tag${priority === p ? ' active' : ''}`}
              onClick={() => setPriority(p)}>{p}</span>
          ))}
        </div>
      </div>

      {/* 标签编辑 */}
      <div className="pc-field">
        <label className="pc-label">标签</label>
        <div ref={tagPopupRef} style={{ position: 'relative' }}>
          {/* 标签显示栏 */}
          <div
            style={{
              display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 5,
              minHeight: 34, padding: '4px 8px',
              background: '#fafafa', border: '1.5px solid #e5e7eb', borderRadius: 8,
              cursor: 'pointer', boxSizing: 'border-box',
              transition: 'border-color 0.15s',
            }}
            onClick={() => setShowTagPopup(v => !v)}
            onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = '#a855f7'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = showTagPopup ? '#a855f7' : '#e5e7eb'; }}
          >
            {tags.length === 0 && (
              <span style={{ fontSize: 12, color: '#d1d5db', lineHeight: '24px', userSelect: 'none', flex: 1 }}>
                点击添加标签…
              </span>
            )}
            {tags.map(tag => {
              const c = getTagColor(tag);
              return (
                <span key={tag} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 3,
                  fontSize: 12, padding: '2px 8px 2px 10px', borderRadius: 20,
                  background: c.bg, color: c.text, border: `1px solid ${c.border}`,
                  fontWeight: 500, lineHeight: 1.5,
                }}>
                  {tag}
                  <button
                    onClick={e => { e.stopPropagation(); setTags(prev => prev.filter(t => t !== tag)); }}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      padding: '0 1px', lineHeight: 1, color: c.text,
                      opacity: 0.45, fontSize: 15, display: 'flex', alignItems: 'center',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.opacity = '1'; }}
                    onMouseLeave={e => { e.currentTarget.style.opacity = '0.45'; }}
                    title="移除标签"
                  >×</button>
                </span>
              );
            })}
            {/* + 图标 */}
            <span style={{
              width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              background: showTagPopup ? '#ede9fe' : '#f3f4f6',
              color: showTagPopup ? '#7c3aed' : '#9ca3af',
              fontSize: 16, lineHeight: 1, transition: 'all 0.12s',
            }}>+</span>
          </div>

          {/* 标签选择弹窗 */}
          {showTagPopup && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0,
              background: '#fff', borderRadius: 10,
              border: '1px solid #e5e7eb',
              boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
              zIndex: 200, padding: '14px 14px 12px',
            }}>
              {/* 快捷预设标签 */}
              <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600, letterSpacing: '0.04em', marginBottom: 8 }}>快捷标签</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 12 }}>
                {PRESET_TAGS.map(pt => {
                  const selected = tags.includes(pt);
                  const c = getTagColor(pt);
                  return (
                    <button key={pt}
                      onClick={() => {
                        if (selected) setTags(prev => prev.filter(t => t !== pt));
                        else setTags(prev => [...prev, pt]);
                      }}
                      style={{
                        padding: '3px 10px', borderRadius: 20, fontSize: 11,
                        border: `1px solid ${selected ? c.border : '#e5e7eb'}`,
                        background: selected ? c.bg : '#fff',
                        color: selected ? c.text : '#6b7280',
                        cursor: 'pointer', fontWeight: selected ? 600 : 400,
                        transition: 'all 0.12s', outline: 'none',
                        display: 'inline-flex', alignItems: 'center', gap: 3,
                        fontFamily: '"Microsoft YaHei","Segoe UI",sans-serif',
                      }}
                      onMouseEnter={e => { if (!selected) { e.currentTarget.style.borderColor = c.border; e.currentTarget.style.background = c.bg + 'cc'; e.currentTarget.style.color = c.text; } }}
                      onMouseLeave={e => { if (!selected) { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.background = '#fff'; e.currentTarget.style.color = '#6b7280'; } }}
                    >
                      {selected
                        ? <svg width="9" height="9" viewBox="0 0 10 10" fill="none"><path d="M1.5 5L4 7.5L8.5 2.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        : <span style={{ opacity: 0.5 }}>+</span>}
                      {pt}
                    </button>
                  );
                })}
              </div>

              {/* 自定义输入 */}
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  autoFocus
                  value={tagInput}
                  onChange={e => setTagInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const t = tagInput.trim();
                      if (t && !tags.includes(t)) setTags(prev => [...prev, t]);
                      setTagInput('');
                    }
                    if (e.key === 'Escape') setShowTagPopup(false);
                  }}
                  placeholder="自定义标签，Enter 确认"
                  style={{
                    flex: 1, height: 32, fontSize: 12, padding: '0 10px',
                    border: '1.5px solid #e5e7eb', borderRadius: 7, outline: 'none',
                    fontFamily: '"Microsoft YaHei","Segoe UI",sans-serif', color: '#374151',
                    transition: 'border-color 0.15s', boxSizing: 'border-box',
                  }}
                  onFocus={e => { e.currentTarget.style.borderColor = '#6366f1'; }}
                  onBlur={e => { e.currentTarget.style.borderColor = '#e5e7eb'; }}
                />
                <button
                  onClick={() => {
                    const t = tagInput.trim();
                    if (t && !tags.includes(t)) setTags(prev => [...prev, t]);
                    setTagInput('');
                  }}
                  style={{
                    height: 32, padding: '0 12px', fontSize: 12, fontWeight: 600,
                    border: 'none', borderRadius: 7,
                    background: '#6366f1', color: '#fff', cursor: 'pointer',
                    fontFamily: '"Microsoft YaHei","Segoe UI",sans-serif',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#4f46e5'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#6366f1'; }}
                >添加</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 开始时间 */}
      <div className="pc-field">
        <label className="pc-label">开始时间</label>
        <input className="pc-input" type="datetime-local"
          value={startTime} onChange={e => setStartTime(e.target.value)} />
      </div>

      {/* 结束时间 */}
      <div className="pc-field">
        <label className="pc-label">结束时间</label>
        <input className="pc-input" type="datetime-local"
          value={endTime} onChange={e => setEndTime(e.target.value)} />
      </div>

      {/* 决策人弹窗 */}
      {showDecisionPicker && (
        <DecisionPicker agentList={agentList.filter(a => !a.isSystem)} current={decisionMaker}
          onClose={() => setShowDecisionPicker(false)}
          onConfirm={v => { setDecisionMaker(v); setShowDecisionPicker(false); }} />
      )}
    </div>
  );
}
