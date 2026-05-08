import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Zap, Search, X, Calendar, MessageSquare, Clock, Loader2, CheckCircle2, Trash2, RotateCcw,
} from 'lucide-react';
import { useSessionKanbanStore, type SessionCard, type SessionColumn } from '@/stores/sessionKanbanStore';
import { useAgentStore } from '@/stores/agentStore';
import { useConversationStore } from '@/stores/conversationStore';
import { conversationsApi } from '@/api/conversations';

/* ══════════════════════════════════════════════════════════════
   列配置
══════════════════════════════════════════════════════════════ */
const COL_CONFIG: Record<SessionColumn, { label: string; color: string; bg: string; icon: typeof Loader2 | typeof CheckCircle2 | typeof Trash2 }> = {
  progress: { label: '进行中', color: '#f59e0b', bg: '#fffbeb', icon: Loader2 },
  done:     { label: '已完成', icon: CheckCircle2, color: '#22c55e', bg: '#f0fdf4' },
  deleted:  { label: '已删除', icon: Trash2, color: '#ef4444', bg: '#fef2f2' },
};

const TAG_COLOR_POOL = [
  { bg: '#eff6ff', border: '#bfdbfe', text: '#1d4ed8' },
  { bg: '#f0fdf4', border: '#bbf7d0', text: '#15803d' },
  { bg: '#fdf4ff', border: '#e9d5ff', text: '#7c3aed' },
  { bg: '#fff7ed', border: '#fed7aa', text: '#c2410c' },
  { bg: '#fef2f2', border: '#fecaca', text: '#b91c1c' },
];

function getTagColor(tag: string) {
  let h = 0;
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) >>> 0;
  return TAG_COLOR_POOL[h % TAG_COLOR_POOL.length];
}

/* ══════════════════════════════════════════════════════════════
   相对时间格式化
══════════════════════════════════════════════════════════════ */
function relativeTime(dateStr: string): string {
  try {
    const now = new Date();
    const date = new Date(dateStr);
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
    if (diff < 60) return '刚刚';
    if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}天前`;
    return date.toLocaleDateString('zh-CN');
  } catch {
    return dateStr;
  }
}

/* ══════════════════════════════════════════════════════════════
   会话卡片
══════════════════════════════════════════════════════════════ */
function SessionCardItem({
  session, col, onDelete, onMoveToDeleted, onRestore,
}: {
  session: SessionCard;
  col: SessionColumn;
  onDelete: () => void;
  onMoveToDeleted: () => void;
  onRestore: () => void;
}) {
  const navigate = useNavigate();
  const [hovered, setHovered] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);
  const { agents } = useAgentStore();
  const createSessionTab = useConversationStore(s => s.createSessionTab);

  // 按 session.id 读取该会话专属标签
  const [sessionTags, setSessionTags] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(`repaceclaw-session-tags-${session.id}`);
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  useEffect(() => {
    const loadTags = () => {
      try {
        const saved = localStorage.getItem(`repaceclaw-session-tags-${session.id}`);
        setSessionTags(saved ? JSON.parse(saved) : []);
      } catch { setSessionTags([]); }
    };
    loadTags();
    const interval = setInterval(loadTags, 500);
    return () => clearInterval(interval);
  }, [session.id]);

  // 解析智能体名称（通过 agentStore 查找）
  const businessAgentId = session.currentAgentId || session.agentIds?.[0] || '';
  const agent = agents.find(a => a.id === businessAgentId);
  const agentName = agent?.name || session.agentName || '未知智能体';
  const agentColor = agent?.color || session.agentColor || '#6366f1';

  /** 标记完成 / 重新打开 */
  const toggleStatus = async () => {
    const nextStatus = col === 'progress' ? 'completed' : 'in_progress';
    try {
      await conversationsApi.updateStatus(session.id, nextStatus);
      // API 成功后直接重新拉取最新数据，确保 UI 与后端一致
      const { restoreFromPersist } = useSessionKanbanStore.getState();
      await restoreFromPersist();
    } catch (err) {
      console.error('[toggleStatus] 失败:', err);
    }
  };
  const openSession = async () => {
    // 不再传 forceNewTab，store 层的 createSessionTab 已有 conversationId 去重检查
    const precreatedTabId = await createSessionTab({
      agentId: businessAgentId,
      agentName,
      agentColor,
      title: session.title,
      conversationId: session.id,
    });

    navigate('/workspace', {
      state: {
        projectName: session.title,
        sessionId: session.id,
        agentNames: agent ? [agent.name] : [],
        precreatedTabId,
        navNonce: Date.now(),
      },
    });
  };

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative',
        display: 'flex', alignItems: 'flex-start', gap: 14,
        padding: '14px 16px 14px 20px',
        background: '#fff',
        border: `1px solid ${hovered ? '#b0b0b0' : '#e5e5e5'}`,
        borderRadius: 12,
        boxShadow: hovered ? '0 2px 10px rgba(0,0,0,0.05)' : 'none',
        transition: 'border-color 0.15s, box-shadow 0.15s',
        userSelect: 'none',
      }}
    >
      {/* 智能体 Avatar */}
      <div
        onClick={() => { void openSession(); }}
        style={{
          width: 40, height: 40, borderRadius: 10, flexShrink: 0,
          background: agentColor + '22',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: agentColor, fontSize: 15, fontWeight: 700, cursor: 'pointer',
        }}
      >{agentName.charAt(0)}</div>

      {/* 信息区 */}
      <div
        onClick={() => { void openSession(); }}
        style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}
      >
        {/* 标题行 */}
        <div style={{ fontSize: 14, fontWeight: 600, color: '#333', marginBottom: 4 }}>
          <span>{session.title}</span>
        </div>

        {/* 任务标签 */}
        {sessionTags.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
            {sessionTags.map(tag => {
              const c = getTagColor(tag);
              return (
                <span key={tag} style={{
                  display: 'inline-flex', alignItems: 'center',
                  fontSize: 10, padding: '1px 6px', borderRadius: 10,
                  background: c.bg, color: c.text, border: `1px solid ${c.border}`,
                  fontWeight: 500, lineHeight: 1.6,
                }}>
                  {tag}
                </span>
              );
            })}
          </div>
        )}

        {/* 最后一条消息 */}
        <div style={{
          fontSize: 13, color: '#666', lineHeight: 1.5, marginBottom: 8,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{session.lastMessage}</div>

        {/* 底部元信息 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: '#9ca3af', flexWrap: 'wrap' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <MessageSquare size={11} /> {session.messageCount} 条消息
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Clock size={11} /> {relativeTime(session.createdAt)}
          </span>
          <span style={{
            fontSize: 11, padding: '1px 7px', borderRadius: 4,
            background: agentColor + '15', color: agentColor,
          }}>{agentName}</span>
        </div>
      </div>

      {/* 操作按钮 */}
      <div
        style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}
        onClick={e => e.stopPropagation()}
      >
        {/* 标记完成 / 重新打开 */}
        <button
          onClick={(e) => { e.stopPropagation(); void toggleStatus(); }}
          disabled={statusLoading}
          title={col === 'progress' ? '标记完成' : '重新打开'}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 28, height: 28, borderRadius: 6, border: '1px solid',
            borderColor: col === 'progress' ? '#bbf7d0' : '#bfdbfe',
            background: col === 'progress' ? '#f0fdf4' : '#eff6ff',
            color: col === 'progress' ? '#22c55e' : '#2563eb',
            cursor: statusLoading ? 'wait' : 'pointer',
            opacity: statusLoading ? 0.6 : 1,
            transition: 'background 0.12s, border-color 0.12s',
          }}
          onMouseEnter={e => {
            if (col === 'progress') e.currentTarget.style.background = '#dcfce7';
            else e.currentTarget.style.background = '#dbeafe';
          }}
          onMouseLeave={e => {
            if (col === 'progress') e.currentTarget.style.background = '#f0fdf4';
            else e.currentTarget.style.background = '#eff6ff';
          }}
        >
          {statusLoading ? (
            <Loader2 size={12} className="animate-spin" />
          ) : col === 'progress' ? (
            <CheckCircle2 size={12} />
          ) : (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
            </svg>
          )}
        </button>
        {/* 进入会话 */}
        <button
          onClick={() => { void openSession(); }}
          title="进入会话"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 28, height: 28, borderRadius: 6, border: '1px solid #bfdbfe',
            background: '#eff6ff', color: '#2563eb', cursor: 'pointer',
            transition: 'background 0.12s, border-color 0.12s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = '#dbeafe'; }}
          onMouseLeave={e => { e.currentTarget.style.background = '#eff6ff'; }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        </button>

        {col === 'deleted' ? (
          <>
            {/* 已删除栏：恢复 + 彻底删除 */}
            <button
              onClick={(e) => { e.stopPropagation(); onRestore(); }}
              title="恢复会话"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 28, height: 28, borderRadius: 6, border: '1px solid #bbf7d0',
                background: '#f0fdf4', color: '#22c55e', cursor: 'pointer',
                transition: 'background 0.12s, border-color 0.12s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#dcfce7'; }}
              onMouseLeave={e => { e.currentTarget.style.background = '#f0fdf4'; }}
            >
              <RotateCcw size={12} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              title="彻底删除（不可恢复）"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 28, height: 28, borderRadius: 6, border: '1px solid #fecaca',
                background: '#fff5f5', color: '#ef4444', cursor: 'pointer',
                transition: 'background 0.12s, border-color 0.12s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#fee2e2'; }}
              onMouseLeave={e => { e.currentTarget.style.background = '#fff5f5'; }}
            >
              <Trash2 size={12} />
            </button>
          </>
        ) : (
          /* 进行中/已完成栏：移入已删除 */
          <button
            onClick={(e) => { e.stopPropagation(); onMoveToDeleted(); }}
            title="移入已删除"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 28, height: 28, borderRadius: 6, border: '1px solid #fecaca',
              background: '#fff5f5', color: '#ef4444', cursor: 'pointer',
              transition: 'background 0.12s, border-color 0.12s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#fee2e2'; }}
            onMouseLeave={e => { e.currentTarget.style.background = '#fff5f5'; }}
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   主页面：会话列表
══════════════════════════════════════════════════════════════ */
export function AgentKanban() {
  const navigate = useNavigate();
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
  const Icon = cfg.icon;

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
