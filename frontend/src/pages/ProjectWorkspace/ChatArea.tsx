/**
 * ChatArea — 对话区 + 消息列表组件
 *
 * 职责：渲染所有 panel 的消息列表（层叠显示，只展示当前激活 panel）。
 * 支持消息折叠（默认显示最近 20 条）、Markdown 渲染、代码高亮、流式输出光标。
 */
import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import type { Agent, Message } from '../../types';
import type { ConversationPanel } from '../../stores/conversation';

// [2026-05-24] 类型安全
interface CodeProps {
  node?: unknown;
  inline?: boolean;
  className?: string;
  children?: React.ReactNode;
}

/**
 * ChatArea — 消息展示区
 *
 * @param openPanels 所有打开的 panel 列表
 * @param activePanel 当前激活的 panel
 * @param agents 智能体列表（用于查找消息对应的智能体信息）
 * @param expandedPanels 已展开的 panel ID 集合
 * @param onExpandPanel 展开面板回调
 * @param welcomeAreaRef 消息容器 ref（用于滚动控制）
 * @param messagesEndRef 底部锚点 ref（用于滚动到底部）
 * @param formatMessageTime 时间格式化函数
 */
export function ChatArea({
  openPanels,
  activePanel,
  agents,
  expandedPanels,
  onExpandPanel,
  welcomeAreaRef,
  messagesEndRef,
  formatMessageTime,
}: {
  openPanels: ConversationPanel[];
  activePanel: ConversationPanel | null;
  agents: Agent[];
  expandedPanels: Set<string>;
  onExpandPanel: (panelId: string) => void;
  welcomeAreaRef: React.RefObject<HTMLDivElement | null>;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  formatMessageTime: (value?: string) => string;
}) {
  const messages = activePanel?.messages ?? [];

  return (
    <div ref={welcomeAreaRef} className={`welcome-area ${messages.length ? 'has-messages' : 'is-empty'}`} style={{ padding: messages.length ? '16px 24px 32px' : 0, position: 'relative' }}>
      {openPanels.map((panel) => {
        const isActivePanel = activePanel?.id === panel.id;
        const panelMessages = panel.messages ?? [];
        return (
          <div
            key={panel.id}
            style={{
              position: isActivePanel ? 'relative' : 'absolute',
              inset: isActivePanel ? 'auto' : 0,
              display: isActivePanel ? 'block' : 'none',
              height: '100%',
              width: '100%',
            }}
          >
            {/* 空状态：无消息时显示欢迎提示 */}
            {panelMessages.length === 0 && (
              <div style={{
                height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexDirection: 'column', gap: 8, color: '#c0c4ce',
              }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
                <span style={{ fontSize: 13 }}>输入消息与智能体开始对话</span>
              </div>
            )}
            {(() => {
              // 消息折叠：默认只显示最近 20 条
              const VISIBLE_COUNT = 20;
              const isExpanded = expandedPanels.has(panel.id);
              const hiddenCount = isExpanded ? 0 : Math.max(0, panelMessages.length - VISIBLE_COUNT);
              const visibleMessages = isExpanded ? panelMessages : panelMessages.slice(-VISIBLE_COUNT);
              return (<>
                {/* 折叠提示：有更多消息时显示展开按钮 */}
                {hiddenCount > 0 && (
                  <div style={{ textAlign: 'center', padding: '12px 0 8px' }}>
                    <button
                      onClick={() => onExpandPanel(panel.id)}
                      style={{
                        fontSize: 12, color: '#6b7280', background: '#f3f4f6',
                        border: '1px solid #e5e7eb', borderRadius: 16,
                        padding: '4px 16px', cursor: 'pointer',
                      }}
                    >
                      ↑ 查看更早的 {hiddenCount} 条消息
                    </button>
                  </div>
                )}
                {/* 消息列表 */}
                {visibleMessages.map((msg: Message) => {
                  const isStreamingMessage = Boolean(msg.streaming || panel.streamingMessageId === msg.id);
                  const msgAgent = msg.role === 'user'
                    ? null
                    : (msg.agentId ? agents.find(a => a.id === msg.agentId) : null) || { name: panel.agentName, color: panel.agentColor, modelName: undefined as string | undefined };
                  const metaLabel = msg.role === 'user' ? '你' : (msgAgent?.name || panel.agentName || '智能体');
                  const metaTime = formatMessageTime(msg.createdAt);

                  return (
                    <div key={msg.id} className={`workspace-message-row ${msg.role === 'user' ? 'is-user' : 'is-agent'}`} style={{
                      display: 'flex',
                      justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                      marginBottom: 12,
                    }}>
                      <div className="workspace-message-wrap" style={{ maxWidth: '72%' }}>
                        {/* 消息元信息：发送者名称 + 模型 + 时间 */}
                        <div className="workspace-message-meta" style={{
                          display: 'flex',
                          justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                          alignItems: 'center',
                          gap: 6,
                          marginBottom: 4,
                          fontSize: 11,
                          color: '#9ca3af',
                        }}>
                          <span style={{ color: msg.role === 'user' ? '#6b7280' : (msgAgent?.color || '#6b7280'), fontWeight: 600 }}>
                            {metaLabel}
                          </span>
                          {msg.role !== 'user' && msgAgent?.modelName && (
                            <span style={{
                              display: 'inline-flex', alignItems: 'center', gap: 2,
                              padding: '1px 6px', borderRadius: 8,
                              background: '#f3f4f6', border: '1px solid #e5e7eb',
                              fontSize: 10, color: '#6b7280', fontWeight: 500,
                            }}>
                              {msgAgent.modelName}
                            </span>
                          )}
                          {metaTime && <span>{metaTime}</span>}
                        </div>
                        {/* 消息气泡 */}
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
                              {/* 流式输出光标 */}
                              {isStreamingMessage && (
                                <span style={{ display: 'inline-block', marginLeft: 4, opacity: 0.7, color: '#8c6fff', fontWeight: 700 }}>|</span>
                              )}
                            </div>
                          ) : (
                            <span style={{ opacity: 0.45 }}>{isStreamingMessage ? '正在生成...' : '●●●'}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </>);
            })()}
            {/* 当前激活 panel 的底部留白 + 滚动锚点 */}
            {isActivePanel && (
              <>
                <div style={{ height: 6, flexShrink: 0 }} />
                <div ref={messagesEndRef} />
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
