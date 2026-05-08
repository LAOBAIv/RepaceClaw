/**
 * MobileWorkspace — 移动端工作区骨架
 *
 * 独立于 PC 端 AppShell 的 /mobile 路由专用页面。
 * 不修改、不影响任何 PC 端页面行为。
 *
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
 *  + Left Drawer  (左侧抽屉：会话列表 / Agent 列表)
 *  + Right Drawer (右侧抽屉：设置 / 信息面板)
 *  + Mask (遮罩层)
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Menu, Settings, X, LogOut, Plus, Pencil, Trash2, ChevronDown,
  Sparkles, Library, PlusCircle, Bot, Network, Wrench, Puzzle, Layers,
  MessageSquare, Check,
} from 'lucide-react';
import { useConversationStore } from '../stores/conversationStore';
import { useAgentStore } from '../stores/agentStore';
import { useAuthStore } from '../stores/authStore';
import MobileChatPanelContainer from '../components/mobile/MobileChatPanelContainer';
import MobileBottomComposer from '../components/mobile/MobileBottomComposer';
import { MobileAgentLibrary } from './MobileAgentLibrary';
import { MobileAgentManager } from './MobileAgentManager';
import { MobileAgentCreate } from './MobileAgentCreate';
import apiClient from '../api/client';

/* ─────────────────────────────────────────────
 * 颜色常量
 * ───────────────────────────────────────────── */
export const COLORS = {
  bg: '#0f0f0f',
  bgSecondary: '#1a1a1a',
  bgTertiary: '#262626',
  textPrimary: '#f5f5f5',
  textSecondary: '#a3a3a3',
  textMuted: '#737373',
  accent: '#6366f1',
  accentLight: 'rgba(99,102,241,0.15)',
  border: '#333333',
  danger: '#ef4444',
};

/* ─────────────────────────────────────────────
 * 可用模型列表（用于移动端模型切换）
 * ───────────────────────────────────────────── */
const AVAILABLE_MODELS = [
  { id: 'claude-opus-4-6', label: 'Claude Opus 4.6', provider: 'anthropic' },
  { id: 'glm-5', label: 'GLM-5', provider: 'zhipu' },
  { id: 'glm-5.1', label: 'GLM-5.1', provider: 'zhipu' },
  { id: 'qwen3-max-2026-01-23', label: 'Qwen3 Max', provider: 'alibaba' },
  { id: 'qwen3.6-plus', label: 'Qwen3.6 Plus', provider: 'alibaba' },
  { id: 'kimi-k2.5', label: 'Kimi K2.5', provider: 'moonshot' },
  { id: 'minimax-m2.5', label: 'MiniMax M2.5', provider: 'minimax' },
  { id: 'doubao-pro-32k', label: 'Doubao Pro 32K', provider: 'doubao' },
  { id: 'qwen-max', label: 'Qwen Max', provider: 'alibaba' },
  { id: 'auto', label: '自动选择', provider: 'auto' },
];

/* ─────────────────────────────────────────────
 * PC端侧边栏导航菜单（对应 AppShell NAV_ITEMS，不含会话列表）
 * ───────────────────────────────────────────── */
type MobileNavItem = {
  action?: string;
  to?: string;
  icon: any;
  label: string;
};

const NAV_ITEMS: MobileNavItem[] = [
  { action: 'home',      icon: Sparkles,      label: 'RepaceClaw' },
  { action: 'sessions',  icon: MessageSquare, label: '会话列表' },
  { to: '/mobile/agent-library',  icon: Library,    label: 'Agent 模板库' },
  { to: '/mobile/agent-create',   icon: PlusCircle, label: '智能体创建' },
  { to: '/mobile/agents',         icon: Bot,        label: '智能体管理' },
  { to: '/console',               icon: Network,    label: '项目协作' },
  { to: '/skill-settings',        icon: Wrench,     label: '技能设置' },
  { to: '/plugin-settings',       icon: Puzzle,     label: '插件设置' },
];

/* ─────────────────────────────────────────────
 * 智能体类型选项（用于创建/编辑智能体）
 * ───────────────────────────────────────────── */
const AGENT_TYPE_OPTIONS = [
  { id: 'dev',      label: '开发/工程类' },
  { id: 'data',     label: '数据分析类' },
  { id: 'creative', label: '内容/创作类' },
  { id: 'pm',       label: '产品/管理类' },
  { id: 'research', label: 'AI/研究类' },
  { id: 'ops',      label: '运营类' },
  { id: 'decision', label: '决策类' },
  { id: 'general',  label: '通用/助手类' },
];

/* ─────────────────────────────────────────────
 * 颜色选项（用于创建/编辑智能体）
 * ───────────────────────────────────────────── */
const COLOR_OPTIONS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e',
  '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#0ea5e9', '#3b82f6', '#a855f7', '#64748b',
];

/* ─────────────────────────────────────────────
 * 移动端工作区
 * ───────────────────────────────────────────── */
export function MobileWorkspace() {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();

  // ── Drawer 状态 ──
  const [leftDrawerOpen, setLeftDrawerOpen] = useState(false);
  const [rightDrawerOpen, setRightDrawerOpen] = useState(false);

  // ── 接入 conversation store ──
  const {
    getTabs, switchTab, connect, restoreFromPersist,
    activeTabId, openPanels, wsConnected,
    createSessionTab, sendMessage, closeTab, renameTab,
  } = useConversationStore();

  // ── 接入 agent store ──
  const { agents, loading: agentsLoading, fetchAgents } = useAgentStore();

  // ── 当前激活的 panel id（和PC端ProjectWorkspace一致） ──
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

  // ── 智能体创建/管理Sheet状态 ──
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null);
  // ⚠️ 防回归说明：移动端左抽屉的“模板库 / 创建 / 管理 / 工作区”必须走同一父组件内的视图切换，
  // 不能再改回 navigate('/mobile...') 路由跳转。
  // 根因：一旦走路由，MobileWorkspace 会整体卸载重建，openPanels / activePanelId 对应的聊天面板也会重建，
  // 用户会看到“不是切内容，而是整块 panel 被删了又建”，并伴随明显延迟。
  const [mobileView, setMobileView] = useState<'workspace' | 'sessions' | 'agent-library' | 'agent-create' | 'agents'>('workspace');
  const [agentCreateTemplateState, setAgentCreateTemplateState] = useState<any>(null);

  // ── 智能体创建表单状态 ──
  const [newAgentName, setNewAgentName] = useState('');
  const [newAgentColor, setNewAgentColor] = useState('#6366f1');
  const [newAgentType, setNewAgentType] = useState('general');
  const [newAgentModel, setNewAgentModel] = useState('glm-5');
  const [newAgentPrompt, setNewAgentPrompt] = useState('');

  /* ── 初始化：恢复持久化状态 + 加载数据 ── */
  useEffect(() => {
    (async () => {
      // ⚠️ 关键：先 fetchAgents 再 restoreFromPersist。
      // 根因：restoreFromPersist 恢复 tab 时会根据 agentId 查 agent.name 填充 agentName。
      // 如果 agents 为空，全部落到 '智能体' 兜底，且恢复后不会再更新。
      try {
        await fetchAgents();
      } catch {}
      try {
        await restoreFromPersist();
      } catch {}
      try {
        connect();
      } catch {}

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

  /* ── 派生数据（和PC端ProjectWorkspace一致） ── */
  const tabs = getTabs();
  const activeTab = tabs.find((t) => t.id === activeTabId) || null;
  /*
   * 顶部与聊天区都必须优先跟随当前激活 tab 绑定的 panel / conversation，
   * 不能再兜底拿 openPanels[0]，否则一旦 activePanelId 短暂失配，
   * 就会串到别的会话，表现为“智能体名称错了 / 内容对不上 / 右上角状态也跟着错”。
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
  // 顶部智能体名称必须优先取 agent store 的真实名字，其次 panel，最后才是 tab。
  // 不能直接显示 activeTab.agentName，否则旧缓存/恢复态会把名称带歪。
  const activeAgentName = activeAgent?.name || activePanel?.agentName || activeTab?.agentName || '';

  /* ── 事件处理 ── */
  // ⚠️ 防回归说明：右侧抽屉切会话只允许“切 activePanelId / activeTabId”，
  // 禁止通过卸载/重建 panel 或整页路由跳转来实现。
  // 否则会出现两个回归：
  // 1) panel 重建导致明显延迟；
  // 2) panel 匹配失败时 activePanel 变 null，落入空状态，用户看到“内容居中”。
  const handleSwitchTab = useCallback((tabId: string) => {
    switchTab(tabId);
    setRightDrawerOpen(false);
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
    // ⚠️ 防回归：绝不能再按 agentId / 第一个 panel 兜底。
    // 同一智能体允许出现在多个会话里，一旦按 agentId 命中，顶部名称、消息区、右上角状态都会串会话。
    // 找不到就先保持目标 panelId / conversationId，等待恢复链或重建链补齐。
    setActivePanelId(targetTab.panelId || convId);
  }, [switchTab]);

  // ⚠️ 防回归说明：这里是左侧抽屉的核心修复点。
  // “工作区 / 模板库 / 创建 / 管理”必须只切 mobileView，不能再改回路由跳转。
  // 当前只有不属于工作区内视图的页面，才允许继续 navigate(item.to)。
  const handleNavClick = useCallback((item: MobileNavItem) => {
    setLeftDrawerOpen(false);
    if (item.action === 'home' || item.to === '/console') {
      setMobileView('workspace');
      const state = useConversationStore.getState();
      const firstTab = state.sessionTabs[0];
      if (firstTab) {
        handleSwitchTab(firstTab.id);
      }
      return;
    }
    if (item.action === 'sessions') {
      setMobileView('sessions');
      return;
    }
    if (item.to === '/mobile/agent-library') {
      setMobileView('agent-library');
      return;
    }
    if (item.to === '/mobile/agent-create') {
      setAgentCreateTemplateState(null);
      setMobileView('agent-create');
      return;
    }
    if (item.to === '/mobile/agents') {
      setMobileView('agents');
      return;
    }
    navigate(item.to!);
  }, [navigate, handleSwitchTab]);

  const handleLogout = useCallback(() => {
    logout();
    navigate('/login');
  }, [logout, navigate]);

  const handleCreateSession = useCallback(async (agentId: string, agentName: string, agentColor: string) => {
    // 先进入标题输入步骤
    setSelectedAgentForCreate({ id: agentId, name: agentName, color: agentColor });
    setNewSessionTitle('');
  }, []);

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
      // 创建后同步activePanelId（和PC端一致）
      const state = useConversationStore.getState();
      const hitTab = state.sessionTabs.find(t => t.id === newTabId);
      if (hitTab?.panelId) {
        setActivePanelId(hitTab.panelId);
      }
      setSelectedAgentForCreate(null);
      setNewSessionTitle('');
      setAgentSelectorOpen(false);
      setRightDrawerOpen(false);
    } catch (e) {
      console.error('[MobileWorkspace:createSessionTab]', e);
      setShowToast('创建会话失败');
    }
  }, [selectedAgentForCreate, newSessionTitle, createSessionTab]);

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
    } catch (e: any) {
      console.error('[MobileWorkspace:switchModel]', e);
      const status = e?.response?.status;
      const detail = e?.response?.data?.error || e?.message || '未知错误';
      setShowToast(`更新模型失败: ${status ? `${status} ` : ''}${detail}`);
    }
  }, [activeAgent?.id, fetchAgents, activePanelId]);

  const handleCloseTab = useCallback((tabId: string) => {
    closeTab(tabId);
  }, [closeTab]);

  const handleStartRename = useCallback((tabId: string, currentTitle: string) => {
    setRenamingTabId(tabId);
    setRenameValue(currentTitle);
  }, []);

  const handleFinishRename = useCallback(() => {
    if (renamingTabId && renameValue.trim()) {
      renameTab(renamingTabId, renameValue.trim());
    }
    setRenamingTabId(null);
    setRenameValue('');
  }, [renamingTabId, renameValue, renameTab]);

  // ── 智能体创建 ──
  const handleCreateAgent = useCallback(async () => {
    if (!newAgentName.trim()) {
      setShowToast('请输入智能体名称');
      return;
    }
    try {
      // ⚠️ 防回归：移动端这里必须走 apiClient，不能直接 fetch('/api/...')。
      // 根因：原生 fetch 不会自动注入 JWT，登录后创建智能体会稳定命中 401。
      await apiClient.post('/agents', {
        name: newAgentName.trim(),
        color: newAgentColor,
        agentType: newAgentType,
        modelName: newAgentModel,
        systemPrompt: newAgentPrompt,
        status: 'idle',
      });
      await fetchAgents();
      navigate('/mobile');
      // 重置表单
      setNewAgentName('');
      setNewAgentColor('#6366f1');
      setNewAgentType('general');
      setNewAgentModel('glm-5');
      setNewAgentPrompt('');
      setShowToast('智能体创建成功');
    } catch (e) {
      console.error('[MobileWorkspace:createAgent]', e);
      setShowToast('创建智能体失败');
    }
  }, [newAgentName, newAgentColor, newAgentType, newAgentModel, newAgentPrompt, fetchAgents]);

  // ── 智能体编辑 ──
  const handleUpdateAgent = useCallback(async (agentId: string, data: Record<string, any>) => {
    try {
      await apiClient.put(`/agents/${agentId}`, data);
      await fetchAgents();
      setShowToast('智能体更新成功');
    } catch (e) {
      console.error('[MobileWorkspace:updateAgent]', e);
      setShowToast('更新智能体失败');
    }
  }, [fetchAgents]);

  // ── 智能体删除 ──
  const handleDeleteAgent = useCallback(async (agentId: string) => {
    try {
      await apiClient.delete(`/agents/${agentId}`);
      await fetchAgents();
      setEditingAgentId(null);
      navigate('/mobile');
      setShowToast('智能体已删除');
    } catch (e) {
      console.error('[MobileWorkspace:deleteAgent]', e);
      setShowToast('删除智能体失败');
    }
  }, [fetchAgents]);

  // Toast auto-hide
  useEffect(() => {
    if (showToast) {
      const timer = setTimeout(() => setShowToast(null), 2000);
      return () => clearTimeout(timer);
    }
  }, [showToast]);

  const handleSend = useCallback((text: string) => {
    if (!activePanelId) return;
    sendMessage(activePanelId, text);
    setInputValue('');
  }, [activePanelId, sendMessage]);

  /* ── 抽屉面板组件 ── */

  // 左抽屉 — 导航菜单（对应PC端侧边栏）
  const renderNavMenu = () => (
    <div style={{ padding: '8px 0' }}>
      {NAV_ITEMS.map(({ action, to, icon: Icon, label }) => {
        const handleClick = () => {
          handleNavClick({ action, to, icon: Icon, label });
        };
        return (
          <button
            key={to || action}
            onClick={handleClick}
            style={{
            display: 'flex', alignItems: 'center', gap: 12,
            width: '100%', padding: '14px 16px',
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: COLORS.textPrimary,
          }}        >
          <Icon size={18} color={COLORS.textSecondary} />
          <span style={{ fontSize: 14, fontWeight: 500 }}>{label}</span>
        </button>
      );
    })}
      {/* 登出按钮 */}
      <button
        onClick={handleLogout}
        style={{
          display: 'flex', alignItems: 'center', gap: 12,
          width: '100%', padding: '14px 16px', marginTop: 8,
          background: 'transparent', border: 'none', cursor: 'pointer',
          color: COLORS.danger,
        }}
      >
        <LogOut size={18} />
        <span style={{ fontSize: 14, fontWeight: 500 }}>退出登录</span>
      </button>
    </div>
  );

  const renderSessionListContent = (opts?: { onSelectTab?: () => void }) => (
    <>
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
        {tabs.length === 0 ? (
          <div style={{
            padding: '24px 16px', textAlign: 'center',
            color: COLORS.textMuted, fontSize: 13,
          }}>
            <MessageSquare size={32} style={{ margin: '0 auto 8px', opacity: 0.3 }} />
            <div>暂无会话</div>
            <div style={{ fontSize: 11, marginTop: 4 }}>点击右上角新建会话</div>
          </div>
        ) : (
          tabs.map((tab) => (
            <div
              key={tab.id}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                width: '100%', padding: '12px 16px',
                background: tab.id === activeTabId ? COLORS.accentLight : 'transparent',
                borderLeft: tab.id === activeTabId ? `3px solid ${COLORS.accent}` : '3px solid transparent',
              }}
            >
              <div style={{
                width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                background: tab.color || COLORS.accent,
              }} />
              {renamingTabId === tab.id ? (
                <input
                  ref={renameInputRef}
                  value={renameValue}
                  onChange={e => setRenameValue(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleFinishRename();
                    if (e.key === 'Escape') { setRenamingTabId(null); setRenameValue(''); }
                  }}
                  onBlur={handleFinishRename}
                  autoFocus
                  style={{
                    flex: 1, background: COLORS.bgTertiary, border: `1px solid ${COLORS.accent}`,
                    borderRadius: 6, padding: '6px 8px', fontSize: 13,
                    color: COLORS.textPrimary, outline: 'none',
                  }}
                />
              ) : (
                <button
                  onClick={() => {
                    handleSwitchTab(tab.id);
                    opts?.onSelectTab?.();
                  }}
                  style={{
                    flex: 1, textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer',
                  }}
                >
                  <div style={{
                    fontSize: 13, fontWeight: tab.id === activeTabId ? 600 : 400,
                    color: COLORS.textPrimary,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {tab.title}
                  </div>
                  {tab.agentName && (
                    <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 2 }}>
                      {tab.agentName}
                    </div>
                  )}
                </button>
              )}
              {renamingTabId !== tab.id && (
                <div style={{ display: 'flex', gap: 4 }}>
                  <button
                    onClick={() => handleStartRename(tab.id, tab.title)}
                    style={{
                      width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: COLORS.bgTertiary, border: 'none', cursor: 'pointer', borderRadius: 6,
                      color: COLORS.textSecondary,
                    }}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => handleCloseTab(tab.id)}
                    style={{
                      width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: COLORS.bgTertiary, border: 'none', cursor: 'pointer', borderRadius: 6,
                      color: COLORS.textMuted,
                    }}
                    onMouseEnter={e => { e.currentTarget.style.color = COLORS.danger; e.currentTarget.style.background = 'rgba(239,68,68,0.1)'; }}
                    onMouseLeave={e => { e.currentTarget.style.color = COLORS.textMuted; e.currentTarget.style.background = COLORS.bgTertiary; }}
                  >
                    <X size={14} />
                  </button>
                </div>
              )}
              {tab.isStreaming && renamingTabId !== tab.id && (
                <div style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: '#10b981', flexShrink: 0,
                }} />
              )}
            </div>
          ))
        )}
      </div>

      <div style={{
        flexShrink: 0, padding: '12px 16px',
        borderTop: `1px solid ${COLORS.border}`,
        textAlign: 'center', fontSize: 11, color: COLORS.textMuted,
      }}>
        {tabs.length > 0 ? `${tabs.length} 个会话` : '无会话'} · {wsConnected ? '已连接' : '离线'}
      </div>
    </>
  );

  // ⚠️ 防回归说明：以下 4 个分支故意放在 MobileWorkspace 内部直接切组件，
  // 目的就是让聊天工作区父组件不卸载，保持 openPanels / activePanelId / WS 连接连续。
  if (mobileView === 'sessions') {
    return (
      <div style={{ minHeight: '100vh', background: COLORS.bg, color: COLORS.textPrimary, display: 'flex', flexDirection: 'column' }}>
        <div style={{
          display: 'flex', alignItems: 'center', padding: '12px 16px',
          background: COLORS.bgSecondary, borderBottom: `1px solid ${COLORS.border}`, gap: 12,
        }}>
          <button
            onClick={() => setMobileView('workspace')}
            style={{ background: 'none', border: 'none', color: COLORS.textPrimary, cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center' }}
          >
            <X size={20} />
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
            <MessageSquare size={18} color={COLORS.accent} />
            <span style={{ fontSize: 16, fontWeight: 600 }}>会话列表</span>
          </div>
          <button
            onClick={() => { setMobileView('workspace'); setAgentSelectorOpen(true); }}
            style={{
              background: COLORS.accent, border: 'none', borderRadius: 8, padding: '8px 12px',
              color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            <Plus size={16} /> 新建
          </button>
        </div>
        {renderSessionListContent({ onSelectTab: () => setMobileView('workspace') })}
      </div>
    );
  }

  if (mobileView === 'agent-library') {
    return (
      <MobileAgentLibrary
        onBack={() => setMobileView('workspace')}
        onUseTemplateState={(state) => {
          setAgentCreateTemplateState(state);
          setMobileView('agent-create');
        }}
      />
    );
  }

  if (mobileView === 'agent-create') {
    return (
      <MobileAgentCreate
        onBack={() => {
          setAgentCreateTemplateState(null);
          setMobileView('workspace');
        }}
        initialTemplateState={agentCreateTemplateState}
      />
    );
  }

  if (mobileView === 'agents') {
    return (
      <MobileAgentManager
        onBack={() => setMobileView('workspace')}
        onCreate={() => {
          setAgentCreateTemplateState(null);
          setMobileView('agent-create');
        }}
      />
    );
  }

  /* ── 主渲染 ── */
  return (
    <div style={{
      width: '100vw',
      height: '100dvh',
      background: COLORS.bg,
      color: COLORS.textPrimary,
      display: 'flex',
      flexDirection: 'column',
      overflowX: 'hidden',
      overflowY: 'hidden',
      position: 'relative',
      touchAction: 'pan-y',
      WebkitOverflowScrolling: 'touch',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    }}>

      {/* ═══════════════════════════════════
       * Top Bar
       * ═══════════════════════════════════ */}
      <header style={{
        minHeight: 56,
        flexShrink: 0,
        display: 'grid',
        gridTemplateColumns: '40px minmax(0, 1fr) 40px',
        alignItems: 'center',
        columnGap: 8,
        padding: '6px 12px',
        background: COLORS.bgSecondary,
        borderBottom: `1px solid ${COLORS.border}`,
      }}>
        {/* 左按钮：打开左抽屉 */}
        <button
          onClick={() => { setLeftDrawerOpen(true); setRightDrawerOpen(false); }}
          style={{
            width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'transparent', border: 'none', cursor: 'pointer', borderRadius: 8,
            color: COLORS.textPrimary,
            flexShrink: 0,
            justifySelf: 'start',
          }}
        >
          <Menu size={20} />
        </button>

        {/* 标题区：中间列独立占位，两行结构，避免和左右图标互相挤压 */}
        <div style={{
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
        }}>
          <div style={{
            width: '100%',
            fontSize: 15,
            fontWeight: 600,
            color: COLORS.textPrimary,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            lineHeight: 1.2,
            textAlign: 'center',
          }}>
            {activeTab?.title || 'RepaceClaw'}
          </div>
          {activeAgentName && (
            <div style={{
              width: '100%',
              display: 'flex',
              justifyContent: 'center',
              minWidth: 0,
            }}>
              <div style={{
                maxWidth: '100%',
                fontSize: 10,
                color: COLORS.textMuted,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
                minWidth: 0,
                lineHeight: 1.2,
                overflow: 'hidden',
              }}>
                <span style={{
                  minWidth: 0,
                  flex: '0 1 auto',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}>
                  {activeAgentName}
                </span>
                {activeAgent?.modelName && (
                  <button
                    onClick={() => setModelSelectorOpen(true)}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 2,
                      background: 'transparent', border: 'none', cursor: 'pointer',
                      color: COLORS.textMuted, fontSize: 10, padding: 0,
                      flexShrink: 0,
                    }}
                  >
                    <span style={{ opacity: 0.7, whiteSpace: 'nowrap' }}>{activeAgent.modelName}</span>
                    <ChevronDown size={10} />
                  </button>
                )}
                {!wsConnected && <span style={{ flexShrink: 0 }}>· 离线</span>}
              </div>
            </div>
          )}
        </div>

        {/* 右按钮：打开右抽屉 */}
        <button
          onClick={() => { setRightDrawerOpen(true); setLeftDrawerOpen(false); }}
          style={{
            width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'transparent', border: 'none', cursor: 'pointer', borderRadius: 8,
            color: COLORS.textPrimary,
            flexShrink: 0,
            justifySelf: 'end',
          }}
        >
          <Settings size={20} />
        </button>
      </header>

      {/* ═══════════════════════════════════
       * 主聊天区容器
       * ═══════════════════════════════════ */}
      <main style={{
        flex: 1,
        minHeight: 0,
        overflowX: 'hidden',
        overflowY: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        touchAction: 'pan-y',
      }}>
        {!activePanel ? (
          /* 纯静态空状态：不混入真实会话/智能体数据，避免刷新时闪出业务内容 */
          <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '32px 24px',
            gap: 16,
            textAlign: 'center',
          }}>
            <div style={{
              width: 64, height: 64, borderRadius: 18,
              background: `linear-gradient(135deg, ${COLORS.accent}, #3b82f6)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 26, color: '#fff', fontWeight: 700,
              boxShadow: '0 10px 30px rgba(99,102,241,0.25)',
            }}>
              RC
            </div>
            <div style={{ fontSize: 18, fontWeight: 600, color: COLORS.textPrimary }}>
              RepaceClaw
            </div>
            <div style={{ fontSize: 13, color: COLORS.textMuted, maxWidth: 280, lineHeight: 1.6 }}>
              点击右上角打开会话列表创建对话
            </div>
          </div>
        ) : (
          /*
           * ⚠️ 防回归说明：聊天区必须保留所有 openPanels 常驻 DOM，
           * 只能通过 activePanelId + 显隐来切换当前 panel，不能只渲染当前 panel。
           * 根因：如果改回“只渲染当前 panel / return null / display:none 后重挂载”的方案，
           * 会重新触发消息区挂载、滚动定位和空状态闪现，表现为切会话时 panel 被重建或内容跳中间。
           */
          <div style={{
            flex: 1,
            minHeight: 0,
            position: 'relative',
            overflow: 'hidden',
            touchAction: 'pan-y',
          }}>
            {openPanels.map((panel) => {
              const isActive = panel.id === activePanelId;
              return (
                <MobileChatPanelContainer
                  key={panel.id}
                  panel={panel}
                  agents={agents}
                  isActive={isActive}
                />
              );
            })}
          </div>
        )}

        <MobileBottomComposer
          value={inputValue}
          onChange={setInputValue}
          onSend={handleSend}
          conversationId={activePanelId}
          taskName={activeTab?.title || activePanel?.agentName || '移动端会话'}
          placeholder={activePanel ? '请输入消息...' : '请先从左侧选择一个智能体开始会话'}
          agents={agents}
          currentAgentId={activePanel?.agentId}
          currentAgentIds={activePanel?.agentIds}
          isProject={false}
        />
      </main>

      {/* ═══════════════════════════════════
       * Left Drawer — 导航菜单（对应PC端侧边栏）
       * ═══════════════════════════════════ */}
      {/* Mask */}
      {leftDrawerOpen && (
        <div
          onClick={() => setLeftDrawerOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 100,
            background: 'rgba(0,0,0,0.5)',
          }}
        />
      )}
      <div style={{
        position: 'fixed', top: 0, left: 0, bottom: 0,
        width: '60vw', maxWidth: 240, zIndex: 101,
        background: 'linear-gradient(180deg, #1f1f23 0%, #0f0f13 100%)',
        borderRight: 'none',
        boxShadow: '4px 0 20px rgba(0,0,0,0.4)',
        display: 'flex', flexDirection: 'column',
        transform: leftDrawerOpen ? 'translateX(0)' : 'translateX(-100%)',
        transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      }}>
        {/* 左抽屉 Header */}
        <div style={{
          height: 52, flexShrink: 0,
          display: 'flex', alignItems: 'center',
          padding: '0 16px', gap: 12,
          background: COLORS.bgSecondary,
          borderBottom: `1px solid ${COLORS.border}`,
        }}>
          <button
            onClick={() => setLeftDrawerOpen(false)}
            style={{
              width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: COLORS.bgTertiary, border: 'none', cursor: 'pointer',
              color: COLORS.textSecondary, borderRadius: 10,
            }}
          >
            <X size={18} />
          </button>
          <div style={{ flex: 1, fontSize: 15, fontWeight: 600, color: COLORS.textPrimary }}>
            导航
          </div>
        </div>

        {/* 左抽屉 Body */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {renderNavMenu()}
        </div>
      </div>

      {/* ═══════════════════════════════════
       * Right Drawer — 会话 Tab 列表（对应PC端会话界面顶部tab）
       * ═══════════════════════════════════ */}
      {rightDrawerOpen && (
        <div
          onClick={() => setRightDrawerOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 100,
            background: 'rgba(0,0,0,0.5)',
          }}
        />
      )}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: '75vw', maxWidth: 280, zIndex: 101,
        background: 'linear-gradient(180deg, #1f1f23 0%, #0f0f13 100%)',
        borderLeft: 'none',
        boxShadow: '-4px 0 20px rgba(0,0,0,0.4)',
        display: 'flex', flexDirection: 'column',
        transform: rightDrawerOpen ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      }}>
        {/* 右抽屉 Header */}
        <div style={{
          height: 52, flexShrink: 0,
          display: 'flex', alignItems: 'center',
          padding: '0 16px', gap: 12,
          background: COLORS.bgSecondary,
          borderBottom: `1px solid ${COLORS.border}`,
        }}>
          <button
            onClick={() => setRightDrawerOpen(false)}
            style={{
              width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: COLORS.bgTertiary, border: 'none', cursor: 'pointer',
              color: COLORS.textSecondary, borderRadius: 10,
            }}
          >
            <X size={18} />
          </button>
          <div style={{ flex: 1, fontSize: 15, fontWeight: 600, color: COLORS.textPrimary }}>
            会话
          </div>
          {/* 新建会话按钮 */}
          <button
            onClick={() => setAgentSelectorOpen(true)}
            style={{
              width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: COLORS.accentLight, border: 'none', cursor: 'pointer',
              color: COLORS.accent, borderRadius: 10,
            }}
          >
            <Plus size={16} />
          </button>
        </div>

        {/* 右抽屉 Body — 会话 Tab 列表 */}
        {renderSessionListContent({ onSelectTab: () => setRightDrawerOpen(false) })}
      </div>

      {/* ═══════════════════════════════════
       * Agent 选择器 Sheet
       * ═══════════════════════════════════ */}
      {agentSelectorOpen && (
        <div
          onClick={() => setAgentSelectorOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: 'rgba(0,0,0,0.6)',
          }}
        />
      )}
      <div style={{
        position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 201,
        background: COLORS.bgSecondary,
        borderRadius: '20px 20px 0 0',
        maxHeight: '70vh',
        display: 'flex', flexDirection: 'column',
        transform: agentSelectorOpen ? 'translateY(0)' : 'translateY(100%)',
        transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      }}>
        {/* Header */}
        <div style={{
          height: 52, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 16px',
          borderBottom: `1px solid ${COLORS.border}`,
        }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: COLORS.textPrimary }}>选择智能体</div>
          <button
            onClick={() => setAgentSelectorOpen(false)}
            style={{
              width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: COLORS.bgTertiary, border: 'none', cursor: 'pointer', borderRadius: 10,
              color: COLORS.textSecondary,
            }}
          >
            <X size={16} />
          </button>
        </div>
        {/* Agent 列表 */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
          {agentsLoading ? (
            <div style={{ textAlign: 'center', color: COLORS.textMuted, padding: 24 }}>加载中...</div>
          ) : agents.length === 0 ? (
            <div style={{ textAlign: 'center', color: COLORS.textMuted, padding: 24 }}>暂无智能体</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {agents.map(agent => (
                <button
                  key={agent.id}
                  onClick={() => handleCreateSession(agent.id, agent.name, agent.color || COLORS.accent)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '12px 16px', borderRadius: 12,
                    background: COLORS.bgTertiary, border: `1px solid ${COLORS.border}`, cursor: 'pointer',
                  }}
                >
                  <div style={{
                    width: 36, height: 36, borderRadius: 10,
                    background: agent.color || COLORS.accent,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', fontSize: 14, fontWeight: 600,
                  }}>
                    {(agent.name || 'A').charAt(0)}
                  </div>
                  <div style={{ flex: 1, textAlign: 'left' }}>
                    <div style={{ fontSize: 14, fontWeight: 500, color: COLORS.textPrimary }}>{agent.name}</div>
                    {agent.modelName && (
                      <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 2 }}>{agent.modelName}</div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════
       * 输入会话标题 Sheet
       * ═══════════════════════════════════ */}
      {selectedAgentForCreate && (
        <div
          onClick={() => setSelectedAgentForCreate(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 300,
            background: 'rgba(0,0,0,0.6)',
          }}
        />
      )}
      <div style={{
        position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 301,
        background: COLORS.bgSecondary,
        borderRadius: '20px 20px 0 0',
        display: 'flex', flexDirection: 'column',
        transform: selectedAgentForCreate ? 'translateY(0)' : 'translateY(100%)',
        transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        pointerEvents: selectedAgentForCreate ? 'auto' : 'none',
      }}>
        <div style={{
          height: 52, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 16px',
          borderBottom: `1px solid ${COLORS.border}`,
        }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: COLORS.textPrimary }}>新建会话</div>
          <button
            onClick={() => setSelectedAgentForCreate(null)}
            style={{
              width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: COLORS.bgTertiary, border: 'none', cursor: 'pointer', borderRadius: 10,
              color: COLORS.textSecondary,
            }}
          >
            <X size={16} />
          </button>
        </div>
        <div style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* 已选智能体 */}
          {selectedAgentForCreate && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 14px', borderRadius: 12,
              background: COLORS.bgTertiary,
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: 10,
                background: selectedAgentForCreate.color,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontSize: 13, fontWeight: 600,
              }}>
                {selectedAgentForCreate.name.charAt(0)}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: COLORS.textPrimary }}>{selectedAgentForCreate.name}</div>
                <div style={{ fontSize: 11, color: COLORS.textMuted }}>已选智能体</div>
              </div>
            </div>
          )}
          {/* 标题输入 */}
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: COLORS.textSecondary, marginBottom: 6, display: 'block' }}>
              会话标题
            </label>
            <input
              value={newSessionTitle}
              onChange={e => setNewSessionTitle(e.target.value)}
              placeholder={selectedAgentForCreate?.name || '请输入标题'}
              autoFocus
              style={{
                width: '100%', height: 44, padding: '0 14px',
                border: `1.5px solid ${COLORS.border}`,
                borderRadius: 10, fontSize: 14, outline: 'none',
                background: COLORS.bgTertiary, color: COLORS.textPrimary,
                boxSizing: 'border-box',
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') handleConfirmCreateSession();
              }}
            />
          </div>
          {/* 创建按钮 */}
          <button
            onClick={() => handleConfirmCreateSession()}
            style={{
              height: 44, borderRadius: 12, border: 'none',
              background: COLORS.accent, color: '#fff',
              fontSize: 15, fontWeight: 600, cursor: 'pointer',
            }}
          >
            创建会话
          </button>
        </div>
      </div>

      {/* ═══════════════════════════════════
       * Model 选择器 Sheet
       * ═══════════════════════════════════ */}
      {modelSelectorOpen && (
        <div
          onClick={() => setModelSelectorOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: 'rgba(0,0,0,0.6)',
          }}
        />
      )}
      <div style={{
        position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 201,
        background: COLORS.bgSecondary,
        borderRadius: '20px 20px 0 0',
        maxHeight: '50vh',
        display: 'flex', flexDirection: 'column',
        transform: modelSelectorOpen ? 'translateY(0)' : 'translateY(100%)',
        transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      }}>
        {/* Header */}
        <div style={{
          height: 52, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 16px',
          borderBottom: `1px solid ${COLORS.border}`,
        }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: COLORS.textPrimary }}>切换模型</div>
          <button
            onClick={() => setModelSelectorOpen(false)}
            style={{
              width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: COLORS.bgTertiary, border: 'none', cursor: 'pointer', borderRadius: 10,
              color: COLORS.textSecondary,
            }}
          >
            <X size={16} />
          </button>
        </div>
        {/* 当前模型 */}
        <div style={{ padding: '12px 16px', borderBottom: `1px solid ${COLORS.border}` }}>
          <div style={{ fontSize: 12, color: COLORS.textMuted }}>当前模型</div>
          <div style={{ fontSize: 13, color: COLORS.textPrimary, marginTop: 4 }}>{activeAgent?.modelName || '未设置'}</div>
        </div>
        {/* Model 列表 */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
          {AVAILABLE_MODELS.map(model => {
            const isSelected = activeAgent?.modelName === model.id;
            return (
              <button
                key={model.id}
                onClick={() => handleSwitchModel(model.id)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '12px 16px', borderRadius: 12,
                  background: isSelected ? COLORS.accentLight : COLORS.bgTertiary,
                  border: isSelected ? `1.5px solid ${COLORS.accent}` : `1px solid ${COLORS.border}`, cursor: 'pointer',
                  marginBottom: 8,
                }}
              >
                <span style={{ fontSize: 14, color: isSelected ? COLORS.accent : COLORS.textPrimary }}>{model.label}</span>
                {isSelected && <Check size={16} color={COLORS.accent} />}
              </button>
            );
          })}
        </div>
      </div>

      {/* ═══════════════════════════════════
       * Toast 通知
       * ═══════════════════════════════════ */}
      {showToast && (
        <div style={{
          position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)',
          zIndex: 300,
          background: COLORS.bgTertiary,
          borderRadius: 8, padding: '10px 20px',
          fontSize: 13, color: COLORS.textPrimary,
          boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
        }}>
          {showToast}
        </div>
      )}
    </div>
  );
}
