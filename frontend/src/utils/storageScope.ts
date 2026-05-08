/**
 * 兼容层：保留原路径，统一转发到 lib/storageScope
 * 避免 Session A / Session B 在不同目录下新增的实现继续分叉
 */

export {
  getScopedKey,
  getSyncChannel,
  clearAllRcStorage,
} from '../lib/storageScope';
