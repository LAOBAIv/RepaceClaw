/**
 * 任务标签面板组件
 * 为会话建立标签，方便整理和搜索
 * 支持预设标签快速选择 + 自定义标签输入
 * 
 * ⚡ 标签按 conversationId 隔离，不同会话独立
 */

import React, { useState, useRef, useEffect } from 'react';
import { getTagColor } from './TagPanel';

// 预设任务标签
const TASK_PRESET_TAGS = ['进行中', '待完成', '紧急', '重要', '日常', '项目', '会议', '调研', '测试', 'Bug修复'];

interface TaskTagPanelProps {
  conversationId?: string;
  taskName?: string;
}

function getStorageKey(conversationId: string): string {
  return `repaceclaw-session-tags-${conversationId}`;
}

function loadSessionTags(conversationId: string): string[] {
  try {
    const saved = localStorage.getItem(getStorageKey(conversationId));
    return saved ? JSON.parse(saved) : [];
  } catch { return []; }
}

function saveSessionTags(conversationId: string, tags: string[]) {
  localStorage.setItem(getStorageKey(conversationId), JSON.stringify(tags));
}

export function TaskTagPanel({ conversationId }: TaskTagPanelProps) {
  const [localTags, setLocalTags] = useState<string[]>(() =>
    conversationId ? loadSessionTags(conversationId) : []
  );
  const [tagInput, setTagInput] = useState('');
  const tagInputRef = useRef<HTMLInputElement>(null);

  // 切换会话时重新加载标签
  useEffect(() => {
    if (conversationId) {
      setLocalTags(loadSessionTags(conversationId));
    }
  }, [conversationId]);

  useEffect(() => {
    tagInputRef.current?.focus();
  }, []);

  function addTag(raw: string) {
    const t = raw.trim();
    if (!t || !conversationId || localTags.includes(t)) return;
    const next = [...localTags, t];
    setLocalTags(next);
    saveSessionTags(conversationId, next);
  }

  function removeTag(tag: string) {
    if (!conversationId) return;
    const next = localTags.filter(t => t !== tag);
    setLocalTags(next);
    saveSessionTags(conversationId, next);
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

  if (!conversationId) {
    return (
      <div style={{ textAlign: 'center', fontSize: 12, color: '#9ca3af', padding: 20 }}>
        请先选择一个会话
      </div>
    );
  }

  return (
    <div style={{ fontFamily: '"Microsoft YaHei","Segoe UI",sans-serif' }}>
      {/* 说明 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 7, marginBottom: 14,
        padding: '9px 12px', background: '#f0fdf4', borderRadius: 8,
        border: '1px solid #bbf7d0',
      }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
          <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
          <line x1="7" y1="7" x2="7.01" y2="7"/>
        </svg>
        <span style={{ fontSize: 12, color: '#16a34a', lineHeight: 1.5 }}>
          标签仅对当前会话生效，添加后可在会话列表中快速筛选
        </span>
      </div>

      {/* 已选标签展示区 */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 7, alignContent: 'flex-start',
        minHeight: 52, marginBottom: 16, padding: '10px 12px',
        background: '#fafafa', border: '1.5px solid #e5e7eb', borderRadius: 10,
        transition: 'border-color 0.15s',
      }} onClick={() => tagInputRef.current?.focus()}>
        {localTags.length === 0 ? (
          <span style={{ fontSize: 12, color: '#d1d5db', lineHeight: '24px', userSelect: 'none' }}>
            点击下方预设标签或输入自定义标签
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

      {/* 预设任务标签 */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600, letterSpacing: '0.04em', marginBottom: 8 }}>
          预设标签
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {TASK_PRESET_TAGS.map(pt => {
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

      {/* 统计信息 */}
      {localTags.length > 0 && (
        <div style={{
          marginTop: 12, display: 'flex', alignItems: 'center', gap: 7,
          padding: '8px 12px', background: '#f3f4f6', borderRadius: 8,
          fontSize: 12, color: '#6b7280',
        }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <span>当前会话已添加 <b style={{ color: '#374151' }}>{localTags.length}</b> 个标签</span>
        </div>
      )}
    </div>
  );
}
