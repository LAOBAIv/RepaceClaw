/**
 * 移动端聊天消息区组件
 * 
 * 用途：在 MobileWorkspace 等移动端页面中渲染聊天消息列表。
 * 
 * 移动端优化：
 * - 代码块自动换行（避免长代码左右滑动）
 * - 代码块带复制按钮
 * - 表格在小屏（≤420px）自动切换为竖排卡片视图
 * - 用户消息右侧深色气泡，AI 消息左侧浅色气泡
 */
import React, { useEffect, useLayoutEffect, useRef, useCallback, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

// ── 消息数据类型 ───────────────────────────────────────────
export interface ChatMessage {
  id: string;
  role: 'user' | 'agent';
  content: string;
  agentId?: string;
  createdAt?: string;
  streaming?: boolean;
  agentName?: string;
  agentColor?: string;
  modelName?: string;
}

export interface MobileChatMessagesProps {
  messages: ChatMessage[];
  defaultAgentName?: string;
  defaultAgentColor?: string;
  defaultModelName?: string;
  showAvatar?: boolean;
  showTime?: boolean;
  emptyPlaceholder?: React.ReactNode;
  className?: string;
  /** 当前面板是否活跃（活跃时自动滚到底部） */
  isActive?: boolean;
}

/* ─────────────────────────────────────────────
 * 代码块组件（带复制按钮 + 自动换行）
 * ───────────────────────────────────────────── */
function CodeBlock({ codeText, language, isUser, props }: { codeText: string; language: string; isUser: boolean; props: any }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(codeText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  };
  return (
    <div style={{ margin: '8px 0', borderRadius: '8px', overflow: 'hidden', border: isUser ? '1px solid rgba(255,255,255,0.15)' : '1px solid rgba(255,255,255,0.08)' }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '6px 12px', background: isUser ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.05)',
        fontSize: 11, color: isUser ? '#b0b3bf' : '#888',
      }}>
        <span>{language}</span>
        <button
          onClick={handleCopy}
          style={{
            background: copied ? '#22c55e' : 'rgba(255,255,255,0.1)',
            border: 'none', borderRadius: 4, padding: '3px 10px',
            color: copied ? '#fff' : '#b0b3bf', fontSize: 11, cursor: 'pointer',
          }}
        >
          {copied ? '✓ 已复制' : '复制'}
        </button>
      </div>
      <SyntaxHighlighter
        style={oneDark}
        language={language}
        PreTag="div"
        customStyle={{
          margin: 0, borderRadius: 0, fontSize: 12,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
          overflowWrap: 'break-word',
        }}
        wrapLongLines={true}
        {...props}
      >
        {codeText}
      </SyntaxHighlighter>
    </div>
  );
}

/* ─────────────────────────────────────────────
 * 表格组件（小屏卡片视图 + 兜底横向滚动）
 * ───────────────────────────────────────────── */
function MobileTable({ children, isUser, ...props }: any) {
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const thEls = containerRef.current.querySelectorAll('th');
    const trEls = containerRef.current.querySelectorAll('tbody tr');
    if (thEls.length > 0 && trEls.length > 0) {
      setHeaders(Array.from(thEls).map(th => th.textContent || ''));
      const tableRows: string[][] = [];
      trEls.forEach(tr => {
        const tds = tr.querySelectorAll('td');
        tableRows.push(Array.from(tds).map(td => td.textContent || ''));
      });
      setRows(tableRows);
    }
  }, [children]);

  return (
    <div className="mobile-table-wrapper" ref={containerRef} style={{ margin: '8px 0' }}>
      {/* 兜底：横向滚动表格（>420px 显示） */}
      <div className="mobile-table-scroll" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <table className="mobile-table" {...props}>{children}</table>
      </div>
      {/* 小屏卡片视图（≤420px 显示） */}
      <div className="mobile-table-cards">
        <div className="mobile-table-cards-inner">
          {rows.map((row, i) => (
            <div key={i} className="mobile-table-card">
              {row.map((cell, j) => (
                <div key={j} className="mobile-table-card-row">
                  <span className="mobile-table-card-label">{headers[j]}</span>
                  <span className="mobile-table-card-value">{cell}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
 * Markdown 渲染器
 * ───────────────────────────────────────────── */
function MarkdownContent({ content, isUser }: { content: string; isUser: boolean }) {
  return (
    <div className={`mobile-markdown ${isUser ? 'mobile-markdown-dark' : ''} mobile-chat-content`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ node, inline, className, children, ...rest }: any) {
            const match = /language-(\w+)/.exec(className || '');
            const language = match ? match[1] : 'text';
            if (inline) {
              return <code className={className} {...rest}>{children}</code>;
            }
            return <CodeBlock codeText={String(children).trimEnd()} language={language} isUser={isUser} props={rest} />;
          },
          table({ children, ...rest }: any) {
            return <MobileTable isUser={isUser} {...rest}>{children}</MobileTable>;
          },
          img({ ...rest }: any) {
            return <img {...rest} style={{ maxWidth: '100%', height: 'auto', borderRadius: '6px' }} />;
          },
          pre({ children, ...rest }: any) {
            return (
              <div style={{ overflowX: 'auto', maxWidth: '100%', margin: '8px 0' }}>
                <pre {...rest} style={{ overflowX: 'auto', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                  {children}
                </pre>
              </div>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

/* ─────────────────────────────────────────────
 * 工具函数
 * ───────────────────────────────────────────── */
function formatMessageTime(value?: string): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

function getInitial(name?: string): string {
  if (!name) return 'A';
  return name.charAt(0);
}

/* ─────────────────────────────────────────────
 * 单条消息行
 * ───────────────────────────────────────────── */
function MobileMessageRow({
  msg, defaultAgentName, defaultAgentColor, defaultModelName, showAvatar, showTime,
}: {
  msg: ChatMessage;
  defaultAgentName?: string;
  defaultAgentColor?: string;
  defaultModelName?: string;
  showAvatar?: boolean;
  showTime?: boolean;
}) {
  const isUser = msg.role === 'user';
  const isStreaming = Boolean(msg.streaming);
  const agentName = msg.agentName || (msg.role === 'agent' ? defaultAgentName : undefined) || (msg.role === 'user' ? '你' : '智能体');
  const agentColor = msg.agentColor || defaultAgentColor || '#6366f1';
  const modelName = msg.modelName || defaultModelName;
  const timeStr = formatMessageTime(msg.createdAt);

  return (
    <div style={{ marginBottom: 12, textAlign: isUser ? 'right' : 'left' }}>
      <div style={{ 
        display: 'inline-block',
        width: isUser ? undefined : '96%',
        maxWidth: isUser ? '96%' : undefined,
        padding: isUser ? '8px 16px 8px 10px' : '8px 16px',
        borderRadius: isUser ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
        background: isUser ? '#2a3b4d' : '#1a1a1a', 
        color: isUser ? '#fff' : '#f5f5f5',
        fontSize: 13, 
        lineHeight: 1.6, 
        wordBreak: 'break-word', 
        overflowWrap: 'break-word',
        textAlign: 'left',
      }}>
        {!isUser && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: agentColor }}>{agentName}</span>
            {modelName && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', padding: '1px 6px', borderRadius: 8,
                background: '#2a2a30', border: '1px solid #4a4a50', fontSize: 10, color: '#b0b3bf', fontWeight: 500,
              }}>{modelName}</span>
            )}
            {showTime !== false && timeStr && <span style={{ fontSize: 10, color: '#b0b3bf' }}>{timeStr}</span>}
          </div>
        )}
        <div>
          {msg.content ? (
            <>
              {isUser ? (
                <span style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</span>
              ) : (
                <MarkdownContent content={msg.content} isUser={false} />
              )}
              {isStreaming && (
                <span style={{
                  display: 'inline-block', marginLeft: 4, opacity: 0.7,
                  color: isUser ? '#8c6fff' : '#6366f1', fontWeight: 700,
                  animation: 'mobileCursorBlink 1s step-end infinite',
                }}>|</span>
              )}
            </>
          ) : (
            <span style={{ opacity: 0.45 }}>{isStreaming ? '正在生成...' : '●●●'}</span>
          )}
          </div>
        {isUser && showTime !== false && timeStr && (
          <div style={{ textAlign: 'right', fontSize: 10, color: '#b0b3bf', marginTop: 4, paddingRight: 2 }}>{timeStr}</div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
 * 主组件
 * ───────────────────────────────────────────── */
export function MobileChatMessages({
  messages, defaultAgentName, defaultAgentColor, defaultModelName,
  showAvatar = true, showTime = true, emptyPlaceholder, className,
  isActive = false,
}: MobileChatMessagesProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(0);
  const lastScrollHeightRef = useRef(0);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    const msgCount = messages.length;
    // 移除新消息自动滚动逻辑（用户要求置底后不允许自动移动）
    prevCountRef.current = msgCount;
  }, [messages]);

  // 消息变化时滚到底部
  useEffect(() => {
    if (messages.length > 0 && containerRef.current) {
      // 给浏览器足够时间渲染DOM
      setTimeout(() => {
        if (containerRef.current) {
          containerRef.current.scrollTop = containerRef.current.scrollHeight;
        }
      }, 100);
    }
  }, [messages]);

  // 面板激活时滚到底部（切换会话后 DOM 更新完成再滚动）
  useEffect(() => {
    if (!isActive || messages.length === 0 || !containerRef.current) return;
    requestAnimationFrame(() => {
      if (containerRef.current) {
        containerRef.current.scrollTop = containerRef.current.scrollHeight;
      }
    });
  }, [isActive, messages.length]);

  if (messages.length === 0) {
    return (
      <div ref={containerRef} className={className} style={{
        flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex',
        alignItems: 'flex-start', justifyContent: 'flex-start', flexDirection: 'column',
        gap: 12, color: '#c0c4ce', padding: '20px',
      }}>
        {emptyPlaceholder || (
          <>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <span style={{ fontSize: 13 }}>输入消息与智能体开始对话</span>
          </>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, height: '100%' }}>
      <style>{`
        @keyframes mobileCursorBlink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        .mobile-markdown { word-break: break-word; overflow-wrap: break-word; }
        .mobile-markdown p { margin: 4px 0; line-height: 1.6; }
        .mobile-markdown h1, .mobile-markdown h2, .mobile-markdown h3, .mobile-markdown h4 {
          margin: 10px 0 6px; font-weight: 700; line-height: 1.4;
        }
        .mobile-markdown h1 { font-size: 16px; }
        .mobile-markdown h2 { font-size: 15px; }
        .mobile-markdown h3 { font-size: 14px; }
        .mobile-markdown h4 { font-size: 13px; }
        .mobile-markdown ul, .mobile-markdown ol { padding-left: 20px; margin: 6px 0; }
        .mobile-markdown li { margin: 3px 0; }
        .mobile-markdown blockquote {
          border-left: 3px solid #d6dee8;
          background: #f7f9fc;
          padding: 8px 12px;
          color: #5b6472;
          margin: 6px 0;
          border-radius: 0 6px 6px 0;
        }
        .mobile-markdown code {
          background: rgba(255, 255, 255, 0.08); padding: 1px 5px; border-radius: 3px;
          font-size: 12px; font-family: 'Menlo', 'Consolas', monospace; color: #e5e7eb;
        }
        .mobile-markdown pre {
          background: #16181d; border: 1px solid #2d333b; color: #e6edf3;
          padding: 12px; border-radius: 6px; overflow-x: auto; font-size: 12px; margin: 8px 0;
        }
        .mobile-markdown pre code { background: none; padding: 0; color: inherit; }
        .mobile-markdown strong { font-weight: 700; }
        .mobile-markdown em { font-style: italic; }
        .mobile-markdown table {
          border-collapse: collapse; width: 100%; margin: 8px 0; font-size: 12px;
          background: #14161a; color: #e5e7eb;
        }
        .mobile-markdown th, .mobile-markdown td {
          border: 1px solid #30363d; padding: 6px 10px; text-align: left;
          background: #14161a; color: #e5e7eb;
        }
        .mobile-markdown th { background: #1c2128; font-weight: 600; }

        /* 深色背景（用户消息气泡内） */
        .mobile-markdown-dark code { background: rgba(255, 255, 255, 0.15); color: #e0e0e0; }
        .mobile-markdown-dark blockquote {
          border-left-color: rgba(255, 255, 255, 0.28);
          background: rgba(255, 255, 255, 0.10);
          color: rgba(255, 255, 255, 0.88);
        }
        .mobile-markdown-dark pre { background: rgba(255, 255, 255, 0.1); border-color: rgba(255, 255, 255, 0.2); color: #f0f0f0; }
        .mobile-markdown-dark pre code { color: inherit; background: none; }
        .mobile-markdown-dark table,
        .mobile-markdown-dark th,
        .mobile-markdown-dark td {
          background: rgba(255, 255, 255, 0.08); border-color: rgba(255, 255, 255, 0.16); color: #f3f4f6;
        }

        /* 表格响应式：≤420px 切换为竖排卡片 */
        .mobile-table-cards { display: none; }
        @media (max-width: 420px) {
          .mobile-table-scroll { display: none; }
          .mobile-table-cards { display: block; }
        }
        .mobile-table-cards-inner { display: flex; flex-direction: column; gap: 8px; }
        .mobile-table-card {
          background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1);
          border-radius: 8px; padding: 10px 12px;
        }
        .mobile-table-card-row {
          display: flex; justify-content: space-between; padding: 4px 0;
          border-bottom: 1px solid rgba(255,255,255,0.05); font-size: 12px;
        }
        .mobile-table-card-row:last-child { border-bottom: none; }
        .mobile-table-card-label {
          color: #888; font-weight: 600; flex-shrink: 0; margin-right: 8px;
        }
        .mobile-table-card-value {
          color: #e5e5e5; text-align: right; word-break: break-word;
        }
      `}</style>

      <div ref={containerRef} className={className} style={{
        flex: 1, minHeight: 0, overflowY: 'auto', padding: '12px 4px 20px',
        WebkitOverflowScrolling: 'touch',
      }}>
        {messages.map((msg) => (
          <MobileMessageRow
            key={msg.id} msg={msg}
            defaultAgentName={defaultAgentName} defaultAgentColor={defaultAgentColor}
            defaultModelName={defaultModelName}
            showAvatar={showAvatar} showTime={showTime}
          />
        ))}
        <div ref={bottomRef} style={{ height: 6, flexShrink: 0 }} />
      </div>
    </div>
  );
}

export default MobileChatMessages;
