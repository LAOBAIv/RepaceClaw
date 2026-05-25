/**
 * CollabFlow/NodeEditor — 节点编辑器组件
 *
 * 职责：渲染单个流程节点卡片，包括：
 * - 节点 Header（序号、并行标签、名称编辑、上移/下移/删除按钮）
 * - 节点 Body（任务描述输入、智能体分配）
 */
import React from 'react';
import type { Agent } from '@/types';
import type { FlowNode } from '../../types';

/* ── NodeCard Props ── */
interface NodeCardProps {
  node: FlowNode;
  allAgents: Agent[];
  globalIdx: number;
  totalNodes: number;
  onUpdateNode: (id: string, patch: Partial<FlowNode>) => void;
  onRemoveNode: (id: string) => void;
  onMoveNode: (idx: number, dir: -1 | 1) => void;
  onOpenPicker: (nodeId: string) => void;
}

/** 单个节点卡片 */
export function NodeCard({
  node,
  allAgents,
  globalIdx,
  totalNodes,
  onUpdateNode,
  onRemoveNode,
  onMoveNode,
  onOpenPicker,
}: NodeCardProps) {
  const isParallel = node.nodeType === 'parallel';

  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      {/* 节点卡片 */}
      <div style={{
        border: `1px solid ${isParallel ? '#a5b4fc' : '#e5e7eb'}`,
        borderRadius: 9, background: '#fff', overflow: 'hidden',
      }}>
        {/* 节点 Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 5,
          padding: '6px 9px', borderBottom: `1px solid ${isParallel ? '#e0e7ff' : '#f0f0f0'}`,
          background: isParallel ? '#f5f3ff' : '#fafafa',
        }}>
          {/* 序号圆圈 */}
          <div style={{
            width: 17, height: 17, borderRadius: '50%', flexShrink: 0,
            background: isParallel ? '#6366f1' : '#374151',
            color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 9, fontWeight: 700,
          }}>{globalIdx + 1}</div>

          {/* 并行标签 */}
          {isParallel && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 3,
              padding: '1px 6px', borderRadius: 20, flexShrink: 0,
              fontSize: 10, background: '#ede9fe', color: '#6d28d9', border: '1px solid #c4b5fd',
            }}>
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>
              </svg>
              并行
            </span>
          )}

          {/* 节点名称（可编辑） */}
          <input
            value={node.name}
            onChange={e => onUpdateNode(node.id, { name: e.target.value })}
            placeholder="节点名称…"
            style={{
              flex: 1, border: 'none', outline: 'none', minWidth: 0,
              fontSize: 12, fontWeight: 600, color: '#374151',
              background: 'transparent',
              fontFamily: '"Microsoft YaHei","Segoe UI",sans-serif',
            }}
            onFocus={e => { e.currentTarget.style.background = '#f9fafb'; e.currentTarget.style.borderRadius = '4px'; e.currentTarget.style.padding = '1px 4px'; }}
            onBlur={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.padding = '0'; }}
          />

          {/* 上移 */}
          <button
            onClick={() => onMoveNode(globalIdx, -1)}
            disabled={globalIdx === 0}
            title="上移"
            style={{ background: 'none', border: 'none', padding: '0 1px', cursor: globalIdx === 0 ? 'default' : 'pointer', color: globalIdx === 0 ? '#e5e7eb' : '#9ca3af', display: 'flex', lineHeight: 1 }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"/></svg>
          </button>
          {/* 下移 */}
          <button
            onClick={() => onMoveNode(globalIdx, 1)}
            disabled={globalIdx === totalNodes - 1}
            title="下移"
            style={{ background: 'none', border: 'none', padding: '0 1px', cursor: globalIdx === totalNodes - 1 ? 'default' : 'pointer', color: globalIdx === totalNodes - 1 ? '#e5e7eb' : '#9ca3af', display: 'flex', lineHeight: 1 }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          {/* 删除 */}
          <button
            onClick={() => onRemoveNode(node.id)}
            title="删除节点"
            style={{ background: 'none', border: 'none', padding: '0 1px', cursor: 'pointer', color: '#d1d5db', display: 'flex', lineHeight: 1, transition: 'color 0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.color = '#ef4444'; }}
            onMouseLeave={e => { e.currentTarget.style.color = '#d1d5db'; }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
            </svg>
          </button>
        </div>

        {/* 节点 Body */}
        <div style={{ padding: '9px 10px' }}>
          {/* 任务描述 */}
          <div style={{ marginBottom: 8 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 4 }}>节点任务描述</label>
            <input
              value={node.desc}
              onChange={e => onUpdateNode(node.id, { desc: e.target.value })}
              placeholder="描述该节点需完成的任务…"
              style={{
                width: '100%', padding: '5px 8px', boxSizing: 'border-box',
                border: '1px solid #e5e7eb', borderRadius: 6,
                fontSize: 11, color: '#374151', outline: 'none',
                fontFamily: '"Microsoft YaHei","Segoe UI",sans-serif',
                transition: 'border-color 0.15s',
              }}
              onFocus={e => { e.currentTarget.style.borderColor = '#6366f1'; }}
              onBlur={e => { e.currentTarget.style.borderColor = '#e5e7eb'; }}
            />
          </div>

          {/* 分配智能体 */}
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 6 }}>
              分配智能体
              <span style={{ color: '#9ca3af', fontWeight: 400, marginLeft: 4 }}>（可多选）</span>
            </label>

            {node.agentIds.length === 0 ? (
              /* 未选状态：全宽虚线按钮，引导选择 */
              <button
                onClick={() => onOpenPicker(node.id)}
                style={{
                  width: '100%', padding: '7px 0', borderRadius: 7,
                  border: '1.5px dashed #d1d5db',
                  background: 'transparent', color: '#9ca3af', fontSize: 12,
                  cursor: 'pointer', fontFamily: '"Microsoft YaHei","Segoe UI",sans-serif',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = '#6366f1';
                  (e.currentTarget as HTMLButtonElement).style.color = '#6366f1';
                  (e.currentTarget as HTMLButtonElement).style.background = '#f5f3ff';
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = '#d1d5db';
                  (e.currentTarget as HTMLButtonElement).style.color = '#9ca3af';
                  (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
                  <circle cx="9" cy="7" r="4"/>
                  <line x1="19" y1="8" x2="19" y2="14"/>
                  <line x1="22" y1="11" x2="16" y2="11"/>
                </svg>
                选择智能体
              </button>
            ) : (
              /* 已选状态：头像列表 + 编辑按钮行 */
              <div style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '5px 8px', borderRadius: 7,
                border: '1px solid #e0e7ff', background: '#f5f3ff',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1, flexWrap: 'wrap', minWidth: 0 }}>
                  {node.agentIds.map(aid => {
                    const a = allAgents.find(x => x.id === aid);
                    if (!a) return null;
                    const ac = a.color ?? '#6366f1';
                    return (
                      <span
                        key={aid}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 3,
                          padding: '1px 6px 1px 3px', borderRadius: 20,
                          fontSize: 11, background: ac + '15',
                          border: `1px solid ${ac}30`, color: ac, fontWeight: 500,
                        }}
                      >
                        <div style={{
                          width: 14, height: 14, borderRadius: '50%',
                          background: ac, display: 'flex', alignItems: 'center',
                          justifyContent: 'center', fontSize: 8, color: '#fff', fontWeight: 700,
                        }}>{a.name.charAt(0)}</div>
                        {a.name}
                      </span>
                    );
                  })}
                </div>
                <button
                  onClick={() => onOpenPicker(node.id)}
                  title="修改智能体"
                  style={{
                    flexShrink: 0, padding: '3px 7px', borderRadius: 5,
                    border: 'none', background: 'rgba(99,102,241,0.12)',
                    color: '#6366f1', fontSize: 11, cursor: 'pointer',
                    fontFamily: '"Microsoft YaHei","Segoe UI",sans-serif',
                    display: 'flex', alignItems: 'center', gap: 3,
                    transition: 'background 0.12s',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(99,102,241,0.22)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(99,102,241,0.12)'; }}
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                  编辑
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── NodeRow Props ── */
interface NodeRowProps {
  row: FlowNode[];
  rowIdx: number;
  nodes: FlowNode[];
  allAgents: Agent[];
  onUpdateNode: (id: string, patch: Partial<FlowNode>) => void;
  onRemoveNode: (id: string) => void;
  onMoveNode: (idx: number, dir: -1 | 1) => void;
  onOpenPicker: (nodeId: string) => void;
}

/** 一行节点（可能包含多个并行节点，带连接符） */
export function NodeRow({
  row,
  rowIdx,
  nodes,
  allAgents,
  onUpdateNode,
  onRemoveNode,
  onMoveNode,
  onOpenPicker,
}: NodeRowProps) {
  const globalIdx = (nodeId: string) => nodes.findIndex(n => n.id === nodeId);

  return (
    <div key={row[0].id + '-row'}>
      {/* 串行向下箭头（非首行） */}
      {rowIdx > 0 && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '2px 0', color: '#d1d5db' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/>
          </svg>
        </div>
      )}

      {/* 一行内可能有多个节点（并行） */}
      <div style={{ display: 'flex', gap: 0, alignItems: 'stretch' }}>
        {row.map((node, colIdx) => {
          const gIdx = globalIdx(node.id);
          return (
            <div key={node.id} style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'stretch' }}>
              {/* 并行节点间竖线 + 符号 */}
              {colIdx > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: 22, flexShrink: 0, gap: 2 }}>
                  <div style={{ flex: 1, width: 1, background: '#c7d2fe', minHeight: 16 }} />
                  <span style={{ fontSize: 13, color: '#818cf8', fontWeight: 700, lineHeight: 1 }}>⇋</span>
                  <div style={{ flex: 1, width: 1, background: '#c7d2fe', minHeight: 16 }} />
                </div>
              )}
              <NodeCard
                node={node}
                allAgents={allAgents}
                globalIdx={gIdx}
                totalNodes={nodes.length}
                onUpdateNode={onUpdateNode}
                onRemoveNode={onRemoveNode}
                onMoveNode={onMoveNode}
                onOpenPicker={onOpenPicker}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
