import { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  Bot, Layers,
  ChevronLeft, ChevronRight, Settings, Network, Sparkles, PlusCircle, Wrench, Puzzle, ShieldCheck, Library, LogOut, MessageCircle,
  User, Mail, Shield, ChevronDown, Copy, Check,
} from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { getOrCreateTabId, clearAllSessionData, clearAllRcStorage } from '../../lib/storageScope';
// Plan C: 接入点 1 — sync 模块生命周期管理
import { getBroadcastSync, destroyBroadcastSync, getWsSync, destroyWsSync, syncEventBus } from '../../lib/sync';
import { getWsInstance } from '../../stores/conversationStore';
import { useSessionKanbanStore } from '../../stores/sessionKanbanStore';
import { useTaskStore } from '../../stores/taskStore';
import { useProjectKanbanStore } from '../../stores/projectKanbanStore';
import { useConversationStore } from '../../stores/conversationStore';

/* ─── 页面标题映射 ─────────────────────────────────────────── */
const PAGE_TITLE_MAP: Record<string, string> = {
  '/login': '登录',
  '/workspace': '工作台',
  '/agents': '智能体管理',
  '/agent-library': '智能体库',
  '/agent-create': '创建智能体',
  '/console': '项目协作',
  '/kanban': '会话列表',
  '/admin': '系统管理',
  '/skill-settings': '技能设置',
  '/plugin-settings': '插件设置',
};

const NAV_ITEMS = [
  { to: '/workspace',      icon: Sparkles,   label: 'RepaceClaw',  exact: false },
  { to: '/agent-library',  icon: Library,    label: 'Agent 模板库', exact: false },
  { to: '/agent-create',   icon: PlusCircle, label: '智能体创建',   exact: false },
  { to: '/agents',         icon: Bot,        label: '智能体管理',   exact: false },
  { to: '/console',        icon: Network,    label: '项目协作',     exact: false },
  { to: '/skill-settings', icon: Wrench,     label: '技能设置',     exact: false },
  { to: '/plugin-settings',icon: Puzzle,     label: '插件设置',     exact: false },
  { to: '/kanban',         icon: Layers,     label: '会话列表',     exact: false },
];

/* ─── 当前项目信息（可替换为真实数据源） ──────────────────────── */
const CURRENT_PROJECT = {
  name: 'RepaceClaw智能体平台',
  phase: '开发阶段',
};

/* ─── 顶部用户信息栏 ────────────────────────────────────────── */
const ROLE_LABEL: Record<string, string> = {
  super_admin: '超级管理员',
  admin: '管理员',
  user: '普通用户',
};

function UserHeader() {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const [showMenu, setShowMenu] = useState(false);
  const [tabId, setTabId] = useState<string>('');
  const [copied, setCopied] = useState(false);

  // 初始化 tabId
  useEffect(() => {
    setTabId(getOrCreateTabId());
  }, []);

  // 复制 tabId 到剪贴板
  const handleCopyTabId = () => {
    navigator.clipboard.writeText(tabId);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (!user) return null;

  return (
    <div style={{
      minHeight: 46, flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 16px',
      background: 'transparent',
      borderBottom: 'none',
    }}>
      {/* 左侧留空：不再显示用户名，避免顶栏出现多余身份文案 */}
      <div />

      {/* 右侧：用户信息入口 */}
      <div style={{ position: 'relative' }}>
        <button
          onClick={() => setShowMenu(v => !v)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '3px 10px 3px 3px',
            borderRadius: 20,
            border: '1px solid #e5e7eb',
            background: showMenu ? '#f9fafb' : '#fff',
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
        >
          <div style={{
            width: 24, height: 24, borderRadius: '50%',
            background: 'linear-gradient(135deg, #6366f1, #3b82f6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: 12, fontWeight: 600,
          }}>
            {(user.username || 'U').charAt(0).toUpperCase()}
          </div>
          {/* 顶栏只保留头像入口，不再显示用户名，减少横向占用和视觉干扰 */}
          <ChevronDown size={14} color="#9ca3af" />
        </button>

        {/* 下拉菜单 */}
        {showMenu && (
          <>
            {/* 点击外部关闭 */}
            <div
              style={{ position: 'fixed', inset: 0, zIndex: 999 }}
              onClick={() => setShowMenu(false)}
            />
            <div style={{
              position: 'absolute', top: '100%', right: 0, marginTop: 8,
              width: 240,
              background: '#fff',
              borderRadius: 12,
              border: '1px solid #e5e7eb',
              boxShadow: '0 10px 40px rgba(0,0,0,0.1)',
              zIndex: 1000,
              overflow: 'hidden',
            }}>
              {/* 用户信息卡片：顶部结构与 Logo 区完全同模板 */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '16px 14px',
                justifyContent: 'flex-start',
                flexShrink: 0,
                background: 'transparent',
              }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{
                    fontWeight: 700,
                    fontSize: 13,
                    color: 'var(--text-primary)',
                    lineHeight: 1.25,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}>
                    {user.username}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                    {ROLE_LABEL[user.role] || user.role}
                  </div>
                </div>
              </div>

              {/* 详细信息 */}
              <div style={{
                padding: '10px 14px 8px',
                background: 'transparent',
                borderTop: '1px solid rgba(148, 163, 184, 0.12)',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%',
                    background: 'linear-gradient(135deg, #6366f1, #3b82f6)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', fontSize: 14, fontWeight: 600,
                    flexShrink: 0,
                  }}>
                    {(user.username || 'U').charAt(0).toUpperCase()}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#6b7280', minWidth: 0 }}>
                    <Mail size={12} style={{ flexShrink: 0 }} />
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.email || '-'}</span>
                  </div>
                </div>
                {user.id && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#9ca3af' }}>
                    <Shield size={11} style={{ flexShrink: 0 }} />
                    <span style={{ fontFamily: 'monospace' }}>ID: {user.id.slice(0, 8)}...</span>
                  </div>
                )}
                {/* Plan C: Tab ID 显示 */}
                {tabId && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#9ca3af' }}>
                    <span style={{ fontFamily: 'monospace' }}>Tab: {tabId.slice(0, 12)}...</span>
                    <button
                      onClick={handleCopyTabId}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        padding: 2,
                        display: 'flex',
                        alignItems: 'center',
                      }}
                      title="复制 Tab ID"
                    >
                      {copied ? <Check size={10} color="#10b981" /> : <Copy size={10} color="#9ca3af" />}
                    </button>
                  </div>
                )}
              </div>

              {/* 操作菜单 */}
              <div style={{ padding: '4px 0' }}>
                <button
                  onClick={() => {
                    setShowMenu(false);
                    if (confirm('确定要退出登录吗？')) {
                      // Plan C: 清理 sessionStorage（包括 auth / tabId）和 rc: 业务缓存
                      clearAllRcStorage();
                      clearAllSessionData();
                      logout();
                      navigate('/login');
                    }
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    width: '100%', padding: '10px 16px',
                    background: 'transparent', border: 'none',
                    color: '#ef4444', fontSize: 13, cursor: 'pointer',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#fef2f2'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <LogOut size={14} />
                  退出登录
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function AppShell() {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAuthenticated } = useAuthStore();
  const isAdmin = user?.role === 'super_admin' || user?.role === 'admin';

  /* ─── Plan C 接入点 1：sync 生命周期管理 ──────────────────── */
  // 登录成功后初始化 BroadcastChannel + WebSocket 同步
  // 退出登录时销毁所有 sync 资源
  useEffect(() => {
    if (!isAuthenticated || !user?.id) {
      // 未登录：清理残留 sync 实例
      destroyBroadcastSync();
      destroyWsSync();
      return;
    }

    // 1. 初始化 BroadcastChannel 同步（同浏览器多 Tab）
    getBroadcastSync(user.id);

    // 2. 初始化 WebSocket 同步（跨浏览器/跨设备）
    //    复用 conversationStore 的 WS 连接
    getWsSync(() => getWsInstance(), user.id);

    console.log(`[AppShell] Sync initialized for userId: ${user.id.slice(0, 8)}, tabId: ${getOrCreateTabId()}`);

    // 3. 注册同步事件订阅（收到其他 Tab 的事件后刷新本地数据）
    const unsubscribes: (() => void)[] = [];

    // 会话打开/关闭：刷新 session list 看板
    const refreshKanban = () => useSessionKanbanStore.getState().restoreFromPersist();
    unsubscribes.push(syncEventBus.on('session.opened', refreshKanban));
    unsubscribes.push(syncEventBus.on('session.closed', refreshKanban));

    // 会话重命名：更新本地 Tab 标题
    // 关键修复:此前直接调用 renameTab(conversationId, newTitle) 有两个问题:
    //   1) renameTab 参数是 tabId 不是 conversationId,导致 tab 找不到、静默失败
    //   2) renameTab 内部会再次 broadcast sync 事件,可能造成多 Tab 间循环广播
    //   修复方式:从事件载荷中取 tabId,直接更新 store 状态,不调 renameTab
    unsubscribes.push(syncEventBus.on('session.renamed', (event) => {
      const { tabId, newTitle } = event.payload as { tabId: string; newTitle: string };
      if (tabId && newTitle) {
        const store = useConversationStore.getState();
        const tab = store.sessionTabs.find(t => t.id === tabId);
        if (tab) {
          useConversationStore.setState({
            sessionTabs: store.sessionTabs.map(t =>
              t.id === tabId ? { ...t, title: newTitle, previousTitle: t.title !== newTitle ? t.title : t.previousTitle } : t
            ),
          });
        }
      }
    }));

    // 任务更新：刷新 task store
    unsubscribes.push(syncEventBus.on('task.updated', () => {
      useTaskStore.getState().restoreFromPersist();
    }));

    // 项目更新：刷新 project kanban store
    unsubscribes.push(syncEventBus.on('project.updated', () => {
      useProjectKanbanStore.getState().restoreFromPersist();
    }));

    // 清理函数：组件卸载或用户退出时销毁
    return () => {
      unsubscribes.forEach((unsub) => unsub());
      destroyBroadcastSync();
      destroyWsSync();
      syncEventBus.destroy();
    };
  }, [isAuthenticated, user?.id]);

  /* ─── 动态设置页面标题 ─────────────────────────────────────── */
  useEffect(() => {
    if (location.pathname === '/workspace') {
      // 工作台：固定标题
      document.title = 'RepaceClaw智能体平台';
    } else {
      // 其他页面：菜单名在前，平台名在后
      const menuName = PAGE_TITLE_MAP[location.pathname] || '工作台';
      document.title = `${menuName} - RepaceClaw智能体平台`;
    }
  }, [location.pathname]);

  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--body-bg)', overflow: 'hidden' }}>

      {/* ── Sidebar ── */}
      <aside style={{
        width: collapsed ? 60 : 208,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        background: 'transparent',
        transition: 'width 0.25s ease',
        overflow: 'hidden',
      }}>

        {/* ── Logo / 当前项目 ── */}
        <div
          onClick={() => navigate('/')}
          style={{
            minHeight: 46,
            display: 'flex', alignItems: 'center', gap: 8,
            padding: collapsed ? '0' : '0 12px',
            justifyContent: collapsed ? 'center' : 'flex-start',
            cursor: 'pointer', flexShrink: 0,
            boxSizing: 'border-box',
          }}
        >
          {/* 项目名 + 阶段 */}
          {!collapsed && (
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{
                fontWeight: 700, fontSize: 12.5, color: 'var(--text-primary)',
                lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {CURRENT_PROJECT.name}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 0, lineHeight: 1.05 }}>
                {CURRENT_PROJECT.phase}
              </div>
            </div>
          )}
        </div>

        {/* ── Nav ── */}
        <nav style={{ flex: 1, padding: '4px 8px', display: 'flex', flexDirection: 'column', gap: 4, overflowY: 'auto' }}>
          {NAV_ITEMS.map(({ to, icon: Icon, label, exact }) => (
            <NavLink
              key={to}
              to={to}
              end={exact}
              title={collapsed ? label : undefined}
              style={{ textDecoration: 'none' }}
            >
              {({ isActive }) => (
                <div style={{
                  display: 'flex', alignItems: 'center',
                  gap: collapsed ? 0 : 10,
                  justifyContent: collapsed ? 'center' : 'flex-start',
                  padding: '10px 12px',
                  borderRadius: 8,
                  background: isActive ? 'var(--accent-light)' : 'transparent',
                  color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                  fontWeight: isActive ? 600 : 400,
                  fontSize: 13.5,
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  whiteSpace: 'nowrap',
                  letterSpacing: 0.1,
                }}
                  onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = '#f9fafb'; }}
                  onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                >
                  <Icon size={17} style={{ flexShrink: 0, color: isActive ? 'var(--accent)' : 'var(--text-muted)' }} />
                  {!collapsed && label}
                </div>
              )}
            </NavLink>
          ))}
        </nav>

        {/* ── 平台助手入口（所有用户可见） ── */}
        <div style={{ padding: '4px 8px' }}>
          <button
            onClick={() => navigate('/platform-assistant')}
            title={collapsed ? '平台助手' : undefined}
            style={{
              display: 'flex', alignItems: 'center',
              gap: collapsed ? 0 : 10,
              justifyContent: collapsed ? 'center' : 'flex-start',
              padding: '10px 12px',
              borderRadius: 8,
              background: location.pathname === '/platform-assistant'
                ? 'linear-gradient(135deg, rgba(59,130,246,0.2), rgba(99,102,241,0.2))'
                : 'linear-gradient(135deg, rgba(59,130,246,0.12), rgba(99,102,241,0.12))',
              border: '1px solid rgba(99,102,241,0.2)',
              color: '#6366f1',
              fontSize: 13,
              cursor: 'pointer',
              fontWeight: location.pathname === '/platform-assistant' ? 600 : 500,
              width: '100%',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'linear-gradient(135deg, rgba(59,130,246,0.2), rgba(99,102,241,0.2))'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'linear-gradient(135deg, rgba(59,130,246,0.12), rgba(99,102,241,0.12))'; }}
          >
            <MessageCircle size={17} style={{ flexShrink: 0 }} />
            {!collapsed && '平台助手'}
          </button>
        </div>

        {/* ── Bottom ── */}
        <div style={{ padding: '4px 8px 12px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {/* 管理后台入口（仅 admin/super_admin 可见） */}
          {isAdmin && (
            <NavLink to="/admin" style={{ textDecoration: 'none' }}>
              {({ isActive }) => (
                <div style={{
                  display: 'flex', alignItems: 'center',
                  gap: collapsed ? 0 : 10,
                  justifyContent: collapsed ? 'center' : 'flex-start',
                  padding: '9px 10px', borderRadius: 8,
                  background: isActive ? '#fef3c7' : 'transparent',
                  color: isActive ? '#d97706' : '#d97706',
                  fontSize: 13, cursor: 'pointer', fontWeight: 500,
                }}
                  title={collapsed ? '管理后台' : undefined}
                >
                  <ShieldCheck size={16} style={{ flexShrink: 0 }} />
                  {!collapsed && '管理后台'}
                </div>
              )}
            </NavLink>
          )}

          <button
            onClick={() => setCollapsed(!collapsed)}
            style={{
              display: 'flex', alignItems: 'center',
              gap: collapsed ? 0 : 10,
              justifyContent: collapsed ? 'center' : 'flex-start',
              padding: '9px 10px', borderRadius: 8,
              background: 'transparent', border: 'none',
              color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer',
              width: '100%',
            }}
          >
            {collapsed ? <ChevronRight size={16} /> : <><ChevronLeft size={16} /><span>收起</span></>}
          </button>
        </div>
      </aside>

      {/* ── Main ── */}
      <main style={{ flex: 1, minWidth: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {/* ── 顶部用户信息栏 ── */}
        <UserHeader />
        {/*
          关键布局修复：内容页不能自己再按 100vh 计算，否则会把顶部用户栏也算进去，
          首次进入时容易出现底部输入框被顶出页面的问题。
          这里统一给 Outlet 一个可收缩的内容容器，页面内部只需要吃满剩余高度即可。
        */}
        <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
