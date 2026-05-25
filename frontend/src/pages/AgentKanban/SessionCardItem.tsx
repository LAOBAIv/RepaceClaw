/**
 * AgentKanban 会话卡片组件
 *
 * 渲染单个会话卡片，包含智能体头像、标题、标签、消息预览、元信息和操作按钮。
 */
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, CheckCircle2, Trash2, RotateCcw, MessageSquare, Clock } from 'lucide-react';
import { useSessionKanbanStore } from '@/stores/sessionKanbanStore';
import { useAgentStore } from '@/stores/agentStore';
import { useConversationStore } from '@/stores/conversation';
import { conversationsApi } from '@/api/conversations';
import type { SessionCardItemProps } from './types';
import { getTagColor, relativeTime } from './utils';

export function SessionCardItem({
  session, col, onDelete, onMoveToDeleted, onRestore,
}: SessionCardItemProps) {
  const navigate = useNavigate();
  const [hovered, setHovered] = useState(false);
  const [statusLoading] = useState(false);
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
          <span
            title={session.id}
            onClick={e => { e.stopPropagation(); navigator.clipboard?.writeText(session.id); }}
            style={{
              fontSize: 10, padding: '1px 6px', borderRadius: 4,
              background: '#f3f4f6', color: '#9ca3af', cursor: 'pointer',
              fontFamily: 'monospace', letterSpacing: 0,
            }}
          >{session.id.substring(0, 8)}…</span>
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
