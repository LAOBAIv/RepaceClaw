/**
 * @file AgentConsole 主入口
 * 智能体协作配置页面：左侧表单 + 右侧协作流程
 * 拆分自原 1,119 行单文件，主入口控制在 200 行以内
 *
 * 路由兼容：App.tsx 中 import { AgentConsole } from './pages/AgentConsole'
 * 会自动解析到本 index.tsx
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Network } from 'lucide-react';
import { useAgentStore } from '@/stores/agentStore';
import { useProjectStore } from '@/stores/projectStore';
import { useProjectKanbanStore } from '@/stores/projectKanbanStore';
import { useTaskStore } from '@/stores/taskStore';
import { DEFAULT_AGENTS } from '@/data/defaultAgents';
import { showToast } from '@/components/Toast';
import { PRIORITY_MAP } from './constants';
import { useConsoleState } from './hooks/useConsoleState';
import { useConsoleNodes } from './hooks/useConsoleNodes';
import { ConsoleSidebar } from './ConsoleSidebar';
import { ConsoleFlow } from './ConsoleFlow';

export function AgentConsole() {
  const navigate = useNavigate();
  const { agents, fetchAgents } = useAgentStore();
  const { fetchProjects, createProject, projects: backendProjects } = useProjectStore();
  const { addProject, updateProject, restoreFromPersist: restoreProjectKanban } = useProjectKanbanStore();
  const { updateTask, restoreFromPersist: restoreTasks } = useTaskStore();

  // 初始化数据加载
  useEffect(() => {
    fetchAgents();
    fetchProjects();
    restoreTasks().catch(() => {});
    restoreProjectKanban().catch(() => {});
  }, [fetchAgents, fetchProjects, restoreTasks, restoreProjectKanban]);

  const agentList = agents.length > 0 ? agents : DEFAULT_AGENTS;

  /* ── 表单状态 ── */
  const {
    taskName, setTaskName, taskDesc, setTaskDesc, taskGoal, setTaskGoal,
    priority, setPriority, tags, setTags, tagInput, setTagInput,
    showTagPopup, setShowTagPopup, tagPopupRef,
    startTime, setStartTime, endTime, setEndTime,
    decisionMaker, setDecisionMaker, resetForm,
    editTask, editProject,
  } = useConsoleState();

  /* ── 节点状态 ── */
  const {
    nodes, resetNodes, addNode, removeNode, updateNode, moveNode,
    pickerNodeId, setPickerNodeId,
    showAddMenu, setShowAddMenu, addBtnRef,
  } = useConsoleNodes(agentList, editTask, editProject, backendProjects);

  /* ── 决策人弹窗 ── */
  const [showDecisionPicker, setShowDecisionPicker] = useState(false);

  /* ── 操作 ── */
  const canCreate = taskName.trim().length > 0;

  async function handleCreate() {
    const name = taskName.trim();
    if (!name) return;

    // 校验：所有节点的任务目标必须填写
    const emptyNodeIdx = nodes.findIndex(n => n.name.trim() === '');
    if (emptyNodeIdx !== -1) {
      showToast(`请填写节点 ${emptyNodeIdx + 1} 的任务目标`, 'error');
      return;
    }

    // 负责智能体（取第一个节点中的第一个智能体，或决策人）
    const firstAgentId = nodes.find(n => n.agentIds.length > 0)?.agentIds[0];
    const assignedAgent = firstAgentId ? agentList.find(a => a.id === firstAgentId) : agentList[0];

    // 所有参与节点的智能体列表（去重）
    const allAgentIds = [...new Set(nodes.flatMap(n => n.agentIds))];
    const allAgents = allAgentIds
      .map(id => agentList.find(a => a.id === id))
      .filter(Boolean)
      .map(a => ({ name: a!.name, color: a!.color ?? '#6366f1' }));

    /* ── 编辑任务 ── */
    if (editTask) {
      updateTask(editTask.id, {
        title: name,
        description: taskDesc.trim(),
        priority: PRIORITY_MAP[priority] ?? 'low',
        tags,
        agent: assignedAgent?.name ?? editTask.agent,
        agentColor: assignedAgent?.color ?? editTask.agentColor,
        agents: allAgents.length > 0 ? allAgents : [{ name: assignedAgent?.name ?? editTask.agent, color: assignedAgent?.color ?? editTask.agentColor }],
      });
      navigate(-1);
      return;
    }

    /* ── 编辑项目 ── */
    if (editProject) {
      const projectAgents = allAgents.length > 0 ? allAgents : [{ name: assignedAgent?.name ?? editProject.agent, color: assignedAgent?.color ?? editProject.agentColor }];
      const { updateProject: updateProjectBackend } = useProjectStore.getState();
      try {
        await updateProjectBackend(editProject.backendId ?? editProject.id, {
          title: name, description: taskDesc.trim(), tags, goal: taskGoal.trim(),
          priority: PRIORITY_MAP[priority] ?? 'low', startTime: startTime || '', endTime: endTime || '',
          decisionMaker: decisionMaker ?? '',
          workflowNodes: nodes.map(n => ({ id: n.id, name: n.name, nodeType: n.nodeType, agentIds: n.agentIds, taskDesc: n.name })), // [2026-05-24] 类型安全
        });
      } catch { /* 后端不可用时静默处理 */ }
      updateProject(editProject.id, {
        title: name, description: taskDesc.trim(), priority: PRIORITY_MAP[priority] ?? 'low', tags,
        agent: assignedAgent?.name ?? editProject.agent, agentColor: assignedAgent?.color ?? editProject.agentColor,
        agents: projectAgents, taskCount: nodes.length, memberCount: allAgents.length || 1,
      });
      navigate(-1);
      return;
    }

    /* ── 新建项目 ── */
    const dueDate30 = new Date(Date.now() + 30 * 86400000);
    const dueMm = String(dueDate30.getMonth() + 1).padStart(2, '0');
    const dueDd = String(dueDate30.getDate()).padStart(2, '0');

    let realProjectId = `proj_${Date.now()}`;
    try {
      const created = await createProject({
        title: name, description: taskDesc.trim(), tags, status: 'active', goal: taskGoal.trim(),
        priority: PRIORITY_MAP[priority] ?? 'low', startTime: startTime || '', endTime: endTime || '',
        decisionMaker: decisionMaker ?? '',
        workflowNodes: nodes.map(n => ({ id: n.id, name: n.name, nodeType: n.nodeType, agentIds: n.agentIds, taskDesc: n.name })),
      });
      realProjectId = created.id;
    } catch { /* 后端不可用时静默处理 */ }

    addProject({
      id: realProjectId, title: name, description: taskDesc.trim(), tags,
      priority: PRIORITY_MAP[priority] ?? 'low',
      agent: assignedAgent?.name ?? '策划助手', agentColor: assignedAgent?.color ?? '#6366f1',
      agents: allAgents.length > 0 ? allAgents : [{ name: assignedAgent?.name ?? '策划助手', color: assignedAgent?.color ?? '#6366f1' }],
      progress: 0, dueDate: endTime ? endTime.slice(0, 10).replace(/-/g, '/').slice(5) : `${dueMm}/${dueDd}`,
      updatedAt: '刚刚', taskCount: nodes.length, memberCount: allAgents.length || 1,
    }, 'progress');

    handleReset();
    navigate('/workspace', {
      state: { projectName: name, projectId: realProjectId, agentNames: allAgents.map(a => a.name) },
    });
  }

  function handleReset() {
    resetForm();
    resetNodes();
  }

  return (
    <>
      <style>{`
        .pc-wrap { width: 100%; height: 100%; display: flex; flex-direction: column; font-family: "Microsoft YaHei", "Segoe UI", sans-serif; background: #f5f7fa; padding: 16px; box-sizing: border-box; overflow: hidden; }
        .pc-shell { flex: 1; min-height: 0; display: flex; flex-direction: column; background: #fafbfc; border: 1px solid #e5e6eb; border-radius: 12px; box-shadow: 0 1px 4px rgba(0,0,0,0.05); overflow: hidden; }
        .pc-header { padding: 16px 32px; border-bottom: 1px solid #e5e6eb; background: #fff; display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; }
        .pc-main { flex: 1; min-height: 0; display: grid; grid-template-columns: 360px 1fr; overflow: hidden; }
        .pc-left { border-right: 1px solid #ebebeb; overflow-y: auto; overflow-x: hidden; flex: 1; min-height: 0; padding: 18px 20px; display: flex; flex-direction: column; gap: 0; background: #fff; }
        .pc-right { overflow-y: auto; padding: 18px 20px; display: flex; flex-direction: column; gap: 0; background: #f5f7fa; }
        .pc-footer { padding: 11px 24px; border-top: 1px solid #ebebeb; background: #fff; display: flex; align-items: center; justify-content: center; gap: 10px; flex-shrink: 0; }
        .pc-label { display: block; font-size: 12px; font-weight: 600; color: #374151; margin-bottom: 5px; }
        .pc-label em { color: #ef4444; font-style: normal; margin-left: 2px; }
        .pc-input, .pc-textarea { width: 100%; padding: 7px 10px; border: 1px solid #d1d5db; border-radius: 7px; font-size: 13px; font-family: inherit; color: #111827; background: #fff; outline: none; box-sizing: border-box; transition: border-color 0.15s; }
        .pc-input:focus, .pc-textarea:focus { border-color: #2a3b4d; }
        .pc-textarea { resize: none; }
        .pc-tag { display: inline-block; padding: 3px 11px; border: 1px solid #e5e7eb; border-radius: 20px; font-size: 12px; cursor: pointer; user-select: none; background: #fff; color: #4a5568; transition: all 0.15s; }
        .pc-tag.active { background: #2a3b4d; border-color: #2a3b4d; color: #fff; }
        .pc-tag:hover:not(.active) { border-color: #2a3b4d; color: #2a3b4d; }
        .pc-node { border: 1px solid #e5e7eb; border-radius: 9px; background: transparent; overflow: hidden; }
        .pc-node.parallel { border-color: #a5b4fc; }
        .pc-node-hd { display: flex; align-items: center; gap: 6px; padding: 7px 11px; border-bottom: 1px solid #f0f0f0; }
        .pc-node.parallel .pc-node-hd { border-bottom-color: #e0e7ff; }
        .pc-node-bd { padding: 10px 12px; }
        .pc-node-name { flex: 1; border: none; border-bottom: 1.5px solid transparent; outline: none; font-size: 13px; font-weight: 600; color: #374151; background: transparent; font-family: inherit; min-width: 0; transition: border-color 0.15s; }
        .pc-node-name:focus { background: #f9fafb; border-radius: 4px; padding: 1px 4px; }
        .pc-arrow { display: flex; justify-content: center; padding: 2px 0; color: #d1d5db; }
        .pc-parallel-label { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 20px; font-size: 11px; background: #ede9fe; color: #6d28d9; border: 1px solid #c4b5fd; margin-right: 4px; }
        .pc-add-wrap { position: relative; margin-top: 10px; }
        .pc-add-node-btn { width: 100%; padding: 8px 0; border: 1.5px dashed #d1d5db; border-radius: 8px; background: transparent; color: #6b7280; font-size: 13px; cursor: pointer; font-family: inherit; display: flex; align-items: center; justify-content: center; gap: 5px; transition: all 0.15s; }
        .pc-add-node-btn:hover, .pc-add-node-btn.open { border-color: #2a3b4d; color: #2a3b4d; background: #eef1f4; }
        .pc-pick-btn { display: inline-flex; align-items: center; gap: 5px; padding: 4px 11px; border-radius: 7px; border: 1px dashed #d1d5db; background: transparent; color: #6b7280; font-size: 12px; cursor: pointer; font-family: inherit; transition: all 0.15s; }
        .pc-pick-btn:hover { border-color: #2a3b4d; color: #2a3b4d; background: #eef1f4; }
        .pc-agent-tag { display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; border-radius: 20px; font-size: 12px; background: #2a3b4d12; border: 1px solid #2a3b4d30; color: #2a3b4d; cursor: pointer; }
        .pc-decision-btn { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 8px; border: 1.5px dashed #d1d5db; background: transparent; color: #6b7280; font-size: 13px; cursor: pointer; font-family: inherit; transition: all 0.15s; width: 100%; box-sizing: border-box; }
        .pc-decision-btn:hover { border-color: #2a3b4d; color: #2a3b4d; background: #f5f7fa; }
        .pc-decision-btn.selected { border-style: solid; border-color: #2a3b4d; color: #2a3b4d; background: #2a3b4d08; }
        .pc-btn-cancel { padding: 7px 18px; border-radius: 7px; border: 1px solid #d1d5db; background: #fff; color: #6b7280; font-size: 13px; cursor: pointer; font-family: inherit; transition: all 0.15s; }
        .pc-btn-cancel:hover { border-color: #e53e3e; color: #e53e3e; background: #fff5f5; }
        .pc-btn-create { padding: 7px 22px; border-radius: 7px; border: none; background: #2a3b4d; color: #fff; font-size: 13px; font-weight: 600; cursor: pointer; font-family: inherit; transition: background 0.15s; }
        .pc-btn-create:hover:not(:disabled) { background: #1e2d3d; }
        .pc-btn-create:disabled { background: #9ca3af; cursor: not-allowed; }
        .pc-field { margin-bottom: 11px; }
      `}</style>

      <div className="pc-wrap">
        <div className="pc-shell">
          {/* Header */}
          <div className="pc-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Network size={18} color="#2a3b4d" />
              <div>
                <span style={{ fontWeight: 700, fontSize: 16, color: '#1a202c' }}>
                  {editTask ? '任务配置' : '项目协作'}
                </span>
                <span style={{ fontSize: 12, color: '#9ca3af', marginLeft: 10 }}>
                  {editTask ? `编辑任务：${editTask.title}` : editProject ? `编辑项目：${editProject.title}` : '配置多智能体协作流程'}
                </span>
              </div>
            </div>
          </div>

          {/* 双栏主体 */}
          <div className="pc-main">
            <ConsoleSidebar
              taskName={taskName} setTaskName={setTaskName}
              taskDesc={taskDesc} setTaskDesc={setTaskDesc}
              taskGoal={taskGoal} setTaskGoal={setTaskGoal}
              priority={priority} setPriority={setPriority}
              tags={tags} setTags={setTags}
              tagInput={tagInput} setTagInput={setTagInput}
              showTagPopup={showTagPopup} setShowTagPopup={setShowTagPopup}
              tagPopupRef={tagPopupRef}
              startTime={startTime} setStartTime={setStartTime}
              endTime={endTime} setEndTime={setEndTime}
              decisionMaker={decisionMaker} setDecisionMaker={setDecisionMaker}
              showDecisionPicker={showDecisionPicker} setShowDecisionPicker={setShowDecisionPicker}
              editTask={editTask} editProject={editProject}
              agentList={agentList}
            />
            <ConsoleFlow
              nodes={nodes} agentList={agentList}
              updateNode={updateNode} removeNode={removeNode} moveNode={moveNode} addNode={addNode}
              pickerNodeId={pickerNodeId} setPickerNodeId={setPickerNodeId}
              showAddMenu={showAddMenu} setShowAddMenu={setShowAddMenu} addBtnRef={addBtnRef}
            />
          </div>

          {/* Footer */}
          <div className="pc-footer">
            <button className="pc-btn-cancel" onClick={editTask || editProject ? () => navigate(-1) : handleReset}>取消</button>
            <button className="pc-btn-create" disabled={!canCreate} onClick={handleCreate}>
              {editTask || editProject ? '保存' : '确认创建'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
