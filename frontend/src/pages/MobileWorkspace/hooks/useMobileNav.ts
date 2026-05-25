/**
 * useMobileNav — 移动端导航/视图切换逻辑 Hook
 *
 * 封装移动端视图状态与导航操作：
 * - mobileView 视图切换（workspace / sessions / agent-library / agent-create / agents）
 * - 左抽屉/右抽屉开关
 * - 导航菜单点击处理
 * - 智能体创建/编辑/删除
 * - 智能体创建表单状态
 *
 * 从原 MobileWorkspace.tsx 提取，保持所有现有行为不变。
 */

import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useConversationStore } from '../../../stores/conversation';
import { useAgentStore } from '../../../stores/agentStore';
import apiClient from '../../../api/client';
import type { MobileNavItem, MobileView } from '../constants';

export function useMobileNav(
  handleSwitchTab: (tabId: string) => void,
  setShowToast: (msg: string | null) => void,
) {
  const navigate = useNavigate();
  const { fetchAgents } = useAgentStore();

  // ── 抽屉状态 ──
  const [leftDrawerOpen, setLeftDrawerOpen] = useState(false);
  const [rightDrawerOpen, setRightDrawerOpen] = useState(false);

  // ── 视图状态 ──
  // ⚠️ 防回归说明：移动端左抽屉的"模板库 / 创建 / 管理 / 工作区"必须走同一父组件内的视图切换，
  // 不能再改回 navigate('/mobile...') 路由跳转。
  const [mobileView, setMobileView] = useState<MobileView>('workspace');

  // ── 智能体创建/管理Sheet状态 ──
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null);
  const [agentCreateTemplateState, setAgentCreateTemplateState] = useState<{ templateId?: string; category?: string } | null>(null);

  // ── 智能体创建表单状态 ──
  const [newAgentName, setNewAgentName] = useState('');
  const [newAgentColor, setNewAgentColor] = useState('#6366f1');
  const [newAgentType, setNewAgentType] = useState('general');
  const [newAgentModel, setNewAgentModel] = useState('glm-5');
  const [newAgentPrompt, setNewAgentPrompt] = useState('');

  /* ── 导航菜单点击处理 ── */
  // ⚠️ 防回归说明：这里是左侧抽屉的核心修复点。
  // "工作区 / 模板库 / 创建 / 管理"必须只切 mobileView，不能再改回路由跳转。
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

  /* ── 智能体创建 ── */
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

  /* ── 智能体编辑 ── */
  const handleUpdateAgent = useCallback(async (agentId: string, data: Record<string, unknown>) => {
    try {
      await apiClient.put(`/agents/${agentId}`, data);
      await fetchAgents();
      setShowToast('智能体更新成功');
    } catch (e) {
      console.error('[MobileWorkspace:updateAgent]', e);
      setShowToast('更新智能体失败');
    }
  }, [fetchAgents]);

  /* ── 智能体删除 ── */
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

  return {
    // Drawer state
    leftDrawerOpen, setLeftDrawerOpen,
    rightDrawerOpen, setRightDrawerOpen,

    // View state
    mobileView, setMobileView,

    // Agent management
    editingAgentId, setEditingAgentId,
    agentCreateTemplateState, setAgentCreateTemplateState,

    // Agent create form
    newAgentName, setNewAgentName,
    newAgentColor, setNewAgentColor,
    newAgentType, setNewAgentType,
    newAgentModel, setNewAgentModel,
    newAgentPrompt, setNewAgentPrompt,

    // Handlers
    handleNavClick,
    handleCreateAgent,
    handleUpdateAgent,
    handleDeleteAgent,
  };
}
