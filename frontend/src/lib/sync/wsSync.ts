/**
 * wsSync.ts — 方案 C WebSocket 用户级同步控制器
 *
 * 职责：
 * - 复用已有的业务 WebSocket 连接（conversationStore 中的 wsInstance）
 * - 在同一条连接上承载同步事件，不发新连接
 * - 实现多浏览器 / 多设备之间的最终一致同步
 *
 * 协议约定：
 * - 同步事件通过 WebSocket 以 { type: "sync_event", ... } 格式发送
 * - 后端需在 wsHandler.ts 中处理 "sync_event" 消息类型：
 *   1. 解析 userId 并查找该用户的其他连接
 *   2. 将事件转发给其他连接（不发回来源连接）
 * - 前端收到 "sync_event" 后通过 syncEventBus 分发
 *
 * 与 broadcastSync 的关系：
 * - BroadcastChannel：同浏览器多 Tab 同步，延迟极低（毫秒级）
 * - WebSocket sync：跨浏览器 / 跨设备同步，需要后端中转
 * - 两者互补：同浏览器内走 BroadcastChannel，跨浏览器走 WebSocket
 * - 如果同时存在，eventBus 的回环防护会自动处理重复
 *
 * 使用方式：
 *   // 初始化（传入获取 wsInstance 的方法）
 *   const wsSync = createWsSync(() => getWsInstance());
 *
 *   // 发送同步事件
 *   wsSync.send('session.opened', { conversationId: 'xxx' });
 *
 *   // 停止
 *   wsSync.destroy();
 *
 * 后端适配要求（最小改动）：
 * - wsHandler.ts 新增 "sync_event" 消息类型处理
 * - 维护 Map<userId, Set<WebSocket>> 连接池
 * - 收到 sync_event 后转发给同 userId 的其他连接
 */

import { syncEventBus, SyncEvent, SyncEventType } from './eventBus';
import { getOrCreateTabId, getCurrentUserId } from '../storageScope';

/** 获取 WebSocket 实例的方法签名 */
type GetWsInstance = () => WebSocket | null;

/** WebSocket 同步控制器 */
export class WsSync {
  private getWsInstance: GetWsInstance;
  private userId: string;
  private unsubWs: (() => void) | null = null;
  private destroyed = false;

  constructor(userId: string, getWsInstance: GetWsInstance) {
    this.userId = userId;
    this.getWsInstance = getWsInstance;
    this.init();
  }

  /** 初始化 WebSocket 事件监听 */
  private init(): void {
    // 在现有 WebSocket onmessage 上挂载同步事件监听
    // 由于 wsInstance 是 conversationStore 的内部变量，
    // 我们通过轮询 + 事件拦截的方式接入
    console.log(`[WsSync] Initialized for userId: ${this.userId.slice(0, 8)}`);
  }

  /**
   * 处理从 WebSocket 收到的同步事件
   * 应由 wsHandler 或 conversationStore 的 onmessage 调用
   */
  static handleIncomingMessage(data: unknown): void {
    if (typeof data !== 'object' || data === null) return;

    const msg = data as Record<string, unknown>;
    if (msg.type !== 'sync_event') return;

    // 关键修复：这里不能直接把 Record<string, unknown> 断言成 SyncEvent。
    // TS2352 说明编译器认为字段集不充分，且运行时也确实可能收到不完整消息。
    // 因此先做最小字段校验，再组装成明确的 SyncEvent 对象。
    const { type, userId, tabId, seq, timestamp, payload } = msg;
    if (
      typeof type !== 'string' ||
      typeof userId !== 'string' ||
      typeof tabId !== 'string' ||
      typeof seq !== 'number' ||
      typeof timestamp !== 'number'
    ) {
      return;
    }

    const syncEvent: SyncEvent = {
      type: type as SyncEventType,
      userId,
      tabId,
      origin: 'ws',
      seq,
      timestamp,
      payload,
    };

    // 通过事件总线分发（回环防护由 eventBus 内部处理）
    syncEventBus.dispatch(syncEvent);
  }

  /**
   * 发送同步事件到后端，由后端广播给同用户的其他连接
   * @param type 事件类型
   * @param payload 事件载荷
   */
  send<T = unknown>(type: SyncEventType, payload: T): void {
    if (this.destroyed) return;

    const ws = this.getWsInstance();
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      // WebSocket 未连接时静默丢弃，不阻塞主流程
      return;
    }

    const event: SyncEvent<T> = {
      type,
      userId: this.userId,
      tabId: getOrCreateTabId(),
      origin: 'ws',
      seq: syncEventBus.nextSeq(),
      timestamp: Date.now(),
      payload,
    };

    // 标记为本地发出，防止回环
    syncEventBus.markLocal(event);

    // 通过 WebSocket 发送
    ws.send(JSON.stringify({
      type: 'sync_event',
      ...event,
    }));
  }

  /** 停止同步 */
  destroy(): void {
    this.destroyed = true;
    if (this.unsubWs) {
      this.unsubWs();
      this.unsubWs = null;
    }
    console.log(`[WsSync] Destroyed (userId: ${this.userId.slice(0, 8)})`);
  }

  /** 是否已销毁 */
  isDestroyed(): boolean {
    return this.destroyed;
  }
}

/** 全局 WsSync 实例 */
let _instance: WsSync | null = null;

/**
 * 初始化或获取 WsSync 实例
 * @param userId 可选，不传则从 storageScope 自动获取
 * @param getWsInstance 获取当前 WebSocket 实例的方法
 */
export function getWsSync(
  getWsInstance: GetWsInstance,
  userId?: string,
): WsSync | null {
  const resolvedUserId = userId || getCurrentUserId();
  if (!resolvedUserId) return null;

  if (_instance && !_instance.isDestroyed()) {
    return _instance;
  }

  _instance = new WsSync(resolvedUserId, getWsInstance);
  return _instance;
}

/** 销毁全局实例（退出登录时调用） */
export function destroyWsSync(): void {
  if (_instance) {
    _instance.destroy();
    _instance = null;
  }
}
