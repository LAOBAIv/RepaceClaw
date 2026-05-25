import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type UserRole = "super_admin" | "admin" | "user";

export interface AuthUser {
  id: string;
  username: string;
  nickname?: string;
  email: string;
  role: UserRole;
  status: string;
  avatar: string;
}

interface AuthStore {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (user: AuthUser, token: string) => void;
  logout: () => void;
  updateUser: (data: Partial<AuthUser>) => void;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,

      login: (user, token) => {
        set({ user, token, isAuthenticated: true });
      },

      logout: () => {
        // [2026-05-19] 退出时清空前端状态，不再写 localStorage（改用后端 active 状态恢复）
        try {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const { useConversationStore } = require('../stores/conversationStore');
          useConversationStore.setState({
            openPanels: [],
            sessionTabs: [],
            activeTabId: null,
            closedSessionIds: [],
          });
        } catch (e) { console.warn("[RC]", e); }
        set({ user: null, token: null, isAuthenticated: false });
      },

      updateUser: (data) => {
        set((state) => ({
          user: state.user ? { ...state.user, ...data } : null,
        }));
      },
    }),
    {
      name: "repaceclaw-auth",
      // Plan C: 使用 sessionStorage 实现 tab 级隔离
      // 同一浏览器不同 tab 可以登录不同账号，关闭 tab 后自动失效
      storage: createJSONStorage(() => sessionStorage),
    }
  )
);
