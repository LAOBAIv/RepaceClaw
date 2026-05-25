/**
 * MessageBubble — 单条消息气泡组件
 *
 * 职责：渲染单条聊天消息，支持 Markdown 渲染、代码高亮、流式输出光标、
 * 用户/AI 消息样式区分。从原 ProjectWorkspace.tsx 拆分。
 */
// [2026-05-18] 从 ProjectWorkspace.tsx 拆分出消息气泡组件
import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { SyntaxHighlighter, oneLight } from '@/lib/syntaxHighlight';
import { Message } from '@/types';

// [2026-05-24] 类型安全
interface CodeProps {
  node?: unknown;
  inline?: boolean;
  className?: string;
  children?: React.ReactNode;
}

interface MessageBubbleProps {
  msg: Message;
  isStreaming: boolean;
  agentName: string;
  agentColor: string;
  modelName?: string;
  metaTime: string;
}

/**
 * 单条消息气泡渲染组件
 * 从 ProjectWorkspace 消息列表中抽出，减少主文件体积
 */
export function MessageBubble({
  msg, isStreaming, agentName, agentColor, modelName, metaTime,
}: MessageBubbleProps) {
  const metaLabel = msg.role === 'user' ? '你' : agentName;

  return (
    <div className={`workspace-message-row ${msg.role === 'user' ? 'is-user' : 'is-agent'}`} style={{
      display: 'flex',
      justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
      marginBottom: 12,
    }}>
      <div className="workspace-message-wrap" style={{ maxWidth: '72%' }}>
        <div className="workspace-message-meta" style={{
          display: 'flex',
          justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
          alignItems: 'center',
          gap: 6,
          marginBottom: 4,
          fontSize: 11,
          color: '#9ca3af',
        }}>
          <span style={{ color: msg.role === 'user' ? '#6b7280' : (agentColor || '#6b7280'), fontWeight: 600 }}>
            {metaLabel}
          </span>
          {msg.role !== 'user' && modelName && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 2,
              padding: '1px 6px', borderRadius: 8,
              background: '#f3f4f6', border: '1px solid #e5e7eb',
              fontSize: 10, color: '#6b7280', fontWeight: 500,
            }}>
              {modelName}
            </span>
          )}
          {metaTime && <span>{metaTime}</span>}
        </div>
        <div className="workspace-message-bubble" style={{
          maxWidth: '100%', padding: '8px 14px',
          borderRadius: msg.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
          background: msg.role === 'user' ? '#2a3b4d' : '#f3f4f6',
          color: msg.role === 'user' ? '#fff' : '#1a202c',
          fontSize: 13, lineHeight: 1.6,
          wordBreak: 'break-word',
          overflowWrap: 'break-word',
        }}>
          {msg.content ? (
            <div className={`markdown-body${msg.role === 'user' ? ' bubble-dark' : ''}`} style={{ ...(msg.role === 'user' ? { color: '#fff' } : {}) }}>
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  code: (codeProps) => { // [2026-05-24] 类型安全
                    const { inline, className, children, ...props } = codeProps as CodeProps;
                    const match = /language-(\w+)/.exec(className || '');
                    const language = match ? match[1] : 'text';
                    if (inline) {
                      return <code className={className} {...props}>{children}</code>;
                    }
                    return (
                      <SyntaxHighlighter
                        style={oneLight}
                        language={language}
                        PreTag="div"
                        {...props}
                      >
                        {String(children).trimEnd()}
                      </SyntaxHighlighter>
                    );
                  }
                }}
              >
                {msg.content}
              </ReactMarkdown>
              {isStreaming && (
                <span style={{ display: 'inline-block', marginLeft: 4, opacity: 0.7, color: '#8c6fff', fontWeight: 700 }}>|</span>
              )}
            </div>
          ) : (
            <span style={{ opacity: 0.45 }}>{isStreaming ? '正在生成...' : '●●●'}</span>
          )}
        </div>
      </div>
    </div>
  );
}
