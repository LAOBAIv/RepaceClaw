import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { ProjectWorkspace } from './pages/ProjectWorkspace';
import { AgentManager } from './pages/AgentManager';
import AgentLibrary from './pages/AgentLibrary';
import { AgentCreate } from './pages/AgentCreate';
import { AgentConsole } from './pages/AgentConsole';
import { AgentKanban } from './pages/AgentKanban';
import { SkillSettings } from './pages/SkillSettings';
import { PluginSettings } from './pages/PluginSettings';
import { PlatformAssistant } from './pages/PlatformAssistant';
import { WechatClawBot } from './pages/WechatClawBot';
import { AuthPage } from './pages/AuthPage';
import { AdminPanel } from './pages/AdminPanel';
import { MobileWorkspace } from './pages/MobileWorkspace';
import { MobileAgentCreate } from './pages/MobileAgentCreate';
import { MobileAgentManager } from './pages/MobileAgentManager';
import { MobileAgentLibrary } from './pages/MobileAgentLibrary';
import { useAuthStore } from './stores/authStore';

// 路由守卫：未登录跳转到 /login
// Plan C 登录恢复兜底：首屏加载瞬间，zustand persist 可能还没来得及把
// sessionStorage 中的 auth 快照同步进内存；这时不能立刻把用户打回 /login。
function PrivateRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  let hasPersistedAuth = false;
  try {
    const raw = sessionStorage.getItem('repaceclaw-auth') || localStorage.getItem('repaceclaw-auth');
    if (raw) {
      const parsed = JSON.parse(raw);
      hasPersistedAuth = !!parsed?.state?.token;
    }
  } catch {}
  return (isAuthenticated || hasPersistedAuth)
    ? <>{children}</>
    : <Navigate to="/login" replace state={{ fromPath: window.location.pathname + window.location.search + window.location.hash }} />;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* 登录/注册页 */}
        <Route path="/login" element={<AuthPage />} />

        {/* 移动端独立路由，不走 PC AppShell */}
        <Route path="/mobile" element={
          <PrivateRoute>
            <MobileWorkspace />
          </PrivateRoute>
        } />
        <Route path="/mobile/agent-create" element={
          <PrivateRoute>
            <MobileAgentCreate onBack={() => window.history.back()} />
          </PrivateRoute>
        } />
        <Route path="/mobile/agents" element={
          <PrivateRoute>
            <MobileAgentManager onBack={() => window.history.back()} />
          </PrivateRoute>
        } />
        <Route path="/mobile/agent-library" element={
          <PrivateRoute>
            <MobileAgentLibrary onBack={() => window.history.back()} />
          </PrivateRoute>
        } />

        {/* 需要登录的页面 */}
        <Route element={
          <PrivateRoute>
            <AppShell />
          </PrivateRoute>
        }>
          <Route path="/" element={<Navigate to="/workspace" replace />} />
          <Route path="/workspace" element={<ProjectWorkspace />} />
          <Route path="/agents" element={<AgentManager />} />
          <Route path="/agent-library" element={<AgentLibrary />} />
          <Route path="/agent-create" element={<AgentCreate />} />
          <Route path="/console" element={<AgentConsole />} />
          <Route path="/kanban" element={<AgentKanban />} />
          <Route path="/admin" element={<AdminPanel />} />
          <Route path="/skill-settings" element={<SkillSettings />} />
          <Route path="/plugin-settings" element={<PluginSettings />} />
          <Route path="/platform-assistant" element={<PlatformAssistant />} />
          <Route path="/wechat-clawbot" element={<WechatClawBot />} />
          <Route path="*" element={<Navigate to="/workspace" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
