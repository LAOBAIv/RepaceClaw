/**
 * TabPanel — 功能面板容器组件
 *
 * 职责：渲染侧边栏功能面板（智能体切换、协作流程、任务列表、项目看板等），
 * 作为各 Tab 子组件的调度容器。
 *
 * [2026-05-23] 重构：从 pages/ProjectWorkspace/ 迁移至 components/workspace/，
 * 消除跨目录引用，保持 @/components/workspace barrel export 兼容。
 * 文件快传逻辑已提取到 FileTransferPanel + useFileTransfer.ts
 * 消息渠道列表已提取到 ChannelListPanel
 */
import React from 'react';
import type { Agent, ConversationPanel } from '@/types';
import type { KanbanProject } from '@/stores/projectKanbanStore';
import type { Task } from '@/stores/taskStore';
// 同目录引用（搬迁后自包含）
import { AgentPanel, type FlowNode } from './AgentPanel';
import { FileTransferPanel } from './FileTransferPanel';
import { ChannelListPanel } from './ChannelListPanel';
import { SkillPanel } from './SkillPanel';
import { SchedulePanel } from './SchedulePanel';
import { ShortcutPanel } from './ShortcutPanel';
import { TaskTagPanel } from './TaskTagPanel';
import { TAB_META } from './constants';

/** TabPanel 弹窗通用样式 */
const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  zIndex: 1000, backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)', overflowY: 'auto',
};

const modalContainerStyle: React.CSSProperties = {
  background: '#fff', borderRadius: 12,
  boxShadow: '0 24px 64px rgba(0,0,0,0.18), 0 4px 16px rgba(0,0,0,0.08)',
  width: 660, maxWidth: 'calc(100vw - 32px)',
  fontFamily: '"Microsoft YaHei","Segoe UI",sans-serif',
  animation: 'tabPanelModalIn 0.2s cubic-bezier(0.34,1.4,0.64,1)',
  overflow: 'clip', marginBottom: 32,
};

const headerStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: '22px 28px 18px', borderBottom: '1px solid #f0f0f0',
};

const headerIconStyle: React.CSSProperties = {
  width: 38, height: 38, borderRadius: 10,
  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
};

const closeBtnStyle: React.CSSProperties = {
  width: 30, height: 30, borderRadius: 8, border: 'none', background: '#f3f4f6', cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: 18, lineHeight: 1,
  transition: 'background 0.15s, color 0.15s', flexShrink: 0,
};

const contentStyle: React.CSSProperties = {
  padding: '20px 28px', maxHeight: '70vh', overflowY: 'auto',
};

export function TabPanel({
  tab, onClose,
  agents, taskName,
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
  agents?: Agent[];
  tasks?: Task[];
  taskName?: string;
  onInject?: (text: string) => void;
  onSend?: (text: string) => void;
  matchedProject?: KanbanProject | null;
  incomingAgentNames?: string[];
  openPanels: ConversationPanel[];
  activePanelId: string | null;
  onSwitchPanel: (panelId: string) => void;
  onOpenAgentPanel: (agentId: string, agentName: string, agentColor: string, initialMessage?: string) => void;
  onSwitchAgentInSession: (agentId: string, agentName: string, agentColor: string) => void;
  onCloseAgentPanel: (panelId: string) => void;
  currentProjectId?: string;
  collabNodes: FlowNode[];
  setCollabNodes: React.Dispatch<React.SetStateAction<FlowNode[]>>;
  isProject: boolean;
  participatingAgentNames?: string[];
  onUpgradeToProject?: (newAgentNames: string[]) => void;
  onDowngradeToTask?: (keptAgentName: string) => void;
}) {
  const activePanel = (activePanelId ? openPanels.find(p => p.id === activePanelId) : null) ?? openPanels[0] ?? null;
  const meta = TAB_META[tab] ?? {
    gradient: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
    subtitle: '',
    icon: <svg width="19" height="19" viewBox="0 0 17 17" fill="none"><circle cx="8.5" cy="8.5" r="5.5" stroke="white" strokeWidth="1.4"/></svg>,
  };

  const agentStatusMap: Record<string, { label: string; color: string }> = {
    active: { label: '在线', color: '#22c55e' },
    idle:   { label: '空闲', color: '#3b82f6' },
    busy:   { label: '忙碌', color: '#f59e0b' },
  };

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose(); }} style={overlayStyle}>
      <div onClick={e => e.stopPropagation()} style={modalContainerStyle}>
        {/* 头部 */}
        <div style={headerStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ ...headerIconStyle, background: meta.gradient }}>{meta.icon}</div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#1a202c', lineHeight: 1.3 }}>{tab}</div>
              <div style={{ fontSize: 12, color: '#666', marginTop: 3, lineHeight: 1.4 }}>{meta.subtitle}</div>
            </div>
          </div>
          <button onClick={onClose} style={closeBtnStyle}
            onMouseEnter={e => { e.currentTarget.style.background = '#e5e7eb'; e.currentTarget.style.color = '#374151'; }}
            onMouseLeave={e => { e.currentTarget.style.background = '#f3f4f6'; e.currentTarget.style.color = '#9ca3af'; }}>×</button>
        </div>

        {/* 内容区 */}
        <div style={contentStyle}>
          {tab === '消息渠道' && <ChannelListPanel />}
          {tab === '快捷指令' && <ShortcutPanel taskName={taskName} onInject={text => { if (onInject) { onInject(text); onClose(); } }} />}
          {tab === '文件快传' && <FileTransferPanel projectId={currentProjectId} conversationId={activePanel?.conversationId} onSend={onSend} />}
          {tab === '技能应用' && <SkillPanel taskName={taskName} onInject={text => { if (onInject) { onInject(text); onClose(); } }} />}
          {tab === '定时任务' && <SchedulePanel onFillInput={text => { if (onInject) { onInject(text); onClose(); } }} onSend={text => { if (onSend) { onSend(text); onClose(); } }} />}
          {tab === '多智能体' && (
            <AgentPanel
              agents={agents} agentStatusMap={agentStatusMap} taskName={taskName}
              matchedProject={matchedProject} incomingAgentNames={incomingAgentNames}
              openPanels={openPanels} activePanelId={activePanelId}
              onSwitchPanel={panelId => { onSwitchPanel(panelId); onClose(); }}
              onOpenPanel={(agentId, agentName, agentColor, initialMessage) => { onOpenAgentPanel(agentId, agentName, agentColor, initialMessage); onClose(); }}
              onSwitchAgent={(agentId, agentName, agentColor) => { onSwitchAgentInSession(agentId, agentName, agentColor); onClose(); }}
              onClosePanel={onCloseAgentPanel} currentProjectId={currentProjectId}
              onInject={text => { if (onInject) { onInject(text); onClose(); } }}
              collabNodes={collabNodes} setCollabNodes={setCollabNodes}
              isProject={isProject} participatingAgentNames={participatingAgentNames}
              onUpgradeToProject={onUpgradeToProject} onDowngradeToTask={onDowngradeToTask}
            />
          )}
          {tab === '任务标签' && <TaskTagPanel conversationId={activePanel?.conversationId} taskName={taskName} />}
        </div>
      </div>
      <style>{`@keyframes tabPanelModalIn{from{opacity:0;transform:scale(0.9) translateY(12px)}to{opacity:1;transform:scale(1) translateY(0)}}`}</style>
    </div>
  );
}
