/**
 * 移动端底部输入区与横向功能栏组件
 *
 * 📱 仅在 ≤ 768px 宽度时渲染，完全不干扰 PC 端页面行为。
 *
 * 功能：
 *  - 横向可滑动功能 tabs（复用 FUNCTION_TABS）
 *  - 底部输入栏：textarea 自动增高、发送按钮、安全区适配
 *  - 点击功能 tab 打开移动端 bottom sheet，复用现有面板组件
 *  - 文件快传：上传入口占位（不破坏 PC 逻辑）
 *
 * Props 说明：
 *  - value / onChange：输入框值与变更回调
 *  - onSend：发送消息回调 (text: string) => void
 *  - onInject：注入文本到输入框回调 (text: string) => void
 *  - activeTab：当前选中的功能 tab 名称（可选，受控模式）
 *  - conversationId：用于 TaskTagPanel 的会话 ID
 *  - taskName：任务/项目名称
 *  - onFileUpload：文件上传回调，未传入时仅显示占位入口
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { Agent } from '@/types';
import {
  ShortcutPanel,
  SkillPanel,
  SchedulePanel,
  TaskTagPanel,
  FUNCTION_TABS,
} from '@/components/workspace';
import { MobileMultiAgentPanel, type FlowNode } from './MobileMultiAgentPanel';
import filesApi, { type FileAsset } from '@/api/files';

/* ── 功能 tab 元数据（图标 emoji + 颜色）── */
const TAB_ICONS: Record<string, string> = {
  '消息渠道': '🔗',
  '快捷指令': '⚡',
  '技能应用': '✨',
  '定时任务': '⏰',
  '多智能体': '🤖',
  '文件快传': '📁',
  '任务标签': '🏷️',
};

/* ── Props 定义 ── */
export interface MobileBottomComposerProps {
  /** 输入框当前值（非受控时可不传） */
  value?: string;
  /** 输入框值变更回调 */
  onChange?: (value: string) => void;
  /** 发送消息回调 */
  onSend: (text: string) => void;
  /** 注入文本到输入框 */
  onInject?: (text: string) => void;
  /** 切换会话智能体 */
  onSwitchAgent?: (agentId: string, agentName: string, agentColor: string) => void;
  /** 当前功能 tab（受控模式，可选） */
  activeTab?: string | null;
  /** 会话 ID，用于 TaskTagPanel */
  conversationId?: string;
  /** 任务/项目名称 */
  taskName?: string;
  /** 文件上传回调，未传入时显示占位入口 */
  onFileUpload?: (file: File) => void;
  /** 自定义占位符文本 */
  placeholder?: string;
  /** 当前可选智能体列表 */
  agents?: Agent[];
  /** 当前激活智能体 */
  currentAgentId?: string;
  /** 当前会话参与的智能体 */
  currentAgentIds?: string[];
  /** 协作节点（外部受控） */
  collabNodes?: FlowNode[];
  /** 协作节点 setter（外部受控） */
  setCollabNodes?: React.Dispatch<React.SetStateAction<FlowNode[]>>;
  /** 是否项目协作模式 */
  isProject?: boolean;
}

/**
 * MobileBottomComposer
 * 移动端底部输入区 + 横向功能栏 + 底部 sheet 弹窗
 *
 * ⚠️ 内部使用 window.innerWidth 检测，≤ 768px 时渲染，否则返回 null。
 *    PC 端页面行为完全不受影响。
 */
export function MobileBottomComposer({
  value: controlledValue,
  onChange: controlledOnChange,
  onSend,
  activeTab: controlledActiveTab,
  conversationId,
  taskName,
  onFileUpload,
  placeholder = '输入消息...',
  onInject,
  onSwitchAgent,
  agents,
  currentAgentId,
  currentAgentIds,
  collabNodes: extCollabNodes,
  setCollabNodes: extSetCollabNodes,
  isProject,
}: MobileBottomComposerProps) {
  /* ── 受控 / 非受控输入值 ── */
  const [internalValue, setInternalValue] = useState('');
  /* ── 协作流程节点状态（外部未传入时内部管理） ── */
  const [collabNodesInternal, setCollabNodesInternal] = useState<FlowNode[]>(
    extCollabNodes || [{ id: `fn_${Date.now()}_0`, name: '', nodeType: 'serial' as const, agentIds: [], desc: '' }]
  );

  const isControlled = controlledValue !== undefined;
  const inputValue = isControlled ? controlledValue : internalValue;
  const setInputValue = useCallback(
    (v: string) => {
      if (!isControlled) setInternalValue(v);
      controlledOnChange?.(v);
    },
    [isControlled, controlledOnChange],
  );

  /* ── 移动端检测 ── */
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth <= 768;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  /* ── Sheet 状态 ── */
  const [openSheet, setOpenSheet] = useState(false);
  const [activeSheetTab, setActiveSheetTab] = useState<string | null>(
    controlledActiveTab ?? null,
  );

  useEffect(() => {
    if (controlledActiveTab !== undefined) {
      setActiveSheetTab(controlledActiveTab);
    }
  }, [controlledActiveTab]);

  /* ── 文件上传状态 ── */
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<FileAsset[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);

  /* ── 加载已上传文件列表 ── */
  useEffect(() => {
    if (conversationId) {
      filesApi.list(undefined, conversationId).then(files => {
        setUploadedFiles(files);
      }).catch(err => {
        console.error('[MobileBottomComposer:loadFiles]', err);
      });
    }
  }, [conversationId]);

  /* ── 文件上传处理 ── */
  const handleFileUpload = useCallback(async (file: File) => {
    if (!conversationId) {
      setUploadError('缺少会话 ID，无法上传');
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      setUploadError('文件大小超过 50MB 限制');
      return;
    }

    setUploading(true);
    setUploadError(null);
    setUploadProgress(`正在上传 ${file.name}...`);

    try {
      // 转换为 base64
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64 = (reader.result as string).split(',')[1];
          const uploaded = await filesApi.upload({
            fileName: file.name,
            mimeType: file.type || 'application/octet-stream',
            base64,
            conversationId,
          });
          setUploadedFiles(prev => [...prev, uploaded]);
          setUploadProgress(`${file.name} 上传成功`);
          setUploading(false);
          // 清除成功提示
          setTimeout(() => setUploadProgress(null), 3000);
        } catch (uploadErr: any) {
          console.error('[MobileBottomComposer:upload]', uploadErr);
          setUploadError(uploadErr.message || '上传失败');
          setUploading(false);
          setUploadProgress(null);
        }
      };
      reader.onerror = () => {
        setUploadError('文件读取失败');
        setUploading(false);
        setUploadProgress(null);
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      console.error('[MobileBottomComposer:uploadOuter]', err);
      setUploadError(err.message || '上传失败');
      setUploading(false);
      setUploadProgress(null);
    }
  }, [conversationId]);

  /* ── Refs ── */
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  /* ── Textarea 自动增高 ── */
  const autoResize = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 150) + 'px';
  }, []);

  useEffect(() => {
    autoResize();
  }, [inputValue, autoResize]);

  /* ── 发送消息 ── */
  const handleSend = useCallback(() => {
    const text = inputValue.trim();
    if (!text) return;
    onSend(text);
    setInputValue('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  }, [inputValue, onSend, setInputValue]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  /* ── 功能 Tab 点击 ── */
  const handleTabClick = useCallback(
    (tab: string) => {
      if (tab === '消息渠道') {
        // 消息渠道不弹 sheet，仅占位提示
        return;
      }
      setActiveSheetTab(tab);
      setOpenSheet(true);
    },
    [],
  );

  /* ── Sheet 关闭 ── */
  const closeSheet = useCallback(() => {
    setOpenSheet(false);
    setActiveSheetTab(null);
  }, []);

  /* ── 注入文本（来自面板按钮）── */
  const handleInject = useCallback(
    (text: string) => {
      setInputValue(text);
      closeSheet();
      // 聚焦输入框
      setTimeout(() => textareaRef.current?.focus(), 200);
    },
    [setInputValue, closeSheet],
  );

  /* ── 不在移动端，不渲染任何内容 ── */
  if (!isMobile) return null;

  return (
    <>
      {/* ══════════ 底部功能栏 + 输入区 ══════════ */}
      <div style={styles.bottomContainer}>
        {/* ── 横向可滚动功能 tabs ── */}
        <div style={styles.tabsRow}>
          {FUNCTION_TABS.filter(t => t !== '消息渠道').map((tab) => {
            const icon = TAB_ICONS[tab] || '•';
            return (
              <button
                key={tab}
                onClick={() => handleTabClick(tab)}
                style={styles.tabBtn}
              >
                <span style={styles.tabIcon}>{icon}</span>
                <span style={styles.tabLabel}>{tab}</span>
              </button>
            );
          })}
        </div>

        {/* ── 输入栏 ── */}
        <div style={styles.inputBar}>
          <textarea
            ref={textareaRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            rows={1}
            style={styles.textarea}
          />
          <button
            onClick={handleSend}
            disabled={!inputValue.trim()}
            style={{
              ...styles.sendBtn,
              opacity: inputValue.trim() ? 1 : 0.4,
            }}
            aria-label="发送"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path
                d="M22 2L11 13"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M22 2L15 22L11 13L2 9L22 2Z"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
        {/* 底部安全区 */}
        <div style={styles.safeArea} />
      </div>

      {/* ══════════ 底部 Sheet 弹窗 ══════════ */}
      {openSheet && (
        <div
          style={styles.sheetOverlay}
          onClick={(e) => {
            if (e.target === e.currentTarget) closeSheet();
          }}
        >
          <div ref={sheetRef} style={styles.sheetContent}>
            {/* Sheet 头部 */}
            <div style={styles.sheetHeader}>
              <div style={styles.sheetTitle}>
                {activeSheetTab && TAB_ICONS[activeSheetTab] && (
                  <span style={{ marginRight: 6 }}>
                    {TAB_ICONS[activeSheetTab]}
                  </span>
                )}
                {activeSheetTab}
              </div>
              <button onClick={closeSheet} style={styles.sheetCloseBtn} aria-label="关闭">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M18 6L6 18M6 6L18 18"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>

            {/* Sheet 内容区 */}
            <div style={styles.sheetBody}>
              {renderSheetContent(
                activeSheetTab,
                handleInject,
                onSend,
                conversationId,
                taskName,
                fileInputRef,
                handleFileUpload,
                uploading,
                uploadProgress,
                uploadError,
                uploadedFiles,
                agents,
                currentAgentId,
                currentAgentIds,
                collabNodesInternal,
                setCollabNodesInternal,
                isProject,
                onSwitchAgent,
              )}
            </div>
          </div>
        </div>
      )}

      {/* Sheet 弹出动画 */}
      <style>{`
        @keyframes sheetSlideUp {
          from { transform: translateY(100%); }
          to   { transform: translateY(0); }
        }
        @keyframes sheetFadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </>
  );
}

/* ── 渲染 Sheet 内容（复用现有面板）── */
function renderSheetContent(
  tab: string | null,
  onInject: (text: string) => void,
  onSend: (text: string) => void,
  conversationId?: string,
  taskName?: string,
  fileInputRef?: React.RefObject<HTMLInputElement>,
  onFileUpload?: (file: File) => void,
  uploading?: boolean,
  uploadProgress?: string | null,
  uploadError?: string | null,
  uploadedFiles?: FileAsset[],
  agents?: any[],
  currentAgentId?: string,
  currentAgentIds?: string[],
  collabNodesInternal?: any[],
  setCollabNodesInternal?: React.Dispatch<React.SetStateAction<any[]>>,
  isProject?: boolean,
  onSwitchAgent?: (agentId: string, agentName: string, agentColor: string) => void,
) {
  switch (tab) {
    case '快捷指令':
      return <ShortcutPanel taskName={taskName} onInject={onInject} />;

    case '技能应用':
      return <SkillPanel taskName={taskName} onInject={onInject} />;

    case '定时任务':
      return (
        <SchedulePanel
          onFillInput={onInject}
          onSend={(text) => {
            onInject(text);
            setTimeout(() => onSend(text), 50);
          }}
        />
      );

    case '多智能体':
      return (
        <MobileMultiAgentPanel
          agents={agents || []}
          currentAgentId={currentAgentId}
          currentAgentIds={currentAgentIds}
          collabNodes={collabNodesInternal}
          setCollabNodes={setCollabNodesInternal}
          isProject={isProject}
          onInject={onInject}
          onSwitchAgent={onSwitchAgent}
        />
      );

    case '文件快传':
      return (
        <div style={{ padding: '4px 0' }}>
          {/* 上传入口 */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv,.pdf,.docx,.md,.txt,.json"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file && onFileUpload) {
                onFileUpload(file);
              }
              e.target.value = '';
            }}
          />
          {/* 上传状态提示 */}
          {uploadProgress && (
            <div style={{
              padding: '12px 16px', marginBottom: 12,
              background: '#262626', borderRadius: 8,
              fontSize: 13, color: '#6366f1', textAlign: 'center',
            }}>
              {uploadProgress}
            </div>
          )}
          {uploadError && (
            <div style={{
              padding: '12px 16px', marginBottom: 12,
              background: 'rgba(239,68,68,0.1)', borderRadius: 8,
              fontSize: 13, color: '#ef4444', textAlign: 'center',
            }}>
              {uploadError}
            </div>
          )}
          {/* 上传按钮 */}
          <div
            style={styles.uploadArea}
            onClick={() => !uploading && fileInputRef?.current?.click()}
          >
            {uploading ? (
              <div style={{ textAlign: 'center' }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="1.5" style={{ marginBottom: 8, animation: 'spin 1s linear infinite' }}>
                  <circle cx="12" cy="12" r="10" strokeOpacity="0.3" />
                  <path d="M12 2a10 10 0 0 1 10 10" />
                </svg>
                <div style={{ fontSize: 13, color: '#a3a3a3', fontWeight: 500 }}>上传中...</div>
              </div>
            ) : (
              <>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="1.5" style={{ marginBottom: 8 }}>
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                <div style={{ fontSize: 13, color: '#a3a3a3', fontWeight: 500 }}>点击选择文件</div>
                <div style={{ fontSize: 12, color: '#737373', marginTop: 4 }}>支持 Excel、PDF、Word、TXT、JSON，最大 50MB</div>
              </>
            )}
          </div>
          {/* 已上传文件列表 */}
          {uploadedFiles && uploadedFiles.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 12, color: '#737373', marginBottom: 8 }}>已上传文件</div>
              {uploadedFiles.map(f => (
                <div key={f.id} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 12px', marginBottom: 6,
                  background: '#262626', borderRadius: 8,
                }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="1.5">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                  <div style={{ flex: 1, fontSize: 13, color: '#f5f5f5' }}>{f.originalName}</div>
                  <div style={{ fontSize: 11, color: '#737373' }}>{Math.round(f.sizeBytes / 1024)} KB</div>
                </div>
              ))}
            </div>
          )}
        </div>
      );

    case '任务标签':
      return (
        <TaskTagPanel
          conversationId={conversationId}
          taskName={taskName}
        />
      );

    default:
      return (
        <div style={styles.placeholderContent}>
          <p style={{ fontSize: 13, color: '#737373' }}>功能开发中...</p>
        </div>
      );
  }
}

/* ── 样式定义 ── */
const styles: Record<string, React.CSSProperties> = {
  /* 底部容器 */
  bottomContainer: {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    background: '#1a1a1a',
    borderTop: '1px solid #3a3a40',
    boxShadow: '0 -2px 12px rgba(0,0,0,0.15)',
  },

  /* 横向 tabs */
  tabsRow: {
    display: 'flex',
    gap: 8,
    overflowX: 'auto',
    WebkitOverflowScrolling: 'touch',
    scrollbarWidth: 'none',
    msOverflowStyle: 'none',
    padding: '8px 10px 6px',
    background: 'linear-gradient(180deg, #222228 0%, #1a1a1a 100%)',
    borderBottom: '1px solid #3a3a40',
    whiteSpace: 'nowrap',
  },

  /* 单个 tab 按钮 */
  tabBtn: {
    display: 'inline-flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    flexShrink: 0,
    minWidth: 'max-content',
    padding: '7px 12px',
    border: '1px solid #4a4a50',
    background: 'linear-gradient(135deg,#2a2a30 0%,#222228 100%)',
    cursor: 'pointer',
    borderRadius: 14,
    transition: 'all 0.18s',
    boxShadow: '0 2px 6px rgba(0,0,0,0.12)',
  },

  tabIcon: {
    fontSize: 14,
    lineHeight: 1,
    flexShrink: 0,
  },

  tabLabel: {
    fontSize: 12,
    color: '#e5e5e5',
    whiteSpace: 'nowrap',
    fontWeight: 500,
  },

  /* 输入栏 */
  inputBar: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: 8,
    padding: '10px 12px 12px',
    background: '#1a1a1a',
  },

  /* 输入框 */
  textarea: {
    flex: 1,
    minHeight: 52,
    maxHeight: 160,
    padding: '12px 14px',
    border: '1.2px solid #3a3a40',
    borderRadius: 16,
    fontSize: 15,
    fontFamily: '"Microsoft YaHei", "Segoe UI", sans-serif',
    color: '#f5f5f5',
    lineHeight: 1.5,
    resize: 'none',
    outline: 'none',
    boxSizing: 'border-box',
    background: 'linear-gradient(180deg,#1f1f23,#262630)',
    transition: 'border-color 0.15s, background 0.15s, box-shadow 0.15s',
    boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.12)',
  },

  /* 发送按钮 */
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    border: 'none',
    background: 'linear-gradient(135deg,#666,#888)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    flexShrink: 0,
    transition: 'opacity 0.15s, transform 0.1s',
    boxShadow: '0 6px 16px rgba(102,102,102,0.2)',
  },

  /* 安全区 */
  safeArea: {
    height: 'env(safe-area-inset-bottom, 0px)',
    background: '#1a1a1a',
  },

  /* Sheet 遮罩 */
  sheetOverlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 200,
    background: 'rgba(0,0,0,0.4)',
    backdropFilter: 'blur(3px)',
    WebkitBackdropFilter: 'blur(3px)',
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'center',
    animation: 'sheetFadeIn 0.2s ease',
  },

  /* Sheet 内容 */
  sheetContent: {
    width: '100%',
    maxWidth: '100%',
    maxHeight: '75vh',
    background: '#1a1a1a',
    borderRadius: '16px 16px 0 0',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    animation: 'sheetSlideUp 0.25s cubic-bezier(0.34,1.4,0.64,1)',
  },

  /* Sheet 头部 */
  sheetHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 16px 12px',
    borderBottom: '1px solid #3a3a40',
    flexShrink: 0,
  },

  sheetTitle: {
    fontSize: 15,
    fontWeight: 700,
    color: '#f5f5f5',
    display: 'flex',
    alignItems: 'center',
  },

  sheetCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    border: 'none',
    background: '#262626',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    color: '#a3a3a3',
    transition: 'background 0.15s, color 0.15s',
  },

  /* Sheet 内容区 */
  sheetBody: {
    flex: 1,
    overflowY: 'auto',
    WebkitOverflowScrolling: 'touch',
    padding: '16px',
    paddingBottom: 'calc(16px + env(safe-area-inset-bottom, 0px))',
    background: '#1a1a1a',
  },

  /* 文件上传区 */
  uploadArea: {
    border: '2px dashed #4a4a50',
    borderRadius: 12,
    padding: '24px 16px',
    textAlign: 'center',
    cursor: 'pointer',
    background: '#262626',
    transition: 'border-color 0.15s, background 0.15s',
  },

  /* 占位内容 */
  placeholderContent: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '24px 16px',
    textAlign: 'center',
    background: '#1a1a1a',
  },

  placeholderBtn: {
    marginTop: 12,
    padding: '8px 20px',
    borderRadius: 8,
    border: '1.5px solid #6366f1',
    background: '#262626',
    color: '#6366f1',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: '"Microsoft YaHei", "Segoe UI", sans-serif',
  },
};

export default MobileBottomComposer;
