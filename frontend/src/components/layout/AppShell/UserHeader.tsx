/**
 * @file UserHeader.tsx
 * @description 顶部用户信息栏组件：头像、下拉菜单、Tab ID 显示、退出登录
 */
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronDown, Copy, Check,
  Mail, Shield, LogOut, Settings,
} from 'lucide-react';
import { useAuthStore } from '../../../stores/authStore';
import { getOrCreateTabId, clearAllSessionData, clearAllRcStorage } from '../../../lib/storageScope';
import { ROLE_LABEL } from './constants';

export function UserHeader() {
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
            {(user.nickname || user.username || 'U').charAt(0).toUpperCase()}
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
                    {user.nickname || user.username}
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
                    {(user.nickname || user.username || 'U').charAt(0).toUpperCase()}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#6b7280', minWidth: 0 }}>
                    <Mail size={12} style={{ flexShrink: 0 }} />
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.email || '-'}</span>
                  </div>
                </div>
                {user.username && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#9ca3af' }}>
                    <Shield size={11} style={{ flexShrink: 0 }} />
                    <span>@{user.username}</span>
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
                {/* [2026-05-17] 修改昵称和密码入口 */}
                <button
                  onClick={() => {
                    setShowMenu(false);
                    navigate('/account');
                  }}
                  style={{
                    width: '100%', padding: '10px 14px',
                    display: 'flex', alignItems: 'center', gap: 8,
                    background: 'transparent', border: 'none',
                    fontSize: 13, color: '#374151', cursor: 'pointer',
                    textAlign: 'left',
                  }}
                  onMouseEnter={(e) => { (e.target as HTMLElement).style.background = '#f3f4f6'; }}
                  onMouseLeave={(e) => { (e.target as HTMLElement).style.background = 'transparent'; }}
                >
                  <Settings size={14} color="#6b7280" />
                  账号设置
                </button>
                <div style={{ height: 1, background: '#f3f4f6', margin: '2px 0' }} />
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
