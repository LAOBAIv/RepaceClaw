/**
 * sync/ — 方案 C 同步模块统一入口
 *
 * 模块结构：
 * - eventBus.ts      全局同步事件总线（发布/订阅 + 回环防护）
 * - broadcastSync.ts  BroadcastChannel 同浏览器多 Tab 同步
 * - wsSync.ts         WebSocket 跨浏览器/跨设备同步
 *
 * 使用方式：
 *   import { syncEventBus, getBroadcastSync, getWsSync } from '@/lib/sync';
 */

export { syncEventBus } from './eventBus';
export type { SyncEvent, SyncEventType, SyncEventHandler } from './eventBus';

export { BroadcastSync, getBroadcastSync, destroyBroadcastSync } from './broadcastSync';

export { WsSync, getWsSync, destroyWsSync } from './wsSync';
