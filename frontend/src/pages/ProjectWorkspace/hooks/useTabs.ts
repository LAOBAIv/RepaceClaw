/**
 * useTabs — 标签栏管理 Hook
 *
 * 职责：管理标签页切换、关闭、重命名、新建、模型切换下拉。
 * 从原 ProjectWorkspace.tsx 中提取。
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { useConversationStore } from '@/stores/conversation';
import { useAgentStore } from '@/stores/agentStore';
import { showToast } from '@/components/Toast';

export function useTabs() {
  const rawSessionTabs = useConversationStore(s => s.sessionTabs);
  const storeActiveId = useConversationStore(s => s.activeTabId);
  const switchTab = useConversationStore(s => s.switchTab);
  const closeTabFn = useConversationStore(s => s.closeTab);
  const renameTab = useConversationStore(s => s.renameTab);
  const createSessionTabFn = useConversationStore(s => s.createSessionTab);
  const { agents, fetchAgents } = useAgentStore();

  const allTabs = rawSessionTabs; // sessionTabs 本身就是完整列表

  /** 标签页重命名状态 */
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editingTabTitle, setEditingTabTitle] = useState('');

  /** 新建标签页弹窗状态 */
  const [showNewTabModal, setShowNewTabModal] = useState(false);

  /** 模型切换下拉状态 */
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [modelDropdownTabId, setModelDropdownTabId] = useState<string | null>(null);
  const modelDropdownRef = useRef<HTMLDivElement>(null);
  const [availableModels, setAvailableModels] = useState<{ id: string; label: string; provider: string }[]>([]);

  // 动态加载模型列表
  useEffect(() => {
    (async () => {
      try {
        const authRaw = sessionStorage.getItem('repaceclaw-auth') || localStorage.getItem('repaceclaw-auth');
        const token = authRaw ? JSON.parse(authRaw)?.state?.token : '';
        const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {}; // [2026-05-24] 类型安全
        const [mRes, pRes] = await Promise.all([
          fetch('/api/models', { headers }).then(r => r.json()),
          fetch('/api/model-providers', { headers }).then(r => r.json()),
        ]);
        const provs = pRes.data || [];
        const models = (mRes.data || []).filter((m: Record<string, unknown>) => m.enabled).map((m: Record<string, unknown>) => { // [2026-05-24] 类型安全
          const prov = provs.find((p: Record<string, unknown>) => p.id === m.providerId); // [2026-05-24] 类型安全
          return { id: m.name, label: `${m.name} · ${prov?.name || ''}`, provider: prov?.name || '' };
        });
        setAvailableModels([{ id: 'auto', label: '自动选择', provider: 'auto' }, ...models]);
      } catch {
        setAvailableModels([{ id: 'auto', label: '自动选择', provider: 'auto' }]);
      }
    })();
  }, []);

  /** 点击外部关闭模型切换下拉 */
  useEffect(() => {
    if (!showModelDropdown) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(e.target as Node)) {
        setShowModelDropdown(false);
        setModelDropdownTabId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showModelDropdown]);

  /** 关闭标签页 */
  const handleCloseTab = useCallback((tabId: string) => {
    closeTabFn(tabId);
  }, [closeTabFn]);

  /** 重命名标签页 */
  const handleRenameTab = useCallback((tabId: string, newTitle: string) => {
    renameTab(tabId, newTitle);
  }, [renameTab]);

  /** 切换模型 */
  const handleSwitchModel = useCallback(async (tabId: string, modelId: string) => {
    const targetTab = allTabs.find(t => t.id === tabId);
    const targetAgent = targetTab?.agentId ? agents.find(a => a.id === targetTab.agentId) : null;
    if (!targetAgent) return;
    try {
      await fetch(`/api/agents/${targetAgent.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelName: modelId }),
      });
      await fetchAgents();
      setShowModelDropdown(false);
      setModelDropdownTabId(null);
      const model = availableModels.find(m => m.id === modelId);
      showToast('模型已更新为 ' + (model?.label || modelId));
    } catch {
      showToast('更新模型失败');
    }
  }, [allTabs, agents, fetchAgents, availableModels]);

  return {
    allTabs,
    storeActiveId,
    editingTabId, setEditingTabId,
    editingTabTitle, setEditingTabTitle,
    showNewTabModal, setShowNewTabModal,
    showModelDropdown, setShowModelDropdown,
    modelDropdownTabId, setModelDropdownTabId,
    modelDropdownRef,
    availableModels,
    switchTab,
    handleCloseTab,
    handleRenameTab,
    handleSwitchModel,
    createSessionTabFn,
    agents,
  };
}
