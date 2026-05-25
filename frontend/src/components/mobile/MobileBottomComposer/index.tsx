/**
 * 移动端底部输入区与横向功能栏组件 - 主入口
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
import { FUNCTION_TABS } from '@/components/workspace';
import filesApi from '@/api/files';
import { TAB_ICONS } from './constants';
import type { MobileBottomComposerProps } from './types';
import { renderSheetContent } from './renderSheetContent';
import { styles } from './styles';

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
  placeholder = '输入消息...',
  onSwitchAgent,
  agents,
  currentAgentId,
  currentAgentIds,
  collabNodes: extCollabNodes,
  isProject,
}: MobileBottomComposerProps) {
  /* ── 受控 / 非受控输入值 ── */
  const [internalValue, setInternalValue] = useState('');
  /* ── 协作流程节点状态（外部未传入时内部管理） ── */
  const [collabNodesInternal, setCollabNodesInternal] = useState(
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
  const [uploadedFiles, setUploadedFiles] = useState([]);
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
        } catch (uploadErr: unknown) { // [2026-05-24] 类型安全
          console.error('[MobileBottomComposer:upload]', uploadErr);
          setUploadError((uploadErr as Error).message || '上传失败');
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
    } catch (err: unknown) { // [2026-05-24] 类型安全
      console.error('[MobileBottomComposer:uploadOuter]', err);
      setUploadError((err as Error).message || '上传失败');
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

export default MobileBottomComposer;
