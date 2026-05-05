/**
 * 会话看板 Store — 从后端 API 拉取真实会话列表
 * 
 * 数据流：
 *   组件挂载 → restoreFromPersist() → GET /api/conversations → 写入 store → 渲染卡片
 * 
 * 不再使用 MOCK 数据，所有会话来自 RepaceClaw 后端数据库
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { conversationsApi } from '../api/conversations';
import { useAgentStore } from './agentStore';

/* ─── 类型 ─────────────────────────────────────────────────── */
/** 会话看板卡片（从 Conversation 转换而来） */
export interface SessionCard {
  /** 会话底层主键 UUID */
  id: string;
  /** 业务会话编码 */
  sessionCode?: string;
  /** 会话标题 */
  title: string;
  /** 关联项目 ID */
  projectId: string | null;
  /** 关联任务 UUID */
  taskId: string | null;
  /** 参与智能体 ID 列表 */
  agentIds: string[];
  /** 当前活跃智能体 ID */
  currentAgentId: string;
  /** 会话状态：'in_progress' | 'completed' | 'archived' | 'deleted' */
  status: 'in_progress' | 'completed' | 'archived' | 'deleted';
  /** 创建时间 */
  createdAt: string;
  /** 创建者 ID */
  createdBy: string | null;
  /** 最后一条消息内容（摘要） */
  lastMessage: string;
  /** 消息总数 */
  messageCount: number;
  /** 智能体名称（前端解析） */
  agentName: string;
  /** 智能体颜色 */
  agentColor: string;
}

export type SessionColumn = 'progress' | 'done' | 'deleted';
export type SessionBoard = Record<SessionColumn, SessionCard[]>;

/* ─── 初始数据（空数组，从 API 加载）───────────────────────── */
const EMPTY_BOARD: SessionBoard = {
  progress: [],
  done: [],
  deleted: [],
};

/* ─── Store 接口 ───────────────────────────────────────────── */
interface SessionKanbanState {
  sessions: SessionBoard;
  /** 加载状态 */
  loading: boolean;
  /** 错误信息 */
  error: string | null;

  /**
   * 从后端 API 拉取会话列表，写入 store
   * 组件挂载时必须调用此方法
   */
  restoreFromPersist: () => Promise<void>;

  /** 删除会话 */
  removeSession: (sessionId: string) => void;
  /** 更新会话状态并同步看板分组 */
  updateSessionStatus: (sessionId: string, status: 'in_progress' | 'completed' | 'archived' | 'deleted') => void;
}

/* ─── Store 实现 ───────────────────────────────────────────── */
export const useSessionKanbanStore = create<SessionKanbanState>()(
  persist(
    (set) => ({
      sessions: EMPTY_BOARD,
      loading: false,
      error: null,

      /**
       * 从后端 API 拉取会话列表
       * 
       * 流程：
       *   1. 调用 GET /api/conversations 获取所有会话
       *   2. 遍历每个会话，调用 GET /api/conversations/:id/messages 获取消息数
       *   3. 解析 agent 信息（名称/颜色）
       *   4. 按 status 字段分组：in_progress → progress 栏；completed/archived → done 栏
       */
      restoreFromPersist: async () => {
        set({ loading: true, error: null });
        try {
          // 获取会话列表
          const conversations = await conversationsApi.list();
          const result: SessionBoard = { progress: [], done: [], deleted: [] };
          const agents = useAgentStore.getState().agents;

          // ⚡ 去重 Set：防止同一个会话被添加多次
          const addedIds = new Set<string>();

          for (const conv of conversations) {
            // ⚡ 去重
            if (addedIds.has(conv.id)) continue;
            addedIds.add(conv.id);

            // 获取消息列表（用于统计消息数和最后一条消息）
            let messages: any[] = [];
            try {
              messages = await conversationsApi.getMessages(conv.id);
            } catch {
              messages = [];
            }

            const messageCount = messages.length;
            const lastMsg = messages.length > 0 ? messages[messages.length - 1] : null;
            const lastMessage = lastMsg?.content?.substring(0, 100) || '暂无消息';

            // 智能体信息（从 currentAgentId 或 agentIds 取）
            const agentId = conv.currentAgentId || conv.agentId || conv.agentIds?.[0] || '';
            const convAgentIds = conv.agentIds?.length ? [...conv.agentIds] : (agentId ? [agentId] : []);
            const agent = agents.find((a) => a.id === agentId);
            const agentName = agent?.name || conv.title || '未知';
            const agentColor = agent?.color || '#6366f1';

            const card: SessionCard = {
              id: conv.id,
              title: conv.title || '新对话',
              sessionCode: conv.sessionCode,
              projectId: conv.projectId || null,
              taskId: conv.taskId || conv.id,
              agentIds: convAgentIds,
              currentAgentId: conv.currentAgentId || agentId,
              status: conv.status || 'in_progress',
              createdAt: conv.createdAt,
              createdBy: (conv as any).createdBy || null,
              lastMessage,
              messageCount,
              agentName,
              agentColor,
            };

            // 按后端返回的 status 字段分组
            // in_progress → progress 栏；completed → done 栏；archived/deleted → deleted 栏
            if (card.status === 'in_progress') {
              result.progress.push(card);
            } else if (card.status === 'completed') {
              result.done.push(card);
            } else {
              // archived / deleted 统一归入 deleted
              result.deleted.push(card);
            }
          }

          set({ sessions: result, loading: false });
        } catch (err: any) {
          console.error('[SessionKanbanStore] restoreFromPersist 失败:', err);
          set({ sessions: EMPTY_BOARD, loading: false, error: err.message || '加载失败' });
        }
      },

      removeSession: (sessionId) => {
        // 先调 API 删除
        conversationsApi.delete(sessionId).catch(() => {});
        set(state => {
          const newSessions: SessionBoard = {
            progress: (state.sessions.progress || []).filter(s => s.id !== sessionId),
            done: (state.sessions.done || []).filter(s => s.id !== sessionId),
            deleted: (state.sessions.deleted || []).filter(s => s.id !== sessionId),
          };
          return { sessions: newSessions };
        });
      },

      updateSessionStatus: (sessionId, status) => {
        // 先调 API
        conversationsApi.updateStatus(sessionId, status).catch(() => {});
        set((state) => {
          const newSessions: SessionBoard = {
            progress: [],
            done: [],
            deleted: [],
          };
          // 防御性取值
          const allCards = [
            ...(state.sessions.progress || []),
            ...(state.sessions.done || []),
            ...(state.sessions.deleted || []),
          ];
          // 找到目标卡片并更新 status，然后按新 status 重新分组
          for (const card of allCards) {
            const isTarget = card.id === sessionId;
            const s = isTarget ? status : card.status;
            if (s === 'in_progress') {
              newSessions.progress.push(isTarget ? { ...card, status: s } : card);
            } else if (s === 'completed') {
              newSessions.done.push(isTarget ? { ...card, status: s } : card);
            } else {
              newSessions.deleted.push(isTarget ? { ...card, status: s } : card);
            }
          }
          return { sessions: newSessions };
        });
      },
    }),
    {
      // ⚠️ 防跨用户数据串扰：storage key 按用户隔离
      name: (() => {
        try {
          const auth = JSON.parse(sessionStorage.getItem('wb-auth') || '{}');
          const uid = auth?.state?.user?.id;
          return uid ? `wb-session-kanban-store-${uid}` : 'wb-session-kanban-store-v4';
        } catch {
          return 'wb-session-kanban-store-v4';
        }
      })(),
      version: 4,
      storage: createJSONStorage(() => sessionStorage),
      migrate: (persistedState: any, version: number) => {
        // v3 及之前没有 deleted 列，补齐
        if (persistedState?.sessions) {
          persistedState.sessions.deleted = persistedState.sessions.deleted || [];
        }
        return persistedState;
      },
    }
  )
);
