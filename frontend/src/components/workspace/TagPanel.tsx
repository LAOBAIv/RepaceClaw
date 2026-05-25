/* eslint-disable react-refresh/only-export-components */
/**
 * 标签管理面板组件
 * 支持添加、删除、预设标签选择
 */

import React, { useState, useRef, useEffect } from 'react';

// 标签颜色池
const TAG_COLOR_POOL: { bg: string; border: string; text: string }[] = [
  { bg: '#eff6ff', border: '#bfdbfe', text: '#1d4ed8' },
  { bg: '#f0fdf4', border: '#bbf7d0', text: '#15803d' },
  { bg: '#fdf4ff', border: '#e9d5ff', text: '#7c3aed' },
  { bg: '#fff7ed', border: '#fed7aa', text: '#c2410c' },
  { bg: '#fef2f2', border: '#fecaca', text: '#b91c1c' },
  { bg: '#ecfdf5', border: '#a7f3d0', text: '#065f46' },
  { bg: '#f0f9ff', border: '#bae6fd', text: '#0369a1' },
  { bg: '#fafaf9', border: '#e7e5e4', text: '#44403c' },
];

// 预设标签
const PRESET_TAGS = ['优先级高', '待跟进', '已完成', '阻塞中', 'Bug', 'Feature', '文档', '重构'];

function getTagColor(tag: string) {
  let h = 0;
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) >>> 0;
  return TAG_COLOR_POOL[h % TAG_COLOR_POOL.length];
}

interface TagPanelProps {
  tags?: string[];
  onAddTag?: (tag: string) => void;
  onRemoveTag?: (tag: string) => void;
  taskName?: string;
}

export function TagPanel({ tags, onAddTag, onRemoveTag, taskName }: TagPanelProps) {
  const [localTags, setLocalTags] = useState<string[]>(tags ?? []);
  const [tagInput, setTagInput] = useState('');
  const tagInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    tagInputRef.current?.focus();
  }, []);

  function addTag(raw: string) {
    const t = raw.trim();
    if (!t || localTags.includes(t)) return;
    const next = [...localTags, t];
    setLocalTags(next);
    onAddTag?.(t);
  }

  function removeTag(tag: string) {
    setLocalTags(prev => prev.filter(t => t !== tag));
    onRemoveTag?.(tag);
  }

  function togglePreset(pt: string) {
    if (localTags.includes(pt)) {
      removeTag(pt);
    } else {
      addTag(pt);
    }
  }

  function commitTag() {
    addTag(tagInput);
    setTagInput('');
  }

  return (
    <div style={{ fontFamily: '"Microsoft YaHei","Segoe UI",sans-serif' }}>
      {/* 已选标签展示区 */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 7, alignContent: 'flex-start',
        minHeight: 52, marginBottom: 16, padding: '10px 12px',
        background: '#fafafa', border: '1.5px solid #e5e7eb', borderRadius: 10,
        transition: 'border-color 0.15s',
      }} onClick={() => tagInputRef.current?.focus()}>
        {localTags.length === 0 ? (
          <span style={{ fontSize: 12, color: '#d1d5db', lineHeight: '24px', userSelect: 'none' }}>
            点击下方标签或输入自定义标签后展示在这里
          </span>
        ) : localTags.map(tag => {
          const c = getTagColor(tag);
          return (
            <span key={tag} style={{
              display: 'inline-flex', alignItems: 'center', gap: 3,
              fontSize: 12, padding: '3px 8px 3px 10px', borderRadius: 20,
              background: c.bg, color: c.text, border: `1px solid ${c.border}`,
              fontWeight: 500, lineHeight: 1.5,
            }}>
              {tag}
              <button
                onClick={e => { e.stopPropagation(); removeTag(tag); }}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  padding: '0 1px', lineHeight: 1, color: c.text,
                  opacity: 0.45, fontSize: 15, display: 'flex', alignItems: 'center',
                  transition: 'opacity 0.12s',
                }}
                onMouseEnter={e => { e.currentTarget.style.opacity = '1'; }}
                onMouseLeave={e => { e.currentTarget.style.opacity = '0.45'; }}
                title="移除此标签"
              >×</button>
            </span>
          );
        })}
      </div>

      {/* 快捷预设标签 */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600, letterSpacing: '0.04em', marginBottom: 8 }}>
          快捷标签
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {PRESET_TAGS.map(pt => {
            const selected = localTags.includes(pt);
            const c = getTagColor(pt);
            return (
              <button
                key={pt}
                onClick={() => togglePreset(pt)}
                style={{
                  padding: '4px 11px', borderRadius: 20, fontSize: 12,
                  border: `1px solid ${selected ? c.border : '#e5e7eb'}`,
                  background: selected ? c.bg : '#fff',
                  color: selected ? c.text : '#6b7280',
                  cursor: 'pointer', fontFamily: '"Microsoft YaHei","Segoe UI",sans-serif',
                  fontWeight: selected ? 600 : 400, transition: 'all 0.12s',
                  display: 'inline-flex', alignItems: 'center', gap: 4, outline: 'none',
                }}
                onMouseEnter={e => {
                  if (!selected) {
                    (e.currentTarget as HTMLButtonElement).style.borderColor = c.border;
                    (e.currentTarget as HTMLButtonElement).style.background = c.bg + 'cc';
                    (e.currentTarget as HTMLButtonElement).style.color = c.text;
                  }
                }}
                onMouseLeave={e => {
                  if (!selected) {
                    (e.currentTarget as HTMLButtonElement).style.borderColor = '#e5e7eb';
                    (e.currentTarget as HTMLButtonElement).style.background = '#fff';
                    (e.currentTarget as HTMLButtonElement).style.color = '#6b7280';
                  }
                }}
              >
                {selected ? (
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ flexShrink: 0 }}>
                    <path d="M1.5 5L4 7.5L8.5 2.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                ) : (
                  <span style={{ fontSize: 12, lineHeight: 1, opacity: 0.5 }}>+</span>
                )}
                {pt}
              </button>
            );
          })}
        </div>
      </div>

      {/* 自定义输入 */}
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          ref={tagInputRef}
          value={tagInput}
          onChange={e => setTagInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commitTag(); } }}
          placeholder="输入自定义标签，Enter 确认"
          style={{
            flex: 1, height: 38, fontSize: 13, padding: '0 14px',
            border: '1.5px solid #e5e7eb', borderRadius: 8, outline: 'none',
            fontFamily: '"Microsoft YaHei","Segoe UI",sans-serif', color: '#374151',
            transition: 'border-color 0.15s', boxSizing: 'border-box',
          }}
          onFocus={e => { e.currentTarget.style.borderColor = '#6366f1'; }}
          onBlur={e => { e.currentTarget.style.borderColor = '#e5e7eb'; }}
        />
        <button
          onClick={commitTag}
          style={{
            height: 38, padding: '0 18px', fontSize: 13, fontWeight: 600,
            border: 'none', borderRadius: 8, background: '#6366f1', color: '#fff',
            cursor: 'pointer', fontFamily: '"Microsoft YaHei","Segoe UI",sans-serif',
            transition: 'background 0.15s', display: 'inline-flex', alignItems: 'center',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = '#4f46e5'; }}
          onMouseLeave={e => { e.currentTarget.style.background = '#6366f1'; }}
        >添加</button>
      </div>

      {/* 项目信息栏 */}
      {taskName && (
        <div style={{
          marginTop: 12, display: 'flex', alignItems: 'center', gap: 7,
          padding: '8px 12px', background: '#f3f4f6', borderRadius: 8,
          fontSize: 12, color: '#6b7280',
        }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <span>标签将同步至项目 <b style={{ color: '#374151' }}>{taskName}</b> 看板列表</span>
        </div>
      )}
    </div>
  );
}

// 导出工具函数供其他组件使用
export { getTagColor, TAG_COLOR_POOL, PRESET_TAGS };