/**
 * AgentKanban 主页面组件
 *
 * 会话列表看板，包含 Tab 切换、搜索过滤、会话卡片渲染。
 */
import { useState, useEffect } from 'react';
import {
  Zap, Search, X, Loader2, CheckCircle2, Trash2,
} from 'lucide-react';
import { useSessionKanbanStore, type SessionCard, type SessionColumn } from '@/stores/sessionKanbanStore';
import { useAgentStore } from '@/stores/agentStore';
import { COL_CONFIG } from './constants';
import { SessionCardItem } from './SessionCardItem';

export function AgentKanban() {
  const [activeTab, setActiveTab] = useState<SessionColumn>('progress');
  const [searchText, setSearchText] = useState('');

  const { sessions, loading, error, restoreFromPersist, removeSession, updateSessionStatus } = useSessionKanbanStore();
  const { fetchAgents } = useAgentStore();

  // 挂载时：拉取 agents + 会话列表
  useEffect(() => {
    fetchAgents();
    restoreFromPersist();
  }, [fetchAgents, restoreFromPersist]);

  // 过滤
  const hasFilter = !!searchText;
  function filterSession(s: SessionCard) {
    if (!searchText) return true;
    const kw = searchText.toLowerCase();
    return s.title.toLowerCase().includes(kw) ||
      s.agentName.toLowerCase().includes(kw) ||
      s.lastMessage.toLowerCase().includes(kw);
  }

  const progressSessions = (sessions.progress || []).filter(filterSession);
  const doneSessions = (sessions.done || []).filter(filterSession);
  const deletedSessions = (sessions.deleted || []).filter(filterSession);

  const tabs = [
    { key: 'progress' as SessionColumn, label: '进行中', icon: Loader2, count: progressSessions.length, color: '#f59e0b' },
    { key: 'done' as SessionColumn, label: '已完成', icon: CheckCircle2, count: doneSessions.length, color: '#22c55e' },
    { key: 'deleted' as SessionColumn, label: '已删除', icon: Trash2, count: deletedSessions.length, color: '#ef4444' },
  ];

  const currentSessions = activeTab === 'progress' ? progressSessions : activeTab === 'deleted' ? deletedSessions : doneSessions;
  const cfg = COL_CONFIG[activeTab];

  return (
    <div style={{
      width: '100%', height: '100%', background: '#f5f7fa',
      padding: 16, boxSizing: 'border-box', display: 'flex', flexDirection: 'column',
      fontFamily: '"Microsoft YaHei", "Segoe UI", sans-serif',
    }}>
      <div style={{
        flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column',
        background: '#fafbfc', border: '1px solid #e5e6eb',
        borderRadius: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.05)', overflow: 'hidden',
      }}>

        {/* ── Header ── */}
        <div style={{
          padding: '16px 32px', minHeight: 58, borderBottom: '1px solid #e5e6eb',
          background: '#fff', flexShrink: 0, boxSizing: 'border-box',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Zap size={18} color="#2a3b4d" />
            <span style={{ fontWeight: 700, fontSize: 16, color: '#1a202c' }}>会话列表</span>
            {loading && <Loader2 size={14} className="animate-spin" color="#9ca3af" />}
          </div>
          <div style={{ position: 'relative' }}>
            <Search size={13} color="#9ca3af" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
            <input
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              placeholder="搜索会话..."
              style={{
                width: 200, padding: '7px 30px 7px 30px', fontSize: 13,
                border: '1px solid #e5e7eb', borderRadius: 8, outline: 'none',
                boxSizing: 'border-box', color: '#374151',
                background: searchText ? '#f0f9ff' : '#f9fafb',
                borderColor: searchText ? '#3b82f6' : '#e5e7eb',
                fontFamily: '"Microsoft YaHei","Segoe UI",sans-serif',
              }}
            />
            {searchText && (
              <button onClick={() => setSearchText('')} style={{
                position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer', padding: 0,
              }}><X size={12} color="#9ca3af" /></button>
            )}
          </div>
        </div>

        {/* ── Tabs ── */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 0,
          padding: '0 32px', background: '#fff',
          borderBottom: '1px solid #e5e6eb', flexShrink: 0,
        }}>
          {tabs.map(tab => {
            const active = activeTab === tab.key;
            const TabIcon = tab.icon;
            return (
              <button
                key={tab.key}
                onClick={() => { setActiveTab(tab.key); setSearchText(''); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 7,
                  padding: '12px 20px', fontSize: 13, fontWeight: active ? 700 : 500,
                  color: active ? '#2a3b4d' : '#9ca3af',
                  background: 'none', border: 'none', cursor: 'pointer',
                  borderBottom: active ? `2.5px solid ${tab.color}` : '2.5px solid transparent',
                  marginBottom: -1, transition: 'all 0.15s',
                  fontFamily: '"Microsoft YaHei","Segoe UI",sans-serif',
                }}
              >
                <TabIcon size={14} color={active ? tab.color : '#9ca3af'} />
                {tab.label}
                <span style={{
                  fontSize: 11, padding: '1px 7px', borderRadius: 20, fontWeight: 600,
                  background: active ? tab.color + '22' : '#f3f4f6',
                  color: active ? tab.color : '#9ca3af',
                }}>{tab.count}</span>
              </button>
            );
          })}
        </div>

        {/* ── 内容区 ── */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '20px 32px' }}>
          {error && (
            <div style={{
              textAlign: 'center', padding: 20, color: '#ef4444', fontSize: 14,
              background: '#fef2f2', borderRadius: 12, border: '1px solid #fecaca',
            }}>
              ⚠️ 加载失败：{error}
              <button
                onClick={() => restoreFromPersist()}
                style={{ marginLeft: 12, padding: '4px 12px', borderRadius: 6, border: '1px solid #ef4444', background: '#fff', color: '#ef4444', cursor: 'pointer', fontSize: 12 }}
              >重试</button>
            </div>
          )}

          {!loading && !error && currentSessions.length === 0 && (
            <div style={{
              textAlign: 'center', padding: '40px 0', fontSize: 14, color: '#d1d5db',
            }}>
              {hasFilter ? '无匹配会话' : `暂无${cfg.label}会话`}
              {!hasFilter && (
                <div style={{ marginTop: 12, fontSize: 12, color: '#9ca3af' }}>
                  通过对话界面创建新会话
                </div>
              )}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {currentSessions.map(session => (
              <SessionCardItem
                key={session.id}
                session={session}
                col={activeTab}
                onDelete={() => removeSession(session.id)}
                onMoveToDeleted={() => updateSessionStatus(session.id, 'deleted')}
                onRestore={() => updateSessionStatus(session.id, 'in_progress')}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
