/**
 * CollabFlow/index — 协作流程主组件
 *
 * 职责：
 * - 渲染协作 Tab 下的流程节点编辑器
 * - 管理节点 CRUD 和移动操作
 * - 处理智能体分配确认
 * - 开启协作（为每个智能体生成专属初始消息并打开面板）
 * - 任务模式下的升级为项目按钮
 */
import React, { useState, useRef } from 'react';
import type { FlowNode, FlowNodeType } from '../../types';
import { AddFlowNodeMenu } from '../AddFlowNodeMenu';
import { AgentPickerModal } from '../AgentPickerModal';
import { showToast } from '@/components/Toast';
import type { CollabFlowProps } from './types';
import { NodeRow } from './NodeEditor';
import { MAX_PARALLEL_NODES, MAX_PARALLEL_NODES_MESSAGE } from './constants';

export function CollabFlow({
  nodes,
  setNodes,
  allAgents,
  openPanels,
  isProject,
  onSwitchPanel,
  onOpenPanel,
  onClosePanel,
}: CollabFlowProps) {
  const [pickerNodeId, setPickerNodeId] = useState<string | null>(null);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const addBtnRef = useRef<HTMLButtonElement>(null);

  /* ── 节点 CRUD ── */
  function addNode(type: FlowNodeType) {
    setNodes(prev => {
      if (type === 'parallel') {
        // 并行节点限制：同一层最多 3 个
        let count = 0;
        for (let i = prev.length - 1; i >= 0; i--) {
          if (prev[i].nodeType === 'serial') { count++; break; }
          count++;
        }
        if (count >= MAX_PARALLEL_NODES) { showToast(MAX_PARALLEL_NODES_MESSAGE, 'warning'); return prev; }
      }
      return [...prev, {
        id: `fn_${Date.now()}`,
        name: `流程节点 ${prev.length + 1}`,
        nodeType: type,
        agentIds: [],
        desc: '',
      }];
    });
  }

  function removeNode(id: string) {
    setNodes(prev => prev.filter(n => n.id !== id));
  }

  function updateNode(id: string, patch: Partial<FlowNode>) {
    setNodes(prev => prev.map(n => n.id === id ? { ...n, ...patch } : n));
  }

  function moveNode(idx: number, dir: -1 | 1) {
    setNodes(prev => {
      const arr = [...prev];
      const t = idx + dir;
      if (t < 0 || t >= arr.length) return arr;
      [arr[idx], arr[t]] = [arr[t], arr[idx]];
      return arr;
    });
  }

  function confirmAgents(nodeId: string, ids: string[]) {
    updateNode(nodeId, { agentIds: ids });
    setPickerNodeId(null);
  }

  /* ── 开启协作：为每个智能体生成专属初始消息并打开面板 ── */
  function applyCollab() {
    // 构建协作上下文：所有节点的概览（供每个智能体了解整体分工）
    const allNodes = nodes.filter(n => n.agentIds.length > 0);
    const contextLines = allNodes.map((n, i) => {
      const assignedNames = n.agentIds
        .map(id => allAgents.find(a => a.id === id)?.name ?? id)
        .join('、');
      const type = n.nodeType === 'parallel' ? '[并行]' : '[串行]';
      const desc = n.desc ? `：${n.desc}` : '';
      return `  ${i + 1}. ${type} ${n.name}（负责：${assignedNames}）${desc}`;
    }).join('\n');

    // 关闭不在协作列表中的面板
    const allAgentIds = [...new Set(nodes.flatMap(n => n.agentIds))];
    openPanels.forEach(p => {
      if (!allAgentIds.includes(p.agentId)) onClosePanel(p.id);
    });

    // 按节点维度，为每个智能体生成专属初始消息
    nodes.forEach(node => {
      if (node.agentIds.length === 0) return;
      node.agentIds.forEach(agentId => {
        const a = allAgents.find(ag => ag.id === agentId);
        if (!a) return;

        const lines: string[] = [];
        lines.push(`【协作任务启动】`);
        lines.push(`你被分配到节点「${node.name}」${node.nodeType === 'parallel' ? '（并行节点）' : '（串行节点）'}。`);
        if (node.desc) {
          lines.push(`\n本节点任务描述：\n${node.desc}`);
        }
        if (allNodes.length > 1) {
          lines.push(`\n整体协作流程如下：\n${contextLines}`);
        }
        lines.push(`\n请根据上述任务描述开始执行。`);
        const initialMessage = lines.join('\n');

        const existingPanel = openPanels.find(p => p.agentId === agentId);
        if (existingPanel) {
          onSwitchPanel(existingPanel.id);
        } else {
          onOpenPanel(a.id, a.name, a.color, initialMessage);
        }
      });
    });
  }

  const pickerNode = pickerNodeId ? nodes.find(n => n.id === pickerNodeId) : null;

  /* ── 将节点分组成行（serial 开新行，parallel 并入当前行） ── */
  const rows: FlowNode[][] = [];
  nodes.forEach(n => {
    if (n.nodeType === 'serial' || rows.length === 0) {
      rows.push([n]);
    } else {
      rows[rows.length - 1].push(n);
    }
  });

  return (
    <>
      {/* 提示文字 */}
      <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 10, lineHeight: 1.5 }}>
        {isProject
          ? '管理参与协作的智能体，配置流程节点分工后开启协作。'
          : '配置协作流程节点后可升级为项目，开启多智能体协同工作。'}
      </div>

      {/* ── 节点渲染 ── */}
      {rows.map((row, rowIdx) => (
        <NodeRow
          key={row[0].id + '-row-wrapper'}
          row={row}
          rowIdx={rowIdx}
          nodes={nodes}
          allAgents={allAgents}
          onUpdateNode={updateNode}
          onRemoveNode={removeNode}
          onMoveNode={moveNode}
          onOpenPicker={setPickerNodeId}
        />
      ))}

      {/* 添加节点按钮 */}
      <div style={{ position: 'relative', marginTop: 10 }}>
        <button
          ref={addBtnRef}
          onClick={() => setShowAddMenu(v => !v)}
          style={{
            width: '100%', padding: '7px 0',
            border: `1.5px dashed ${showAddMenu ? '#374151' : '#d1d5db'}`,
            borderRadius: 8, background: showAddMenu ? '#f5f7fa' : 'transparent',
            color: showAddMenu ? '#374151' : '#6b7280',
            fontSize: 12, cursor: 'pointer',
            fontFamily: '"Microsoft YaHei","Segoe UI",sans-serif',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = '#374151'; e.currentTarget.style.color = '#374151'; e.currentTarget.style.background = '#f5f7fa'; }}
          onMouseLeave={e => {
            if (!showAddMenu) {
              e.currentTarget.style.borderColor = '#d1d5db';
              e.currentTarget.style.color = '#6b7280';
              e.currentTarget.style.background = 'transparent';
            }
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          添加流程节点
        </button>
        {showAddMenu && (
          <AddFlowNodeMenu
            anchorRef={addBtnRef}
            onAdd={addNode}
            onClose={() => setShowAddMenu(false)}
          />
        )}
      </div>

      {/* 开启协作按钮 */}
      <button
        onClick={applyCollab}
        disabled={nodes.every(n => n.agentIds.length === 0)}
        style={{
          marginTop: 12, width: '100%', height: 36, borderRadius: 8, border: 'none',
          background: nodes.some(n => n.agentIds.length > 0) ? '#6366f1' : '#e5e7eb',
          color: nodes.some(n => n.agentIds.length > 0) ? '#fff' : '#9ca3af',
          fontSize: 13, fontWeight: 700,
          cursor: nodes.some(n => n.agentIds.length > 0) ? 'pointer' : 'not-allowed',
          fontFamily: '"Microsoft YaHei","Segoe UI",sans-serif',
          transition: 'background 0.15s',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        {nodes.some(n => n.agentIds.length > 0) ? '开启协作' : '请先为节点分配智能体'}
      </button>

      {/* 智能体选择弹窗 */}
      {pickerNode && (
        <AgentPickerModal
          agentList={allAgents}
          selected={pickerNode.agentIds}
          onClose={() => setPickerNodeId(null)}
          onConfirm={ids => confirmAgents(pickerNode.id, ids)}
        />
      )}
    </>
  );
}
