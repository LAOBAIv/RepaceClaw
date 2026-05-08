import React, { memo, useMemo } from 'react';
import MobileChatMessages from './MobileChatMessages';
import { COLORS } from '../../pages/MobileWorkspace';

interface MobileChatPanelContainerProps {
  panel: any;
  agents: any[];
  isActive: boolean;
}

// ⚠️ 防回归说明：这里必须让所有 panel 常驻 DOM，
// 不能改回 `if (!isActive) return null`、`display: none` 后再重挂载，
// 也不要通过切 key 强制 remount。
// 根因：移动端右侧抽屉切会话时，如果 panel 被卸载再挂载，会出现：
// 1) 切换闪烁 / 体感延迟；
// 2) 消息滚动位置丢失；
// 3) 短暂落入空状态，用户视觉上会看到“内容居中”。
//
// ⚠️ 防回归：消息名称必须在这里用 agents 数组补齐，不能只靠 panel.agentName。
// 根因：panel.agentName 在恢复链路中可能因 agent store 未加载完而落到 '智能体' 兜底，
// 导致同一个用户不同 panel 显示名称不一致。这里用 agents 数组做运行时解析，
// 只要 agents 数据在，消息名称就一定正确。
const MobileChatPanelContainer = memo(({ panel, agents, isActive }: MobileChatPanelContainerProps) => {
  const panelAgent = panel.agentId ? agents.find(a => a.id === panel.agentId) : null;

  // 用 agents 数组补齐消息的 agentName，避免 panel.agentName 不准导致名称显示不一致
  const resolvedMessages = useMemo(() => {
    const raw = panel.messages || [];
    if (!agents.length) return raw;
    return raw.map((msg: any) => {
      if (msg.agentName) return msg;
      const msgAgent = msg.agentId ? agents.find(a => a.id === msg.agentId) : null;
      if (msgAgent) {
        return { ...msg, agentName: msgAgent.name, agentColor: msgAgent.color, modelName: msgAgent.modelName };
      }
      return msg;
    });
  }, [panel.messages, agents]);

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        paddingBottom: 90,
        // 非激活 panel 只隐藏，不卸载，确保 DOM / 滚动状态持续存在
        visibility: isActive ? 'visible' : 'hidden',
        pointerEvents: isActive ? 'auto' : 'none',
      }}
    >
      <MobileChatMessages
        messages={resolvedMessages}
        defaultAgentName={panel.agentName}
        defaultAgentColor={panel.agentColor || COLORS.accent}
        defaultModelName={panelAgent?.modelName}
        isActive={isActive}
      />
    </div>
  );
});

export default MobileChatPanelContainer;
