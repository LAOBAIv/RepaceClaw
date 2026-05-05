import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { Message, Conversation } from "../types";
import { conversationsApi } from "../api/conversations";

// 平台助手 UUID（DB 真实 id）+ 兼容旧别名
const PLATFORM_ASSISTANT_IDS = new Set([
  'platform-assistant',
  'repaceclaw-platform-assistant',
  '24cf6cc5-da0d-48df-814e-11582e398007',  // DB 平台助手 UUID
]);

const isPlatformAssistantAgent = (agentId?: string | null) =>
  agentId ? PLATFORM_ASSISTANT_IDS.has(agentId) : false;

function resolveConversationCurrentAgent(conv?: Partial<Conversation> | null, fallback = ""): string {
  return conv?.currentAgentId || conv?.agentId || conv?.agentIds?.[0] || fallback;
}

function resolveConversationAgentIds(conv?: Partial<Conversation> | null, fallback?: string[]): string[] {
  const agentIds = conv?.agentIds || [];
  if (agentIds.length > 0) return agentIds;
  const currentAgentId = conv?.currentAgentId || conv?.agentId;
  if (currentAgentId) return [currentAgentId];
  return fallback || [];
}

interface ConversationPanel {
  id: string;
  conversationId: string;
  /** 会话业务编码，展示/排障优先用它 */
  sessionCode?: string;
  /** 当前面板"主"agentId（单智能体对话时即为唯一 agent；多智能体时取第一个） */
  agentId: string;
  /** 当前智能体业务编码 */
  currentAgentCode?: string;
  /** 参与此会话的所有 agentIds */
  agentIds: string[];
  agentName: string;
  agentColor: string;
  messages: Message[];
  isStreaming: boolean;
  streamingMessageId?: string;
  streamingContent?: string;
  /** 协作任务启动提示，仅前端展示，不存库，用户可关闭 */
  systemBanner?: string;
}

/** 顶部会话 Tab 数据结构 — 唯一 Tab 数据源 */
export interface SessionTab {
  /** 唯一 id：'home' 或 conversationId */
  id: string;
  /** Tab 类型 */
  type: 'home' | 'session';
  /** Tab 标题（智能体名称、项目名称或"新会话 N"） */
  title: string;
  /** 绑定的会话 panel id（home tab 为 null） */
  panelId: string | null;
  /** Tab 颜色（智能体颜色，home tab 无） */
  color?: string;
  /** 是否正在 streaming */
  isStreaming?: boolean;
  /** 绑定的会话 ID（与 panelId 相同，冗余字段便于查询） */
  conversationId?: string;
  /** 会话业务编码 */
  sessionCode?: string;
  /** 关联的智能体 ID */
  agentId?: string;
  /** 当前智能体业务编码 */
  currentAgentCode?: string;
  /** 关联的智能体名称 */
  agentName?: string;
  /** 关联的智能体颜色 */
  agentColor?: string;
  /** 最近一次改名前的标题，用于把“旧标题 -> 新标题”的变化带给后端上下文 */
  previousTitle?: string;
}

interface ConversationStore {
  openPanels: ConversationPanel[];
  messagesMap: Record<string, Message[]>;
  maxPanels: number;
  /** WebSocket 是否已连通 */
  wsConnected: boolean;

  /** 顶部会话 Tab 列表 */
  sessionTabs: SessionTab[];
  /** 当前激活的 Tab id */
  activeTabId: string | null;
  /** 当前会话正在对话的 Agent */
  currentAgentId: string;
  /** 用户主动关闭的会话 ID 列表（刷新后不再恢复） */
  closedSessionIds: string[];

  connect: () => void;
  sendMessage: (panelId: string, content: string) => void;
  /**
   * 打开会话面板
   * - agentIds 传多个时，创建多智能体会话
   * - agentId（单个）向下兼容
   * - 返回创建的 panelId
   */
  openPanel: (opts: {
    agentId: string;
    agentIds?: string[];
    agentName: string;
    agentColor: string;
    projectId?: string;
    initialMessage?: string;
    /** 绑定到指定 tabId（新建 Tab 时传入） */
    tabId?: string;
    /** 强制创建新会话，不复用已有会话 */
    forceNew?: boolean;
  }) => Promise<string | void>;
  /** Close a panel by panelId */
  closePanel: (panelId: string) => void;
  /** @deprecated use openPanel */
  addPanel: (agentId: string, agentName: string, agentColor: string, projectId?: string) => Promise<void>;
  /** @deprecated use closePanel */
  removePanel: (panelId: string) => void;

  // internal streaming helpers
  startStreaming: (panelId: string, messageId: string) => void;
  appendStreamChunk: (panelId: string, messageId: string, chunk: string) => void;
  finishStreaming: (panelId: string, messageId: string, finalMessage: Message) => void;
  loadMessages: (panelId: string, conversationId: string) => Promise<void>;
  clearPanels: () => void;
  /** 关闭协作任务 Banner */
  dismissBanner: (panelId: string) => void;

  /** 将 panel 绑定到指定 Tab */
  bindPanelToTab: (tabId: string, panelId: string, title: string, color?: string) => void;
  /** 同步 Tab 的 streaming 状态 */
  syncTabStreamingState: () => void;
  /** 刷新后从持久化的 tabs 恢复 panels 和消息 */
  restoreFromPersist: () => Promise<void>;
  /** 永久关闭指定会话（刷新后也不再恢复） */
  permanentlyCloseSession: (conversationId: string) => void;

  /** ── Tab 管理（统一入口） ── */
  /** 获取完整 Tab 列表（含 home tab） */
  getTabs: () => SessionTab[];
  /** 切换激活 Tab */
  switchTab: (tabId: string) => void;
  /** 切换当前会话的 Agent（不换 Session） */
  switchAgent: (sessionId: string, agentId: string) => Promise<void>;
  /** 关闭 Tab（会话 tab 记录到 closedSessionIds，home tab 忽略） */
  closeTab: (tabId: string) => void;
  /** 重命名 Tab */
  renameTab: (tabId: string, newTitle: string) => void;
  /** 新建会话 Tab（创建 panel + tab + 切换） */
  createSessionTab: (opts: {
    agentId: string;
    agentName: string;
    agentColor: string;
    title?: string;
    conversationId?: string;
    messages?: Message[];
    /** 强制新开一个标签，不复用已有 tab */
    forceNewTab?: boolean;
  }) => Promise<string>;
}

// WebSocket singleton
let wsInstance: WebSocket | null = null;
let wsReconnectTimer: ReturnType<typeof setTimeout> | null = null;

type ConversationWsEvent = {
  type: string;
  conversationId?: string;
  messageId?: string;
  message?: any;
  chunk?: string;
  agentId?: string;
  [key: string]: any;
};

const conversationWsSubscribers = new Map<string, Set<(event: ConversationWsEvent) => void>>();

function notifyConversationWsSubscribers(event: ConversationWsEvent) {
  const conversationId = event.conversationId || event.message?.conversationId;
  if (!conversationId) return;
  const handlers = conversationWsSubscribers.get(conversationId);
  if (!handlers?.size) return;
  handlers.forEach((handler) => {
    try {
      handler(event);
    } catch {}
  });
}

export function subscribeConversationWs(
  conversationId: string,
  handler: (event: ConversationWsEvent) => void,
): () => void {
  const handlers = conversationWsSubscribers.get(conversationId) || new Set<(event: ConversationWsEvent) => void>();
  handlers.add(handler);
  conversationWsSubscribers.set(conversationId, handlers);
  return () => {
    const current = conversationWsSubscribers.get(conversationId);
    if (!current) return;
    current.delete(handler);
    if (current.size === 0) {
      conversationWsSubscribers.delete(conversationId);
    }
  };
}

async function ensureWsOpen(timeoutMs = 5000): Promise<boolean> {
  if (wsInstance?.readyState === WebSocket.OPEN) return true;
  useConversationStore.getState().connect();
  const start = Date.now();
  return new Promise((resolve) => {
    const timer = setInterval(() => {
      if (wsInstance?.readyState === WebSocket.OPEN) {
        clearInterval(timer);
        resolve(true);
        return;
      }
      if (Date.now() - start >= timeoutMs) {
        clearInterval(timer);
        resolve(false);
      }
    }, 100);
  });
}

export async function sendConversationMessageOverWs(payload: {
  conversationId: string;
  conversationTitle?: string;
  previousConversationTitle?: string;
  agentId: string;
  agentIds?: string[];
  content: string;
}): Promise<void> {
  const ok = await ensureWsOpen();
  if (!ok || !wsInstance || wsInstance.readyState !== WebSocket.OPEN) {
    throw new Error("WS not connected");
  }
  wsInstance.send(JSON.stringify({
    type: "chat",
    conversationId: payload.conversationId,
    conversationTitle: payload.conversationTitle || "",
    previousConversationTitle: payload.previousConversationTitle || "",
    agentId: payload.agentId,
    // 与工作台保持一致：只上报当前激活 agent，避免旧 agentIds 干扰后端路由。
    agentIds: payload.agentId ? [payload.agentId] : (payload.agentIds || []),
    content: payload.content,
  }));
}

export const useConversationStore = create<ConversationStore>()(
  persist(
    (set, get) => ({
  openPanels: [],
  messagesMap: {},
  maxPanels: 4,
  wsConnected: false,
  sessionTabs: [],
  activeTabId: '',
  currentAgentId: '',
  /** 用户主动关闭的会话 ID 列表（刷新后不再恢复） */
  closedSessionIds: [],

  connect: () => {
    // 根因修复：之前这里只拦 OPEN，没有拦 CONNECTING。
    // 当页面初始化、发送消息后的补连、onclose 定时补连同时触发时，
    // 会在“旧连接尚未建好”的窗口里重复 new WebSocket()，造成浏览器端频繁 1005/1006/1001 断连。
    // 这里把 CONNECTING 也视为“已有连接进行中”，严格保证前端只有一条会话 WS。
    if (wsInstance && (wsInstance.readyState === WebSocket.OPEN || wsInstance.readyState === WebSocket.CONNECTING)) return;
    try {
      const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      // Phase 3: 携带 JWT token 用于 WebSocket 认证
      const raw = localStorage.getItem("repaceclaw-auth");
      let tokenParam = "";
      if (raw) {
        try {
          const state = JSON.parse(raw);
          const token = state?.state?.token;
          if (token) tokenParam = `?token=${encodeURIComponent(token)}`;
        } catch {}
      }
      const wsUrl = `${wsProtocol}//${window.location.host}/ws${tokenParam}`;
      const currentWs = new WebSocket(wsUrl);
      wsInstance = currentWs;
      currentWs.onopen = async () => {
        console.log("[WS] Connected");
        if (wsReconnectTimer) {
          clearTimeout(wsReconnectTimer);
          wsReconnectTimer = null;
        }
        set({ wsConnected: true });

        // 根因修复：Gateway 回复可能在断连期间已经成功入库。
        // 只靠旧 WS 推流会丢 UI；因此每次重连成功后都从 DB 回补当前已打开会话消息。
        const { openPanels } = get();
        for (const panel of openPanels) {
          try {
            const messages = await conversationsApi.getMessages(panel.conversationId);
            if (messages?.length) {
              set((s) => ({
                openPanels: s.openPanels.map((p) =>
                  p.id === panel.id ? { ...p, messages } : p
                ),
              }));
            }
          } catch {}
        }
      };
      currentWs.onclose = () => {
        console.log("[WS] Disconnected");
        set({ wsConnected: false });

        // 只允许存在一个待执行的重连定时器，避免多处 connect() 叠加触发重连风暴。
        if (wsInstance === currentWs) {
          wsInstance = null;
        }
        if (wsReconnectTimer) return;
        wsReconnectTimer = setTimeout(() => {
          wsReconnectTimer = null;
          get().connect();
        }, 3000);
      };
      currentWs.onerror = () => {}; // ignore error silently
      currentWs.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          notifyConversationWsSubscribers(data);
          const panels = get().openPanels;

          // ── 用户消息已保存到后端，将真实消息（含数据库 id）插入面板 ──
          if (data.type === "user_message" && data.message) {
            const msg: Message = data.message;
            const panel = panels.find((p) => p.conversationId === msg.conversationId);
            if (panel) {
              set((s) => ({
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
          console.log("[WS] agent_start:", data.messageId, data.agentId, data.conversationId, "panels:", panels.length);
            // 关键修复：流式回复必须优先按 conversationId 路由到 panel。
            // 原因：同一 agent 允许出现在多个会话里，如果只按 agentId 找 panel，
            // 就会把当前会话的回复挂到别的会话上，表现为“当前界面不刷新看不到回复，刷新后从 DB 重载才出现”。
            const panel = data.conversationId
              ? panels.find((p) => p.conversationId === data.conversationId)
              : panels.find((p) => p.agentId === data.agentId || p.agentIds.includes(data.agentId));
            console.log("[WS] agent_start panel:", panel?.id); if (panel) get().startStreaming(panel.id, data.messageId);
          }
          if (data.type === "agent_chunk" && data.messageId && data.chunk) {
            // 先按 streamingMessageId 命中正在流式输出的消息；命不中再按 conversationId 兜底。
            // conversationId 兜底是为了解决切换 agent / 多会话同 agent 场景下的 panel 归属问题。
            const panel = panels.find((p) => p.streamingMessageId === data.messageId)
              || (data.conversationId ? panels.find((p) => p.conversationId === data.conversationId) : undefined);
            if (panel) get().appendStreamChunk(panel.id, data.messageId, data.chunk);
          }
          if (data.type === "agent_done" && data.messageId && data.message) {
          console.log("[WS] agent_done:", data.messageId, data.conversationId, "content:", data.message?.content?.length);
            // 与 agent_start / agent_chunk 保持同一归属规则：优先 messageId，其次 conversationId。
            const panel = panels.find((p) => p.streamingMessageId === data.messageId)
              || (data.conversationId ? panels.find((p) => p.conversationId === data.conversationId) : undefined);
            console.log("[WS] agent_done panel:", panel?.id); if (panel) get().finishStreaming(panel.id, data.messageId, data.message);
          }

          // ── 异步概述生成：流式片段 ──
          if (data.type === "overview_chunk" && data.chunk) {
            const panel = panels.find((p) => p.conversationId === data.conversationId);
            if (panel) {
              // 如果还没有概述消息，先创建一个占位
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
                set((s) => ({
                  openPanels: s.openPanels.map((p) =>
                    p.conversationId === data.conversationId
                      ? { ...p, messages: [...p.messages, overviewMsg!], isStreaming: true, streamingMessageId: 'overview-generating', streamingContent: '' }
                      : p
                  ),
                }));
              } else {
                // 追加片段
                set((s) => ({
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

          // ── 异步概述生成：完成 ──
          if (data.type === "overview_done" && data.message) {
            const panel = panels.find((p) => p.conversationId === data.conversationId);
            if (panel) {
              // 替换占位消息为真实消息
              set((s) => ({
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
        } catch {}
      };
    } catch {
      // WS not available, ignore
    }
  },

  sendMessage: (panelId, content) => {
    const state = get();
    const panel = state.openPanels.find((p) => p.id === panelId);
    if (!panel) return;

    const activeTab = state.sessionTabs.find((t) => t.id === state.activeTabId)
      || state.sessionTabs.find((t) => t.panelId === panelId || t.conversationId === panel.conversationId);
    const conversationTitle = activeTab?.title?.trim() || '';
    const previousConversationTitle = activeTab?.previousTitle?.trim() || '';

    // 乐观更新
    const optimisticMsg: Message = {
      id: `optimistic-${Date.now()}`,
      conversationId: panel.conversationId,
      role: "user",
      content,
      createdAt: new Date().toISOString(),
    };
    set((s) => ({
      openPanels: s.openPanels.map((p) =>
        p.id === panelId ? { ...p, messages: [...p.messages, optimisticMsg] } : p
      ),
    }));

    // 如果 WS 未连接，先尝试重连
    if (wsInstance?.readyState !== WebSocket.OPEN) {
      console.warn("[WS] Not connected, reconnecting...");
      get().connect();
      // 等待连接建立后重试发送（最多等 5 秒）
      let retries = 0;
      const retryInterval = setInterval(() => {
        retries++;
        if (wsInstance?.readyState === WebSocket.OPEN) {
          clearInterval(retryInterval);
          wsInstance.send(JSON.stringify({
            type: "chat",
            conversationId: panel.conversationId,
            conversationTitle,
            previousConversationTitle,
            agentId: panel.agentId,
            // 关键修复：会话内切换 agent 后，发送层只能上报“当前激活 agent”。
            // 不能继续透传历史 agentIds 数组，否则后端若优先读取 agentIds[0]，
            // 就会在不刷新页面时仍然命中旧 agent，表现为“切换了但回复不对/不回复”。
            agentIds: panel.agentId ? [panel.agentId] : [],
            content,
          }));
          console.log("[WS] Message sent after reconnect");
        } else if (retries > 15) {
          clearInterval(retryInterval);
          console.error("[WS] Failed to reconnect, message lost");
          // 移除乐观消息，显示发送失败
          set((s) => ({
            openPanels: s.openPanels.map((p) =>
              p.id === panelId ? { ...p, messages: p.messages.filter((m) => m.id !== optimisticMsg.id) } : p
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
      // 与重连分支保持一致：只发送当前激活 agent，不透传旧 agentIds。
      agentIds: panel.agentId ? [panel.agentId] : [],
      content,
    }));
  },

  addPanel: async (agentId, agentName, agentColor, projectId) => {
    await get().openPanel({ agentId, agentName, agentColor, projectId });
  },

  openPanel: async ({ agentId, agentIds, agentName, agentColor, projectId, initialMessage, tabId, forceNew }) => {
    const { openPanels, maxPanels } = get();

    // 平台助手跳过 maxPanels 限制（全局服务，不限并发面板数）
    const isPlatformAssistant = isPlatformAssistantAgent(agentId);
    if (!isPlatformAssistant && openPanels.length >= maxPanels) return;

    // 只允许按 panel/conversation 精确复用，禁止按 agentId 复用其他会话的 panel
    const existingPanel = openPanels.find((p) =>
      p.id === tabId || p.conversationId === tabId
    );
    if (existingPanel) {
      if (tabId) get().bindPanelToTab(tabId, existingPanel.id, existingPanel.agentName, existingPanel.agentColor);
      await get().loadMessages(existingPanel.id, existingPanel.conversationId);
      return existingPanel.id;
    }

    // 合并 agentIds（去重，确保主 agentId 在列表中）
    const allAgentIds: string[] = agentIds?.length
      ? [...new Set([agentId, ...agentIds])]
      : [agentId];

    try {
      // ── 优先复用该 agent 的最新已有会话（除非强制新建） ──
      let conv: Conversation;
      if (!forceNew) {
        const existingList = await conversationsApi.list(projectId);
        const existing = existingList.find((c) => c.agentId === agentId || c.agentIds.includes(agentId));
        if (existing) {
          conv = existing;
          // 若新的参与者比已有会话多，逐个追加
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
        // 强制创建新会话
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
      set((s) => ({ openPanels: [...s.openPanels, panel] }));
      await get().loadMessages(conv.id, conv.id);
      // 绑定到 Tab
      if (tabId) {
        get().bindPanelToTab(tabId, conv.id, agentName, agentColor);
      }
      // 返回创建的 panelId
      return conv.id;
    } catch {
      // API not available, add a local panel
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
      set((s) => ({ openPanels: [...s.openPanels, panel] }));
      // 绑定到 Tab
      if (tabId) {
        get().bindPanelToTab(tabId, localId, agentName, agentColor);
      }
      // 返回创建的 panelId
      return localId;
    }
  },

  removePanel: (panelId) => {
    set((s) => ({ openPanels: s.openPanels.filter((p) => p.id !== panelId) }));
  },

  closePanel: (panelId) => {
    set((s) => ({ openPanels: s.openPanels.filter((p) => p.id !== panelId) }));
  },

  startStreaming: (panelId, messageId) => {
    const placeholder: Message = {
      id: messageId,
      conversationId: panelId,
      role: "agent",
      content: "",
      createdAt: new Date().toISOString(),
      streaming: true,
    };
    set((s) => ({
      openPanels: s.openPanels.map((p) =>
        p.id === panelId
          ? { ...p, isStreaming: true, streamingMessageId: messageId, streamingContent: "", messages: [...p.messages, placeholder] }
          : p
      ),
    }));
  },

  appendStreamChunk: (panelId, messageId, chunk) => {
    set((s) => ({
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
  },

  finishStreaming: (panelId, messageId, finalMessage) => {
    set((s) => ({
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
  },

  loadMessages: async (panelId, conversationId) => {
    try {
      const messages = await conversationsApi.getMessages(conversationId);
      set((s) => ({
        openPanels: s.openPanels.map((p) => p.id === panelId ? { ...p, messages } : p),
      }));
    } catch {}
  },

  clearPanels: () => set({ openPanels: [] }),

  dismissBanner: (panelId) => {
    set((s) => ({
      openPanels: s.openPanels.map((p) =>
        p.id === panelId ? { ...p, systemBanner: undefined } : p
      ),
    }));
  },

  // ─────────────────────────────────────────────
  // Session Tab 多会话 Tab 管理方法（统一入口）
  // ─────────────────────────────────────────────

  /** 获取完整 Tab 列表 */
  getTabs: () => {
    const { sessionTabs, activeTabId } = get();
    const key = JSON.stringify(sessionTabs?.map(t => t.id));
    const tabs = sessionTabs || [];
    return tabs.map(t => ({ ...t, type: (t.type || 'session') as 'home' | 'session' }));
  },

  /** 切换激活 Tab */
  switchTab: (tabId) => {
    set({ activeTabId: tabId });
  },

  /**
   * 切换当前会话的 Agent（不换 Session，不新开 Tab）
   *
   * ⚠️ 关键业务规则：
   * - 只更新当前 conversation 的 currentAgentId，以及已绑定该 conversation 的 panel/tab 元数据
   * - 后端负责清理旧的 conversation_agents 记录，只保留新 agent
   * - 绝不能在这里 createSessionTab，否则会把“会话内切换 agent”错误实现成“新开一个会话标签”
   *
   * 回归历史：
   * - 2026-04-29：曾因 switchAgent 误调用 createSessionTab 导致开新 tab
   * - 2026-05-01：曾因后端 INSERT OR IGNORE 导致 conversation_agents 积累多个 agent，
   *               前端拿到 agentIds 包含两个 agent，SessionAgentBar 同时显示两个智能体
   */
  switchAgent: async (sessionId, agentId) => {
    let switchedAgentIds: string[] | null = null;
    let switchedSessionCode: string | undefined;
    let switchedCurrentAgentCode: string | undefined;
    try {
      const { conversationsApi } = await import('@/api/conversations');
      const result = await conversationsApi.switchAgent(sessionId, agentId);
      switchedAgentIds = result?.agentIds || null;
      switchedSessionCode = result?.sessionCode;
      switchedCurrentAgentCode = result?.currentAgentCode;
    } catch {}

    let nextAgentName = '';
    let nextAgentColor = '#6366f1';
    try {
      const { useAgentStore } = await import('@/stores/agentStore');
      const agent = useAgentStore.getState().agents.find(a => a.id === agentId);
      if (agent) {
        nextAgentName = agent.name;
        nextAgentColor = agent.color || '#6366f1';
      }
    } catch {}

    set((state) => ({
      currentAgentId: agentId,
      openPanels: state.openPanels.map((p) =>
        p.conversationId === sessionId || p.id === sessionId
          ? {
              ...p,
              sessionCode: switchedSessionCode || p.sessionCode,
              agentId,
              currentAgentCode: switchedCurrentAgentCode || p.currentAgentCode,
              // 展示和发送层只保留当前激活 agent；
              // 参与者集合则以服务端返回的真实 agentIds 为准，便于 SessionAgentBar / 恢复链路保持一致。
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
  },

  /** 关闭 Tab */
  closeTab: (tabId) => {
    const { sessionTabs, activeTabId, closedSessionIds } = get();
    const tab = sessionTabs.find(t => t.id === tabId);
    if (!tab) return;
    // 所有 tab 均可关闭
    // 记录已关闭的会话 ID（刷新后不再恢复）
    const convId = tab.panelId || tab.conversationId || tab.id;
    const newClosedIds = !closedSessionIds.includes(convId)
      ? [...closedSessionIds, convId]
      : closedSessionIds;

    const remaining = sessionTabs.filter(t => t.id !== tabId);

    // 仅当没有其他 tab 继续引用该 panel 时，才真正关闭 panel
    if (tab.panelId && !remaining.some(t => t.panelId === tab.panelId)) {
      set(s => ({
        openPanels: s.openPanels.filter(p => p.id !== tab.panelId),
      }));
    }

    // 重新计算激活 Tab：若关闭的是当前激活，切换到相邻 Tab
    let newActiveTabId: string | null = activeTabId;
    if (activeTabId === tabId) {
      const idx = sessionTabs.findIndex(t => t.id === tabId);
      newActiveTabId = remaining[idx]?.id ?? remaining[idx - 1]?.id ?? '';
    }
    set({ sessionTabs: remaining, activeTabId: newActiveTabId, closedSessionIds: newClosedIds, currentAgentId: '' });
  },

  /** 重命名 Tab */
  renameTab: (tabId, newTitle) => {
    const targetTab = get().sessionTabs.find(t => t.id === tabId);
    set(s => ({
      sessionTabs: s.sessionTabs.map(t =>
        t.id === tabId
          ? {
              ...t,
              // 记录修改前标题，供后续一段时间内发消息时告知后端“标题刚从 A 改成 B”。
              previousTitle: t.title && t.title !== newTitle ? t.title : t.previousTitle,
              title: newTitle,
            }
          : t
      ),
    }));

    // 1) 持久化 tab 自身标题（用于刷新后恢复标签显示）
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

    // 2) 关键修复：如果这个 tab 绑定的是一个真实会话，还要同步更新 conversations.title。
    // 否则标题只存在于前端标签 UI，后端生成回复时完全拿不到，自然也不会把标题带进回复上下文。
    const conversationId = targetTab?.conversationId || targetTab?.panelId;
    if (conversationId && conversationId !== 'home') {
      import('@/api/conversations').then(({ conversationsApi }) => {
        conversationsApi.update(conversationId, { title: newTitle }).catch(() => {});
      }).catch(() => {});
    }
  },

  /** 新建会话 Tab（创建 panel + tab + 切换） */
  createSessionTab: async (opts) => {
    const { sessionTabs, openPanel, openPanels, loadMessages } = get();
    const baseId = opts.conversationId || `conv-${Date.now()}`;
    const tabId = opts.forceNewTab ? `${baseId}::tab-${Date.now()}` : baseId;

    // ── 去重检查：同一会话（conversationId）只允许一个 tab ──
    // 无论是否传 forceNewTab，只要 conversationId 匹配已有 tab，就切换到已有 tab。
    // 根因：AgentKanban 点击会话卡片时始终传 forceNewTab: true，导致同一会话反复创建新 tab。
    const targetConvId = opts.conversationId;
    if (targetConvId) {
      const existingTab = sessionTabs.find(t => t.conversationId === targetConvId);
      if (existingTab) {
        set({ activeTabId: existingTab.id });
        return existingTab.panelId || existingTab.id;
      }
    }

    // 非强制新建时：若 tab 已存在则直接切换（按 tabId 精确匹配，兜底）
    if (!opts.forceNewTab) {
      const existing = sessionTabs.find(t => t.id === tabId);
      if (existing) {
        set({ activeTabId: tabId });
        if (existing.panelId) return existing.panelId;
      }
    }

    let finalPanelId = '';

    // 会话列表点击时，必须精确绑定指定 conversationId，不能按 agent 误复用别的会话
    if (opts.conversationId) {
      const existingPanel = openPanels.find(
        p => p.conversationId === opts.conversationId || p.id === opts.conversationId
      );

      if (existingPanel) {
        finalPanelId = existingPanel.id;
        await loadMessages(existingPanel.id, opts.conversationId);
      } else {
        try {
          const convList = await conversationsApi.list();
          const conv = convList.find(c => c.id === opts.conversationId);
          const messages = await conversationsApi.getMessages(opts.conversationId);
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
          };
          set(s => ({
            openPanels: s.openPanels.some(p => p.id === panel.id)
              ? s.openPanels
              : [...s.openPanels, panel],
          }));
          finalPanelId = panel.id;
        } catch {
          // 兜底：仍然创建“该会话自己的 panel”，禁止借用其他会话的 panel
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
      }) || tabId;
    }

    const newTab: SessionTab = {
      id: tabId,
      type: 'session',
      title: opts.title || opts.agentName,
      panelId: finalPanelId,
      color: opts.agentColor,
      conversationId: opts.conversationId || finalPanelId,
      agentId: opts.agentId,
      agentName: opts.agentName,
      agentColor: opts.agentColor,
    };
    set(s => ({
      sessionTabs: [...s.sessionTabs, newTab],
      activeTabId: tabId,
    }));
    return tabId;
  },

  /** 永久关闭指定会话（不通过 UI 关闭，直接标记为已关闭） */
  permanentlyCloseSession: (conversationId) => {
    const { closedSessionIds, sessionTabs, activeTabId } = get();
    if (closedSessionIds.includes(conversationId)) return;
    const newClosedIds = [...closedSessionIds, conversationId];
    // 同时移除相关的 sessionTab
    const remaining = sessionTabs.filter((t) => t.panelId !== conversationId);
    let newActiveTabId = activeTabId;
    if (activeTabId && remaining.find(t => t.id === activeTabId) === undefined) {
      newActiveTabId = remaining[0]?.id ?? null;
    }
    set({ closedSessionIds: newClosedIds, sessionTabs: remaining, activeTabId: newActiveTabId });
  },

  bindPanelToTab: (tabId, panelId, title, color) => {
    set((s) => ({
      sessionTabs: s.sessionTabs.map((t) =>
        t.id === tabId ? {
          ...t,
          panelId,
          title,
          color,
          sessionCode: t.sessionCode || s.openPanels.find((p) => p.id === panelId)?.sessionCode,
          currentAgentCode: t.currentAgentCode || s.openPanels.find((p) => p.id === panelId)?.currentAgentCode,
        } : t
      ),
    }));
  },

  syncTabStreamingState: () => {
    const { sessionTabs, openPanels } = get();
    const updated = sessionTabs.map((tab) => {
      if (!tab.panelId) return tab;
      const panel = openPanels.find((p) => p.id === tab.panelId);
      return panel ? { ...tab, isStreaming: panel.isStreaming } : tab;
    });
    set({ sessionTabs: updated });
  },

  /**
   * 刷新后从 persist 恢复会话状态
   *
   * 恢复策略（按优先级）：
   * 1) Zustand persist（localStorage）中的 sessionTabs 快照 — 用户上次真实打开的 tab
   * 2) 首次访问无 persist 时，从 conversations API 拉取 — 但只恢复有消息的会话
   * 3) sessions API 兜底 — 同样只恢复有消息的会话
   *
   * ⚠️ 历史回归 BUG：
   * - 2026-04-13：restoreFromPersist 只恢复 sessionTabs 不恢复 openPanels → Panel/消息全丢
   * - 2026-04-29：只恢复 sessionTabs 不恢复 openPanels → 刷新后 Tab 在但 Panel 空
   * - 2026-05-01：第二优先/兜底路径为 API 返回的每个会话都创建 tab → 新用户看到一堆空 tab
   *   修复：加了 messages.length === 0 过滤，catch 块改为 continue 不再创建空面板
   */
  restoreFromPersist: async () => {
    const { sessionTabs: persistedTabs, activeTabId: persistedActiveId, closedSessionIds, openPanels: persistedPanels } = get();

    // ━━━ 第一优先：Zustand persist 是用户真实状态 ━━━
    // 如果用户之前已经打开过标签页，直接恢复。
    // 关键修复：这里不能只恢复 sessionTabs，必须连 openPanels 一起恢复，
    // 否则刷新后会出现“Tab 还在，但 Panel/智能体/历史消息全丢”的回归问题。
    // 当前策略：
    // 1) 先用 persist 中的 panel 快照秒恢复 UI
    // 2) 再用 conversations API 拉最新消息/agent 元数据做增量校正
    // 3) 恢复时只做 merge，不覆盖当前内存状态，防止刚创建的新 tab/panel 被冲掉
    if (persistedTabs && persistedTabs.length > 0) {
      const restoredPanels: ConversationPanel[] = [];
      const restoredTabs: SessionTab[] = [];
      // 允许同一会话恢复多个 tab，但 panel 只恢复一份并复用
      const panelCache = new Map<string, ConversationPanel>();
      for (const tab of persistedTabs) {
        if (!tab.panelId) continue;
        // 跳过本地面板（API 不可用时创建的临时面板）
        if (tab.panelId.startsWith('local-')) continue;
        // 过滤用户主动关闭的会话
        const convId = tab.conversationId || tab.panelId || tab.id;
        if (closedSessionIds?.includes(convId)) continue;

        let panel = panelCache.get(convId);
        if (!panel) {
          const persistedPanel = (persistedPanels || []).find(
            (p) => p.conversationId === convId || p.id === tab.panelId || p.id === convId
          );
          let conv: Conversation | undefined;
          try {
            const messages = await conversationsApi.getMessages(convId);
            let agentId = '';
            let agentIds: string[] = [];
            try {
              const convList = await conversationsApi.list();
              conv = convList.find((c) => c.id === convId);
              if (conv) {
                agentId = resolveConversationCurrentAgent(conv, '');
                agentIds = resolveConversationAgentIds(conv, agentId ? [agentId] : []);
              }
            } catch {}

            let agentName = tab.agentName || tab.title || '会话';
            let agentColor = tab.color || tab.agentColor || '#9ca3af';
            if (!tab.agentName && agentId) {
              try {
                const { useAgentStore } = await import('@/stores/agentStore');
                const agent = useAgentStore.getState().agents.find(a => a.id === agentId);
                if (agent) {
                  agentName = agent.name;
                  agentColor = agent.color || tab.color || '#9ca3af';
                }
              } catch {}
            }

            panel = {
              id: tab.panelId,
              conversationId: convId,
              sessionCode: conv?.sessionCode || persistedPanel?.sessionCode || tab.sessionCode,
              agentId: agentId || persistedPanel?.agentId || tab.agentId || '',
              currentAgentCode: conv?.currentAgentCode || persistedPanel?.currentAgentCode || tab.currentAgentCode,
              agentIds: agentIds?.length ? agentIds : (persistedPanel?.agentIds || (tab.agentId ? [tab.agentId] : [])),
              agentName: agentName || persistedPanel?.agentName || tab.agentName || tab.title || '会话',
              agentColor: agentColor || persistedPanel?.agentColor || tab.color || tab.agentColor || '#9ca3af',
              messages: messages?.length ? messages : (persistedPanel?.messages || []),
              isStreaming: false,
            };
          } catch {
            panel = {
              id: tab.panelId,
              conversationId: convId,
              sessionCode: persistedPanel?.sessionCode || tab.sessionCode,
              agentId: persistedPanel?.agentId || tab.agentId || '',
              currentAgentCode: persistedPanel?.currentAgentCode || tab.currentAgentCode,
              agentIds: persistedPanel?.agentIds || (tab.agentId ? [tab.agentId] : []),
              agentName: persistedPanel?.agentName || tab.agentName || tab.title || '会话',
              agentColor: persistedPanel?.agentColor || tab.color || tab.agentColor || '#9ca3af',
              messages: persistedPanel?.messages || [],
              isStreaming: false,
            };
          }
          panelCache.set(convId, panel);
          restoredPanels.push(panel);
        }

        restoredTabs.push({
          ...tab,
          type: tab.type || 'session',
          panelId: panel.id,
          conversationId: convId,
          sessionCode: tab.sessionCode || panel.sessionCode,
          agentId: tab.agentId || panel.agentId,
          currentAgentCode: tab.currentAgentCode || panel.currentAgentCode,
          agentName: tab.agentName || panel.agentName,
          agentColor: tab.agentColor || panel.agentColor,
        });
      }
      set((state) => {
        const mergedPanels = [...restoredPanels];
        for (const p of (persistedPanels || [])) {
          if (!mergedPanels.some(x => x.id === p.id)) mergedPanels.push({ ...p, isStreaming: false, streamingMessageId: undefined });
        }
        for (const p of state.openPanels) {
          if (!mergedPanels.some(x => x.id === p.id)) mergedPanels.push(p);
        }
        const mergedTabs = [...restoredTabs];
        for (const t of state.sessionTabs) {
          if (!mergedTabs.some(x => x.id === t.id)) mergedTabs.push(t);
        }
        return {
          openPanels: mergedPanels,
          sessionTabs: mergedTabs,
          activeTabId: state.activeTabId || persistedActiveId || (mergedTabs.length > 0 ? mergedTabs[0].id : null),
        };
      });
      return;
    }

    // ━━━ 第二优先：首次访问（zustand 无数据），从 conversations API 填充 ━━━
    // ⚠️ 修复：只恢复有效会话（有消息记录的），不自动为每个 API 返回的会话创建 tab。
    // 新用户在首次登录时不应该看到一堆空 tab。
    try {
      const { useAgentStore } = await import('@/stores/agentStore');
      const agents = useAgentStore.getState().agents;
      const convList = await conversationsApi.list();
      const persistedPanelMap = new Map((persistedPanels || []).map(p => [p.conversationId || p.id, p]));
      if (convList && convList.length > 0) {
        const restoredPanels: ConversationPanel[] = [];
        const restoredTabs: SessionTab[] = [];
        for (const conv of convList.slice(0, 10)) {
          if (closedSessionIds?.includes(conv.id)) continue;
          try {
            const messages = await conversationsApi.getMessages(conv.id);
            // 关键过滤：跳过没有消息的会话，避免创建空 tab
            if (!messages || messages.length === 0) continue;

            const agentId = resolveConversationCurrentAgent(conv, '');
            const agent = agents.find(a => a.id === agentId);
            const agentName = agent?.name || persistedPanelMap.get(conv.id)?.agentName || '智能体';
            const displayTitle = conv.title || persistedPanelMap.get(conv.id)?.agentName || agent?.name || '会话';
            const agentColor = agent?.color || '#6366f1';
            const convAgentIds = resolveConversationAgentIds(conv, agentId ? [agentId] : []);
            const persistedPanel = persistedPanelMap.get(conv.id);
            restoredPanels.push({
              id: conv.id,
              conversationId: conv.id,
              sessionCode: conv.sessionCode || persistedPanel?.sessionCode,
              agentId: agentId || persistedPanel?.agentId || '',
              currentAgentCode: conv.currentAgentCode || persistedPanel?.currentAgentCode,
              agentIds: convAgentIds?.length ? convAgentIds : (persistedPanel?.agentIds || []),
              agentName: agentName || persistedPanel?.agentName || '智能体',
              agentColor: agentColor || persistedPanel?.agentColor || '#6366f1',
              messages: messages?.length ? messages : (persistedPanel?.messages || []),
              isStreaming: false,
            });
            restoredTabs.push({
              id: conv.id,
              type: 'session',
              title: displayTitle,
              panelId: conv.id,
              color: agentColor,
              conversationId: conv.id,
              sessionCode: conv.sessionCode,
              agentId,
              currentAgentCode: conv.currentAgentCode,
              agentName,
            });
          } catch {
            // 跳过获取消息失败的会话，不创建空 tab
            continue;
          }
        }
        // 只恢复有效 tab（有消息的会话），没有有效会话则不创建任何 tab
        if (restoredTabs.length > 0) {
          set((state) => ({
            openPanels: restoredPanels.length > 0 ? restoredPanels : (persistedPanels || state.openPanels),
            sessionTabs: restoredTabs,
            activeTabId: state.activeTabId || restoredTabs[0].id,
          }));
          return;
        }
      }
    } catch {}

    // ━━━ 兜底：sessions API ━━━
    // ⚠️ 修复：同样只恢复有效会话（有消息的），不自动创建空 tab。
    try {
      const { sessionsApi } = await import('@/api/sessions');
      const sessions = await sessionsApi.list();
      if (sessions && sessions.length > 0) {
        const restoredPanels: ConversationPanel[] = [];
        const restoredTabs: SessionTab[] = [];
        for (const session of sessions.slice(0, 10)) {
          if (closedSessionIds?.includes(session.id)) continue;
          try {
            const preview = await sessionsApi.preview(session.id, 20);
            const messages = (preview?.messages || []).map((m: any) => ({
              id: m.id,
              messageCode: m.messageCode,
              conversationId: session.id,
              role: m.role as 'user' | 'agent',
              content: m.content,
              createdAt: m.createdAt,
            }));
            // 关键过滤：跳过没有消息的会话
            if (messages.length === 0) continue;

            const persistedPanel = (persistedPanels || []).find((p) => p.conversationId === session.id || p.id === session.id);
            const agentId = preview?.currentAgentId || preview?.agentId || session.currentAgentId || session.agentId || '';
            let agentName = persistedPanel?.agentName || '';
            let agentColor = '#6366f1';
            if (agentId) {
              try {
                const { useAgentStore } = await import('@/stores/agentStore');
                const agent = useAgentStore.getState().agents.find(a => a.id === agentId);
                if (agent) {
                  agentName = agent.name;
                  agentColor = agent.color || '#6366f1';
                }
              } catch {}
            }
            const displayTitle = preview?.title || session.title || agentName || '会话';
            restoredPanels.push({
              id: session.id,
              conversationId: session.id,
              sessionCode: preview?.sessionCode || persistedPanel?.sessionCode,
              agentId,
              currentAgentCode: preview?.currentAgentCode || persistedPanel?.currentAgentCode,
              agentIds: preview?.agentIds || session.agentIds || [],
              agentName: agentName || '智能体',
              agentColor,
              messages,
              isStreaming: false,
            });
            restoredTabs.push({
              id: session.id,
              type: 'session',
              title: displayTitle,
              panelId: session.id,
              color: agentColor,
              conversationId: session.id,
              sessionCode: preview?.sessionCode || persistedPanel?.sessionCode,
              agentId,
              currentAgentCode: preview?.currentAgentCode || persistedPanel?.currentAgentCode,
              agentName: agentName || '智能体',
            });
          } catch {
            // 跳过获取失败的会话，不创建空 tab
            continue;
          }
        }
        if (restoredTabs.length > 0) {
          set((state) => {
            const mergedPanels = [...restoredPanels];
            for (const p of (persistedPanels || [])) {
              if (!mergedPanels.some(x => x.id === p.id)) mergedPanels.push({ ...p, isStreaming: false, streamingMessageId: undefined });
            }
            for (const p of state.openPanels) {
              if (!mergedPanels.some(x => x.id === p.id)) mergedPanels.push(p);
            }
            const mergedTabs = [...restoredTabs];
            for (const t of state.sessionTabs) {
              if (!mergedTabs.some(x => x.id === t.id)) mergedTabs.push(t);
            }
            return {
              openPanels: mergedPanels,
              sessionTabs: mergedTabs,
              activeTabId: state.activeTabId || restoredTabs[0].id,
            };
          });
        }
      }
    } catch {}
  },
  }),
  {
    // ⚠️ 防跨用户数据串扰：localStorage key 按用户隔离
    // 旧全局 key `repaceclaw-conversations` 导致不同用户看到彼此的会话/Tab/Panel 快照
    name: (() => {
      try {
        const auth = JSON.parse(localStorage.getItem('repaceclaw-auth') || '{}');
        const uid = auth?.state?.user?.id;
        return uid ? `repaceclaw-conversations-${uid}` : 'repaceclaw-conversations';
      } catch {
        return 'repaceclaw-conversations';
      }
    })(),
    version: 4, // 版本升级：持久化 openPanels 快照，刷新后恢复 panel/智能体/历史
    storage: createJSONStorage(() => localStorage),
    migrate: (persistedState: any, version: number) => {
      // 无条件重置：旧数据格式完全不兼容，避免任何崩溃
      return {
        sessionTabs: [],
        activeTabId: '',
        currentAgentId: '',
        closedSessionIds: [],
        openPanels: [],
      };
    },
    // 持久化 tabs + panel 快照 + 激活状态；刷新后先恢复快照，再用 API 校正
    partialize: (state) => ({
      sessionTabs: state.sessionTabs,
      activeTabId: state.activeTabId,
      closedSessionIds: state.closedSessionIds,
      currentAgentId: state.currentAgentId,
      openPanels: state.openPanels.map((p) => ({
        id: p.id,
        conversationId: p.conversationId,
        sessionCode: p.sessionCode,
        agentId: p.agentId,
        currentAgentCode: p.currentAgentCode,
        agentIds: p.agentIds,
        agentName: p.agentName,
        agentColor: p.agentColor,
        messages: p.messages,
        isStreaming: false,
      })),
    }),
  }
)
);
