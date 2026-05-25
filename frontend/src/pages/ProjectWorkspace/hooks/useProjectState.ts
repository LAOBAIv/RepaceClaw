/**
 * useProjectState — 项目状态管理 Hook
 *
 * 职责：管理项目模式切换（升级/降级）、优先级读写、看板/任务匹配、协作流程节点。
 * 从原 ProjectWorkspace.tsx 中提取项目状态相关逻辑。
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useProjectStore } from '@/stores/projectStore';
import { useTaskStore } from '@/stores/taskStore';
import { useProjectKanbanStore, type ProjectPriority } from '@/stores/projectKanbanStore';
import { useAgentStore } from '@/stores/agentStore';
import { useConversationStore } from '@/stores/conversation';
import { makeFlowNode, type FlowNode } from '../types';

export function useProjectState(
  incomingProjectId?: string,
  incomingProjectName?: string,
  incomingTaskId?: string,
  incomingAgentNames?: string[]
) {
  const { currentProject, projects, fetchProjects } = useProjectStore();
  const { agents } = useAgentStore();
  const { tasks, updateTask } = useTaskStore();
  const { projects: kanbanProjects, updateProject: updateKanbanProject, addProject: addKanbanProject } = useProjectKanbanStore();

  /** 当前是否为项目模式（可动态升级/降级） */
  const [isProjectMode, setIsProjectMode] = useState<boolean>(() => !!incomingProjectId);
  /** 当前参与会话的智能体名称列表 */
  const [participatingAgentNames, setParticipatingAgentNames] = useState<string[]>(
    () => incomingAgentNames ?? []
  );
  /** 协作流程节点（提升到顶层，防止 TabPanel 关闭时丢失） */
  const [collabNodes, setCollabNodes] = useState<FlowNode[]>(() => [makeFlowNode(0)]);

  /** 顶部优先级下拉是否展开 */
  const [showPriorityDropdown, setShowPriorityDropdown] = useState(false);
  const priorityDropdownRef = useRef<HTMLDivElement>(null);

  // 动态数据：优先用跳转传入的项目名 > currentProject > 第一个项目
  const taskName = incomingProjectName ?? currentProject?.title ?? (projects[0]?.title ?? 'WorkBuddy');

  /* ── 找到 kanban 中对应的项目 ── */
  const allKanbanProjects = [...kanbanProjects.progress, ...kanbanProjects.done];
  const matchedKanbanProject =
    (incomingProjectId ? allKanbanProjects.find(p => p.id === incomingProjectId) : undefined)
    ?? (incomingProjectName && !incomingTaskId ? allKanbanProjects.find(p => p.title === incomingProjectName) : undefined)
    ?? null;

  /* ── 找到 taskStore 中对应的任务 ── */
  const allTasks = [...tasks.progress, ...tasks.done];
  const matchedTask = incomingTaskId ? allTasks.find(t => t.id === incomingTaskId) ?? null : null;

  /* ── 统一的 tags / priority 数据源 ── */
  const currentTags: string[] = matchedTask?.tags ?? matchedKanbanProject?.tags ?? [];
  const currentPriority: ProjectPriority | null = (matchedTask?.priority as ProjectPriority | undefined) ?? matchedKanbanProject?.priority ?? null;

  /* ── 优先级读写 ── */
  const setPriority = useCallback((p: ProjectPriority) => {
    if (matchedTask) {
      updateTask(matchedTask.id, { priority: p as 'high' | 'mid' | 'low' });
    } else if (matchedKanbanProject) {
      updateKanbanProject(matchedKanbanProject.id, { priority: p });
    }
  }, [matchedTask, matchedKanbanProject, updateTask, updateKanbanProject]);

  /* ── 任务升级为项目 ── */
  const upgradeToProject = useCallback((newAgentNames: string[]) => {
    const allNames = [...new Set([...participatingAgentNames, ...newAgentNames])];
    setParticipatingAgentNames(allNames);
    setIsProjectMode(true);

    // 在看板 store 新建一条项目记录（如果还没有匹配项目）
    if (!matchedKanbanProject || matchedKanbanProject.agents.length < 2) {
      const participantAgents = agents
        .filter(a => allNames.includes(a.name))
        .map(a => ({ name: a.name, color: a.color ?? '#6366f1' }));
      const dueDate30 = new Date(Date.now() + 30 * 86400000);
      const mm = String(dueDate30.getMonth() + 1).padStart(2, '0');
      const dd = String(dueDate30.getDate()).padStart(2, '0');
      addKanbanProject({
        id: matchedKanbanProject?.id ?? `proj_upgrade_${Date.now()}`,
        title: taskName,
        description: '',
        tags: currentTags,
        priority: currentPriority ?? 'low',
        agent: participantAgents[0]?.name ?? '策划助手',
        agentColor: participantAgents[0]?.color ?? '#6366f1',
        agents: participantAgents.length >= 2 ? participantAgents : [
          ...(participantAgents.length > 0 ? participantAgents : [{ name: '策划助手', color: '#6366f1' }]),
          { name: allNames[1] ?? allNames[0] ?? '研究员', color: '#3b82f6' },
        ],
        progress: 0,
        dueDate: `${mm}/${dd}`,
        updatedAt: '刚刚',
        taskCount: collabNodes.length,
        memberCount: allNames.length,
      }, 'progress');
    } else {
      // 已有项目记录则只更新 agents 列表
      const participantAgents = agents
        .filter(a => allNames.includes(a.name))
        .map(a => ({ name: a.name, color: a.color ?? '#6366f1' }));
      updateKanbanProject(matchedKanbanProject.id, { agents: participantAgents, memberCount: allNames.length });
    }
  }, [participatingAgentNames, matchedKanbanProject, agents, taskName, currentTags, currentPriority, collabNodes.length, addKanbanProject, updateKanbanProject]);

  /* ── 项目降级为任务 ── */
  const downgradeToTask = useCallback((keptAgentName: string) => {
    setParticipatingAgentNames([keptAgentName]);
    setIsProjectMode(false);
    // 关闭非保留智能体的所有 Panel
    const { openPanels, closePanel } = useConversationStore.getState();
    openPanels.forEach(p => {
      if (p.agentName !== keptAgentName) closePanel(p.id);
    });
    // 清空协作节点，回到初始单节点
    setCollabNodes([makeFlowNode(0)]);
  }, []);

  /* ── 点击空白处关闭优先级下拉 ── */
  useEffect(() => {
    if (!showPriorityDropdown) return;
    function handleClickOutside(e: MouseEvent) {
      if (priorityDropdownRef.current && !priorityDropdownRef.current.contains(e.target as Node)) {
        setShowPriorityDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showPriorityDropdown]);

  return {
    isProjectMode, setIsProjectMode,
    participatingAgentNames, setParticipatingAgentNames,
    collabNodes, setCollabNodes,
    showPriorityDropdown, setShowPriorityDropdown,
    priorityDropdownRef,
    taskName,
    matchedKanbanProject,
    matchedTask,
    currentTags,
    currentPriority,
    setPriority,
    upgradeToProject,
    downgradeToTask,
    currentProject,
    projects,
    fetchProjects,
  };
}


