/**
 * broadcastSync.ts — 方案 C 同浏览器多 Tab 同步控制器
 *
 * 职责：
 * - 使用 BroadcastChannel 实现同一浏览器内同账号多 Tab 之间的状态同步
 * - 频道名由 storageScope.getSyncChannel(userId) 生成，格式: rc-sync-{userId}
 * - 与 syncEventBus 对接，事件发出/接收均通过总线
 *
 * 关键规则：
 * - 仅在用户已登录（有 userId）时激活
 * - 用户退出登录时必须销毁，避免串号
 * - 自身发出的事件标记为本地事件，eventBus 内部会做回环防护
 * - 不同账号的 Tab 不会互相收到广播（频道名含 userId）
 *
 * 使用方式：
 *   // 初始化（登录成功后调用）
 *   const bc = createBroadcastSync(userId);
 *
 *   // 发送同步事件
 *   bc.send('session.opened', { conversationId: 'xxx' });
 *
 *   // 停止（退出登录时调用）
 *   bc.destroy();
 */

import { syncEventBus, SyncEvent, SyncEventType } from './eventBus';
import { getSyncChannel, getOrCreateTabId, getCurrentUserId } from '../storageScope';

/** BroadcastChannel 同步控制器 */
export class BroadcastSync {
  private channel: BroadcastChannel | null = null;
  private userId: string;
  private destroyed = false;

  constructor(userId: string) {
    this.userId = userId;
    this.init();
  }

  /** 初始化 BroadcastChannel */
  private init(): void {
    if (typeof BroadcastChannel === 'undefined') {
      // 不支持 BroadcastChannel 的环境（如 Safari < 15）静默降级
      console.warn('[BroadcastSync] BroadcastChannel not supported, sync disabled');
      return;
    }

    const channelName = getSyncChannel(this.userId);
    this.channel = new BroadcastChannel(channelName);
    console.log(`[BroadcastSync] Joined channel: ${channelName}`);

    this.channel.onmessage = (event: MessageEvent) => {
      if (this.destroyed) return;
      const syncEvent = event.data as SyncEvent;

      // 基础校验
      if (!syncEvent?.type || !syncEvent?.userId || syncEvent.userId !== this.userId) {
        return;
      }

      // 通过事件总线分发（回环防护由 eventBus 内部处理）
      syncEventBus.dispatch({
        ...syncEvent,
        origin: 'broadcast',
      });
    };
  }

  /**
   * 发送同步事件到同浏览器其他 Tab
   * @param type 事件类型
   * @param payload 事件载荷
   */
  send<T = unknown>(type: SyncEventType, payload: T): void {
    if (this.destroyed || !this.channel) return;

    const event: SyncEvent<T> = {
      type,
      userId: this.userId,
      tabId: getOrCreateTabId(),
      origin: 'broadcast',
      seq: syncEventBus.nextSeq(),
      timestamp: Date.now(),
      payload,
    };

    // 标记为本地发出，防止回环
    syncEventBus.markLocal(event);

    // 广播到同频道其他 Tab
    this.channel.postMessage(event);
  }

  /** 停止同步，释放资源 */
  destroy(): void {
    this.destroyed = true;
    if (this.channel) {
      this.channel.close();
      this.channel = null;
    }
    console.log(`[BroadcastSync] Destroyed (userId: ${this.userId.slice(0, 8)})`);
  }

  /** 是否已销毁 */
  isDestroyed(): boolean {
    return this.destroyed;
  }
}

/**
 * 全局 BroadcastSync 实例
 * 通过 getBroadcastSync() 获取，通过 initBroadcastSync(userId) 初始化
 */
let _instance: BroadcastSync | null = null;

/**
 * 初始化或获取 BroadcastSync 实例
 * @param userId 可选，如果不传则从 storageScope 自动获取
 */
export function getBroadcastSync(userId?: string): BroadcastSync | null {
  const resolvedUserId = userId || getCurrentUserId();
  if (!resolvedUserId) return null;

  // 如果已有实例且 userId 匹配，直接返回
  if (_instance && !_instance.isDestroyed()) {
    return _instance;
  }

  // 创建新实例
  _instance = new BroadcastSync(resolvedUserId);
  return _instance;
}

/** 销毁全局实例（退出登录时调用） */
export function destroyBroadcastSync(): void {
  if (_instance) {
    _instance.destroy();
    _instance = null;
  }
}
