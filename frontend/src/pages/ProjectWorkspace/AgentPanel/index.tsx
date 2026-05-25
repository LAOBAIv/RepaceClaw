/**
 * AgentPanel/index — 智能体面板主入口组件
 *
 * 职责：整合 AgentList（智能体列表）、AgentControls（操作控制）、
 * CollabFlow（协作流程节点）、ProjectUpgrade（升级按钮）四个子组件，
 * 根据当前 subTab 状态切换显示内容。
 * 保留原有的 props 接口，确保父组件无需修改。
 */
import React, { useState } from 'react';
import type { Agent, ConversationPanel } from '@/types';
import type { FlowNode } from '../types';
import { AgentList } from './AgentList';
import { AgentControls } from './AgentControls';
import { CollabFlow } from './CollabFlow';
import { ProjectUpgrade } from './ProjectUpgrade';

export function AgentPanel({
  agents,
  agentStatusMap,
  openPanels,
  activePanelId,
  onSwitchPanel,
  onOpenPanel,
  onSwitchAgent,
  onClosePanel,
  collabNodes,
  setCollabNodes,
  isProject,
  participatingAgentNames,
  onUpgradeToProject,
  onDowngradeToTask,
}: {
  agents?: Agent[];
  agentStatusMap: Record<string, { label: string; color: string }>;
  openPanels: ConversationPanel[];
  activePanelId: string | null;
  onSwitchPanel: (panelId: string) => void;
  onOpenPanel: (agentId: string, agentName: string, agentColor: string, initialMessage?: string) => void;
  onSwitchAgent: (agentId: string, agentName: string, agentColor: string) => void;
  onClosePanel: (panelId: string) => void;
  collabNodes: FlowNode[];
  setCollabNodes: React.Dispatch<React.SetStateAction<FlowNode[]>>;
  /** 当前是项目（true）还是任务（false） */
  isProject: boolean;
  /** 当前参与会话的智能体名称列表 */
  participatingAgentNames?: string[];
  /** 任务升级为项目回调 */
  onUpgradeToProject?: (newAgentNames: string[]) => void;
  /** 项目降级为任务回调 */
  onDowngradeToTask?: (keptAgentName: string) => void;
}) {
  // 子 Tab 状态：switch（切换智能体）/ collab（协作流程）
  const [subTab, setSubTab] = useState<'switch' | 'collab'>('switch');

  // 智能体列表：使用全部可用 agent，不被 incomingAgentNames 限制
  // 这样"切换智能体"时能看到所有候选，而非仅当前会话的 agent
  // [2026-05-23] 过滤系统助手（微信助手、平台助手），用户不可选
  const agentList = (agents ?? []).filter(a => !a.isSystem);

  return (
    <div style={{ fontFamily: '"Microsoft YaHei","Segoe UI",sans-serif' }}>
      {/* ── 操作控制区：子 Tab 切换 + 参与智能体管理 ── */}
      <AgentControls
        isProject={isProject}
        subTab={subTab}
        onSubTabChange={setSubTab}
        participatingAgentNames={participatingAgentNames}
        agentList={agentList}
        openPanels={openPanels}
        onDowngradeToTask={onDowngradeToTask}
        onClosePanel={onClosePanel}
      />

      {/* ══════════ 切换 Tab：智能体列表 ══════════ */}
      {subTab === 'switch' && (
        <AgentList
          agentList={agentList}
          agentStatusMap={agentStatusMap}
          openPanels={openPanels}
          activePanelId={activePanelId}
          onSwitchAgent={onSwitchAgent}
        />
      )}

      {/* ══════════ 协作 Tab：流程节点编辑 ══════════ */}
      {subTab === 'collab' && (
        <>
          <CollabFlow
            nodes={collabNodes}
            setNodes={setCollabNodes}
            allAgents={agentList}
            openPanels={openPanels}
            isProject={isProject}
            onSwitchPanel={onSwitchPanel}
            onOpenPanel={onOpenPanel}
            onClosePanel={onClosePanel}
            onUpgradeToProject={onUpgradeToProject}
          />

          {/* 任务模式：升级为项目按钮 */}
          {!isProject && (
            <ProjectUpgrade
              nodes={collabNodes}
              agentList={agentList}
              onUpgradeToProject={onUpgradeToProject}
            />
          )}
        </>
      )}
    </div>
  );
}
