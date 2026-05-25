import { useState } from 'react';
import { Cpu, Users, FileText, Route, Bot, MessageCircle } from 'lucide-react';
import { ModelChannels } from './ModelChannels';
import { AgentChannelOverview } from '../components/AgentChannelOverview';
import { UserManagement } from './UserManagement';
import { AuditLogs } from './AuditLogs';
import { TemplatesAdmin } from './TemplatesAdmin';
import { UserAgentsAdmin } from './UserAgentsAdmin';
import { useAuthStore } from '../stores/authStore';
import { WechatClawBot } from './WechatClawBot';
import { Navigate } from 'react-router-dom';

type AdminTab = 'model-channels' | 'agent-routing' | 'templates' | 'user-agents' | 'users' | 'audit-logs' | 'wechat-bot';

const TABS = [
  { id: 'model-channels' as AdminTab, label: '模型渠道', icon: Cpu },
  { id: 'agent-routing' as AdminTab,  label: '智能体通道', icon: Route },
  { id: 'templates' as AdminTab,      label: '模板管理', icon: FileText },
  { id: 'user-agents' as AdminTab,    label: '用户会话', icon: Bot },
  { id: 'users' as AdminTab,          label: '用户管理', icon: Users },
  { id: 'audit-logs' as AdminTab,     label: '审计日志', icon: FileText },
  { id: 'wechat-bot' as AdminTab,     label: '微信Bot', icon: MessageCircle },
];

export function AdminPanel() {
  const user = useAuthStore((s) => s.user);
  const [activeTab, setActiveTab] = useState<AdminTab>('model-channels');

  // 非管理员重定向
  if (!user || (user.role !== 'super_admin' && user.role !== 'admin')) {
    return <Navigate to="/workspace" replace />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: 'var(--body-bg)' }}>

      {/* 顶部 Tab 导航 */}
      <div style={{
        height: 56, flexShrink: 0, borderBottom: '1px solid #e5e7eb',
        background: '#fff', display: 'flex', alignItems: 'center', padding: '0 24px',
        gap: 16,
      }}>
        {/* 标题 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginRight: 24 }}>
          <ShieldCheck size={18} color="#d97706" />
          <span style={{ fontWeight: 700, fontSize: 15, color: '#1a202c' }}>管理后台</span>
        </div>

        {/* Tab 列表（横排） */}
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', borderRadius: 8, border: 'none',
              background: activeTab === id ? '#fef3c7' : 'transparent',
              color: activeTab === id ? '#d97706' : '#6b7280',
              fontWeight: activeTab === id ? 600 : 400,
              fontSize: 13, cursor: 'pointer', transition: 'all 0.15s',
            }}
          >
            <Icon size={14} style={{ flexShrink: 0 }} />
            {label}
          </button>
        ))}
      </div>

      {/* 内容区 */}
      <div style={{ flex: 1, minWidth: 0, overflow: 'auto' }}>
        {activeTab === 'model-channels' && <ModelChannels />}
        {activeTab === 'agent-routing' && <AgentChannelOverview />}
        {activeTab === 'templates' && <TemplatesAdmin />}
        {activeTab === 'user-agents' && <UserAgentsAdmin />}
        {activeTab === 'users' && <UserManagement />}
        {activeTab === 'audit-logs' && <AuditLogs />}
        {activeTab === 'wechat-bot' && <WechatClawBot />}
      </div>
    </div>
  );
}
