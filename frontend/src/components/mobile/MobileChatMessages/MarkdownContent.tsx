/**
 * MarkdownContent Markdown 渲染组件
 *
 * 使用 react-markdown + remark-gfm 渲染 Markdown 内容，
 * 自定义 code、table、img、pre 组件以适配移动端样式。
 */
import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CodeBlock } from './CodeBlock';
import { MobileTable } from './MobileTable';

interface MarkdownContentProps {
  content: string;
  isUser: boolean;
}

export function MarkdownContent({ content, isUser }: MarkdownContentProps) {
  return (
    <div className={`mobile-markdown ${isUser ? 'mobile-markdown-dark' : ''} mobile-chat-content`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ inline, className, children, ...rest }: React.ComponentProps<'code'> & { inline?: boolean }) { // [2026-05-24] 类型安全
            const match = /language-(\w+)/.exec(className || '');
            const language = match ? match[1] : 'text';
            if (inline) {
              return <code className={className} {...rest}>{children}</code>;
            }
            return <CodeBlock codeText={String(children).trimEnd()} language={language} isUser={isUser} props={rest} />;
          },
          table({ children, ...rest }: React.ComponentProps<'table'>) { // [2026-05-24] 类型安全
            return <MobileTable isUser={isUser} {...rest}>{children}</MobileTable>;
          },
          img({ ...rest }: React.ComponentProps<'img'>) { // [2026-05-24] 类型安全
            return <img {...rest} style={{ maxWidth: '100%', height: 'auto', borderRadius: '6px' }} />;
          },
          pre({ children, ...rest }: React.ComponentProps<'pre'>) { // [2026-05-24] 类型安全
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
