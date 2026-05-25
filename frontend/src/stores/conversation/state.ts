// [2026-05-25] 状态配置 — 从 conversationStore.ts 拆分
import { getCurrentUserId } from "../../lib/storageScope";

// 持久化存储 basename
export const CONV_STORE_BASENAME = 'rc:conv';

/**
 * Plan C: conversationStore 不能在模块加载时把 persist key 算死。
 *
 * 历史回归 BUG(2026-05-06):
 * - 用户首次打开站点时,conversationStore 往往早于 auth 完成初始化
 * - 此时如果直接用 getScopedKey('conv'),会落到 rc:conv:anonymous
 * - 用户登录后继续使用,同一 tab 的会话状态就被写进 anonymous key
 * - 一旦刷新,auth 已存在,store 又会去读 rc:conv:{userId}
 * - 表现出来就是"刷新后会话全丢"
 *
 * 修复方式:
 * - 改成运行时动态 storage key
 * - 优先读 rc:conv:{userId}
 * - 若用户 key 不存在但 anonymous key 存在,则自动迁移到用户 key
 */
export const convPersistStorage = {
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
