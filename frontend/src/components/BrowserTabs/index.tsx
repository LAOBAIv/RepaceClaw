/**
 * 浏览器风格多标签栏组件
 * 
 * 设计：
 * ┌─────────────────────────────────────────────────┐
 * │ 🌐 标签1 × | 🧩 标签2 × | 🧩 标签3 × | + │
 * ├─────────────────────────────────────────────────┤
 * │                                                 │
 * │           【当前激活标签内容区】                  │
 * │                                                 │
 * └─────────────────────────────────────────────────┘
 */

import React, { useCallback, useRef } from 'react';

// ============ 类型定义 ============

export interface BrowserTab {
  /** 标签唯一标识 */
  key: string;
  /** 标签标题 */
  title: string;
  /** 图标（emoji 或 React 节点） */
  icon?: React.ReactNode;
  /** 标签类型 */
  type?: 'page' | 'task' | 'project';
  /** 是否可关闭 */
  closable?: boolean;
  /** 是否固定 */
  fixed?: boolean;
}

export interface BrowserTabsProps {
  /** 标签列表 */
  tabs: BrowserTab[];
  /** 当前激活的标签 key */
  activeKey: string;
  /** 标签切换回调 */
  onChange?: (key: string) => void;
  /** 新增标签回调 */
  onAdd?: () => void;
  /** 关闭标签回调 */
  onClose?: (key: string) => void;
  /** 标签内容渲染函数 */
  renderContent?: (tab: BrowserTab) => React.ReactNode;
  /** 最大标签数 */
  maxTabs?: number;
  /** 容器样式 */
  style?: React.CSSProperties;
}

// ============ 默认图标 ============

const DEFAULT_ICONS: Record<string, React.ReactNode> = {
  page: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.2"/>
      <path d="M5 8L7 10L11 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  task: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.2"/>
      <path d="M5 8L7 10L11 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  project: (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path d="M1.5 3.5C1.5 2.67 2.17 2 3 2H6L7.5 3.5H13C13.83 3.5 14.5 4.17 14.5 5V12.5C14.5 13.33 13.83 14 13 14H3C2.17 14 1.5 13.33 1.5 12.5V3.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
    </svg>
  ),
};

// ============ 主组件 ============

const BrowserTabs: React.FC<BrowserTabsProps> = ({
  tabs,
  activeKey,
  onChange,
  onAdd,
  onClose,
  renderContent,
  maxTabs = 20,
  style,
}) => {
  const tabsRef = useRef<HTMLDivElement>(null);

  // 当前激活的标签
  const activeTab = tabs.find(t => t.key === activeKey) ?? tabs[0];

  // 关闭标签
  const handleClose = useCallback((e: React.MouseEvent, key: string) => {
    e.stopPropagation();
    const tab = tabs.find(t => t.key === key);
    if (tab?.fixed || tab?.closable === false) return;
    onClose?.(key);
  }, [tabs, onClose]);

  // 切换标签
  const handleChange = useCallback((key: string) => {
    onChange?.(key);
  }, [onChange]);

  // 新增标签
  const handleAdd = useCallback(() => {
    if (tabs.length >= maxTabs) return;
    onAdd?.();
  }, [tabs.length, maxTabs, onAdd]);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      overflow: 'hidden',
      ...style,
    }}>
      {/* 标签栏 */}
      <div
        ref={tabsRef}
        style={{
          display: 'flex',
          alignItems: 'center',
          background: 'linear-gradient(180deg, #f8f9fa 0%, #f1f3f4 100%)',
          borderBottom: '1px solid #dadce0',
          padding: '8px 8px 0',
          flexShrink: 0,
          minHeight: 42,
          overflowX: 'auto',
          gap: 2,
        }}
      >
        {/* 标签列表 */}
        {tabs.map((tab) => {
          const isActive = tab.key === activeKey;
          const icon = tab.icon || DEFAULT_ICONS[tab.type || 'page'] || DEFAULT_ICONS.page;
          
          return (
            <div
              key={tab.key}
              onClick={() => handleChange(tab.key)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 12px',
                background: isActive ? '#fff' : 'transparent',
                borderRadius: '8px 8px 0 0',
                border: '1px solid',
                borderColor: isActive ? '#dadce0' : 'transparent',
                borderBottomColor: isActive ? '#fff' : 'transparent',
                cursor: 'pointer',
                minWidth: 120,
                maxWidth: 200,
                flexShrink: 0,
                position: 'relative',
                transition: 'all 0.15s',
                color: '#3c4043',
                fontSize: 13,
                fontWeight: isActive ? 500 : 400,
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = '#e8eaed';
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = 'transparent';
                }
              }}
            >
              {/* 图标 */}
              <span style={{
                display: 'flex',
                alignItems: 'center',
                color: isActive ? '#1a73e8' : '#5f6368',
                flexShrink: 0,
              }}>
                {icon}
              </span>
              
              {/* 标题 */}
              <span style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                flex: 1,
              }}>
                {tab.title}
              </span>
              
              {/* 关闭按钮 */}
              {(tab.closable !== false && !tab.fixed) && (
                <span
                  onClick={(e) => handleClose(e, tab.key)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 18,
                    height: 18,
                    borderRadius: 4,
                    flexShrink: 0,
                    opacity: isActive ? 0.7 : 0.5,
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    e.stopPropagation();
                    e.currentTarget.style.background = '#dadce0';
                    e.currentTarget.style.opacity = '1';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.opacity = isActive ? '0.7' : '0.5';
                  }}
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M2 2L8 8M8 2L2 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </span>
              )}
            </div>
          );
        })}
        
        {/* 新增按钮 */}
        {tabs.length < maxTabs && (
          <button
            onClick={handleAdd}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 32,
              height: 32,
              background: 'transparent',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
              color: '#5f6368',
              flexShrink: 0,
              transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#e8eaed';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
            title="新增标签页"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 2V12M2 7H12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          </button>
        )}
      </div>

      {/* 内容区域 */}
      <div style={{
        flex: 1,
        background: '#fff',
        overflow: 'auto',
        border: '1px solid #dadce0',
        borderTop: 'none',
      }}>
        {renderContent && activeTab ? renderContent(activeTab) : (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: '#9ca3af',
            fontSize: 14,
          }}>
            {tabs.length === 0 ? '暂无标签页，点击 + 新增' : '选择标签查看内容'}
          </div>
        )}
      </div>
    </div>
  );
};

export default BrowserTabs;