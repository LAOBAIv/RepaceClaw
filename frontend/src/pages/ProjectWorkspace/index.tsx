/**
 * ProjectWorkspace/index — 项目工作台主入口组件
 *
 * 职责：整合所有子组件和 hooks，作为工作台布局容器。
 * 初始化逻辑已提取到 hooks/useWorkspaceInit.ts
 * 微信助手 Tab 逻辑已提取到 hooks/useWechatTab.ts
 * 在线状态检测已提取到 hooks/useOnlineStatus.ts
 */
import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import '../ProjectWorkspace.css';

import { useConversationStore } from '@/stores/conversation';
import { useAgentStore } from '@/stores/agentStore';
import { useProjectStore } from '@/stores/projectStore';
import { useTaskStore } from '@/stores/taskStore';
import { SessionAgentBar } from '@/components/SessionAgentBar';
import { NewTabModal } from '@/components/NewTabModal';
import { PriorityModal } from './PriorityModal';
import { getProgressColor } from '@/components/workspace';

// 子组件
import { TabBar } from './TabBar';
import { ChatArea } from './ChatArea';
import { ChatInput } from './ChatInput';
import { WorkspaceSidebar } from './WorkspaceSidebar';

// Hooks
import { useTabs } from './hooks/useTabs';
import { useChat } from './hooks/useChat';
import { useProjectState } from './hooks/useProjectState';
// import { useOnlineStatus } from './hooks/useOnlineStatus'; // reserved for future use
import { useWechatTab } from './hooks/useWechatTab';
import { useWorkspaceInit } from './hooks/useWorkspaceInit';

/** 应用状态配置常量 */
// const STATUS_CONFIG = {
//   running: { label: '运行中', bg: '#e8f5e9', color: '#2e7d32', border: '#dcedc8', dotColor: '#22c55e' },
//   offline: { label: '离线',   bg: '#fef2f2', color: '#b91c1c', border: '#fecaca', dotColor: '#ef4444' },
//   busy:    { label: '忙碌',   bg: '#fffbeb', color: '#b45309', border: '#fde68a', dotColor: '#f59e0b' },
// } as const;

export function ProjectWorkspace() {
  const location = useLocation();
  type NavState = { projectName?: string; projectId?: string; taskId?: string; agentNames?: string[]; sessionId?: string; precreatedTabId?: string; navNonce?: number } | null;
  const navState = location.state as NavState;
  const incomingProjectName = navState?.projectName;
  const incomingProjectId = navState?.projectId;
  const incomingTaskId = navState?.taskId;
  const incomingAgentNames = navState?.agentNames;

  /* ── Store ── */
  const { openPanels, openPanel, connect, closePanel } = useConversationStore();
  const { agents, fetchAgents } = useAgentStore();
  const { currentProject } = useProjectStore();

  /* ── Hooks ── */
  const tabs = useTabs();
  const chat = useChat();
  const project = useProjectState(incomingProjectId, incomingProjectName, incomingTaskId, incomingAgentNames);
  // const isOnline = useOnlineStatus(); // reserved for future use
  const { handleWechatTabClick } = useWechatTab(tabs.switchTab, chat.setActivePanelId);
  useWorkspaceInit(
    navState,
    project.fetchProjects,
    fetchAgents,
    connect,
    tabs.switchTab,
    chat.setActivePanelId,
    tabs.createSessionTabFn,
  );

  /* ── 本地状态 ── */
  const [activeSideTab, setActiveSideTab] = useState<string | null>(null);
  const [showPriorityModal, setShowPriorityModal] = useState(false);
  const [showChannelModal, setShowChannelModal] = useState(false);

  /* ── 顶部状态徽标 ── */
  // const isAnyStreaming = openPanels.some(p => p.isStreaming); // reserved for future use
  // type AppStatus = 'running' | 'offline' | 'busy';
  // const appStatus: AppStatus = !isOnline || !wsConnected ? 'offline' : isAnyStreaming ? 'busy' : 'running';

  /* ── 上下文使用量估算 ── */
  const activeAgent = chat.activePanel?.agentId ? agents.find(a => a.id === chat.activePanel.agentId) : null;
  const activeModelName = activeAgent?.modelName || 'GLM-5';
  const panelMessages = chat.activePanel?.messages || [];
  const totalChars = panelMessages.reduce((sum, msg) => sum + (msg.content?.length || 0), 0);
  const messageCount = panelMessages.length;
  const draftChars = chat.inputValue.length;
  const estimatedTokens = Math.max(1000, Math.round(totalChars * 1.1 + draftChars * 1.1 + messageCount * 80 + 1500));
  const contextLimit = 200000;
  const contextUsedK = estimatedTokens >= 1000 ? (estimatedTokens / 1000).toFixed(1).replace(/\.0$/, '') : '1';
  const contextMaxK = Math.round(contextLimit / 1000);
  const contextPct = Math.min(100, Math.max(1, Math.round((estimatedTokens / contextLimit) * 100)));
  const taskProgress = 68;
  const progressColor = getProgressColor(taskProgress);

  /* ── activeTab 变化时同步 activePanel ── */
  React.useEffect(() => {
    const tab = tabs.allTabs.find(t => t.id === tabs.storeActiveId);
    if (tab?.panelId) chat.setActivePanelId(tab.panelId);
  }, [tabs.allTabs, tabs.storeActiveId, chat.setActivePanelId]);

  /* ── 侧边 Tab 点击 ── */
  const handleTabClick = (tab: string) => {
    if (tab === '消息渠道') { setActiveSideTab(null); setShowChannelModal(true); }
    else { setActiveSideTab(activeSideTab === tab ? null : tab); }
  };

  return (
    <>
      <div className="workspace-body">
        <div className="layout-container">
          {/* 标签栏 */}
          <TabBar
            allTabs={tabs.allTabs}
            storeActiveId={tabs.storeActiveId}
            editingTabId={tabs.editingTabId}
            editingTabTitle={tabs.editingTabTitle}
            onEditingTitleChange={v => tabs.setEditingTabTitle(v)}
            showModelDropdown={tabs.showModelDropdown}
            modelDropdownTabId={tabs.modelDropdownTabId}
            modelDropdownRef={tabs.modelDropdownRef}
            availableModels={tabs.availableModels}
            agents={tabs.agents}
            onTabClick={(tab) => tabs.switchTab(tab.id)}
            onTabClose={tabs.handleCloseTab}
            onRenameStart={(id, title) => { tabs.setEditingTabId(id); tabs.setEditingTabTitle(title); }}
            onRenameConfirm={tabs.handleRenameTab}
            onRenameCancel={() => { tabs.setEditingTabId(null); tabs.setEditingTabTitle(''); }}
            onAddTab={() => tabs.setShowNewTabModal(true)}
            onModelDropdownClose={() => { tabs.setShowModelDropdown(false); tabs.setModelDropdownTabId(null); }}
            onSwitchModel={tabs.handleSwitchModel}
            onWechatTabClick={handleWechatTabClick}
          />

          {/* 多智能体 Agent 栏 */}
          {chat.activePanel && (
            <SessionAgentBar
              conversationId={chat.activePanel.conversationId}
              participants={(agents ?? []).filter(a =>
                chat.activePanel!.agentIds.includes(a.id) ||
                chat.activePanel!.agentIds.includes(a.agentCode || '') ||
                chat.activePanel!.agentIds.includes(a.openclawAgentId || '')
              ).map(a => ({ id: a.id, name: a.name, color: a.color }))}
              isWechatAssistant={chat.activePanel.agentId === 'rc-wechat-agent' || chat.activePanel.agentName === '微信助手'}
              onParticipantsChange={async (updatedConversation) => {
                await fetchAgents();
                if (!updatedConversation) return;
                useConversationStore.setState((state) => ({
                  openPanels: state.openPanels.map((panel) =>
                    panel.conversationId === chat.activePanel!.conversationId || panel.id === chat.activePanel!.conversationId
                      ? { ...panel, sessionCode: updatedConversation.sessionCode || panel.sessionCode,
                          agentId: updatedConversation.currentAgentId || panel.agentId,
                          currentAgentCode: updatedConversation.currentAgentCode || panel.currentAgentCode,
                          agentIds: updatedConversation.agentIds?.length ? updatedConversation.agentIds : panel.agentIds }
                      : panel
                  ),
                  sessionTabs: state.sessionTabs.map((tab) =>
                    tab.conversationId === chat.activePanel!.conversationId || tab.panelId === chat.activePanel!.conversationId
                      ? { ...tab, sessionCode: updatedConversation.sessionCode || tab.sessionCode,
                          agentId: updatedConversation.currentAgentId || tab.agentId,
                          currentAgentCode: updatedConversation.currentAgentCode || tab.currentAgentCode }
                      : tab
                  ),
                }));
              }}
            />
          )}

          {/* 消息展示区 */}
          <ChatArea
            openPanels={openPanels}
            activePanel={chat.activePanel}
            agents={agents}
            expandedPanels={chat.expandedPanels}
            onExpandPanel={chat.handleExpandPanel}
            welcomeAreaRef={chat.welcomeAreaRef}
            messagesEndRef={chat.messagesEndRef}
            formatMessageTime={chat.formatMessageTime}
          />

          {/* 功能标签栏 + TabPanel */}
          <WorkspaceSidebar
            activeSideTab={activeSideTab}
            onSideTabClick={handleTabClick}
            showChannelModal={showChannelModal}
            onCloseChannelModal={() => setShowChannelModal(false)}
            activePanelAgentId={chat.activePanel?.agentId}
            activePanelAgentName={chat.activePanel?.agentName}
            tabPanelProps={{
              agents,
              tasks: [...useTaskStore.getState().tasks.progress, ...useTaskStore.getState().tasks.done],
              taskName: project.taskName,
              matchedProject: project.matchedKanbanProject,
              incomingAgentNames,
              onInject: text => chat.setInputValue(text),
              onSend: text => { chat.setInputValue(text); setTimeout(() => chat.handleSend(), 0); },
              openPanels,
              activePanelId: chat.activePanelId ?? chat.activePanel?.id ?? null,
              onSwitchPanel: panelId => chat.setActivePanelId(panelId),
              onOpenAgentPanel: async (agentId, agentName, agentColor, initialMessage) => {
                const existing = openPanels.find(p => p.agentId === agentId);
                if (existing) {
                  const isNewTab = !chat.activePanel;
                  if (isNewTab) {
                    closePanel(existing.id);
                    const newPanelId = await openPanel({ agentId, agentName, agentColor, projectId: currentProject?.id, initialMessage, forceNew: true });
                    if (newPanelId) { chat.setActivePanelId(newPanelId); tabs.createSessionTabFn({ agentId, agentName, agentColor, title: agentName, conversationId: newPanelId }); }
                  } else { chat.setActivePanelId(existing.id); }
                } else {
                  await openPanel({ agentId, agentName, agentColor, projectId: currentProject?.id, initialMessage });
                  const fresh = useConversationStore.getState().openPanels.find(p => p.agentId === agentId);
                  if (fresh) { chat.setActivePanelId(fresh.id); tabs.createSessionTabFn({ agentId, agentName, agentColor, title: agentName, conversationId: fresh.id }); }
                }
              },
              onSwitchAgentInSession: async (agentId, agentName) => {
                const current = chat.activePanel ?? openPanels.find(p => p.id === chat.activePanelId) ?? openPanels[0] ?? null;
                if (!current?.conversationId) return;
                const { switchAgent } = useConversationStore.getState();
                await switchAgent(current.conversationId, agentId);
                project.setParticipatingAgentNames(prev => prev.includes(agentName) ? prev : [...prev, agentName]);
                chat.setActivePanelId(current.id);
              },
              onCloseAgentPanel: panelId => {
                closePanel(panelId);
                chat.setActivePanelId(prev => prev === panelId ? (openPanels.find(p => p.id !== panelId)?.id ?? null) : prev);
              },
              currentProjectId: currentProject?.id || project.matchedKanbanProject?.id,
              collabNodes: project.collabNodes,
              setCollabNodes: project.setCollabNodes,
              isProject: project.isProjectMode,
              participatingAgentNames: project.participatingAgentNames,
              onUpgradeToProject: project.upgradeToProject,
              onDowngradeToTask: project.downgradeToTask,
            }}
          />

          {/* 输入区 */}
          <ChatInput
            inputValue={chat.inputValue}
            onInputChange={v => chat.setInputValue(v)}
            onKeyDown={chat.handleKeyDown}
            onPaste={chat.handlePaste}
            onSend={chat.handleSend}
            textareaRef={chat.textareaRef}
            pastedImages={chat.pastedImages}
            onRemoveImage={chat.removePastedImage}
          />

          {/* 上下文使用进度条 */}
          <div className="progress-bar-area">
            <div className="progress-bar-header">
              <span className="progress-bar-label">{activeModelName} · 估算上下文 约 {contextUsedK}k / {contextMaxK}k</span>
              <span className="progress-bar-pct" style={{ color: progressColor }}>{contextPct}%</span>
            </div>
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${contextPct}%`, background: `linear-gradient(90deg, ${progressColor}88, ${progressColor})` }} />
            </div>
          </div>
        </div>
      </div>

      {/* 弹窗 */}
      {showPriorityModal && (
        <PriorityModal priority={project.currentPriority} onSetPriority={project.setPriority} onClose={() => setShowPriorityModal(false)} />
      )}
      {tabs.showNewTabModal && (
        <NewTabModal open={tabs.showNewTabModal} onClose={() => tabs.setShowNewTabModal(false)}
          onCreated={(convId, agentName, agentColor, tabTitle) => {
            chat.setActivePanelId(convId);
            tabs.createSessionTabFn({ agentId: '', agentName, agentColor, title: tabTitle, conversationId: convId });
          }}
        />
      )}
    </>
  );
}
