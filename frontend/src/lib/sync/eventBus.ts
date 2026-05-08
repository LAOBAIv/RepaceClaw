/**
 * eventBus.ts — 方案 C 同步事件总线
 *
 * 职责：
 * - 定义统一的 SyncEvent 结构
 * - 提供发布/订阅机制，BroadcastChannel 和 WebSocket 均通过此总线收发
 * - 事件去重与回环防护（通过 recentEventIds 记录本地发出的事件）
 *
 * 设计原则（与 PLAN-C-SYNC-ARCH 一致）：
 * - 事件只携带"变更通知"，不同步完整业务快照
 * - 业务真相始终以后端 API 为准
 * - 采用 Last-Write-Wins 作为基础合并规则
 *
 * 使用方式：
 *   // 订阅某类事件
 *   syncEventBus.on('session.closed', (event) => { ... });
 *
 *   // 发布事件（自动走 BroadcastChannel / WebSocket）
 *   syncEventBus.emit('session.opened', { conversationId, title });
 *
 *   // 停止同步（如用户退出登录）
 *   syncEventBus.destroy();
 */

// ─── 事件类型定义 ───

export type SyncEventType =
  // 会话生命周期
  | 'session.opened'
  | 'session.closed'
  | 'session.renamed'
  | 'session.activated'
  // 消息流
  | 'message.appended'
  | 'message.stream.started'
  | 'message.stream.delta'
  | 'message.stream.completed'
  // 任务 / 项目
  | 'task.updated'
  | 'project.updated';

/** 统一同步事件结构 */
export interface SyncEvent<T = unknown> {
  /** 事件类型 */
  type: SyncEventType;
  /** 触发用户 ID */
  userId: string;
  /** 触发 Tab ID */
  tabId: string;
  /** 来源：'broadcast' = 同浏览器广播, 'ws' = WebSocket */
  origin: 'broadcast' | 'ws';
  /** 递增序列号（用于排序和去重） */
  seq: number;
  /** 生成时间戳 */
  timestamp: number;
  /** 事件载荷（具体业务数据） */
  payload: T;
}

/** 事件处理函数 */
export type SyncEventHandler<T = unknown> = (event: SyncEvent<T>) => void;

// ─── 事件总线实现 ───

/** 事件去重窗口（毫秒） */
const DEDUP_WINDOW_MS = 5000;
/** 最多保留的已处理事件 ID 数量 */
const MAX_RECENT_EVENTS = 200;

class SyncEventBus {
  /** 订阅者：事件类型 → 处理函数集合 */
  private subscribers = new Map<SyncEventType, Set<SyncEventHandler>>();
  /** 已处理的事件 ID 集合（防回环 + 去重） */
  private recentEventIds = new Set<string>();
  /** 全局递增序列号 */
  private seq = 0;

  /**
   * 订阅指定类型的事件
   * @param eventType 事件类型
   * @param handler 处理函数
   * @returns 取消订阅函数
   */
  on<T = unknown>(eventType: SyncEventType, handler: SyncEventHandler<T>): () => void {
    if (!this.subscribers.has(eventType)) {
      this.subscribers.set(eventType, new Set());
    }
    this.subscribers.get(eventType)!.add(handler as SyncEventHandler);
    return () => {
      this.subscribers.get(eventType)?.delete(handler as SyncEventHandler);
    };
  }

  /**
   * 发布事件到总线
   *
   * ⚠️ 注意：此方法仅供内部调用。
   * 外部应使用 broadcastSync 或 wsSync 的 send() 方法，
   * 它们会在发送前自动标记事件为"本地发出"以防止回环。
   */
  dispatch<T = unknown>(event: SyncEvent<T>): void {
    // ── 回环防护：跳过本地发出的事件 ──
    const eventId = this.buildEventId(event);
    if (this.recentEventIds.has(eventId)) return;

    // ── 去重：记录已处理的事件 ──
    this.trackEvent(eventId);

    // ── 通知所有订阅者 ──
    const handlers = this.subscribers.get(event.type as SyncEventType);
    if (!handlers?.size) return;

    for (const handler of handlers) {
      try {
        handler(event as SyncEvent<unknown>);
      } catch (err) {
        // 单个 handler 失败不影响其他 handler
        console.error('[SyncEventBus] handler error:', err);
      }
    }
  }

  /**
   * 标记事件为"本地发出"，防止回环
   * 应在通过 BroadcastChannel 或 WebSocket 发送前调用
   */
  markLocal<T = unknown>(event: SyncEvent<T>): string {
    const eventId = this.buildEventId(event);
    this.trackEvent(eventId);
    return eventId;
  }

  /** 获取下一个序列号 */
  nextSeq(): number {
    return ++this.seq;
  }

  /** 清理资源 */
  destroy(): void {
    this.subscribers.clear();
    this.recentEventIds.clear();
    this.seq = 0;
  }

  /** 生成事件唯一 ID */
  private buildEventId(event: SyncEvent): string {
    return `${event.type}:${event.userId}:${event.tabId}:${event.seq}:${event.timestamp}`;
  }

  /** 追踪已处理的事件 ID */
  private trackEvent(eventId: string): void {
    this.recentEventIds.add(eventId);
    // 防止内存泄漏：超出上限时清理一半
    if (this.recentEventIds.size > MAX_RECENT_EVENTS) {
      const arr = Array.from(this.recentEventIds);
      this.recentEventIds.clear();
      // 保留最近的一半
      for (let i = Math.floor(arr.length / 2); i < arr.length; i++) {
        this.recentEventIds.add(arr[i]);
      }
    }
  }
}

/** 全局单例事件总线 */
export const syncEventBus = new SyncEventBus();
