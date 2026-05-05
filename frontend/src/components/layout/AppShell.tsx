import { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  Bot, Layers,
  ChevronLeft, ChevronRight, Settings, Network, Sparkles, PlusCircle, Wrench, Puzzle, ShieldCheck, Library, LogOut, MessageCircle,
  User, Mail, Shield, ChevronDown,
} from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';

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
  const menuRef = useState<HTMLDivElement | null>(null)[1];

  if (!user) return null;

  return (
    <div style={{
      height: 44, flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 20px',
      background: '#fff',
      borderBottom: '1px solid #f0f0f0',
    }}>
      {/* 左侧：当前页面路径提示 */}
      <div style={{ fontSize: 12, color: '#9ca3af' }}>
        {user.username}
      </div>

      {/* 右侧：用户信息入口 */}
      <div style={{ position: 'relative' }} ref={(el) => (menuRef as any) = el}>
        <button
          onClick={() => setShowMenu(v => !v)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '4px 12px 4px 4px',
            borderRadius: 20,
            border: '1px solid #e5e7eb',
            background: showMenu ? '#f9fafb' : '#fff',
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
        >
          {/* 头像 */}
          <div style={{
            width: 26, height: 26, borderRadius: '50%',
            background: 'linear-gradient(135deg, #6366f1, #3b82f6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: 12, fontWeight: 600,
          }}>
            {(user.username || 'U').charAt(0).toUpperCase()}
          </div>
          <span style={{ fontSize: 13, color: '#1f2937', fontWeight: 500 }}>{user.username}</span>
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
              {/* 用户信息卡片 */}
              <div style={{ padding: '16px', background: 'linear-gradient(135deg, #f0f0ff, #f0f7ff)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%',
                    background: 'linear-gradient(135deg, #6366f1, #3b82f6)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', fontSize: 16, fontWeight: 600,
                  }}>
                    {(user.username || 'U').charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14, color: '#1f2937' }}>{user.username}</div>
                    <div style={{
                      fontSize: 11, padding: '1px 6px', borderRadius: 4,
                      background: user.role === 'super_admin' ? '#fef3c7' : user.role === 'admin' ? '#eff6ff' : '#f3f4f6',
                      color: user.role === 'super_admin' ? '#d97706' : user.role === 'admin' ? '#2563eb' : '#6b7280',
                      display: 'inline-block', marginTop: 2,
                    }}>
                      {ROLE_LABEL[user.role] || user.role}
                    </div>
                  </div>
                </div>
                {/* 详细信息 */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#6b7280' }}>
                    <Mail size={12} />
                    <span>{user.email || '-'}</span>
                  </div>
                  {user.id && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#9ca3af' }}>
                      <Shield size={11} />
                      <span style={{ fontFamily: 'monospace' }}>ID: {user.id.slice(0, 8)}...</span>
                    </div>
                  )}
                </div>
              </div>

              {/* 操作菜单 */}
              <div style={{ padding: '4px 0' }}>
                <button
                  onClick={() => {
                    setShowMenu(false);
                    if (confirm('确定要退出登录吗？')) {
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
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === 'super_admin' || user?.role === 'admin';

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
            display: 'flex', alignItems: 'center', gap: 10,
            padding: collapsed ? '20px 0' : '16px 14px',
            justifyContent: collapsed ? 'center' : 'flex-start',
            cursor: 'pointer', flexShrink: 0,
          }}
        >
          {/* 项目名 + 阶段 */}
          {!collapsed && (
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{
                fontWeight: 700, fontSize: 13, color: 'var(--text-primary)',
                lineHeight: 1.25, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {CURRENT_PROJECT.name}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
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
        <Outlet />
      </main>
    </div>
  );
}
