import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { Message, Conversation } from "../types";
import { conversationsApi } from "../api/conversations";
import { getCurrentUserId, getOrCreateTabId } from "../lib/storageScope";
// sync 模块按需懒加载，避免循环依赖
import type { WsSync } from "../lib/sync";
import type { BroadcastSync } from "../lib/sync";

// 平台助手 UUID(DB 真实 id)+ 兼容旧别名
const PLATFORM_ASSISTANT_IDS = new Set([
  'platform-assistant',
  'repaceclaw-platform-assistant',
  '24cf6cc5-da0d-48df-814e-11582e398007',  // DB 平台助手 UUID
]);

const isPlatformAssistantAgent = (agentId?: string | null) =>
  agentId ? PLATFORM_ASSISTANT_IDS.has(agentId) : false;

const isPlatformAssistantConversationLike = (input: {
  agentId?: string | null;
  currentAgentId?: string | null;
  agentIds?: string[] | null;
  title?: string | null;
}) => {
  const ids = [input.agentId, input.currentAgentId, ...(input.agentIds || [])].filter(Boolean) as string[];
  return ids.some((id) => isPlatformAssistantAgent(id)) || input.title === 'RepaceClaw 平台助手';
};

/**
 * Plan C: conversationStore 不能在模块加载时把 persist key 算死。
 *
 * 历史回归 BUG（2026-05-06）：
 * - 用户首次打开站点时，conversationStore 往往早于 auth 完成初始化
 * - 此时如果直接用 getScopedKey('conv')，会落到 rc:conv:anonymous
 * - 用户登录后继续使用，同一 tab 的会话状态就被写进 anonymous key
 * - 一旦刷新，auth 已存在，store 又会去读 rc:conv:{userId}
 * - 表现出来就是“刷新后会话全丢”
 *
 * 修复方式：
 * - 改成运行时动态 storage key
 * - 优先读 rc:conv:{userId}
 * - 若用户 key 不存在但 anonymous key 存在，则自动迁移到用户 key
 */
const CONV_STORE_BASENAME = 'rc:conv';
const convPersistStorage = {
  getItem: (name: string) => {
    const userId = getCurrentUserId();
    const userKey = userId ? `${name}:${userId}` : `${name}:anonymous`;
    const anonymousKey = `${name}:anonymous`;

    const current = sessionStorage.getItem(userKey);
    if (current) return current;

    if (userId) {
      const anonymous = sessionStorage.getItem(anonymousKey);
      if (anonymous) {
        sessionStorage.setItem(userKey, anonymous);
        sessionStorage.removeItem(anonymousKey);
        return anonymous;
      }
    }

    return null;
  },
  setItem: (name: string, value: string) => {
    const userId = getCurrentUserId();
    const key = userId ? `${name}:${userId}` : `${name}:anonymous`;
    sessionStorage.setItem(key, value);
  },
  removeItem: (name: string) => {
    const userId = getCurrentUserId();
    const key = userId ? `${name}:${userId}` : `${name}:anonymous`;
    sessionStorage.removeItem(key);
  },
};

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

function isConversationNotFoundError(err: any): boolean {
  return err?.response?.status === 404 || err?.response?.data?.error === 'Conversation not found';
}

export interface ConversationPanel {
  id: string;
  conversationId: string;
  /** 会话业务编码,展示/排障优先用它 */
  sessionCode?: string;
  /** 当前面板"主"agentId(单智能体对话时即为唯一 agent;多智能体时取第一个) */
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
  /** 协作任务启动提示,仅前端展示,不存库,用户可关闭 */
  systemBanner?: string;
}

/** 顶部会话 Tab 数据结构 - 唯一 Tab 数据源 */
export interface SessionTab {
  /** 唯一 id:'home' 或 conversationId */
  id: string;
  /** Tab 类型 */
  type: 'home' | 'session';
  /** Tab 标题(智能体名称、项目名称或"新会话 N") */
  title: string;
  /** 绑定的会话 panel id(home tab 为 null) */
  panelId: string | null;
  /** Tab 颜色(智能体颜色,home tab 无) */
  color?: string;
  /** 是否正在 streaming */
  isStreaming?: boolean;
  /** 绑定的会话 ID(与 panelId 相同,冗余字段便于查询) */
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
  /** 最近一次改名前的标题,用于把"旧标题 -> 新标题"的变化带给后端上下文 */
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
  /** 用户主动关闭的会话 ID 列表(刷新后不再恢复) */
  closedSessionIds: string[];

  connect: () => void;
  sendMessage: (panelId: string, content: string) => void;
  /**
   * 打开会话面板
   * - agentIds 传多个时,创建多智能体会话
   * - agentId(单个)向下兼容
   * - 返回创建的 panelId
   */
  openPanel: (opts: {
    agentId: string;
    agentIds?: string[];
    agentName: string;
    agentColor: string;
    projectId?: string;
    initialMessage?: string;
    /** 绑定到指定 tabId(新建 Tab 时传入) */
    tabId?: string;
    /** 强制创建新会话,不复用已有会话 */
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
  /** 永久关闭指定会话(刷新后也不再恢复) */
  permanentlyCloseSession: (conversationId: string) => void;

  /** ── Tab 管理(统一入口) ── */
  /** 获取完整 Tab 列表(含 home tab) */
  getTabs: () => SessionTab[];
  /** 切换激活 Tab */
  switchTab: (tabId: string) => void;
  /** 切换当前会话的 Agent(不换 Session) */
  switchAgent: (sessionId: string, agentId: string) => Promise<void>;
  /** 关闭 Tab(会话 tab 记录到 closedSessionIds,home tab 忽略) */
  closeTab: (tabId: string) => void;
  /** 重命名 Tab */
  renameTab: (tabId: string, newTitle: string) => void;
  /** 新建会话 Tab(创建 panel + tab + 切换) */
  createSessionTab: (opts: {
    agentId: string;
    agentName: string;
    agentColor: string;
    title?: string;
    conversationId?: string;
    messages?: Message[];
    /** 强制新开一个标签,不复用已有 tab */
    forceNewTab?: boolean;
    /** 强制创建新会话,不复用已有会话 */
    forceNew?: boolean;
  }) => Promise<string>;
}

// WebSocket singleton
let wsInstance: WebSocket | null = null;

/**
 * 获取当前 WebSocket 实例（供 sync 模块等非核心模块复用）
 * 不创建新连接，只返回已有连接。wsSync 复用此连接承载同步事件。
 */
export function getWsInstance(): WebSocket | null {
  return wsInstance;
}
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
    // 与工作台保持一致:只上报当前激活 agent,避免旧 agentIds 干扰后端路由。
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
  /** 用户主动关闭的会话 ID 列表(刷新后不再恢复) */
  closedSessionIds: [],

  connect: () => {
    // 根因修复:之前这里只拦 OPEN,没有拦 CONNECTING。
    // 当页面初始化、发送消息后的补连、onclose 定时补连同时触发时,
    // 会在"旧连接尚未建好"的窗口里重复 new WebSocket(),造成浏览器端频繁 1005/1006/1001 断连。
    // 这里把 CONNECTING 也视为"已有连接进行中",严格保证前端只有一条会话 WS。
    if (wsInstance && (wsInstance.readyState === WebSocket.OPEN || wsInstance.readyState === WebSocket.CONNECTING)) return;
    try {
      const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      // Phase 3: 携带 JWT token 用于 WebSocket 认证
      const raw = sessionStorage.getItem("repaceclaw-auth") || localStorage.getItem("repaceclaw-auth");
      let tokenParam = "";
      if (raw) {
        try {
          const state = JSON.parse(raw);
          const token = state?.state?.token;
          if (token) tokenParam = `?token=${encodeURIComponent(token)}`;
        } catch {}
      }
      // 方案 C: WS URL 携带 tabId，供后端回环防护使用
      const tabId = getOrCreateTabId();
      const wsUrl = `${wsProtocol}//${window.location.host}/ws${tokenParam}${tokenParam ? '&' : '?'}tabId=${encodeURIComponent(tabId)}`;
      const currentWs = new WebSocket(wsUrl);
      wsInstance = currentWs;
      currentWs.onopen = async () => {
        console.log("[WS] Connected");
        if (wsReconnectTimer) {
          clearTimeout(wsReconnectTimer);
          wsReconnectTimer = null;
        }
        set({ wsConnected: true });

        // 根因修复:Gateway 回复可能在断连期间已经成功入库。
        // 只靠旧 WS 推流会丢 UI;因此每次重连成功后都从 DB 回补当前已打开会话消息。
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
          } catch (err) {
            // 会话已在后端被删掉时，前端不能继续保留这个 panel/tab，
            // 否则每次重连都会重复打 404，控制台持续报错。
            if (isConversationNotFoundError(err)) {
              get().permanentlyCloseSession(panel.conversationId);
            }
          }
        }
      };
      currentWs.onclose = () => {
        console.log("[WS] Disconnected");
        set({ wsConnected: false });

        // 只允许存在一个待执行的重连定时器,避免多处 connect() 叠加触发重连风暴。
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

          // ── 用户消息已保存到后端,将真实消息(含数据库 id)插入面板 ──
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
            // 关键修复:流式回复必须优先按 conversationId 路由到 panel。
            // 原因:同一 agent 允许出现在多个会话里,如果只按 agentId 找 panel,
            // 就会把当前会话的回复挂到别的会话上,表现为"当前界面不刷新看不到回复,刷新后从 DB 重载才出现"。
            const panel = data.conversationId
              ? panels.find((p) => p.conversationId === data.conversationId)
              : panels.find((p) => p.agentId === data.agentId || p.agentIds.includes(data.agentId));
            console.log("[WS] agent_start panel:", panel?.id); if (panel) get().startStreaming(panel.id, data.messageId);
          }
          if (data.type === "agent_chunk" && data.messageId && data.chunk) {
            // 先按 streamingMessageId 命中正在流式输出的消息;命不中再按 conversationId 兜底。
            // conversationId 兜底是为了解决切换 agent / 多会话同 agent 场景下的 panel 归属问题。
            const panel = panels.find((p) => p.streamingMessageId === data.messageId)
              || (data.conversationId ? panels.find((p) => p.conversationId === data.conversationId) : undefined);
            if (panel) get().appendStreamChunk(panel.id, data.messageId, data.chunk);
          }
          if (data.type === "agent_done" && data.messageId && data.message) {
          console.log("[WS] agent_done:", data.messageId, data.conversationId, "content:", data.message?.content?.length);
            // 与 agent_start / agent_chunk 保持同一归属规则:优先 messageId,其次 conversationId。
            const panel = panels.find((p) => p.streamingMessageId === data.messageId)
              || (data.conversationId ? panels.find((p) => p.conversationId === data.conversationId) : undefined);
            console.log("[WS] agent_done panel:", panel?.id); if (panel) get().finishStreaming(panel.id, data.messageId, data.message);
          }

          if (data.type === "error" && data.message) {
            console.error("[WS] error:", data);
          }

          // ── 异步概述生成:流式片段 ──
          if (data.type === "overview_chunk" && data.chunk) {
            const panel = panels.find((p) => p.conversationId === data.conversationId);
            if (panel) {
              // 如果还没有概述消息,先创建一个占位
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

          // ── 异步概述生成:完成 ──
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

          // ── 方案 C 同步事件处理 ──
          // 交给 WsSync 静态方法处理，非 sync_event 会直接 return，不影响现有消息流
          try {
            import("../lib/sync").then(({ WsSync }) => {
              WsSync.handleIncomingMessage(data);
            }).catch(() => {});
          } catch {}
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

    // 如果 WS 未连接,先尝试重连
    if (wsInstance?.readyState !== WebSocket.OPEN) {
      console.warn("[WS] Not connected, reconnecting...");
      get().connect();
      // 等待连接建立后重试发送(最多等 5 秒)
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
            // 关键修复:会话内切换 agent 后,发送层只能上报"当前激活 agent"。
            // 不能继续透传历史 agentIds 数组,否则后端若优先读取 agentIds[0],
            // 就会在不刷新页面时仍然命中旧 agent,表现为"切换了但回复不对/不回复"。
            agentIds: panel.agentId ? [panel.agentId] : [],
            content,
          }));
          console.log("[WS] Message sent after reconnect");
        } else if (retries > 15) {
          clearInterval(retryInterval);
          console.error("[WS] Failed to reconnect, message lost");
          // 移除乐观消息,并插入明确失败提示,避免用户只看到"没回复"
          set((s) => ({
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
                        content: "消息发送失败：WebSocket 重连超时，请刷新页面后重试。",
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
      // 与重连分支保持一致:只发送当前激活 agent,不透传旧 agentIds。
      agentIds: panel.agentId ? [panel.agentId] : [],
      content,
    }));
  },

  addPanel: async (agentId, agentName, agentColor, projectId) => {
    await get().openPanel({ agentId, agentName, agentColor, projectId });
  },

  openPanel: async ({ agentId, agentIds, agentName, agentColor, projectId, initialMessage, tabId, forceNew }) => {
    const { openPanels, maxPanels } = get();

    // 平台助手跳过 maxPanels 限制(全局服务,不限并发面板数)
    const isPlatformAssistant = isPlatformAssistantAgent(agentId);
    if (!isPlatformAssistant && openPanels.length >= maxPanels) return;

    // 只允许按 panel/conversation 精确复用,禁止按 agentId 复用其他会话的 panel
    const existingPanel = openPanels.find((p) =>
      p.id === tabId || p.conversationId === tabId
    );
    if (existingPanel) {
      if (tabId) get().bindPanelToTab(tabId, existingPanel.id, existingPanel.agentName, existingPanel.agentColor);
      await get().loadMessages(existingPanel.id, existingPanel.conversationId);
      return existingPanel.id;
    }

    // 合并 agentIds(去重,确保主 agentId 在列表中)
    const allAgentIds: string[] = agentIds?.length
      ? [...new Set([agentId, ...agentIds])]
      : [agentId];

    try {
      // ── 优先复用该 agent 的最新已有会话(除非强制新建) ──
      let conv: Conversation;
      if (!forceNew) {
        const existingList = await conversationsApi.list(projectId);
        const existing = existingList.find((c) => c.agentId === agentId || c.agentIds.includes(agentId));
        if (existing) {
          conv = existing;
          // 若新的参与者比已有会话多,逐个追加
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
    } catch (err) {
      if (isConversationNotFoundError(err)) {
        get().permanentlyCloseSession(conversationId);
      }
    }
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
  // Session Tab 多会话 Tab 管理方法(统一入口)
  // ─────────────────────────────────────────────

  /** 获取完整 Tab 列表 */
  getTabs: () => {
    const { sessionTabs } = get();
    const tabs = sessionTabs || [];
    // 平台助手是独立入口服务，不进入顶部会话 tab。
    return tabs
      .filter(t => !isPlatformAssistantAgent(t.agentId))
      .map(t => ({ ...t, type: (t.type || 'session') as 'home' | 'session' }));
  },

  /** 切换激活 Tab */
  switchTab: (tabId) => {
    set({ activeTabId: tabId });
  },

  /**
   * 切换当前会话的 Agent(不换 Session,不新开 Tab)
   *
   * ⚠️ 关键业务规则:
   * - 只更新当前 conversation 的 currentAgentId,以及已绑定该 conversation 的 panel/tab 元数据
   * - 后端负责清理旧的 conversation_agents 记录,只保留新 agent
   * - 绝不能在这里 createSessionTab,否则会把"会话内切换 agent"错误实现成"新开一个会话标签"
   *
   * 回归历史:
   * - 2026-04-29:曾因 switchAgent 误调用 createSessionTab 导致开新 tab
   * - 2026-05-01:曾因后端 INSERT OR IGNORE 导致 conversation_agents 积累多个 agent,
   *               前端拿到 agentIds 包含两个 agent,SessionAgentBar 同时显示两个智能体
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
              // 展示和发送层只保留当前激活 agent;
              // 参与者集合则以服务端返回的真实 agentIds 为准,便于 SessionAgentBar / 恢复链路保持一致。
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
    // 记录已关闭的会话 ID(刷新后不再恢复)
    const convId = tab.panelId || tab.conversationId || tab.id;
    const newClosedIds = !closedSessionIds.includes(convId)
      ? [...closedSessionIds, convId]
      : closedSessionIds;

    const remaining = sessionTabs.filter(t => t.id !== tabId);

    // 仅当没有其他 tab 继续引用该 panel 时,才真正关闭 panel
    if (tab.panelId && !remaining.some(t => t.panelId === tab.panelId)) {
      set(s => ({
        openPanels: s.openPanels.filter(p => p.id !== tab.panelId),
      }));
    }

    // 重新计算激活 Tab:若关闭的是当前激活,切换到相邻 Tab
    let newActiveTabId: string | null = activeTabId;
    if (activeTabId === tabId) {
      const idx = sessionTabs.findIndex(t => t.id === tabId);
      newActiveTabId = remaining[idx]?.id ?? remaining[idx - 1]?.id ?? '';
    }
    set({ sessionTabs: remaining, activeTabId: newActiveTabId, closedSessionIds: newClosedIds, currentAgentId: '' });

    // 方案 C: 广播 Tab 关闭事件
    import("../lib/sync").then(({ getBroadcastSync }) => {
      const bc = getBroadcastSync();
      if (bc) bc.send('session.closed', { conversationId: convId, tabId });
    }).catch(() => {});
  },

  /** 重命名 Tab */
  renameTab: (tabId, newTitle) => {
    const targetTab = get().sessionTabs.find(t => t.id === tabId);
    set(s => ({
      sessionTabs: s.sessionTabs.map(t =>
        t.id === tabId
          ? {
              ...t,
              // 记录修改前标题,供后续一段时间内发消息时告知后端"标题刚从 A 改成 B"。
              previousTitle: t.title && t.title !== newTitle ? t.title : t.previousTitle,
              title: newTitle,
            }
          : t
      ),
    }));

    // 1) 持久化 tab 自身标题(用于刷新后恢复标签显示)
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

    // 2) 关键修复:如果这个 tab 绑定的是一个真实会话,还要同步更新 conversations.title。
    // 否则标题只存在于前端标签 UI,后端生成回复时完全拿不到,自然也不会把标题带进回复上下文。
    const conversationId = targetTab?.conversationId || targetTab?.panelId;
    if (conversationId && conversationId !== 'home') {
      import('@/api/conversations').then(({ conversationsApi }) => {
        conversationsApi.update(conversationId, { title: newTitle }).catch(() => {});
      }).catch(() => {});

      // 方案 C: 广播 Tab 重命名事件
      // ⚠️ 必须携带 tabId,供接收方定位 SessionTab (而非 conversationId)
      import("../lib/sync").then(({ getBroadcastSync }) => {
        const bc = getBroadcastSync();
        if (bc) bc.send('session.renamed', { tabId, conversationId, newTitle });
      }).catch(() => {});
    }
  },

  /** 新建会话 Tab(创建 panel + tab + 切换) */
  createSessionTab: async (opts) => {
    // 平台助手是独立入口服务：独立页面、独立会话，但绝不能进入工作台 sessionTabs。
    // 只要这里放行，任何“从会话列表点击 / 从恢复链回补 / 从别处复用 createSessionTab”
    // 都可能把平台助手重新塞回顶部 tab，形成反复复现的回归。
    if (isPlatformAssistantConversationLike({
      agentId: opts.agentId,
      agentIds: opts.agentId ? [opts.agentId] : [],
      title: opts.title,
    })) {
      return opts.conversationId || '';
    }

    const { sessionTabs, openPanel, openPanels, loadMessages } = get();
    const baseId = opts.conversationId || `conv-${Date.now()}`;
    const tabId = opts.forceNewTab ? `${baseId}::tab-${Date.now()}` : baseId;

    // ── 去重检查:同一会话(conversationId)只允许一个 tab ──
    // 无论是否传 forceNewTab,只要 conversationId 匹配已有 tab,就切换到已有 tab。
    // 根因:AgentKanban 点击会话卡片时始终传 forceNewTab: true,导致同一会话反复创建新 tab。
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

    // 非强制新建时:若 tab 已存在则直接切换(按 tabId 精确匹配,兜底)
    if (!opts.forceNewTab) {
      const existing = sessionTabs.find(t => t.id === tabId);
      if (existing) {
        set({ activeTabId: tabId });
        if (existing.panelId) return existing.panelId;
      }
    }

    let finalPanelId = '';

    // 会话列表点击时,必须精确绑定指定 conversationId,不能按 agent 误复用别的会话
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
        } catch (err) {
          if (isConversationNotFoundError(err)) {
            get().permanentlyCloseSession(opts.conversationId);
            return '';
          }
          // 兜底:仅在不是 404 会话失效时，才创建最小 panel，避免前端反复恢复一个后端已不存在的假会话
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
      // 关键修复：会话一旦重新打开，就必须从 closedSessionIds 里移除。
      // 否则用户明明已经重新进入并继续对话，刷新后 restore 仍会把它当成“已关闭会话”过滤掉。
      closedSessionIds: convId ? s.closedSessionIds.filter(id => id !== convId) : s.closedSessionIds,
      sessionTabs: [...s.sessionTabs, newTab],
      activeTabId: tabId,
    }));

    // 方案 C: 广播会话打开事件
    import("../lib/sync").then(({ getBroadcastSync }) => {
      const bc = getBroadcastSync();
      if (bc) bc.send('session.opened', { conversationId: opts.conversationId || tabId, title: opts.title || opts.agentName });
    }).catch(() => {});

    return tabId;
  },

  /** 永久关闭指定会话(不通过 UI 关闭,直接标记为已关闭) */
  permanentlyCloseSession: (conversationId) => {
    const { closedSessionIds, sessionTabs, activeTabId, openPanels } = get();
    const newClosedIds = closedSessionIds.includes(conversationId)
      ? closedSessionIds
      : [...closedSessionIds, conversationId];

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
  },

  bindPanelToTab: (tabId, panelId, title, color) => {
    set((s) => ({
      sessionTabs: s.sessionTabs.map((t) =>
        t.id === tabId ? {
          ...t,
          panelId,
          // ⚠️ 防回归：这里只做 panel 绑定，不允许再用传入的 agentName 覆盖会话 title。
          // 历史问题：openPanel/createSessionTab 调这里时，第三个参数实际经常传的是 agentName，
          // 如果这里无条件写入 title，会把“会话标题”和“智能体名称”串掉，表现为名称错乱。
          title: t.title,
          color,
          // 这里应同步当前 panel 绑定后的智能体展示名，避免旧 t.agentName 长期污染顶部显示链。
          agentName: title,
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
   * Day 2 改造后恢复策略:
   * 1) 从 sessionStorage 恢复 sessionTabs(UI 布局,秒级)
   * 2) 对每个 tab 调 API 拉取 messages → 在内存中重建 openPanels
   * 3) 不再依赖 persisted openPanels 快照(已移除持久化)
   *
   * ⚠️ 历史回归 BUG:
   * - 2026-04-13:restoreFromPersist 只恢复 sessionTabs 不恢复 openPanels → Panel/消息全丢
   * - 2026-04-29:只恢复 sessionTabs 不恢复 openPanels → 刷新后 Tab 在但 Panel 空
   * - 2026-05-01:第二优先/兜底路径为 API 返回的每个会话都创建 tab → 新用户看到一堆空 tab
   * - 2026-05-05:Day 2 改造:openPanels 不再持久化,改为 API 重建
   * - 2026-05-06:第一优先分支只要看到 persistedTabs 就直接 return，
   *               即使这些 tabs 全部恢复失败/被过滤，也不会继续走 API 回补，
   *               表现为“刷新后会话全丢”。
   */
  restoreFromPersist: async () => {
    const { sessionTabs: persistedTabs, activeTabId: persistedActiveId, closedSessionIds } = get();

    // ━━━ 第一优先:从 sessionStorage 恢复 sessionTabs(UI 布局)━━━━━━━━━━
    // Day 2 改造后:openPanels 不再持久化,这里只做两件事:
    //   1) 恢复 sessionTabs + activeTabId(秒级 UI 恢复)
    //   2) 对每个 tab 调 API 重建 openPanels(后台异步)
    if (persistedTabs && persistedTabs.length > 0) {
      const restoredPanels: ConversationPanel[] = [];
      const restoredTabs: SessionTab[] = [];
      // 允许同一会话恢复多个 tab,但 panel 只恢复一份并复用
      const panelCache = new Map<string, ConversationPanel>();
      for (const tab of persistedTabs) {
        if (!tab.panelId) continue;
        // 平台助手是独立入口服务，不参与工作台 tab 恢复。
        if (isPlatformAssistantAgent(tab.agentId)) continue;
        // 跳过本地面板(API 不可用时创建的临时面板)
        if (tab.panelId.startsWith('local-')) continue;
        // ⚠️ 关键业务规则：如果一个会话已经重新出现在 persistedTabs 里，
        // 说明它当前是“打开状态”，此时 persistedTabs 的事实优先级高于 closedSessionIds。
        // 否则会出现这种回归：用户曾关闭过某会话 -> 又重新打开并继续使用 ->
        // 刷新时仍被 closedSessionIds 误判为“应隐藏”，表现为会话再次丢失。
        const convId = tab.conversationId || tab.panelId || tab.id;

        let panel = panelCache.get(convId);
        if (!panel) {
          // Day 2:不再依赖 persistedPanel,面板完全由 API 数据 + tab 元数据构建
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

            // ⚠️ 防回归：agentName 只能来自 agent 元数据/已持久化的 agentName，
            // 绝不能再从 tab.title 回填。
            // 根因：title 是“会话标题”，不是“智能体名称”。
            // 一旦混用，用户改过会话标题或恢复旧 tab 后，UI 会表现成“智能体名字被改了”。
            let agentName = tab.agentName || '智能体';
            let agentColor = tab.color || tab.agentColor || '#9ca3af';
            if (agentId) {
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
              sessionCode: conv?.sessionCode || tab.sessionCode,
              agentId: agentId || tab.agentId || '',
              currentAgentCode: conv?.currentAgentCode || tab.currentAgentCode,
              agentIds: agentIds?.length ? agentIds : (tab.agentId ? [tab.agentId] : []),
              agentName: agentName || tab.agentName || '智能体',
              agentColor: agentColor || tab.color || tab.agentColor || '#9ca3af',
              messages: messages?.length ? messages : [],
              isStreaming: false,
            };
          } catch (err) {
            // 会话已被后端删除时，不能再恢复成本地空 panel，
            // 否则刷新后这个失效会话会永久残留，并持续触发 404。
            if (isConversationNotFoundError(err)) {
              get().permanentlyCloseSession(convId);
              continue;
            }
            // API 不可用时,用 tab 元数据创建最小面板(无消息)
            // ⚠️ 防回归：catch 分支也要从 agent store 查真实名字，不能直接用 tab.agentName || '智能体'
            // 注意：useAgentStore 需要动态导入，因为 try 块里的 import 作用域不覆盖 catch
            let fallbackAgentName = tab.agentName || '智能体';
            let fallbackAgentColor = tab.color || tab.agentColor || '#9ca3af';
            if (tab.agentId) {
              try {
                const { useAgentStore } = await import('@/stores/agentStore');
                const agent = useAgentStore.getState().agents.find(a => a.id === tab.agentId);
                if (agent) {
                  fallbackAgentName = agent.name;
                  fallbackAgentColor = agent.color;
                }
              } catch {}
            }
            panel = {
              id: tab.panelId,
              conversationId: convId,
              sessionCode: tab.sessionCode,
              agentId: tab.agentId || '',
              currentAgentCode: tab.currentAgentCode,
              agentIds: tab.agentId ? [tab.agentId] : [],
              agentName: fallbackAgentName,
              agentColor: fallbackAgentColor,
              messages: [],
              isStreaming: false,
            };
          }
          panelCache.set(convId, panel);
          restoredPanels.push(panel);
        }

        // ⚠️ 防回归：restoredTabs 的 agentName 也要从 agent store 查，不能只依赖 tab/panel.agentName
        // 注意：useAgentStore 需要动态导入，因为 try 块里的 import 作用域不覆盖此处
        let finalAgentName = tab.agentName || panel.agentName;
        let finalAgentColor = tab.agentColor || panel.agentColor;
        const finalAgentId = tab.agentId || panel.agentId;
        if (finalAgentId && (finalAgentName === '智能体' || !finalAgentName)) {
          try {
            const { useAgentStore } = await import('@/stores/agentStore');
            const agent = useAgentStore.getState().agents.find(a => a.id === finalAgentId);
            if (agent) {
              finalAgentName = agent.name;
              finalAgentColor = agent.color;
            }
          } catch {}
        }
        restoredTabs.push({
          ...tab,
          type: tab.type || 'session',
          panelId: panel.id,
          conversationId: convId,
          sessionCode: tab.sessionCode || panel.sessionCode,
          agentId: finalAgentId,
          currentAgentCode: tab.currentAgentCode || panel.currentAgentCode,
          agentName: finalAgentName,
          agentColor: finalAgentColor,
        });
      }
      // 关键修复：不能因为“persistedTabs 数组非空”就盲目 return。
      // 如果这些 tab 在恢复过程中全部被跳过/恢复失败，必须继续走后面的 API 回补分支，
      // 否则刷新后会看到整个工作区会话全丢。
      if (restoredTabs.length > 0) {
        set((state) => {
          // Day 2:不再合并 persistedPanels,只合并当前内存中已有的 panels
          const mergedPanels = [...restoredPanels];
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
    }

    // ━━━ 第二优先：首次访问（无 persist 数据），从 conversations API 填充 ━━━
    // Day 2：不再使用 persistedPanelMap，面板数据完全来自 API
    try {
      const { useAgentStore } = await import('@/stores/agentStore');
      const agents = useAgentStore.getState().agents;
      const convList = await conversationsApi.list();
      if (convList && convList.length > 0) {
        const restoredPanels: ConversationPanel[] = [];
        const restoredTabs: SessionTab[] = [];
        for (const conv of convList.slice(0, 10)) {
          if (closedSessionIds?.includes(conv.id)) continue;
          // 平台助手是独立入口服务，不参与工作台 tab / panel 自动恢复。
          if (isPlatformAssistantConversationLike(conv)) continue;
          try {
            const messages = await conversationsApi.getMessages(conv.id);
            // 关键过滤:跳过没有消息的会话,避免创建空 tab
            if (!messages || messages.length === 0) continue;

            const agentId = resolveConversationCurrentAgent(conv, '');
            const agent = agents.find(a => a.id === agentId);
            const agentName = agent?.name || '智能体';
            const displayTitle = conv.title || agent?.name || '会话';
            const agentColor = agent?.color || '#6366f1';
            const convAgentIds = resolveConversationAgentIds(conv, agentId ? [agentId] : []);
            restoredPanels.push({
              id: conv.id,
              conversationId: conv.id,
              sessionCode: conv.sessionCode,
              agentId: agentId || '',
              currentAgentCode: conv.currentAgentCode,
              agentIds: convAgentIds?.length ? convAgentIds : [],
              agentName,
              agentColor: agentColor || '#6366f1',
              messages: messages?.length ? messages : [],
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
            // 跳过获取消息失败的会话,不创建空 tab
            continue;
          }
        }
        // 只恢复有效 tab(有消息的会话),没有有效会话则不创建任何 tab
        if (restoredTabs.length > 0) {
          set((state) => ({
            openPanels: restoredPanels,
            sessionTabs: restoredTabs,
            activeTabId: state.activeTabId || restoredTabs[0].id,
          }));
          return;
        }
      }
    } catch {}

    // ━━━ 兜底:sessions API ━━━
    try {
      const { sessionsApi } = await import('@/api/sessions');
      const sessions = await sessionsApi.list();
      if (sessions && sessions.length > 0) {
        const restoredPanels: ConversationPanel[] = [];
        const restoredTabs: SessionTab[] = [];
        for (const session of sessions.slice(0, 10)) {
          if (closedSessionIds?.includes(session.id)) continue;
          // sessions API 兜底恢复链也必须排除平台助手，避免它被当普通会话补回 tab。
          if (isPlatformAssistantConversationLike(session as any)) continue;
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
            // 关键过滤:跳过没有消息的会话
            if (messages.length === 0) continue;

            const agentId = preview?.currentAgentId || preview?.agentId || session.currentAgentId || session.agentId || '';
            let agentName = '';
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
              sessionCode: preview?.sessionCode,
              agentId,
              currentAgentCode: preview?.currentAgentCode,
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
              sessionCode: preview?.sessionCode,
              agentId,
              currentAgentCode: preview?.currentAgentCode,
              agentName: agentName || '智能体',
            });
          } catch {
            // 跳过获取失败的会话,不创建空 tab
            continue;
          }
        }
        if (restoredTabs.length > 0) {
          set((state) => {
            const mergedPanels = [...restoredPanels];
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
    // ⚠️ Day 2 改造:业务数据与 UI 状态分层
    // - 只持久化 UI 状态(sessionTabs/activeTabId/closedSessionIds/currentAgentId)
    // - openPanels 含 messages 是后端业务真相,不再持久化,刷新后从 API 重建
    // - 迁移到 sessionStorage,配合 Day 1 auth tab 隔离
    // - 关键修复(2026-05-06):不能在模块初始化时把 key 固定成 anonymous
    name: CONV_STORE_BASENAME,
    version: 5, // 版本升级:移除 openPanels 持久化,业务数据改由 API 重建
    storage: createJSONStorage(() => convPersistStorage),
    migrate: (persistedState: any, version: number) => {
      // 无条件重置:v4→v5 移除了 openPanels 持久化,旧数据完全不兼容
      // 同时兼容 v4 及更旧版本的全量 reset
      return {
        sessionTabs: [],
        activeTabId: '',
        currentAgentId: '',
        closedSessionIds: [],
        openPanels: [],
      };
    },
    // Day 2 改造:只持久化 UI 状态,不持久化业务数据
    // - sessionTabs: 用户打开的 Tab 列表(UI 布局)
    // - activeTabId: 当前激活的 Tab(UI 状态)
    // - closedSessionIds: 用户关闭的会话(UI 偏好)
    // - currentAgentId: 当前会话 Agent(可从 activeTab 推导,保留用于快速读取)
    // - openPanels: ❌ 不再持久化,含 messages 是后端业务真相,刷新后从 API 重建
    partialize: (state) => ({
      sessionTabs: state.sessionTabs,
      activeTabId: state.activeTabId,
      closedSessionIds: state.closedSessionIds,
      currentAgentId: state.currentAgentId,
    }),
  }
)
);
