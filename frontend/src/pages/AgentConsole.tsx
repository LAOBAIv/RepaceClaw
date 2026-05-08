import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Network, Plus, Trash2, ChevronDown, ChevronUp,
  ArrowDown, Users, X, Check, UserCircle2, GitBranch,
} from 'lucide-react';
import { useAgentStore } from '@/stores/agentStore';
import { useProjectStore } from '@/stores/projectStore';
import { useProjectKanbanStore } from '@/stores/projectKanbanStore';
import { useTaskStore } from '@/stores/taskStore';
import { Agent } from '@/types';
import { DEFAULT_AGENTS } from '@/data/defaultAgents';
import { showToast } from '@/components/Toast';

/* ─── 类型 ───────────────────────────────────────────────────── */
/** 节点类型：serial=下行串行  parallel=并行（与上一节点同层） */
type NodeType = 'serial' | 'parallel';

interface FlowNode {
  id: string;
  name: string;
  nodeType: NodeType;
  agentIds: string[];
  desc: string;
}

/** 决策人：user 表示「用户」，否则为智能体 id */
type DecisionMaker = 'user' | string;

const PRIORITY = ['普通', '高优先级', '紧急'];

/* ─── 标签工具 ──────────────────────────────────────────────── */
const PRESET_TAGS = ['优先级高', '待跟进', '阻塞中', 'Bug', 'Feature', '文档', '重构', '需评审'];

const TAG_COLOR_POOL: { bg: string; border: string; text: string }[] = [
  { bg: '#eff6ff', border: '#bfdbfe', text: '#1d4ed8' },
  { bg: '#f0fdf4', border: '#bbf7d0', text: '#15803d' },
  { bg: '#fdf4ff', border: '#e9d5ff', text: '#7c3aed' },
  { bg: '#fff7ed', border: '#fed7aa', text: '#c2410c' },
  { bg: '#fef2f2', border: '#fecaca', text: '#b91c1c' },
  { bg: '#ecfdf5', border: '#a7f3d0', text: '#065f46' },
  { bg: '#f0f9ff', border: '#bae6fd', text: '#0369a1' },
  { bg: '#fafaf9', border: '#e7e5e4', text: '#44403c' },
];
function getTagColor(tag: string) {
  let h = 0;
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) >>> 0;
  return TAG_COLOR_POOL[h % TAG_COLOR_POOL.length];
}

/* ─── 工具 ───────────────────────────────────────────────────── */
function nowLocal() {
  const d = new Date(); d.setSeconds(0, 0);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/* ─── 智能体头像 ─────────────────────────────────────────────── */
function AgentAvatar({ agent, size = 28 }: { agent: Agent; size?: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: agent.color + '22',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: agent.color, fontWeight: 700,
      fontSize: size <= 18 ? 9 : size < 30 ? 11 : 13,
      border: `1.5px solid ${agent.color}44`,
    }}>
      {agent.name.charAt(0)}
    </div>
  );
}

/* ─── 分区标题 ───────────────────────────────────────────────── */
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 13, fontWeight: 700, color: '#374151',
      marginBottom: 12, paddingBottom: 8,
      borderBottom: '1px solid #f0f0f0',
      display: 'flex', alignItems: 'center', gap: 6,
    }}>{children}</div>
  );
}

/* ─── 通用弹窗容器 ───────────────────────────────────────────── */
function Modal({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div ref={ref} onClick={e => { if (e.target === ref.current) onClose(); }} style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(3px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {children}
    </div>
  );
}

/* ─── 智能体多选弹窗 ─────────────────────────────────────────── */
function AgentPicker({ agentList, selected, onClose, onConfirm }: {
  agentList: Agent[]; selected: string[];
  onClose: () => void; onConfirm: (ids: string[]) => void;
}) {
  const [draft, setDraft] = useState<Set<string>>(new Set(selected));
  const toggle = (id: string) =>
    setDraft(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  return (
    <Modal onClose={onClose}>
      <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.14)', width: 660, maxWidth: 'calc(100vw - 32px)', maxHeight: '70vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', marginBottom: 32 }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: '#1a202c' }}>
            选择智能体
            <span style={{ fontSize: 12, color: '#9ca3af', fontWeight: 400, marginLeft: 8 }}>已选 {draft.size} 个</span>
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', display: 'flex', padding: 2 }}><X size={16} /></button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 7 }}>
          {agentList.map(agent => {
            const sel = draft.has(agent.id);
            return (
              <div key={agent.id} onClick={() => toggle(agent.id)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8, cursor: 'pointer', border: `1.5px solid ${sel ? '#2a3b4d' : '#e5e7eb'}`, background: sel ? '#2a3b4d08' : '#fff', transition: 'all 0.15s' }}>
                <AgentAvatar agent={agent} size={32} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: '#1a202c' }}>{agent.name}</div>
                  {agent.modelName ? (
                    <div style={{ fontSize: 11, color: '#6366f1', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {agent.modelProvider ? `${agent.modelProvider} · ` : ''}{agent.modelName}
                      {agent.temperature != null ? ` · T=${agent.temperature}` : ''}
                      {agent.maxTokens != null ? ` · ${agent.maxTokens}tk` : ''}
                    </div>
                  ) : (
                    <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>Auto</div>
                  )}
                </div>
                <div style={{ width: 18, height: 18, borderRadius: '50%', flexShrink: 0, border: `1.5px solid ${sel ? '#2a3b4d' : '#d1d5db'}`, background: sel ? '#2a3b4d' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {sel && <Check size={10} color="#fff" strokeWidth={3} />}
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ padding: '12px 18px', borderTop: '1px solid #f0f0f0', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} style={{ padding: '7px 18px', borderRadius: 7, border: '1px solid #d1d5db', background: '#fff', color: '#6b7280', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>取消</button>
          <button onClick={() => onConfirm([...draft])} style={{ padding: '7px 20px', borderRadius: 7, border: 'none', background: '#2a3b4d', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>确认</button>
        </div>
      </div>
    </Modal>
  );
}

/* ─── 决策人单选弹窗 ─────────────────────────────────────────── */
function DecisionPicker({ agentList, current, onClose, onConfirm }: {
  agentList: Agent[]; current: DecisionMaker | null;
  onClose: () => void; onConfirm: (v: DecisionMaker) => void;
}) {
  const [draft, setDraft] = useState<DecisionMaker | null>(current);
  return (
    <Modal onClose={onClose}>
      <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.14)', width: 660, maxWidth: 'calc(100vw - 32px)', maxHeight: '70vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', marginBottom: 32 }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: '#1a202c' }}>选择决策人</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', display: 'flex', padding: 2 }}><X size={16} /></button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 7 }}>
          {/* 用户选项 */}
          {(['user'] as const).map(() => {
            const sel = draft === 'user';
            return (
              <div key="user" onClick={() => setDraft('user')} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8, cursor: 'pointer', border: `1.5px solid ${sel ? '#2a3b4d' : '#e5e7eb'}`, background: sel ? '#2a3b4d08' : '#fff', transition: 'all 0.15s' }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <UserCircle2 size={18} color="#6b7280" />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: '#1a202c' }}>用户</div>
                  <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>由人工用户负责决策</div>
                </div>
                <div style={{ width: 18, height: 18, borderRadius: '50%', border: `1.5px solid ${sel ? '#2a3b4d' : '#d1d5db'}`, background: sel ? '#2a3b4d' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {sel && <Check size={10} color="#fff" strokeWidth={3} />}
                </div>
              </div>
            );
          })}
          {/* 智能体选项 */}
          {agentList.map(agent => {
            const sel = draft === agent.id;
            return (
              <div key={agent.id} onClick={() => setDraft(agent.id)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8, cursor: 'pointer', border: `1.5px solid ${sel ? '#2a3b4d' : '#e5e7eb'}`, background: sel ? '#2a3b4d08' : '#fff', transition: 'all 0.15s' }}>
                <AgentAvatar agent={agent} size={32} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: '#1a202c' }}>{agent.name}</div>
                  <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>{agent.writingStyle}</div>
                </div>
                <div style={{ width: 18, height: 18, borderRadius: '50%', border: `1.5px solid ${sel ? '#2a3b4d' : '#d1d5db'}`, background: sel ? '#2a3b4d' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {sel && <Check size={10} color="#fff" strokeWidth={3} />}
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ padding: '12px 18px', borderTop: '1px solid #f0f0f0', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} style={{ padding: '7px 18px', borderRadius: 7, border: '1px solid #d1d5db', background: '#fff', color: '#6b7280', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>取消</button>
          <button disabled={!draft} onClick={() => draft && onConfirm(draft)} style={{ padding: '7px 20px', borderRadius: 7, border: 'none', background: draft ? '#2a3b4d' : '#9ca3af', color: '#fff', fontSize: 13, fontWeight: 600, cursor: draft ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>确认</button>
        </div>
      </div>
    </Modal>
  );
}

/* ─── 添加节点选项弹出菜单 ───────────────────────────────────── */
function AddNodeMenu({ anchorRef, onAdd, onClose }: {
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  onAdd: (type: NodeType) => void;
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node) &&
          anchorRef.current && !anchorRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [anchorRef, onClose]);

  return (
    <div ref={menuRef} style={{
      position: 'absolute', bottom: '110%', left: '50%', transform: 'translateX(-50%)',
      background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10,
      boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
      padding: '8px', display: 'flex', gap: 8, zIndex: 100,
      whiteSpace: 'nowrap',
    }}>
      {/* 小三角 */}
      <div style={{ position: 'absolute', bottom: -6, left: '50%', transform: 'translateX(-50%)', width: 10, height: 6, overflow: 'hidden' }}>
        <div style={{ width: 10, height: 10, background: '#fff', border: '1px solid #e5e7eb', transform: 'rotate(45deg) translate(-3px,-3px)' }} />
      </div>
      <button onClick={() => { onAdd('serial'); onClose(); }} style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
        padding: '10px 18px', borderRadius: 8, border: '1.5px solid #e5e7eb',
        background: '#fff', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
      }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = '#2a3b4d'; e.currentTarget.style.background = '#f5f7fa'; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.background = '#fff'; }}
      >
        <ArrowDown size={18} color="#2a3b4d" />
        <span style={{ fontSize: 12, color: '#374151', fontWeight: 600 }}>下行节点</span>
        <span style={{ fontSize: 11, color: '#9ca3af' }}>串行向下执行</span>
      </button>
      <button onClick={() => { onAdd('parallel'); onClose(); }} style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
        padding: '10px 18px', borderRadius: 8, border: '1.5px solid #e5e7eb',
        background: '#fff', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
      }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = '#2a3b4d'; e.currentTarget.style.background = '#f5f7fa'; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.background = '#fff'; }}
      >
        <GitBranch size={18} color="#6366f1" />
        <span style={{ fontSize: 12, color: '#374151', fontWeight: 600 }}>并行节点</span>
        <span style={{ fontSize: 11, color: '#9ca3af' }}>与上节点并行</span>
      </button>
    </div>
  );
}

/* ─── 初始预设节点 ───────────────────────────────────────────── */
function makeDefaultNode(): FlowNode {
  return { id: Date.now().toString(), name: '', nodeType: 'serial', agentIds: [], desc: '' };
}

/* ─── 主页面 ─────────────────────────────────────────────────── */
export function AgentConsole() {
  const navigate = useNavigate();
  const location = useLocation();
  const { agents, fetchAgents } = useAgentStore();
  const { fetchProjects, createProject, projects: backendProjects } = useProjectStore();
  const { addProject, updateProject, restoreFromPersist: restoreProjectKanban } = useProjectKanbanStore();
  const { updateTask, addTask, restoreFromPersist: restoreTasks } = useTaskStore();
  useEffect(() => {
    fetchAgents();
    fetchProjects();
    // Day 2: 任务/项目看板恢复链路补全（此前从未调用，刷新后看板数据丢失）
    restoreTasks().catch(() => {});
    restoreProjectKanban().catch(() => {});
  }, [fetchAgents, fetchProjects, restoreTasks, restoreProjectKanban]);
  const agentList = agents.length > 0 ? agents : DEFAULT_AGENTS;

  /* 从看板「编辑」跳转时带入的预填数据 */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const locationState = location.state as any;
  const editProject = locationState?.editProject ?? null;
  const editTask    = locationState?.editTask    ?? null;
  /** 统一预填源：任务优先，其次项目 */
  const prefill = editTask ?? editProject ?? null;

  /** 优先级反向映射：KanbanProject/Task priority → PRIORITY 标签 */
  const priorityRevMap: Record<string, string> = {
    high: '紧急', mid: '高优先级', low: '普通',
  };

  /* 表单 */
  const [taskName, setTaskName] = useState(() => prefill?.title ?? '');
  const [taskDesc, setTaskDesc] = useState(() => prefill?.description ?? '');
  const [taskGoal, setTaskGoal] = useState('');
  const [priority, setPriority] = useState(() =>
    prefill?.priority ? (priorityRevMap[prefill.priority] ?? PRIORITY[0]) : PRIORITY[0]
  );
  const [tags, setTags] = useState<string[]>(() => prefill?.tags ?? []);
  const [tagInput, setTagInput] = useState('');
  const [showTagPopup, setShowTagPopup] = useState(false);
  const tagPopupRef = useRef<HTMLDivElement>(null);

  /* 点击弹窗外部时关闭标签弹窗 */
  useEffect(() => {
    if (!showTagPopup) return;
    function handleClick(e: MouseEvent) {
      if (tagPopupRef.current && !tagPopupRef.current.contains(e.target as Node)) {
        setShowTagPopup(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showTagPopup]);
  const [startTime, setStartTime] = useState(nowLocal);
  const [endTime, setEndTime] = useState('');
  const [decisionMaker, setDecisionMaker] = useState<DecisionMaker | null>(null);

  /* 流程节点 */
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
      const restored: FlowNode[] = backendMatch.workflowNodes.map(n => ({
        id: n.id,
        name: n.name,
        nodeType: n.nodeType as 'serial' | 'parallel',
        agentIds: n.agentIds,
        desc: n.taskDesc ?? '',
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
  const [showDecisionPicker, setShowDecisionPicker] = useState(false);
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

  /* 决策人显示名 */
  const decisionLabel = decisionMaker === null ? null
    : decisionMaker === 'user' ? '用户'
    : agentList.find(a => a.id === decisionMaker)?.name ?? decisionMaker;
  const decisionAgent = decisionMaker && decisionMaker !== 'user'
    ? agentList.find(a => a.id === decisionMaker) : null;

  /* 操作 */
  const canCreate = taskName.trim().length > 0;

  /** 优先级映射 */
  const priorityMap: Record<string, 'high' | 'mid' | 'low'> = {
    '紧急': 'high', '高优先级': 'mid', '普通': 'low',
  };

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
        priority: priorityMap[priority] ?? 'low',
        tags,
        agent: assignedAgent?.name ?? editTask.agent,
        agentColor: assignedAgent?.color ?? editTask.agentColor,
        agents: allAgents.length > 0
          ? allAgents
          : [{ name: assignedAgent?.name ?? editTask.agent, color: assignedAgent?.color ?? editTask.agentColor }],
      });
      navigate(-1);
      return;
    }

    /* ── 编辑项目 ── */
    if (editProject) {
      // 直接使用真实参与智能体列表，不补假数据
      const projectAgents = allAgents.length > 0
        ? allAgents
        : [{ name: assignedAgent?.name ?? editProject.agent, color: assignedAgent?.color ?? editProject.agentColor }];

      // 同步工作流数据到后端
      const { updateProject: updateProjectBackend } = useProjectStore.getState();
      try {
        await updateProjectBackend(editProject.backendId ?? editProject.id, {
          title: name,
          description: taskDesc.trim(),
          tags,
          goal: taskGoal.trim(),
          priority: priorityMap[priority] ?? 'low',
          startTime: startTime || '',
          endTime: endTime || '',
          decisionMaker: decisionMaker ?? '',
          workflowNodes: nodes.map(n => ({
            id: n.id,
            name: n.name,
            nodeType: n.nodeType,
            agentIds: n.agentIds,
            taskDesc: n.name,  // 节点名称即为任务目标
          })) as any,
        });
      } catch {
        // 后端不可用时静默处理
      }

      // 更新前端看板 store
      updateProject(editProject.id, {
        title: name,
        description: taskDesc.trim(),
        priority: priorityMap[priority] ?? 'low',
        tags,
        agent: assignedAgent?.name ?? editProject.agent,
        agentColor: assignedAgent?.color ?? editProject.agentColor,
        agents: projectAgents,
        taskCount: nodes.length,
        memberCount: allAgents.length || 1,
      });
      navigate(-1);
      return;
    }

    /* ── 新建项目（原有逻辑）── */
    // 修复日期计算：用 Date 对象正确处理跨月
    const dueDate30 = new Date(Date.now() + 30 * 86400000);
    const dueMm = String(dueDate30.getMonth() + 1).padStart(2, '0');
    const dueDd = String(dueDate30.getDate()).padStart(2, '0');

    // 优先使用后端返回的真实 ID，避免 kanban 与后端 ID 不一致导致刷新后重复
    let realProjectId = `proj_${Date.now()}`; // 后端不可用时的 fallback
    try {
      // 写入后端 projects 表（含完整工作流数据），返回含真实 id 的 Project 对象
      const created = await createProject({
        title: name,
        description: taskDesc.trim(),
        tags,
        status: 'active',
        goal: taskGoal.trim(),
        priority: priorityMap[priority] ?? 'low',
        startTime: startTime || '',
        endTime: endTime || '',
        decisionMaker: decisionMaker ?? '',
        workflowNodes: nodes.map(n => ({
          id: n.id,
          name: n.name,
          nodeType: n.nodeType,
          agentIds: n.agentIds,
          taskDesc: n.name,  // 节点名称即为任务目标
        })),
      });
      // 使用后端真实 ID，防止刷新后 AgentKanban.useEffect 重新同步时出现重复项
      realProjectId = created.id;
    } catch {
      // 后端不可用时静默处理，继续添加到 kanban store（使用临时 ID）
    }

    // 同步到看板 kanban store（前端全局状态）
    addProject({
      id: realProjectId,
      title: name,
      description: taskDesc.trim(),
      tags,
      priority: priorityMap[priority] ?? 'low',
      agent: assignedAgent?.name ?? '策划助手',
      agentColor: assignedAgent?.color ?? '#6366f1',
      // 直接使用真实参与智能体列表，不补假数据
      agents: allAgents.length > 0
        ? allAgents
        : [{ name: assignedAgent?.name ?? '策划助手', color: assignedAgent?.color ?? '#6366f1' }],
      progress: 0,
      dueDate: endTime ? endTime.slice(0, 10).replace(/-/g, '/').slice(5) : `${dueMm}/${dueDd}`,
      updatedAt: '刚刚',
      taskCount: nodes.length,
      memberCount: allAgents.length || 1,
    }, 'progress');

    handleReset();
    // 修复：传入后端真实 projectId 和 agentNames，确保 workspace 以项目模式打开
    navigate('/workspace', {
      state: {
        projectName: name,
        projectId: realProjectId,
        agentNames: allAgents.map(a => a.name),
      },
    });
  }
  function handleReset() {
    setTaskName(''); setTaskDesc(''); setTaskGoal('');
    setPriority(PRIORITY[0]);
    setTags([]); setTagInput('');
    setStartTime(nowLocal()); setEndTime('');
    setDecisionMaker(null);
    setNodes([makeDefaultNode()]);
  }

  const pickerNode = pickerNodeId ? nodes.find(n => n.id === pickerNodeId) : null;

  return (
    <>
      <style>{`
        .pc-wrap {
          width: 100%; height: 100%;
          display: flex; flex-direction: column;
          font-family: "Microsoft YaHei", "Segoe UI", sans-serif;
          background: #f5f7fa; padding: 16px; box-sizing: border-box; overflow: hidden;
        }
        .pc-shell {
          flex: 1; min-height: 0; display: flex; flex-direction: column;
          background: #fafbfc; border: 1px solid #e5e6eb;
          border-radius: 12px; box-shadow: 0 1px 4px rgba(0,0,0,0.05); overflow: hidden;
        }
        .pc-header {
          padding: 16px 32px; border-bottom: 1px solid #e5e6eb; background: #fff;
          display: flex; align-items: center; justify-content: space-between; flex-shrink: 0;
        }
        .pc-main {
          flex: 1; min-height: 0; display: grid;
          grid-template-columns: 360px 1fr; overflow: hidden;
        }
        .pc-left {
          border-right: 1px solid #ebebeb; overflow-y: auto; overflow-x: hidden;
          flex: 1; min-height: 0;
          padding: 18px 20px; display: flex; flex-direction: column; gap: 0; background: #fff;
        }
        .pc-right {
          overflow-y: auto; padding: 18px 20px;
          display: flex; flex-direction: column; gap: 0; background: #f5f7fa;
        }
        .pc-footer {
          padding: 11px 24px; border-top: 1px solid #ebebeb; background: #fff;
          display: flex; align-items: center; justify-content: center; gap: 10px; flex-shrink: 0;
        }
        .pc-label { display: block; font-size: 12px; font-weight: 600; color: #374151; margin-bottom: 5px; }
        .pc-label em { color: #ef4444; font-style: normal; margin-left: 2px; }
        .pc-input, .pc-textarea {
          width: 100%; padding: 7px 10px; border: 1px solid #d1d5db; border-radius: 7px;
          font-size: 13px; font-family: inherit; color: #111827; background: #fff;
          outline: none; box-sizing: border-box; transition: border-color 0.15s;
        }
        .pc-input:focus, .pc-textarea:focus { border-color: #2a3b4d; }
        .pc-textarea { resize: none; }
        .pc-tag {
          display: inline-block; padding: 3px 11px; border: 1px solid #e5e7eb; border-radius: 20px;
          font-size: 12px; cursor: pointer; user-select: none; background: #fff; color: #4a5568; transition: all 0.15s;
        }
        .pc-tag.active { background: #2a3b4d; border-color: #2a3b4d; color: #fff; }
        .pc-tag:hover:not(.active) { border-color: #2a3b4d; color: #2a3b4d; }
        /* 流程节点 */
        .pc-node { border: 1px solid #e5e7eb; border-radius: 9px; background: transparent; overflow: hidden; }
        .pc-node.parallel { border-color: #a5b4fc; }
        .pc-node-hd {
          display: flex; align-items: center; gap: 6px; padding: 7px 11px; border-bottom: 1px solid #f0f0f0;
        }
        .pc-node.parallel .pc-node-hd { border-bottom-color: #e0e7ff; }
        .pc-node-bd { padding: 10px 12px; }
        .pc-node-name {
          flex: 1; border: none; border-bottom: 1.5px solid transparent; outline: none;
          font-size: 13px; font-weight: 600; color: #374151;
          background: transparent; font-family: inherit; min-width: 0;
          transition: border-color 0.15s;
        }
        .pc-node-name:focus { background: #f9fafb; border-radius: 4px; padding: 1px 4px; }
        .pc-arrow { display: flex; justify-content: center; padding: 2px 0; color: #d1d5db; }
        .pc-parallel-label {
          display: inline-flex; align-items: center; gap: 4px;
          padding: 2px 8px; border-radius: 20px;
          font-size: 11px; background: #ede9fe; color: #6d28d9; border: 1px solid #c4b5fd;
          margin-right: 4px;
        }
        /* 添加节点按钮（相对定位，供菜单定锚） */
        .pc-add-wrap { position: relative; margin-top: 10px; }
        .pc-add-node-btn {
          width: 100%; padding: 8px 0;
          border: 1.5px dashed #d1d5db; border-radius: 8px;
          background: transparent; color: #6b7280; font-size: 13px; cursor: pointer;
          font-family: inherit; display: flex; align-items: center; justify-content: center; gap: 5px;
          transition: all 0.15s;
        }
        .pc-add-node-btn:hover, .pc-add-node-btn.open {
          border-color: #2a3b4d; color: #2a3b4d; background: #eef1f4;
        }
        .pc-pick-btn {
          display: inline-flex; align-items: center; gap: 5px;
          padding: 4px 11px; border-radius: 7px; border: 1px dashed #d1d5db;
          background: transparent; color: #6b7280; font-size: 12px; cursor: pointer;
          font-family: inherit; transition: all 0.15s;
        }
        .pc-pick-btn:hover { border-color: #2a3b4d; color: #2a3b4d; background: #eef1f4; }
        .pc-agent-tag {
          display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; border-radius: 20px;
          font-size: 12px; background: #2a3b4d12; border: 1px solid #2a3b4d30; color: #2a3b4d; cursor: pointer;
        }
        /* 决策人选择器 */
        .pc-decision-btn {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 6px 12px; border-radius: 8px; border: 1.5px dashed #d1d5db;
          background: transparent; color: #6b7280; font-size: 13px; cursor: pointer;
          font-family: inherit; transition: all 0.15s; width: 100%; box-sizing: border-box;
        }
        .pc-decision-btn:hover { border-color: #2a3b4d; color: #2a3b4d; background: #f5f7fa; }
        .pc-decision-btn.selected { border-style: solid; border-color: #2a3b4d; color: #2a3b4d; background: #2a3b4d08; }
        /* 操作按钮 */
        .pc-btn-cancel {
          padding: 7px 18px; border-radius: 7px; border: 1px solid #d1d5db; background: #fff;
          color: #6b7280; font-size: 13px; cursor: pointer; font-family: inherit; transition: all 0.15s;
        }
        .pc-btn-cancel:hover { border-color: #e53e3e; color: #e53e3e; background: #fff5f5; }
        .pc-btn-create {
          padding: 7px 22px; border-radius: 7px; border: none; background: #2a3b4d;
          color: #fff; font-size: 13px; font-weight: 600; cursor: pointer; font-family: inherit; transition: background 0.15s;
        }
        .pc-btn-create:hover:not(:disabled) { background: #1e2d3d; }
        .pc-btn-create:disabled { background: #9ca3af; cursor: not-allowed; }
        .pc-field { margin-bottom: 11px; }
      `}</style>

      <div className="pc-wrap">
        <div className="pc-shell">

          {/* ── Header ── */}
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

          {/* ── 双栏主体 ── */}
          <div className="pc-main">

            {/* ═══ 左栏 ═══ */}
            <div className="pc-left">

              <div className="pc-field">
                <label className="pc-label">任务名称<em>*</em></label>
                <input className="pc-input" placeholder={editTask ? '为本次任务起一个名字…' : '为本次协作项目起一个名字…'}
                  value={taskName} onChange={e => setTaskName(e.target.value)} />
              </div>

              <div className="pc-field">
                <label className="pc-label">任务描述</label>
                <textarea className="pc-textarea" style={{ height: 76 }} placeholder={editTask ? '描述任务背景与预期产出…' : '描述项目背景与预期产出…'}
                  value={taskDesc} onChange={e => setTaskDesc(e.target.value)} />
              </div>

              {/* 项目目标（任务模式隐藏） */}
              {!editTask && (
              <div className="pc-field">
                <label className="pc-label">项目目标</label>
                <textarea className="pc-textarea" style={{ height: 76 }} placeholder="本次项目期望达成的核心目标…"
                  value={taskGoal} onChange={e => setTaskGoal(e.target.value)} />
              </div>
              )}

              {/* 项目决策人（任务模式隐藏） */}
              {!editTask && (
              <div className="pc-field">
                <label className="pc-label">项目决策人</label>
                <button
                  className={`pc-decision-btn${decisionMaker ? ' selected' : ''}`}
                  onClick={() => setShowDecisionPicker(true)}
                >
                  {decisionMaker === null ? (
                    <><Users size={14} /> 选择决策人（智能体或用户）</>
                  ) : decisionMaker === 'user' ? (
                    <><UserCircle2 size={14} /> 用户</>
                  ) : decisionAgent ? (
                    <><AgentAvatar agent={decisionAgent} size={18} /> {decisionLabel}</>
                  ) : null}
                </button>
              </div>
              )}

              <div className="pc-field">
                <label className="pc-label">优先级</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {PRIORITY.map(p => (
                    <span key={p} className={`pc-tag${priority === p ? ' active' : ''}`}
                      onClick={() => setPriority(p)}>{p}</span>
                  ))}
                </div>
              </div>

              {/* ── 标签编辑 ── */}
              <div className="pc-field">
                <label className="pc-label">标签</label>

                {/* 标签栏：显示已选标签 + 点击 + 号唤起弹窗 */}
                <div ref={tagPopupRef} style={{ position: 'relative' }}>
                  <div
                    style={{
                      display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 5,
                      minHeight: 34, padding: '4px 8px',
                      background: '#fafafa', border: '1.5px solid #e5e7eb', borderRadius: 8,
                      cursor: 'pointer', boxSizing: 'border-box',
                      transition: 'border-color 0.15s',
                    }}
                    onClick={() => setShowTagPopup(v => !v)}
                    onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = '#a855f7'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = showTagPopup ? '#a855f7' : '#e5e7eb'; }}
                  >
                    {tags.length === 0 && (
                      <span style={{ fontSize: 12, color: '#d1d5db', lineHeight: '24px', userSelect: 'none', flex: 1 }}>
                        点击添加标签…
                      </span>
                    )}
                    {tags.map(tag => {
                      const c = getTagColor(tag);
                      return (
                        <span key={tag} style={{
                          display: 'inline-flex', alignItems: 'center', gap: 3,
                          fontSize: 12, padding: '2px 8px 2px 10px', borderRadius: 20,
                          background: c.bg, color: c.text, border: `1px solid ${c.border}`,
                          fontWeight: 500, lineHeight: 1.5,
                        }}>
                          {tag}
                          <button
                            onClick={e => { e.stopPropagation(); setTags(prev => prev.filter(t => t !== tag)); }}
                            style={{
                              background: 'none', border: 'none', cursor: 'pointer',
                              padding: '0 1px', lineHeight: 1, color: c.text,
                              opacity: 0.45, fontSize: 15, display: 'flex', alignItems: 'center',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.opacity = '1'; }}
                            onMouseLeave={e => { e.currentTarget.style.opacity = '0.45'; }}
                            title="移除标签"
                          >×</button>
                        </span>
                      );
                    })}
                    {/* + 图标 */}
                    <span style={{
                      width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      background: showTagPopup ? '#ede9fe' : '#f3f4f6',
                      color: showTagPopup ? '#7c3aed' : '#9ca3af',
                      fontSize: 16, lineHeight: 1, transition: 'all 0.12s',
                    }}>+</span>
                  </div>

                  {/* 浮层弹窗 */}
                  {showTagPopup && (
                    <div style={{
                      position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0,
                      background: '#fff', borderRadius: 10,
                      border: '1px solid #e5e7eb',
                      boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                      zIndex: 200, padding: '14px 14px 12px',
                    }}>
                      {/* 快捷预设标签 */}
                      <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600, letterSpacing: '0.04em', marginBottom: 8 }}>快捷标签</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 12 }}>
                        {PRESET_TAGS.map(pt => {
                          const selected = tags.includes(pt);
                          const c = getTagColor(pt);
                          return (
                            <button key={pt}
                              onClick={() => {
                                if (selected) setTags(prev => prev.filter(t => t !== pt));
                                else setTags(prev => [...prev, pt]);
                              }}
                              style={{
                                padding: '3px 10px', borderRadius: 20, fontSize: 11,
                                border: `1px solid ${selected ? c.border : '#e5e7eb'}`,
                                background: selected ? c.bg : '#fff',
                                color: selected ? c.text : '#6b7280',
                                cursor: 'pointer', fontWeight: selected ? 600 : 400,
                                transition: 'all 0.12s', outline: 'none',
                                display: 'inline-flex', alignItems: 'center', gap: 3,
                                fontFamily: '"Microsoft YaHei","Segoe UI",sans-serif',
                              }}
                              onMouseEnter={e => { if (!selected) { e.currentTarget.style.borderColor = c.border; e.currentTarget.style.background = c.bg + 'cc'; e.currentTarget.style.color = c.text; } }}
                              onMouseLeave={e => { if (!selected) { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.background = '#fff'; e.currentTarget.style.color = '#6b7280'; } }}
                            >
                              {selected
                                ? <svg width="9" height="9" viewBox="0 0 10 10" fill="none"><path d="M1.5 5L4 7.5L8.5 2.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                : <span style={{ opacity: 0.5 }}>+</span>}
                              {pt}
                            </button>
                          );
                        })}
                      </div>

                      {/* 自定义输入 */}
                      <div style={{ display: 'flex', gap: 6 }}>
                        <input
                          autoFocus
                          value={tagInput}
                          onChange={e => setTagInput(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              const t = tagInput.trim();
                              if (t && !tags.includes(t)) setTags(prev => [...prev, t]);
                              setTagInput('');
                            }
                            if (e.key === 'Escape') setShowTagPopup(false);
                          }}
                          placeholder="自定义标签，Enter 确认"
                          style={{
                            flex: 1, height: 32, fontSize: 12, padding: '0 10px',
                            border: '1.5px solid #e5e7eb', borderRadius: 7, outline: 'none',
                            fontFamily: '"Microsoft YaHei","Segoe UI",sans-serif', color: '#374151',
                            transition: 'border-color 0.15s', boxSizing: 'border-box',
                          }}
                          onFocus={e => { e.currentTarget.style.borderColor = '#6366f1'; }}
                          onBlur={e => { e.currentTarget.style.borderColor = '#e5e7eb'; }}
                        />
                        <button
                          onClick={() => {
                            const t = tagInput.trim();
                            if (t && !tags.includes(t)) setTags(prev => [...prev, t]);
                            setTagInput('');
                          }}
                          style={{
                            height: 32, padding: '0 12px', fontSize: 12, fontWeight: 600,
                            border: 'none', borderRadius: 7,
                            background: '#6366f1', color: '#fff', cursor: 'pointer',
                            fontFamily: '"Microsoft YaHei","Segoe UI",sans-serif',
                            transition: 'background 0.15s',
                          }}
                          onMouseEnter={e => { e.currentTarget.style.background = '#4f46e5'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = '#6366f1'; }}
                        >添加</button>
                      </div>
                    </div>
                  )}
                </div>
              </div>



              <div className="pc-field">
                <label className="pc-label">开始时间</label>
                <input className="pc-input" type="datetime-local"
                  value={startTime} onChange={e => setStartTime(e.target.value)} />
              </div>

              <div className="pc-field">
                <label className="pc-label">结束时间</label>
                <input className="pc-input" type="datetime-local"
                  value={endTime} onChange={e => setEndTime(e.target.value)} />
              </div>
            </div>

            {/* ═══ 右栏：协作流程 ═══ */}
            <div className="pc-right">
              <SectionTitle>协作流程设置</SectionTitle>

              {/* 把节点列表分组成"行"：每遇到 serial 节点开新行，parallel 节点追加到当前行 */}
              {(() => {
                // 分组
                const rows: FlowNode[][] = [];
                nodes.forEach(n => {
                  if (n.nodeType === 'serial' || rows.length === 0) {
                    rows.push([n]);
                  } else {
                    rows[rows.length - 1].push(n);
                  }
                });

                // 计算每个节点在 nodes[] 中的全局索引（用于上移/下移/删除）
                const globalIdx = (nodeId: string) => nodes.findIndex(n => n.id === nodeId);

                return rows.map((row, rowIdx) => (
                  <div key={row[0].id + '-row'}>
                    {/* 行间箭头（串行向下，第一行不显示） */}
                    {rowIdx > 0 && (
                      <div className="pc-arrow"><ArrowDown size={14} /></div>
                    )}

                    {/* 一行内可能有多个节点（并行）*/}
                    <div style={{ display: 'flex', gap: 0, alignItems: 'stretch' }}>
                      {row.map((node, colIdx) => {
                        const gIdx = globalIdx(node.id);
                        return (
                          <div key={node.id} style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'stretch' }}>
                            {/* 同行并行节点间的竖线 + 并行符号 */}
                            {colIdx > 0 && (
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: 28, flexShrink: 0, gap: 2 }}>
                                <div style={{ flex: 1, width: 1, background: '#c7d2fe', minHeight: 20 }} />
                                <span style={{ fontSize: 14, color: '#818cf8', fontWeight: 700, lineHeight: 1 }}>⇋</span>
                                <div style={{ flex: 1, width: 1, background: '#c7d2fe', minHeight: 20 }} />
                              </div>
                            )}
                            <div style={{ flex: 1, minWidth: 0 }}>
                            <div className={`pc-node${node.nodeType === 'parallel' ? ' parallel' : ''}`}>
                              {/* 节点 header */}
                              <div className="pc-node-hd">
                                <div style={{ width: 19, height: 19, borderRadius: '50%', background: node.nodeType === 'parallel' ? '#6366f1' : '#2a3b4d', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>{gIdx + 1}</div>

                                {node.nodeType === 'parallel' && (
                                  <span className="pc-parallel-label">
                                    <GitBranch size={10} /> 并行
                                  </span>
                                )}

                                <input className="pc-node-name" value={node.name}
                                  onChange={e => updateNode(node.id, { name: e.target.value })}
                                  placeholder="请描述你的节点目标（必填）"
                                  style={{ borderBottomColor: node.name.trim() === '' ? '#fca5a5' : 'transparent' }} />

                                <button onClick={() => moveNode(gIdx, -1)} disabled={gIdx === 0}
                                  style={{ background: 'none', border: 'none', cursor: gIdx === 0 ? 'default' : 'pointer', color: gIdx === 0 ? '#e5e7eb' : '#9ca3af', padding: '0 2px', display: 'flex' }}>
                                  <ChevronUp size={14} />
                                </button>
                                <button onClick={() => moveNode(gIdx, 1)} disabled={gIdx === nodes.length - 1}
                                  style={{ background: 'none', border: 'none', cursor: gIdx === nodes.length - 1 ? 'default' : 'pointer', color: gIdx === nodes.length - 1 ? '#e5e7eb' : '#9ca3af', padding: '0 2px', display: 'flex' }}>
                                  <ChevronDown size={14} />
                                </button>
                                <button onClick={() => removeNode(node.id)}
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#d1d5db', padding: '0 2px', display: 'flex', transition: 'color 0.15s' }}
                                  onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                                  onMouseLeave={e => (e.currentTarget.style.color = '#d1d5db')}>
                                  <Trash2 size={13} />
                                </button>
                              </div>

                              {/* 节点 body */}
                              <div className="pc-node-bd">
                                <div>
                                  <label className="pc-label" style={{ fontSize: 12, marginBottom: 6 }}>
                                    分配智能体
                                    <span style={{ color: '#9ca3af', fontWeight: 400, marginLeft: 5 }}>（可多选，同节点并行）</span>
                                  </label>
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                                    {node.agentIds.map(aid => {
                                      const a = agentList.find(x => x.id === aid);
                                      if (!a) return null;
                                      return (
                                        <span key={aid} className="pc-agent-tag" onClick={() => setPickerNodeId(node.id)}>
                                          <AgentAvatar agent={a} size={14} />{a.name}
                                        </span>
                                      );
                                    })}
                                    <button className="pc-pick-btn" onClick={() => setPickerNodeId(node.id)}>
                                      <Users size={12} />{node.agentIds.length === 0 ? '选择智能体' : '修改'}
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>{/* pc-node */}
                            </div>{/* flex:1 wrapper */}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ));
              })()}

              {/* 添加节点按钮 + 弹出菜单 */}
              <div className="pc-add-wrap">
                <button
                  ref={addBtnRef}
                  className={`pc-add-node-btn${showAddMenu ? ' open' : ''}`}
                  onClick={() => setShowAddMenu(v => !v)}
                >
                  <Plus size={13} /> 添加流程节点
                </button>
                {showAddMenu && (
                  <AddNodeMenu
                    anchorRef={addBtnRef}
                    onAdd={addNode}
                    onClose={() => setShowAddMenu(false)}
                  />
                )}
              </div>
            </div>

          </div>

          {/* ── Footer ── */}
          <div className="pc-footer">
            <button className="pc-btn-cancel" onClick={editTask || editProject ? () => navigate(-1) : handleReset}>取消</button>
            <button className="pc-btn-create" disabled={!canCreate} onClick={handleCreate}>
              {editTask || editProject ? '保存' : '确认创建'}
            </button>
          </div>

        </div>
      </div>

      {/* 智能体弹窗 */}
      {pickerNode && (
        <AgentPicker agentList={agentList} selected={pickerNode.agentIds}
          onClose={() => setPickerNodeId(null)}
          onConfirm={ids => confirmAgents(pickerNode.id, ids)} />
      )}

      {/* 决策人弹窗 */}
      {showDecisionPicker && (
        <DecisionPicker agentList={agentList} current={decisionMaker}
          onClose={() => setShowDecisionPicker(false)}
          onConfirm={v => { setDecisionMaker(v); setShowDecisionPicker(false); }} />
      )}
    </>
  );
}
