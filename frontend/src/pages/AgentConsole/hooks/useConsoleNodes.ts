/**
 * @file useConsoleNodes - AgentConsole 流程节点管理 Hook
 * 管理节点的增删改查、移动、智能体预填等逻辑
 */

import { useState, useEffect, useRef } from 'react';
import { Agent, Project } from '@/types';
import { makeDefaultNode } from '../constants';
import type { FlowNode, NodeType } from '../constants';
import { showToast } from '@/components/Toast';
import type { ConsoleEditTask, ConsoleEditProject } from './useConsoleState'; // [2026-05-24] 类型安全

export interface ConsoleNodesReturn {
  nodes: FlowNode[];
  resetNodes: () => void;
  addNode: (type: NodeType) => void;
  removeNode: (id: string) => void;
  updateNode: (id: string, patch: Partial<FlowNode>) => void;
  moveNode: (idx: number, dir: -1 | 1) => void;
  confirmAgents: (nodeId: string, ids: string[]) => void;
  pickerNodeId: string | null;
  setPickerNodeId: React.Dispatch<React.SetStateAction<string | null>>;
  pickerNode: FlowNode | undefined;
  showAddMenu: boolean;
  setShowAddMenu: React.Dispatch<React.SetStateAction<boolean>>;
  addBtnRef: React.RefObject<HTMLButtonElement | null>;
}

export function useConsoleNodes(
  agentList: Agent[],
  editTask: ConsoleEditTask | null, // [2026-05-24] 类型安全
  editProject: ConsoleEditProject | null, // [2026-05-24] 类型安全
  backendProjects: Project[], // [2026-05-24] 类型安全
): ConsoleNodesReturn {
  const [nodes, setNodes] = useState<FlowNode[]>(() => [makeDefaultNode()]);

  /* 当 editTask 存在且 agentList 加载完成时，将任务的智能体预填到第一个节点 */
  useEffect(() => {
    if (!editTask?.agents?.length) return;
    const matchedIds = (editTask.agents as { name: string; color: string }[])
      .map(a => agentList.find(ag => ag.name === a.name)?.id)
      .filter(Boolean) as string[];
    if (matchedIds.length === 0) return;
    setNodes(prev => prev.map((n, i) =>
      i === 0 ? { ...n, agentIds: matchedIds } : n
    ));
  // agentList 变化时（首次加载完成）触发一次即可
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentList]);

  /* 当 editProject 存在且后端项目列表加载完成时，用后端 workflowNodes 回填节点 */
  const editProjectNodesInitialized = useRef(false);
  useEffect(() => {
    if (!editProject) return;
    if (editProjectNodesInitialized.current) return;
    if (!agentList.length) return;

    // 优先从后端 backendProjects 里找对应项目的 workflowNodes
    const backendMatch = backendProjects.find(p => p.title === editProject.title);
    if (backendMatch?.workflowNodes?.length) {
      // 把后端 workflowNodes 转成前端 FlowNode 格式
      const restored: FlowNode[] = backendMatch.workflowNodes.map((n: unknown) => ({ // [2026-05-24] 类型安全
        id: (n as { id: string }).id,
        name: (n as { name: string }).name,
        nodeType: (n as { nodeType: string }).nodeType as 'serial' | 'parallel',
        agentIds: (n as { agentIds: string[] }).agentIds,
        desc: (n as { taskDesc?: string }).taskDesc ?? '',
      }));
      setNodes(restored);
      editProjectNodesInitialized.current = true;
      return;
    }

    // 后端无节点数据时，退化为把 kanban agents 填入第一个节点
    if (!editProject.agents?.length) return;
    const matchedIds = (editProject.agents as { name: string; color: string }[])
      .map((a: { name: string }) => agentList.find(ag => ag.name === a.name)?.id)
      .filter(Boolean) as string[];
    if (matchedIds.length === 0) return;
    setNodes(prev => prev.map((n, i) =>
      i === 0 ? { ...n, agentIds: matchedIds } : n
    ));
    editProjectNodesInitialized.current = true;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentList, backendProjects]);

  /* 弹窗状态 */
  const [pickerNodeId, setPickerNodeId] = useState<string | null>(null);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const addBtnRef = useRef<HTMLButtonElement>(null);

  /* 节点操作 */
  function addNode(type: NodeType) {
    setNodes(prev => {
      // 并行节点限制：统计最后一个"串行行"已有几个节点（串行本身算1个）
      if (type === 'parallel') {
        let count = 0;
        for (let i = prev.length - 1; i >= 0; i--) {
          if (prev[i].nodeType === 'serial') { count++; break; }
          count++;
        }
        if (count >= 3) {
          showToast('同一层最多并行 3 个节点', 'warning');
          return prev;
        }
      }
      return [...prev, {
        id: Date.now().toString(),
        name: ``,
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

  const pickerNode = pickerNodeId ? nodes.find(n => n.id === pickerNodeId) : null;

  /** 重置节点为默认单节点 */
  function resetNodes() {
    setNodes([makeDefaultNode()]);
  }

  return {
    nodes, resetNodes, addNode, removeNode, updateNode, moveNode, confirmAgents,
    pickerNodeId, setPickerNodeId, pickerNode,
    showAddMenu, setShowAddMenu, addBtnRef,
  };
}
