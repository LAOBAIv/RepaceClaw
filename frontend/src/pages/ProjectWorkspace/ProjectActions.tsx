/**
 * ProjectActions — 项目操作组件
 *
 * 职责：渲染顶部项目名显示、优先级下拉、升级/降级触发入口。
 * 从原 ProjectWorkspace.tsx 中提取项目操作相关 UI。
 */
import React from 'react';
import { PRIORITY_OPTIONS, getProgressColor, getTagColor } from '@/components/workspace';
import type { ProjectPriority } from '@/stores/projectKanbanStore';

export function ProjectActions({
  taskName,
  taskProgress,
  isProjectMode,
  participatingAgentNames,
  currentPriority,
  currentTags,
  showPriorityDropdown,
  priorityDropdownRef,
  onTogglePriorityDropdown,
  onSetPriority,
  onUpgradeToProject,
  onDowngradeToTask,
}: {
  /** 项目/任务名称 */
  taskName: string;
  /** 任务进度百分比 */
  taskProgress: number;
  /** 是否为项目模式 */
  isProjectMode: boolean;
  /** 参与智能体名称列表 */
  participatingAgentNames: string[];
  /** 当前优先级 */
  currentPriority: ProjectPriority | null;
  /** 当前标签列表 */
  currentTags: string[];
  /** 优先级下拉是否展开 */
  showPriorityDropdown: boolean;
  /** 优先级下拉 ref */
  priorityDropdownRef: React.RefObject<HTMLDivElement | null>;
  /** 切换优先级下拉 */
  onTogglePriorityDropdown: () => void;
  /** 设置优先级 */
  onSetPriority: (p: ProjectPriority) => void;
  /** 升级为项目 */
  onUpgradeToProject: (agentNames: string[]) => void;
  /** 降级为任务 */
  onDowngradeToTask: (keptAgentName: string) => void;
  /** 打开优先级弹窗 */
  onShowPriorityModal: () => void;
}) {
  const progressColor = getProgressColor(taskProgress);

  return (
    <div className="project-actions-bar" style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px',
      background: '#fff', borderBottom: '1px solid #e5e7eb', flexShrink: 0,
    }}>
      {/* 项目/任务名称 */}
      <span style={{ fontSize: 15, fontWeight: 600, color: '#1f2937' }}>{taskName}</span>

      {/* 进度条 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ width: 80, height: 4, background: '#e5e7eb', borderRadius: 2 }}>
          <div style={{ width: `${taskProgress}%`, height: '100%', background: progressColor, borderRadius: 2 }} />
        </div>
        <span style={{ fontSize: 11, color: '#6b7280' }}>{taskProgress}%</span>
      </div>

      {/* 标签 */}
      {currentTags.length > 0 && (
        <div style={{ display: 'flex', gap: 4 }}>
          {currentTags.map(tag => {
            const c = getTagColor(tag);
            return (
              <span key={tag} style={{
                fontSize: 10, padding: '2px 8px', borderRadius: 10,
                background: c.bg, color: c.text,
                border: `1px solid ${c.border}`,
              }}>{tag}</span>
            );
          })}
        </div>
      )}

      {/* 优先级下拉 */}
      <div ref={priorityDropdownRef} style={{ position: 'relative' }}>
        <button
          onClick={onTogglePriorityDropdown}
          style={{
            fontSize: 11, padding: '3px 10px', borderRadius: 12,
            border: '1px solid #e5e7eb', background: '#fff',
            color: currentPriority === 'high' ? '#ef4444' : currentPriority === 'mid' ? '#f59e0b' : '#6b7280',
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
          }}
        >
          {currentPriority === 'high' ? '🔴 高' : currentPriority === 'mid' ? '🟡 中' : '🟢 低'}
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M2 4L5 7L8 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
        {showPriorityDropdown && (
          <div style={{
            position: 'absolute', top: '100%', left: 0, marginTop: 4,
            background: '#fff', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
            padding: 4, zIndex: 100, minWidth: 120,
          }}>
            {PRIORITY_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => { onSetPriority(opt.value as ProjectPriority); onTogglePriorityDropdown(); }}
                style={{
                  display: 'block', width: '100%', padding: '6px 12px', border: 'none',
                  background: 'transparent', borderRadius: 6, cursor: 'pointer',
                  fontSize: 12, textAlign: 'left', color: '#374151',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = '#f3f4f6'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 升级/降级按钮 */}
      {isProjectMode ? (
        <button
          onClick={() => {
            if (participatingAgentNames.length > 1) {
              // 弹出选择保留哪个智能体
              const kept = prompt(
                `降级为任务，请保留一个智能体：\n${participatingAgentNames.join(', ')}`,
                participatingAgentNames[0]
              );
              if (kept && participatingAgentNames.includes(kept)) {
                onDowngradeToTask(kept);
              }
            } else {
              onDowngradeToTask(participatingAgentNames[0]);
            }
          }}
          style={{
            fontSize: 11, padding: '3px 10px', borderRadius: 12,
            border: '1px solid #e5e7eb', background: '#fff',
            color: '#6b7280', cursor: 'pointer',
          }}
        >
          降级为任务
        </button>
      ) : (
        <button
          onClick={() => onUpgradeToProject([])}
          style={{
            fontSize: 11, padding: '3px 10px', borderRadius: 12,
            border: '1px solid #6366f1', background: '#f0f0ff',
            color: '#6366f1', cursor: 'pointer',
          }}
        >
          升级为项目
        </button>
      )}
    </div>
  );
}
