// [2026-05-25] Zustand store 定义 — 从 conversationStore.ts 拆分
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { Message } from "../../types";
import { CONV_STORE_BASENAME, convPersistStorage } from "./state";
import type { ConversationPanel, SessionTab } from "./types";
import {
  createConnectAction,
  createSendMessageAction,
  createOpenPanelAction,
  createClosePanelAction,
  createRemovePanelAction,
  createAddPanelAction,
  createStartStreamingAction,
  createAppendStreamChunkAction,
  createFinishStreamingAction,
  createLoadMessagesAction,
  createClearPanelsAction,
  createDismissBannerAction,
  createGetTabsAction,
  createSwitchTabAction,
  createSwitchAgentAction,
  createCloseTabAction,
  createRenameTabAction,
  createCreateSessionTabAction,
  createPermanentlyCloseSessionAction,
  createBindPanelToTabAction,
  createSyncTabStreamingStateAction,
  createRestoreFromPersistAction,
} from "./actions";

// ── Store 接口 ──

interface ConversationStore {
  openPanels: ConversationPanel[];
  messagesMap: Record<string, Message[]>;
  maxPanels: number;
  wsConnected: boolean;
  sessionTabs: SessionTab[];
  activeTabId: string | null;
  currentAgentId: string;
  closedSessionIds: string[];

  connect: () => void;
  sendMessage: (panelId: string, content: string) => void;
  openPanel: (opts: {
    agentId: string;
    agentIds?: string[];
    agentName: string;
    agentColor: string;
    projectId?: string;
    initialMessage?: string;
    tabId?: string;
    forceNew?: boolean;
  }) => Promise<string | void>;
  closePanel: (panelId: string) => void;
  /** @deprecated use openPanel */
  addPanel: (agentId: string, agentName: string, agentColor: string, projectId?: string) => Promise<void>;
  /** @deprecated use closePanel */
  removePanel: (panelId: string) => void;

  startStreaming: (panelId: string, messageId: string) => void;
  appendStreamChunk: (panelId: string, messageId: string, chunk: string) => void;
  finishStreaming: (panelId: string, messageId: string, finalMessage: Message) => void;
  loadMessages: (panelId: string, conversationId: string) => Promise<void>;
  clearPanels: () => void;
  dismissBanner: (panelId: string) => void;

  bindPanelToTab: (tabId: string, panelId: string, title: string, color?: string) => void;
  syncTabStreamingState: () => void;
  restoreFromPersist: () => Promise<void>;
  permanentlyCloseSession: (conversationId: string) => void;

  getTabs: () => SessionTab[];
  switchTab: (tabId: string) => void;
  switchAgent: (sessionId: string, agentId: string) => Promise<void>;
  closeTab: (tabId: string) => void;
  renameTab: (tabId: string, newTitle: string) => void;
  createSessionTab: (opts: {
    agentId: string;
    agentName: string;
    agentColor: string;
    title?: string;
    conversationId?: string;
    messages?: Message[];
    forceNewTab?: boolean;
    forceNew?: boolean;
  }) => Promise<string>;
}

// ── Store 创建 ──

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
      closedSessionIds: [],

      connect: createConnectAction(set, get),
      sendMessage: createSendMessageAction(set, get),
      openPanel: createOpenPanelAction(set, get),
      closePanel: createClosePanelAction(set),
      addPanel: createAddPanelAction(get),
      removePanel: createRemovePanelAction(set),
      startStreaming: createStartStreamingAction(set),
      appendStreamChunk: createAppendStreamChunkAction(set),
      finishStreaming: createFinishStreamingAction(set),
      loadMessages: createLoadMessagesAction(set, get),
      clearPanels: createClearPanelsAction(set),
      dismissBanner: createDismissBannerAction(set),
      getTabs: createGetTabsAction(get),
      switchTab: createSwitchTabAction(set, get),
      switchAgent: createSwitchAgentAction(set, get),
      closeTab: createCloseTabAction(set, get),
      renameTab: createRenameTabAction(set, get),
      createSessionTab: createCreateSessionTabAction(set, get),
      permanentlyCloseSession: createPermanentlyCloseSessionAction(set, get),
      bindPanelToTab: createBindPanelToTabAction(set, get),
      syncTabStreamingState: createSyncTabStreamingStateAction(set, get),
      restoreFromPersist: createRestoreFromPersistAction(set, get),
    }),
    {
      name: CONV_STORE_BASENAME,
      version: 6,
      storage: createJSONStorage(() => convPersistStorage),
      migrate: () => {
        return {
          sessionTabs: [],
          activeTabId: '',
          currentAgentId: '',
          closedSessionIds: [],
          openPanels: [],
        };
      },
      partialize: (state) => ({
        activeTabId: state.activeTabId,
      }),
    }
  )
);
