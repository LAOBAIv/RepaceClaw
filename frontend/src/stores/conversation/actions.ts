// [2026-05-25] Store actions — 从 conversationStore.ts 拆分
import { Message, Conversation } from "../../types";
import { conversationsApi } from "../../api/conversations";
import { getOrCreateTabId } from "../../lib/storageScope";
import { restoreTabs } from "./tabRestore";
import { isConversationNotFoundError } from "./helpers";
import {
  isPlatformAssistantAgent,
  isWechatAssistantAgent,
  isGlobalAssistantConversationLike,
  resolveConversationCurrentAgent,
  resolveConversationAgentIds,
} from "./helpers";
import type { ConversationPanel, SessionTab } from "./types";
import {
  wsInstance,
  setWsInstance,
  setWsReconnectTimer,
  getWsReconnectTimer,
  notifyConversationWsSubscribers,
} from "./wsUtils";

// ── 类型定义 ──

interface ConversationStoreState {
  openPanels: ConversationPanel[];
  messagesMap: Record<string, Message[]>;
  maxPanels: number;
  wsConnected: boolean;
  sessionTabs: SessionTab[];
  activeTabId: string | null;
  currentAgentId: string;
  closedSessionIds: string[];
  _restoring?: boolean;
}

type SetState = (partial: Partial<ConversationStoreState> | ((s: ConversationStoreState) => Partial<ConversationStoreState>)) => void;
type GetState = () => ConversationStoreState;

// ── 连接管理 ──

export function createConnectAction(set: SetState, get: GetState) {
  return () => {
    if (wsInstance && (wsInstance.readyState === WebSocket.OPEN || wsInstance.readyState === WebSocket.CONNECTING)) return;
    try {
      const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const raw = sessionStorage.getItem("repaceclaw-auth") || localStorage.getItem("repaceclaw-auth");
      let tokenParam = "";
      if (raw) {
        try {
          const state = JSON.parse(raw);
          const token = state?.state?.token;
          if (token) tokenParam = `?token=${encodeURIComponent(token)}`;
        } catch (e) { console.warn("[ConvStore]", e); }
      }
      const tabId = getOrCreateTabId();
      const wsUrl = `${wsProtocol}//${window.location.host}/ws${tokenParam}${tokenParam ? '&' : '?'}tabId=${encodeURIComponent(tabId)}`;
      const currentWs = new WebSocket(wsUrl);
      setWsInstance(currentWs);
      currentWs.onopen = async () => {
        console.debug("[WS] Connected");
        setWsReconnectTimer(null);
        set({ wsConnected: true });
        const { openPanels } = get();
        for (const panel of openPanels) {
          try {
            let actualConversationId = panel.conversationId;
            if (panel.conversationId === 'wechat-assistant') {
              try {
                const wechatConv = await conversationsApi.getWechatAssistant();
                actualConversationId = wechatConv.id;
                set((s: ConversationStoreState) => ({
                  openPanels: s.openPanels.map(p =>
                    p.id === panel.id
                      ? { ...p, conversationId: wechatConv.id, messages: wechatConv.messages || [] }
                      : p
                  ),
                }));
              } catch (err) {
                console.warn('[WS onopen] 无法获取微信助手真实ID:', err);
                continue;
              }
            }
            const messages = await conversationsApi.getMessages(actualConversationId);
            if (messages?.length) {
              set((s: ConversationStoreState) => ({
                openPanels: s.openPanels.map((p) =>
                  p.id === panel.id ? { ...p, messages } : p
                ),
              }));
            }
          } catch (err) {
            if (isConversationNotFoundError(err)) {
              get().permanentlyCloseSession(panel.conversationId);
            }
          }
        }
      };
      currentWs.onclose = () => {
        console.debug("[WS] Disconnected");
        set({ wsConnected: false });
        if (wsInstance === currentWs) {
          setWsInstance(null);
        }
        if (getWsReconnectTimer()) return;
        setWsReconnectTimer(setTimeout(() => {
          setWsReconnectTimer(null);
          get().connect();
        }, 3000));
      };
      currentWs.onerror = () => {};
      currentWs.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          notifyConversationWsSubscribers(data);
          const panels = get().openPanels;

          if (data.type === "user_message" && data.message) {
            const msg: Message = data.message;
            const panel = panels.find((p) => p.conversationId === msg.conversationId);
            if (panel) {
              set((s: ConversationStoreState) => ({
                openPanels: s.openPanels.map((p) => {
                  if (p.id !== panel.id) return p;
                  const filtered = p.messages.filter(
                    (m) => !m.id.startsWith("optimistic-") && m.id !== msg.id
                  );
                  return { ...p, messages: [...filtered, msg] };
                }),
              }));
            }
          }

          if (data.type === "agent_start" && data.messageId && data.agentId) {
            console.debug("[WS] agent_start:", data.messageId, data.agentId, data.conversationId, "panels:", panels.map(p => ({ id: p.id, convId: p.conversationId, agentId: p.agentId })));
            const panel = data.conversationId
              ? panels.find((p) => p.conversationId === data.conversationId)
              : panels.find((p) => p.agentId === data.agentId || p.agentIds.includes(data.agentId));
            console.debug("[WS] agent_start panel:", panel?.id);
            if (panel) get().startStreaming(panel.id, data.messageId);
          }
          if (data.type === "agent_chunk" && data.messageId && data.chunk) {
            const panel = panels.find((p) => p.streamingMessageId === data.messageId)
              || (data.conversationId ? panels.find((p) => p.conversationId === data.conversationId) : undefined);
            if (panel) get().appendStreamChunk(panel.id, data.messageId, data.chunk);
          }
          if (data.type === "agent_done" && data.messageId && data.message) {
            console.debug("[WS] agent_done:", data.messageId, data.conversationId, "content:", data.message?.content?.length);
            const panel = panels.find((p) => p.streamingMessageId === data.messageId)
              || (data.conversationId ? panels.find((p) => p.conversationId === data.conversationId) : undefined);
            console.debug("[WS] agent_done panel:", panel?.id);
            if (panel) get().finishStreaming(panel.id, data.messageId, data.message);
          }

          if (data.type === "error" && data.message) {
            console.error("[WS] error:", data);
          }

          if (data.type === "new_message" && data.message) {
            const panel = panels.find((p) => p.conversationId === data.message.conversationId);
            if (panel) {
              const msg = data.message;
              const exists = panel.messages.some((m: unknown) => (m as { id?: string })?.id === msg.id);
              if (!exists) {
                set({
                  openPanels: panels.map((p) =>
                    p.id === panel.id
                      ? { ...p, messages: [...p.messages, msg] }
                      : p
                  ),
                });
              }
            }
          }

          if (data.type === "overview_chunk" && data.chunk) {
            const panel = panels.find((p) => p.conversationId === data.conversationId);
            if (panel) {
              let overviewMsg = panel.messages.find((m) => m.id === 'overview-generating');
              if (!overviewMsg) {
                overviewMsg = {
                  id: 'overview-generating',
                  conversationId: data.conversationId,
                  role: 'agent' as const,
                  content: '正在生成项目概述...\n',
                  createdAt: new Date().toISOString(),
                  agentId: data.agentId || panel.agentId,
                };
                set((s: ConversationStoreState) => ({
                  openPanels: s.openPanels.map((p) =>
                    p.conversationId === data.conversationId
                      ? { ...p, messages: [...p.messages, overviewMsg!], isStreaming: true, streamingMessageId: 'overview-generating', streamingContent: '' }
                      : p
                  ),
                }));
              } else {
                set((s: ConversationStoreState) => ({
                  openPanels: s.openPanels.map((p) =>
                    p.conversationId === data.conversationId
                      ? {
                          ...p,
                          messages: p.messages.map((m) =>
                            m.id === 'overview-generating'
                              ? { ...m, content: m.content + data.chunk }
                              : m
                          ),
                          streamingContent: (p.streamingContent || '') + data.chunk,
                        }
                      : p
                  ),
                }));
              }
            }
          }

          if (data.type === "overview_done" && data.message) {
            const panel = panels.find((p) => p.conversationId === data.conversationId);
            if (panel) {
              set((s: ConversationStoreState) => ({
                openPanels: s.openPanels.map((p) =>
                  p.conversationId === data.conversationId
                    ? {
                        ...p,
                        isStreaming: false,
                        streamingMessageId: undefined,
                        streamingContent: undefined,
                        messages: p.messages.map((m) =>
                          m.id === 'overview-generating' ? { ...data.message, streaming: false } : m
                        ),
                      }
                    : p
                ),
              }));
            }
          }

          try {
            import("../../lib/sync").then(({ WsSync }) => {
              WsSync.handleIncomingMessage(data);
            }).catch(() => {});
          } catch (e) { console.warn("[ConvStore]", e); }
        } catch (e) { console.warn("[ConvStore]", e); }
      };
    } catch {
      // WS not available, ignore
    }
  };
}

// ── 消息发送 ──

export function createSendMessageAction(set: SetState, get: GetState) {
  return (panelId: string, content: string) => {
    const state = get();
    const panel = state.openPanels.find((p) => p.id === panelId);
    if (!panel) return;

    const activeTab = state.sessionTabs.find((t) => t.id === state.activeTabId)
      || state.sessionTabs.find((t) => t.panelId === panelId || t.conversationId === panel.conversationId);
    const conversationTitle = activeTab?.title?.trim() || '';
    const previousConversationTitle = activeTab?.previousTitle?.trim() || '';

    const optimisticMsg: Message = {
      id: `optimistic-${Date.now()}`,
      conversationId: panel.conversationId,
      role: "user",
      content,
      createdAt: new Date().toISOString(),
    };
    set((s: ConversationStoreState) => ({
      openPanels: s.openPanels.map((p) =>
        p.id === panelId ? { ...p, messages: [...p.messages, optimisticMsg] } : p
      ),
    }));

    if (wsInstance?.readyState !== WebSocket.OPEN) {
      console.warn("[WS] Not connected, reconnecting...");
      get().connect();
      let retries = 0;
      const retryInterval = setInterval(() => {
        retries++;
        if (wsInstance?.readyState === WebSocket.OPEN) {
          clearInterval(retryInterval);
          wsInstance!.send(JSON.stringify({
            type: "chat",
            conversationId: panel.conversationId,
            conversationTitle,
            previousConversationTitle,
            agentId: panel.agentId,
            agentIds: panel.agentId ? [panel.agentId] : [],
            content,
          }));
          console.debug("[WS] Message sent after reconnect");
        } else if (retries > 15) {
          clearInterval(retryInterval);
          console.error("[WS] Failed to reconnect, message lost");
          set((s: ConversationStoreState) => ({
            openPanels: s.openPanels.map((p) =>
              p.id === panelId
                ? {
                    ...p,
                    messages: [
                      ...p.messages.filter((m) => m.id !== optimisticMsg.id),
                      {
                        id: `system-error-${Date.now()}`,
                        conversationId: p.conversationId,
                        role: "agent",
                        content: "消息发送失败:WebSocket 重连超时,请刷新页面后重试。",
                        createdAt: new Date().toISOString(),
                      } as Message,
                    ],
                  }
                : p
            ),
          }));
        }
      }, 300);
      return;
    }

    wsInstance.send(JSON.stringify({
      type: "chat",
      conversationId: panel.conversationId,
      conversationTitle,
      previousConversationTitle,
      agentId: panel.agentId,
      agentIds: panel.agentId ? [panel.agentId] : [],
      content,
    }));
  };
}

// ── 面板管理 ──

export function createOpenPanelAction(set: SetState, get: GetState) {
  return async ({ agentId, agentIds, agentName, agentColor, projectId, initialMessage, tabId, forceNew }: {
    agentId: string;
    agentIds?: string[];
    agentName: string;
    agentColor: string;
    projectId?: string;
    initialMessage?: string;
    tabId?: string;
    forceNew?: boolean;
  }) => {
    const { openPanels, maxPanels } = get();
    const isGlobalAssistant = isPlatformAssistantAgent(agentId) || isWechatAssistantAgent(agentId);
    if (!isGlobalAssistant && openPanels.length >= maxPanels) return;

    const existingPanel = openPanels.find((p) =>
      p.id === tabId || p.conversationId === tabId
    );
    if (existingPanel) {
      if (tabId) get().bindPanelToTab(tabId, existingPanel.id, existingPanel.agentName, existingPanel.agentColor);
      await get().loadMessages(existingPanel.id, existingPanel.conversationId);
      return existingPanel.id;
    }

    const allAgentIds: string[] = agentIds?.length
      ? [...new Set([agentId, ...agentIds])]
      : [agentId];

    try {
      let conv: Conversation;
      if (!forceNew) {
        const existingList = await conversationsApi.list(projectId);
        const existing = existingList.find((c) => c.agentId === agentId || c.agentIds.includes(agentId));
        if (existing) {
          conv = existing;
          for (const id of allAgentIds) {
            if (!conv.agentIds.includes(id)) {
              await conversationsApi.addAgent(conv.id, id);
            }
          }
        } else {
          conv = await conversationsApi.create({
            agentIds: allAgentIds,
            projectId,
            title: allAgentIds.length > 1
              ? `${allAgentIds.length} 智能体协作`
              : agentName,
          });
        }
      } else {
        conv = await conversationsApi.create({
          agentIds: allAgentIds,
          projectId,
          title: allAgentIds.length > 1
            ? `${allAgentIds.length} 智能体协作`
            : agentName,
        });
      }

      const panel: ConversationPanel = {
        id: conv.id,
        conversationId: conv.id,
        sessionCode: conv.sessionCode,
        agentId,
        currentAgentCode: conv.currentAgentCode,
        agentIds: conv.agentIds.length > 0 ? conv.agentIds : allAgentIds,
        agentName,
        agentColor,
        messages: [],
        isStreaming: false,
        systemBanner: initialMessage,
      };
      set((s: ConversationStoreState) => ({ openPanels: [...s.openPanels, panel] }));
      await get().loadMessages(conv.id, conv.id);
      if (tabId) {
        get().bindPanelToTab(tabId, conv.id, agentName, agentColor);
      }
      return conv.id;
    } catch {
      const localId = `local-${Date.now()}`;
      const panel: ConversationPanel = {
        id: localId,
        conversationId: localId,
        agentId,
        agentIds: allAgentIds,
        agentName,
        agentColor,
        messages: [],
        isStreaming: false,
        systemBanner: initialMessage,
      };
      set((s: ConversationStoreState) => ({ openPanels: [...s.openPanels, panel] }));
      if (tabId) {
        get().bindPanelToTab(tabId, localId, agentName, agentColor);
      }
      return localId;
    }
  };
}

export function createClosePanelAction(set: SetState) {
  return (panelId: string) => {
    set((s: ConversationStoreState) => ({ openPanels: s.openPanels.filter((p) => p.id !== panelId) }));
  };
}

export function createRemovePanelAction(set: SetState) {
  return (panelId: string) => {
    set((s: ConversationStoreState) => ({ openPanels: s.openPanels.filter((p) => p.id !== panelId) }));
  };
}

export function createAddPanelAction(get: GetState) {
  return async (agentId: string, agentName: string, agentColor: string, projectId?: string) => {
    await get().openPanel({ agentId, agentName, agentColor, projectId });
  };
}

// ── 流式处理 ──

export function createStartStreamingAction(set: SetState) {
  return (panelId: string, messageId: string) => {
    const placeholder: Message = {
      id: messageId,
      conversationId: panelId,
      role: "agent",
      content: "",
      createdAt: new Date().toISOString(),
      streaming: true,
    };
    set((s: ConversationStoreState) => ({
      openPanels: s.openPanels.map((p) =>
        p.id === panelId
          ? { ...p, isStreaming: true, streamingMessageId: messageId, streamingContent: "", messages: [...p.messages, placeholder] }
          : p
      ),
    }));
  };
}

export function createAppendStreamChunkAction(set: SetState) {
  return (panelId: string, messageId: string, chunk: string) => {
    set((s: ConversationStoreState) => ({
      openPanels: s.openPanels.map((p) => {
        if (p.id !== panelId) return p;
        const newContent = (p.streamingContent || "") + chunk;
        return {
          ...p,
          streamingContent: newContent,
          messages: p.messages.map((m) => m.id === messageId ? { ...m, content: newContent } : m),
        };
      }),
    }));
  };
}

export function createFinishStreamingAction(set: SetState) {
  return (panelId: string, messageId: string, finalMessage: Message) => {
    set((s: ConversationStoreState) => ({
      openPanels: s.openPanels.map((p) => {
        if (p.id !== panelId) return p;
        return {
          ...p,
          isStreaming: false,
          streamingMessageId: undefined,
          streamingContent: undefined,
          messages: p.messages.map((m) => m.id === messageId ? { ...finalMessage, streaming: false } : m),
        };
      }),
    }));
  };
}

// ── 消息加载 ──

export function createLoadMessagesAction(set: SetState, get: GetState) {
  return async (panelId: string, conversationId: string) => {
    try {
      let actualConversationId = conversationId;
      if (conversationId === 'wechat-assistant') {
        try {
          const { conversationsApi } = await import('@/api/conversations');
          const wechatConv = await conversationsApi.getWechatAssistant();
          actualConversationId = wechatConv.id;
          set((s: ConversationStoreState) => ({
            openPanels: s.openPanels.map(p =>
              p.id === panelId
                ? { ...p, conversationId: wechatConv.id, messages: wechatConv.messages || [] }
                : p
            ),
          }));
        } catch (err) {
          console.warn('[loadMessages] 无法获取微信助手真实ID:', err);
          return;
        }
      }
      const messages = await conversationsApi.getMessages(actualConversationId);
      set((s: ConversationStoreState) => ({
        openPanels: s.openPanels.map((p) => p.id === panelId ? { ...p, messages } : p),
      }));
    } catch (err) {
      if (isConversationNotFoundError(err)) {
        get().permanentlyCloseSession(conversationId);
      }
    }
  };
}

// ── 其他 ──

export function createClearPanelsAction(set: SetState) {
  return () => set({ openPanels: [] });
}

export function createDismissBannerAction(set: SetState) {
  return (panelId: string) => {
    set((s: ConversationStoreState) => ({
      openPanels: s.openPanels.map((p) =>
        p.id === panelId ? { ...p, systemBanner: undefined } : p
      ),
    }));
  };
}

// ── Tab 管理 ──

export function createGetTabsAction(get: GetState) {
  return () => {
    const { sessionTabs } = get();
    const tabs = sessionTabs || [];
    const normalTabs = tabs
      .filter(t => !isGlobalAssistantConversationLike({ agentId: t.agentId, currentAgentCode: t.currentAgentCode, title: t.title }))
      .map(t => ({ ...t, type: (t.type || 'session') as 'home' | 'session' | 'wechat' }));

    const wechatTabFromState = tabs.find(t => t.id === 'wechat');
    if (wechatTabFromState) {
      normalTabs.unshift({ ...wechatTabFromState, type: 'wechat' as const });
    }
    return normalTabs;
  };
}

export function createSwitchTabAction(set: SetState, get: GetState) {
  return (tabId: string) => {
    set({ activeTabId: tabId });
    const state = get();
    const activeTab = state.sessionTabs.find(t => t.id === tabId);
    const activeConvId = activeTab?.panelId || activeTab?.conversationId || '';
    if (activeConvId && activeConvId !== 'wechat-assistant' && !activeConvId.startsWith('local-')) {
      conversationsApi.updateStatus(activeConvId, 'active').catch(() => {});
      try { sessionStorage.setItem('rc:last-active-conv', activeConvId); } catch (e) { console.warn("[ConvStore]", e); }
    }
    if (activeConvId) {
      const panel = state.openPanels.find(p => p.id === activeConvId);
      if (panel && panel.messages.length > 0) {
        try {
          const snapshot = JSON.stringify({
            messages: panel.messages.slice(-50),
            agentId: panel.agentId,
            agentName: panel.agentName,
            agentColor: panel.agentColor,
            sessionCode: panel.sessionCode,
          });
          sessionStorage.setItem(`rc:msg-cache:${activeConvId}`, snapshot);
        } catch (e) { console.warn("[ConvStore]", e); }
      }
    }
  };
}

export function createSwitchAgentAction(set: SetState) {
  return async (sessionId: string, agentId: string) => {
    let switchedAgentIds: string[] | null = null;
    let switchedSessionCode: string | undefined;
    let switchedCurrentAgentCode: string | undefined;
    try {
      const { conversationsApi } = await import('@/api/conversations');
      const result = await conversationsApi.switchAgent(sessionId, agentId);
      switchedAgentIds = result?.agentIds || null;
      switchedSessionCode = result?.sessionCode;
      switchedCurrentAgentCode = result?.currentAgentCode;
    } catch (e) { console.warn("[ConvStore]", e); }

    let nextAgentName = '';
    let nextAgentColor = '#6366f1';
    try {
      const { useAgentStore } = await import('@/stores/agentStore');
      const agent = useAgentStore.getState().agents.find(a => a.id === agentId);
      if (agent) {
        nextAgentName = agent.name;
        nextAgentColor = agent.color || '#6366f1';
      }
    } catch (e) { console.warn("[ConvStore]", e); }

    set((state: ConversationStoreState) => ({
      currentAgentId: agentId,
      openPanels: state.openPanels.map((p) =>
        p.conversationId === sessionId || p.id === sessionId
          ? {
              ...p,
              sessionCode: switchedSessionCode || p.sessionCode,
              agentId,
              currentAgentCode: switchedCurrentAgentCode || p.currentAgentCode,
              agentIds: switchedAgentIds?.length ? switchedAgentIds : [agentId],
              agentName: nextAgentName || p.agentName,
              agentColor: nextAgentColor || p.agentColor,
            }
          : p
      ),
      sessionTabs: state.sessionTabs.map((t) =>
        t.conversationId === sessionId || t.panelId === sessionId
          ? {
              ...t,
              conversationId: t.conversationId || sessionId,
              sessionCode: switchedSessionCode || t.sessionCode,
              agentId,
              currentAgentCode: switchedCurrentAgentCode || t.currentAgentCode,
              agentName: nextAgentName || t.agentName,
              agentColor: nextAgentColor || t.agentColor,
              color: nextAgentColor || t.color,
            }
          : t
      ),
    }));
  };
}

export function createCloseTabAction(set: SetState, get: GetState) {
  return (tabId: string) => {
    if (tabId === 'wechat') return;
    const { sessionTabs, activeTabId, closedSessionIds } = get();
    const tab = sessionTabs.find(t => t.id === tabId);
    if (!tab) return;
    const convId = tab.panelId || tab.conversationId || tab.id;
    const newClosedIds = closedSessionIds.filter(id => id !== convId);

    if (convId && convId !== 'home') {
      conversationsApi.updateStatus(convId, 'closed').catch(() => {});
    }
    try { sessionStorage.removeItem(`rc:msg-cache:${convId}`); } catch (e) { console.warn("[ConvStore]", e); }

    const remaining = sessionTabs.filter(t => t.id !== tabId);
    if (tab.panelId && !remaining.some(t => t.panelId === tab.panelId)) {
      set(s => ({
        openPanels: s.openPanels.filter(p => p.id !== tab.panelId),
      }));
    }

    let newActiveTabId: string | null = activeTabId;
    if (activeTabId === tabId) {
      const idx = sessionTabs.findIndex(t => t.id === tabId);
      newActiveTabId = remaining[idx - 1]?.id ?? remaining[idx]?.id ?? '';
    }
    set({ sessionTabs: remaining, activeTabId: newActiveTabId, closedSessionIds: newClosedIds, currentAgentId: '' });

    import("../../lib/sync").then(({ getBroadcastSync }) => {
      const bc = getBroadcastSync();
      if (bc) bc.send('session.closed', { conversationId: convId, tabId });
    }).catch(() => {});
  };
}

export function createRenameTabAction(set: SetState, get: GetState) {
  return (tabId: string, newTitle: string) => {
    if (tabId === 'wechat') return;
    const targetTab = get().sessionTabs.find(t => t.id === tabId);
    set(s => ({
      sessionTabs: s.sessionTabs.map(t =>
        t.id === tabId
          ? {
              ...t,
              previousTitle: t.title && t.title !== newTitle ? t.title : t.previousTitle,
              title: newTitle,
            }
          : t
      ),
    }));

    if (tabId !== 'home') {
      import('@/api/sessionTabs').then(({ sessionTabsApi }) => {
        sessionTabsApi.upsert({
          browser_tab_key: tabId,
          title: newTitle,
          conversation_id: targetTab?.conversationId || tabId,
          agent_id: targetTab?.agentId || '',
          agent_name: targetTab?.agentName || newTitle,
          color: targetTab?.color || '',
        }).catch(() => {});
      }).catch(() => {});
    }

    const conversationId = targetTab?.conversationId || targetTab?.panelId;
    if (conversationId && conversationId !== 'home') {
      import('@/api/conversations').then(({ conversationsApi }) => {
        conversationsApi.update(conversationId, { title: newTitle }).catch(() => {});
      }).catch(() => {});

      import("../../lib/sync").then(({ getBroadcastSync }) => {
        const bc = getBroadcastSync();
        if (bc) bc.send('session.renamed', { tabId, conversationId, newTitle });
      }).catch(() => {});
    }
  };
}

export function createCreateSessionTabAction(set: SetState, get: GetState) {
  return async (opts: {
    agentId: string;
    agentName: string;
    agentColor: string;
    title?: string;
    conversationId?: string;
    messages?: Message[];
    forceNewTab?: boolean;
    forceNew?: boolean;
  }) => {
    if (isGlobalAssistantConversationLike({
      agentId: opts.agentId,
      title: opts.title,
    })) {
      return opts.conversationId || '';
    }

    const { sessionTabs, openPanel, openPanels, loadMessages } = get();
    const baseId = opts.conversationId || `conv-${Date.now()}`;
    const tabId = opts.forceNewTab ? `${baseId}::tab-${Date.now()}` : baseId;

    const targetConvId = opts.conversationId;
    if (targetConvId) {
      const existingTab = sessionTabs.find(t => t.conversationId === targetConvId);
      if (existingTab) {
        const existingPanel = openPanels.find(
          p => p.id === existingTab.panelId || p.conversationId === targetConvId
        );
        if (existingPanel) {
          set({ activeTabId: existingTab.id });
          await loadMessages(existingPanel.id, targetConvId);
          const stillExists = get().openPanels.some(
            p => p.id === existingPanel.id && p.conversationId === targetConvId
          );
          if (stillExists) {
            return existingPanel.id;
          }
        }
      }
    }

    if (!opts.forceNewTab) {
      const existing = sessionTabs.find(t => t.id === tabId);
      if (existing) {
        set({ activeTabId: tabId });
        if (existing.panelId) return existing.panelId;
      }
    }

    let finalPanelId = '';

    if (opts.conversationId) {
      const existingPanel = openPanels.find(
        p => p.conversationId === opts.conversationId || p.id === opts.conversationId
      );

      if (existingPanel) {
        finalPanelId = existingPanel.id;
        await loadMessages(existingPanel.id, opts.conversationId);
        const stillExists = get().openPanels.some(
          p => p.id === existingPanel.id && p.conversationId === opts.conversationId
        );
        if (!stillExists) {
          return '';
        }
      } else {
        try {
          const convList = await conversationsApi.list();
          const conv = convList.find(c => c.id === opts.conversationId);

          let messages: Message[] = [];

          if (opts.conversationId === 'wechat-assistant') {
            try {
              const wechatConv = await conversationsApi.getWechatAssistant();
              actualConversationId = wechatConv.id;
              messages = wechatConv.messages || [];
            } catch (err) {
              console.warn('[createSessionTab] 无法获取微信助手真实ID:', err);
              messages = [];
            }
          } else {
            messages = await conversationsApi.getMessages(opts.conversationId);
          }

          const resolvedAgentId = resolveConversationCurrentAgent(conv, opts.agentId);
          const resolvedAgentIds = resolveConversationAgentIds(conv, resolvedAgentId ? [resolvedAgentId] : []);
          const panel: ConversationPanel = {
            id: opts.conversationId,
            conversationId: opts.conversationId,
            sessionCode: conv?.sessionCode,
            agentId: resolvedAgentId,
            currentAgentCode: conv?.currentAgentCode,
            agentIds: resolvedAgentIds,
            agentName: opts.agentName,
            agentColor: opts.agentColor,
            messages,
            isStreaming: false,
            conversationType: conv?.conversationType || 'general',
          };
          set(s => ({
            openPanels: s.openPanels.some(p => p.id === panel.id)
              ? s.openPanels
              : [...s.openPanels, panel],
          }));
          finalPanelId = panel.id;
        } catch (err) {
          if (isConversationNotFoundError(err)) {
            get().permanentlyCloseSession(opts.conversationId);
            return '';
          }
          const panel: ConversationPanel = {
            id: opts.conversationId,
            conversationId: opts.conversationId,
            agentId: opts.agentId,
            agentIds: opts.agentId ? [opts.agentId] : [],
            agentName: opts.agentName,
            agentColor: opts.agentColor,
            messages: [],
            isStreaming: false,
          };
          set(s => ({
            openPanels: s.openPanels.some(p => p.id === panel.id)
              ? s.openPanels
              : [...s.openPanels, panel],
          }));
          finalPanelId = panel.id;
        }
      }
    } else {
      finalPanelId = await openPanel({
        agentId: opts.agentId,
        agentName: opts.agentName,
        agentColor: opts.agentColor,
        tabId,
        forceNew: opts.forceNew,
      }) || tabId;
    }

    const convId = opts.conversationId || finalPanelId;
    if (!finalPanelId || !convId) {
      return '';
    }

    const newTab: SessionTab = {
      id: tabId,
      type: 'session',
      title: opts.title || opts.agentName,
      panelId: finalPanelId,
      color: opts.agentColor,
      conversationId: convId,
      agentId: opts.agentId,
      agentName: opts.agentName,
      agentColor: opts.agentColor,
    };
    set(s => ({
      closedSessionIds: convId ? s.closedSessionIds.filter(id => id !== convId) : s.closedSessionIds,
      sessionTabs: [...s.sessionTabs, newTab],
      activeTabId: tabId,
    }));

    if (convId) {
      conversationsApi.updateStatus(convId, 'in_progress').catch(() => {});
    }

    import("../../lib/sync").then(({ getBroadcastSync }) => {
      const bc = getBroadcastSync();
      if (bc) bc.send('session.opened', { conversationId: opts.conversationId || tabId, title: opts.title || opts.agentName });
    }).catch(() => {});

    return tabId;
  };
}

export function createPermanentlyCloseSessionAction(set: SetState, get: GetState) {
  return (conversationId: string) => {
    const { closedSessionIds, sessionTabs, activeTabId, openPanels } = get();
    const newClosedIds = closedSessionIds.filter(id => id !== conversationId);

    const relatedTabs = sessionTabs.filter((t) =>
      t.conversationId === conversationId || t.panelId === conversationId || t.id === conversationId
    );
    const relatedPanelIds = new Set<string>([
      conversationId,
      ...relatedTabs.map((t) => t.panelId).filter(Boolean) as string[],
    ]);

    const remainingTabs = sessionTabs.filter((t) =>
      t.conversationId !== conversationId && t.panelId !== conversationId && t.id !== conversationId
    );
    const remainingPanels = openPanels.filter((p) =>
      p.conversationId !== conversationId && p.id !== conversationId && !relatedPanelIds.has(p.id)
    );

    let newActiveTabId = activeTabId;
    if (activeTabId && remainingTabs.find(t => t.id === activeTabId) === undefined) {
      newActiveTabId = remainingTabs[0]?.id ?? null;
    }

    set({
      closedSessionIds: newClosedIds,
      sessionTabs: remainingTabs,
      openPanels: remainingPanels,
      activeTabId: newActiveTabId,
    });
  };
}

export function createBindPanelToTabAction(set: SetState) {
  return (tabId: string, panelId: string, title: string, color?: string) => {
    set((s: ConversationStoreState) => ({
      sessionTabs: s.sessionTabs.map((t) =>
        t.id === tabId ? {
          ...t,
          panelId,
          conversationId: panelId,
          title: t.title,
          color,
          agentName: title,
          sessionCode: t.sessionCode || s.openPanels.find((p) => p.id === panelId)?.sessionCode,
          currentAgentCode: t.currentAgentCode || s.openPanels.find((p) => p.id === panelId)?.currentAgentCode,
        } : t
      ),
    }));
  };
}

export function createSyncTabStreamingStateAction(set: SetState, get: GetState) {
  return () => {
    const { sessionTabs, openPanels } = get();
    const updated = sessionTabs.map((tab) => {
      if (!tab.panelId) return tab;
      const panel = openPanels.find((p) => p.id === tab.panelId);
      return panel ? { ...tab, isStreaming: panel.isStreaming } : tab;
    });
    set({ sessionTabs: updated });
  };
}

export function createRestoreFromPersistAction(set: SetState, get: GetState) {
  return async () => {
    if (get()._restoring) return;
    set({ _restoring: true });
    try {
      const { useAgentStore } = await import('@/stores/agentStore');
      const agents = useAgentStore.getState().agents;

      const result = await restoreTabs(
        agents,
        (convId, freshMsgs) => {
          set((s: ConversationStoreState) => ({
            openPanels: s.openPanels.map(p =>
              p.id === convId ? { ...p, messages: freshMsgs } : p
            ),
          }));
        }
      );

      if (result.panels.length > 0) {
        set({
          openPanels: result.panels,
          sessionTabs: result.tabs,
          activeTabId: result.activeTabId,
        });
      }
    } finally {
      set({ _restoring: false });
    }
  };
}
