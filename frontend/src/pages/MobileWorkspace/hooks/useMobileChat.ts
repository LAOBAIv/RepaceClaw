/**
 * useMobileChat — 移动端聊天逻辑 Hook
 *
 * 封装聊天相关的状态与操作：
 * - 消息发送
 * - 会话创建/切换/关闭
 * - 会话重命名
 * - 模型切换
 * - Toast 通知
 *
 * 从原 MobileWorkspace.tsx 提取，保持所有现有行为不变。
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useConversationStore } from '../../../stores/conversation';
import { useAgentStore } from '../../../stores/agentStore';
import { useAuthStore } from '../../../stores/authStore';
import apiClient from '../../../api/client';
import { AVAILABLE_MODELS } from '../constants';

export function useMobileChat() {
  const navigate = useNavigate();
  const { logout } = useAuthStore();

  // ── 接入 conversation store ──
  const {
    getTabs, switchTab, connect, restoreFromPersist,
    activeTabId, openPanels, wsConnected,
    createSessionTab, sendMessage, closeTab, renameTab,
  } = useConversationStore();

  // ── 接入 agent store ──
  const { agents, loading: agentsLoading, fetchAgents } = useAgentStore();

  // ── 当前激活的 panel id ──
  const [activePanelId, setActivePanelId] = useState<string | null>(null);

  // ── 本地状态 ──
  const [initialized, setInitialized] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [agentSelectorOpen, setAgentSelectorOpen] = useState(false);
  const [selectedAgentForCreate, setSelectedAgentForCreate] = useState<{ id: string; name: string; color: string } | null>(null);
  const [newSessionTitle, setNewSessionTitle] = useState('');
  const [modelSelectorOpen, setModelSelectorOpen] = useState(false);
  const [renamingTabId, setRenamingTabId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [showToast, setShowToast] = useState<string | null>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  /* ── 初始化：恢复持久化状态 + 加载数据 ── */
  useEffect(() => {
    (async () => {
      // ⚠️ 关键：先 fetchAgents 再 restoreFromPersist。
      // 根因：restoreFromPersist 恢复 tab 时会根据 agentId 查 agent.name 填充 agentName。
      try {
        await fetchAgents();
      } catch (e) { console.warn("[MobileChat]", e); }
      try {
        await restoreFromPersist();
      } catch (e) { console.warn("[MobileChat]", e); }
      try {
        connect();
      } catch (e) { console.warn("[MobileChat]", e); }

      // 和PC端一致：restoreFromPersist完成后，从activeTab.panelId设置activePanelId
      const { openPanels: panels, sessionTabs: restoredTabs, activeTabId: restoredActiveId } = useConversationStore.getState();
      if (restoredActiveId) {
        const activeTab = restoredTabs.find(t => t.id === restoredActiveId);
        if (activeTab?.panelId) {
          setActivePanelId(activeTab.panelId);
        } else if (panels.length > 0) {
          setActivePanelId(panels[0].id);
        }
      } else if (panels.length > 0) {
        setActivePanelId(panels[0].id);
      }

      setInitialized(true);
    })();
  }, [restoreFromPersist, fetchAgents, connect]);

  /* ── 派生数据 ── */
  const tabs = getTabs();
  const activeTab = tabs.find((t) => t.id === activeTabId) || null;

  /*
   * 顶部与聊天区都必须优先跟随当前激活 tab 绑定的 panel / conversation，
   * 不能再兜底拿 openPanels[0]，否则一旦 activePanelId 短暂失配，
   * 就会串到别的会话。
   */
  const activePanel = (() => {
    if (activePanelId) {
      const byId = openPanels.find((p) => p.id === activePanelId);
      if (byId) return byId;
    }
    if (activeTab?.panelId) {
      const byPanelId = openPanels.find((p) => p.id === activeTab.panelId);
      if (byPanelId) return byPanelId;
    }
    const activeConvId = activeTab?.conversationId || activeTab?.id;
    if (activeConvId) {
      const byConv = openPanels.find((p) => p.conversationId === activeConvId);
      if (byConv) return byConv;
    }
    return openPanels.length === 1 ? openPanels[0] : null;
  })();

  const activeAgent =
    (activePanel?.agentId ? agents.find((a) => a.id === activePanel.agentId) : null)
    || (activeTab?.agentId ? agents.find((a) => a.id === activeTab.agentId) : null)
    || null;

  // 顶部智能体名称必须优先取 agent store 的真实名字
  const activeAgentName = activeAgent?.name || activePanel?.agentName || activeTab?.agentName || '';

  /* ── 事件处理 ── */

  // 切换会话
  const handleSwitchTab = useCallback((tabId: string) => {
    switchTab(tabId);
    const state = useConversationStore.getState();
    const targetTab = state.sessionTabs.find(t => t.id === tabId);
    if (!targetTab) return;

    const convId = targetTab.conversationId || targetTab.panelId || targetTab.id;

    // 1. 先用 tab 的 panelId 精确匹配
    if (targetTab.panelId) {
      const hit = state.openPanels.find(p => p.id === targetTab.panelId);
      if (hit) { setActivePanelId(hit.id); return; }
    }
    // 2. 按 conversationId 匹配
    const byConv = state.openPanels.find(p => p.conversationId === convId);
    if (byConv) { setActivePanelId(byConv.id); return; }
    // ⚠️ 防回归：绝不能再按 agentId / 第一个 panel 兜底
    setActivePanelId(targetTab.panelId || convId);
  }, [switchTab]);

  // 登出
  const handleLogout = useCallback(() => {
    logout();
    navigate('/login');
  }, [logout, navigate]);

  // 创建会话 — 进入标题输入步骤
  const handleCreateSession = useCallback(async (agentId: string, agentName: string, agentColor: string) => {
    setSelectedAgentForCreate({ id: agentId, name: agentName, color: agentColor });
    setNewSessionTitle('');
  }, []);

  // 确认创建会话
  const handleConfirmCreateSession = useCallback(async () => {
    if (!selectedAgentForCreate) return;
    const title = newSessionTitle.trim() || selectedAgentForCreate.name;
    try {
      const newTabId = await createSessionTab({
        agentId: selectedAgentForCreate.id,
        agentName: selectedAgentForCreate.name,
        agentColor: selectedAgentForCreate.color,
        title,
        forceNewTab: true,
      });
      // 创建后同步activePanelId
      const state = useConversationStore.getState();
      const hitTab = state.sessionTabs.find(t => t.id === newTabId);
      if (hitTab?.panelId) {
        setActivePanelId(hitTab.panelId);
      }
      setSelectedAgentForCreate(null);
      setNewSessionTitle('');
      setAgentSelectorOpen(false);
    } catch (e) {
      console.error('[MobileWorkspace:createSessionTab]', e);
      setShowToast('创建会话失败');
    }
  }, [selectedAgentForCreate, newSessionTitle, createSessionTab]);

  // 切换模型
  const handleSwitchModel = useCallback(async (modelId: string) => {
    if (!activeAgent?.id || !activePanelId) return;
    const state = useConversationStore.getState();
    const currentPanel = state.openPanels.find(p => p.id === activePanelId);
    try {
      await apiClient.put(`/agents/${activeAgent.id}`, { modelName: modelId });
      await fetchAgents();
      setModelSelectorOpen(false);
      if (currentPanel) {
        await state.loadMessages(currentPanel.id, currentPanel.conversationId);
      }
      const model = AVAILABLE_MODELS.find(m => m.id === modelId);
      setShowToast(`模型已更新为 ${model?.label || modelId}`);
    } catch (e: unknown) { // [2026-05-24] 类型安全
      console.error('[MobileWorkspace:switchModel]', e);
      const status = e?.response?.status;
      const detail = e?.response?.data?.error || e?.message || '未知错误';
      setShowToast(`更新模型失败: ${status ? `${status} ` : ''}${detail}`);
    }
  }, [activeAgent?.id, fetchAgents, activePanelId]);

  // 关闭会话
  const handleCloseTab = useCallback((tabId: string) => {
    closeTab(tabId);
  }, [closeTab]);

  // 开始重命名
  const handleStartRename = useCallback((tabId: string, currentTitle: string) => {
    setRenamingTabId(tabId);
    setRenameValue(currentTitle);
  }, []);

  // 完成重命名
  const handleFinishRename = useCallback(() => {
    if (renamingTabId && renameValue.trim()) {
      renameTab(renamingTabId, renameValue.trim());
    }
    setRenamingTabId(null);
    setRenameValue('');
  }, [renamingTabId, renameValue, renameTab]);

  // Toast auto-hide
  useEffect(() => {
    if (showToast) {
      const timer = setTimeout(() => setShowToast(null), 2000);
      return () => clearTimeout(timer);
    }
  }, [showToast]);

  // 发送消息
  const handleSend = useCallback((text: string) => {
    if (!activePanelId) return;
    sendMessage(activePanelId, text);
    setInputValue('');
  }, [activePanelId, sendMessage]);

  return {
    // State
    activePanelId, setActivePanelId,
    initialized,
    inputValue, setInputValue,
    agentSelectorOpen, setAgentSelectorOpen,
    selectedAgentForCreate, setSelectedAgentForCreate,
    newSessionTitle, setNewSessionTitle,
    modelSelectorOpen, setModelSelectorOpen,
    renamingTabId, setRenamingTabId,
    renameValue, setRenameValue,
    showToast, setShowToast,
    renameInputRef,

    // Derived
    tabs, activeTab, activeTabId, activePanel, activeAgent, activeAgentName,
    agents, agentsLoading, openPanels, wsConnected,

    // Handlers
    handleSwitchTab,
    handleLogout,
    handleCreateSession,
    handleConfirmCreateSession,
    handleSwitchModel,
    handleCloseTab,
    handleStartRename,
    handleFinishRename,
    handleSend,
  };
}
