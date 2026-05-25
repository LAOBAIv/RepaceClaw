/**
 * MobileWorkspace — 移动端工作区主入口
 *
 * 独立于 PC 端 AppShell 的 /mobile 路由专用页面。
 * 布局结构：
 *  ┌────────────────────┐
 *  │     Top Bar        │ ← 标题 + 左/右抽屉触发按钮
 *  ├────────────────────┤
 *  │                    │
 *  │   主聊天区容器      │ ← 消息列表 + 空状态占位
 *  │                    │
 *  ├────────────────────┤
 *  │  底部功能区占位     │ ← 输入框 + 功能按钮
 *  └────────────────────┘
 *  + Left Drawer  (左侧抽屉：导航菜单)
 *  + Right Drawer (右侧抽屉：会话列表)
 *  + 各类 Sheet（智能体选择 / 会话标题 / 模型切换）
 *
 * 本文件为编排层，组合各子组件与 hooks，不直接渲染复杂 UI。
 */

import { useCallback } from 'react';
import { MobileAgentLibrary } from '../MobileAgentLibrary';
import { MobileAgentManager } from '../MobileAgentManager';
import { MobileAgentCreate } from '../MobileAgentCreate';
import { COLORS } from './constants';
import { useMobileChat } from './hooks/useMobileChat';
import { useMobileNav } from './hooks/useMobileNav';
import { MobileHeader } from './MobileHeader';
import { MobileChatArea } from './MobileChatArea';
import { MobileChatInput } from './MobileChatInput';
import { MobileLeftDrawer } from './MobileLeftDrawer';
import { MobileRightDrawer } from './MobileRightDrawer';
import { MobileAgentSelector } from './MobileAgentSelector';
import { MobileSessionTitleSheet } from './MobileSessionTitleSheet';
import { MobileModelSelector } from './MobileModelSelector';
import { MobileSessionsView } from './MobileSessionsView';

export function MobileWorkspace() {

  // ── 聊天逻辑 Hook ──
  const chat = useMobileChat();

  // ── 导航逻辑 Hook（依赖 chat 的 handlers） ──
  const nav = useMobileNav(chat.handleSwitchTab, chat.setShowToast);

  /* ── 包装 handleSwitchTab：切换时关闭右抽屉 + 返回 workspace ── */
  const handleSwitchTab = useCallback((tabId: string) => {
    chat.handleSwitchTab(tabId);
    nav.setRightDrawerOpen(false);
    nav.setMobileView('workspace');
  }, [chat.handleSwitchTab, nav.setRightDrawerOpen, nav.setMobileView]);

  /* ── 包装 handleConfirmCreateSession：创建后关闭右抽屉 ── */
  const handleConfirmCreateSession = useCallback(async () => {
    await chat.handleConfirmCreateSession();
    nav.setRightDrawerOpen(false);
  }, [chat.handleConfirmCreateSession, nav.setRightDrawerOpen]);

  /* ── 取消重命名 ── */
  const handleCancelRename = useCallback(() => {
    chat.setRenamingTabId(null);
    chat.setRenameValue('');
  }, [chat.setRenamingTabId, chat.setRenameValue]);

  /* ── 视图分支：非 workspace 视图直接返回对应页面 ── */
  if (nav.mobileView === 'sessions') {
    return (
      <MobileSessionsView
        tabs={chat.tabs}
        activeTabId={chat.activeTabId}
        wsConnected={chat.wsConnected}
        renamingTabId={chat.renamingTabId}
        renameValue={chat.renameValue}
        renameInputRef={chat.renameInputRef}
        onBack={() => nav.setMobileView('workspace')}
        onNewSession={() => { nav.setMobileView('workspace'); chat.setAgentSelectorOpen(true); }}
        onSwitchTab={handleSwitchTab}
        onCloseTab={chat.handleCloseTab}
        onStartRename={chat.handleStartRename}
        onFinishRename={chat.handleFinishRename}
        onCancelRename={handleCancelRename}
        onRenameValueChange={chat.setRenameValue}
      />
    );
  }

  if (nav.mobileView === 'agent-library') {
    return (
      <MobileAgentLibrary
        onBack={() => nav.setMobileView('workspace')}
        onUseTemplateState={(state: unknown) => { // [2026-05-24] 类型安全
          nav.setAgentCreateTemplateState(state);
          nav.setMobileView('agent-create');
        }}
      />
    );
  }

  if (nav.mobileView === 'agent-create') {
    return (
      <MobileAgentCreate
        onBack={() => {
          nav.setAgentCreateTemplateState(null);
          nav.setMobileView('workspace');
        }}
        initialTemplateState={nav.agentCreateTemplateState}
      />
    );
  }

  if (nav.mobileView === 'agents') {
    return (
      <MobileAgentManager
        onBack={() => nav.setMobileView('workspace')}
        onCreate={() => {
          nav.setAgentCreateTemplateState(null);
          nav.setMobileView('agent-create');
        }}
      />
    );
  }

  /* ── 主渲染：workspace 视图 ── */
  return (
    <div style={{
      width: '100vw', height: '100dvh', background: COLORS.bg, color: COLORS.textPrimary,
      display: 'flex', flexDirection: 'column', overflowX: 'hidden', overflowY: 'hidden',
      position: 'relative', touchAction: 'pan-y', WebkitOverflowScrolling: 'touch',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    }}>
      {/* Top Bar */}
      <MobileHeader
        activeTabTitle={chat.activeTab?.title}
        activeAgentName={chat.activeAgentName}
        activeAgentModelName={chat.activeAgent?.modelName}
        wsConnected={chat.wsConnected}
        onLeftClick={() => { nav.setLeftDrawerOpen(true); nav.setRightDrawerOpen(false); }}
        onRightClick={() => { nav.setRightDrawerOpen(true); nav.setLeftDrawerOpen(false); }}
        onModelClick={() => chat.setModelSelectorOpen(true)}
      />

      {/* 主聊天区容器 */}
      <main style={{
        flex: 1, minHeight: 0, overflowX: 'hidden', overflowY: 'hidden',
        display: 'flex', flexDirection: 'column', touchAction: 'pan-y',
      }}>
        <MobileChatArea
          activePanel={chat.activePanel}
          openPanels={chat.openPanels}
          activePanelId={chat.activePanelId}
          agents={chat.agents}
        />
        <MobileChatInput
          value={chat.inputValue}
          onChange={chat.setInputValue}
          onSend={chat.handleSend}
          conversationId={chat.activePanelId}
          taskName={chat.activeTab?.title || chat.activePanel?.agentName || '移动端会话'}
          placeholder={chat.activePanel ? '请输入消息...' : '请先从左侧选择一个智能体开始会话'}
          agents={chat.agents}
          currentAgentId={chat.activePanel?.agentId}
          currentAgentIds={chat.activePanel?.agentIds}
        />
      </main>

      {/* Left Drawer — 导航菜单 */}
      <MobileLeftDrawer
        isOpen={nav.leftDrawerOpen}
        onClose={() => nav.setLeftDrawerOpen(false)}
        onNavClick={nav.handleNavClick}
        onLogout={chat.handleLogout}
      />

      {/* Right Drawer — 会话 Tab 列表 */}
      <MobileRightDrawer
        isOpen={nav.rightDrawerOpen}
        onClose={() => nav.setRightDrawerOpen(false)}
        onNewSession={() => chat.setAgentSelectorOpen(true)}
        tabs={chat.tabs}
        activeTabId={chat.activeTabId}
        wsConnected={chat.wsConnected}
        renamingTabId={chat.renamingTabId}
        renameValue={chat.renameValue}
        renameInputRef={chat.renameInputRef}
        onSwitchTab={handleSwitchTab}
        onCloseTab={chat.handleCloseTab}
        onStartRename={chat.handleStartRename}
        onFinishRename={chat.handleFinishRename}
        onCancelRename={handleCancelRename}
        onRenameValueChange={chat.setRenameValue}
      />

      {/* Agent 选择器 Sheet */}
      <MobileAgentSelector
        isOpen={chat.agentSelectorOpen}
        onClose={() => chat.setAgentSelectorOpen(false)}
        agents={chat.agents}
        agentsLoading={chat.agentsLoading}
        onSelectAgent={chat.handleCreateSession}
      />

      {/* 输入会话标题 Sheet */}
      <MobileSessionTitleSheet
        selectedAgent={chat.selectedAgentForCreate}
        sessionTitle={chat.newSessionTitle}
        onTitleChange={chat.setNewSessionTitle}
        onClose={() => chat.setSelectedAgentForCreate(null)}
        onConfirm={handleConfirmCreateSession}
      />

      {/* Model 选择器 Sheet */}
      <MobileModelSelector
        isOpen={chat.modelSelectorOpen}
        onClose={() => chat.setModelSelectorOpen(false)}
        currentModelName={chat.activeAgent?.modelName}
        onSelectModel={chat.handleSwitchModel}
      />

      {/* Toast 通知 */}
      {chat.showToast && (
        <div style={{
          position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)',
          zIndex: 300, background: COLORS.bgTertiary, borderRadius: 8, padding: '10px 20px',
          fontSize: 13, color: COLORS.textPrimary, boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
        }}>
          {chat.showToast}
        </div>
      )}
    </div>
  );
}

/** 向后兼容：MobileChatPanelContainer 等组件从该路径导入 COLORS */
export { COLORS } from './constants';
