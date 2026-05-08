import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { PlusCircle, X, Check, ChevronDown, Code2, KeyRound, Eye, EyeOff, Copy, CheckCheck } from 'lucide-react';
import { useAgentStore } from '@/stores/agentStore';
import { useAuthStore } from '@/stores/authStore';
import { DEFAULT_AGENTS } from '@/data/defaultAgents';
import { showToast } from '@/components/Toast';
import apiClient from '@/api/client';
import { tokenChannelsApi, type TokenChannel } from '@/api/tokenChannels';
import { agentsApi } from '@/api/agents';

/* ─── 后端技能类型 ─────────────────────────────────────────── */
interface BackendSkill {
  id: string;
  name: string;
  description: string;
  category: string;
  type: 'builtin' | 'custom';
  enabled: boolean;
}

const STYLE_TAGS  = ['极简简洁', '详细全面', '口语化', '正式专业'];
const OUTPUT_TAGS = ['纯文本', 'Markdown', 'Markdown+完整代码', '结构化JSON'];

const AGENT_TYPE_OPTIONS = [
  { value: 'dev', label: '工程开发类', desc: '对应 rc-dev-agent' },
  { value: 'data', label: '数据分析类', desc: '对应 rc-data-agent' },
  { value: 'creative', label: '内容生成类', desc: '对应 rc-creative-agent' },
  { value: 'pm', label: '项目管理类', desc: '对应 rc-pm-agent' },
  { value: 'research', label: '知识推理类', desc: '对应 rc-research-agent' },
  { value: 'ops', label: '平台策略类', desc: '对应 rc-ops-agent' },
  { value: 'decision', label: '决策支持类', desc: '对应 rc-decision-agent' },
  { value: 'general', label: '通用助手类', desc: '对应 rc-general-agent' },
] as const;

function templateCategoryToAgentType(category?: string): (typeof AGENT_TYPE_OPTIONS)[number]['value'] {
  switch (category) {
    case 'engineering':
    case 'integrations':
    case 'testing':
      return 'dev';
    case 'design':
      return 'creative';
    case 'project-management':
    case 'product':
      return 'pm';
    case 'academic':
      return 'research';
    case 'marketing':
    case 'paid-media':
    case 'strategy':
    case 'sales':
      return 'ops';
    default:
      return 'general';
  }
}

/* ─── CODE 渠道 + 模型预设 ────────────────────────────────── */
interface CodeModel {
  id: string;        // 实际调用的模型 ID（如 doubao-pro-32k-241215）
  name: string;      // 显示名称
  contextWindow: string;
  maxTokens: number;
  temperature: number;
  topP: number;
  frequencyPenalty: number;
  presencePenalty: number;
  badge?: string;
  desc?: string;
}

interface CodeChannel {
  id: string;        // 对应 Token 渠道 id（如 'doubao'、'openai'）
  name: string;      // 渠道显示名称（如 '火山方舟'）
  provider: string;  // 厂商（如 '字节跳动'）
  badge?: string;
  desc: string;
  baseUrl: string;
  authType: 'Bearer' | 'ApiKey' | 'Basic';
  keyLabel?: string;
  keyPlaceholder?: string;
  models: CodeModel[];
  hasBackendKey?: boolean;  // 后台是否已配置 API Key
  isPreset?: boolean;        // 是否为平台预设渠道
}

// CODE 渠道现在完全由管理后台「模型渠道」配置提供
// 这里仅保留一个加载中占位渠道，避免 selectedChannel 为空导致渲染崩溃
const CODE_CHANNELS: CodeChannel[] = [{
  id: '__loading__',
  name: '加载中…',
  provider: 'loading',
  badge: '默认',
  desc: '正在从管理后台加载渠道配置…',
  baseUrl: '',
  authType: 'Bearer' as const,
  models: [{ id: 'loading', name: '加载中…', contextWindow: '-', maxTokens: 4096, temperature: 0.7, topP: 0.95, frequencyPenalty: 0, presencePenalty: 0, desc: '' }],
}];

/* ─── 角标颜色 ─────────────────────────────────────────────── */
const BADGE_COLOR: Record<string, { bg: string; color: string }> = {
  推荐:  { bg: '#e6f4ff', color: '#1677ff' },
  高性能: { bg: '#fff7e6', color: '#d48806' },
  新:    { bg: '#f6ffed', color: '#389e0d' },
  默认:  { bg: '#f0f0f0', color: '#666' },
  后台:  { bg: '#fff0f6', color: '#c41d7f' },
  预设:  { bg: '#fef3c7', color: '#d97706' },   // 后台配置渠道专用标签颜色（粉紫色）
};

// 平台预设渠道标识（无需用户填 Key）

/* ─── Token 本地缓存（按渠道 ID 存取，跨智能体复用） ─── */
const TOKEN_CACHE_PREFIX = 'wb_token_';
interface TokenCache {
  apiKey: string;
  baseUrl: string;
  modelId?: string;
}
function saveTokenCache(channelId: string, data: TokenCache) {
  try { localStorage.setItem(TOKEN_CACHE_PREFIX + channelId, JSON.stringify(data)); } catch { /* ignore */ }
}
function loadTokenCache(channelId: string): TokenCache | null {
  try {
    const raw = localStorage.getItem(TOKEN_CACHE_PREFIX + channelId);
    return raw ? (JSON.parse(raw) as TokenCache) : null;
  } catch { return null; }
}

const AUTH_TYPE_LABEL: Record<string, string> = {
  Bearer: 'Bearer Token',
  ApiKey: 'API Key',
  Basic:  'Basic Auth',
};



/* ═══════════════════════════════════════════════════════════ */
export function AgentCreate() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  const editId = searchParams.get('id');           // 编辑模式：携带 ?id=xxx
  const isEdit = !!editId;

  // 从项目跳转过来时携带的参数
  const fromProject   = searchParams.get('fromProject') === '1';
  const projectTitle  = searchParams.get('projectTitle') ?? '';
  const projectDesc   = searchParams.get('projectDesc') ?? '';
  const projectTags   = searchParams.get('projectTags') ?? '';

  /**
   * 动态渠道列表：以 CODE_CHANNELS 为基础，启动时从后台 /api/token-channels
   * 拉取已配置渠道，将后台独有的渠道（provider 不在静态列表中的）追加进去，
   * 同时将已有渠道中后台配置了 apiKey 的打上「已配置」标记，供 UI 提示。
   */
  const [dynamicChannels, setDynamicChannels] = useState<CodeChannel[]>([]);
  const [presetChannel, setPresetChannel] = useState<TokenChannel | null>(null);

  useEffect(() => {
    apiClient.get('/token-channels')
      .then(res => {
        const rawChannels: Array<{ id: string; provider: string; modelName: string; baseUrl: string; apiKey: string; authType: string; enabled: boolean; priority: number; isPreset?: boolean }> = res.data.data || [];
        if (!rawChannels.length) return;
        const backendChannels = rawChannels.filter(c => c.enabled);
        if (!backendChannels.length) return;

        // 直接使用后端配置的渠道，不再合并静态列表
        const channels: CodeChannel[] = backendChannels.map(bc => ({
          id: bc.provider,
          name: bc.provider,
          provider: bc.provider,
          badge: bc.isPreset ? '预设' : undefined,
          isPreset: !!bc.isPreset,
          hasBackendKey: !!bc.apiKey,
          desc: `由管理员在后台配置的渠道（${bc.baseUrl || 'OpenAI 兼容格式'}）`,
          baseUrl: bc.baseUrl,
          authType: (bc.authType as 'Bearer' | 'ApiKey' | 'Basic') || 'Bearer',
          keyLabel: 'API Key',
          keyPlaceholder: '使用后台配置的 Key（如需覆盖请重新填写）',
          models: bc.modelName
            ? [{
                id: bc.modelName,
                name: bc.modelName,
                contextWindow: '-',
                maxTokens: 4096,
                temperature: 0.7,
                topP: 0.95,
                frequencyPenalty: 0,
                presencePenalty: 0,
                desc: `后台管理员配置的模型`,
              }]
            : [{
                id: 'auto',
                name: 'Auto（后台调度）',
                contextWindow: '-',
                maxTokens: 4096,
                temperature: 0.7,
                topP: 0.95,
                frequencyPenalty: 0,
                presencePenalty: 0,
                desc: `使用后台配置的默认模型`,
              }],
        }));

        setDynamicChannels(channels);

        // 写入本地缓存（仅在没有缓存时）
        for (const bc of backendChannels) {
          if (bc.apiKey) {
            const cacheKey = TOKEN_CACHE_PREFIX + bc.provider;
            if (!localStorage.getItem(cacheKey)) {
              try {
                localStorage.setItem(cacheKey, JSON.stringify({
                  apiKey: bc.apiKey,
                  baseUrl: bc.baseUrl || '',
                }));
              } catch { /* ignore */ }
            }
          }
        }

        // 自动选中预设渠道，否则选第一个
        const presetBc = backendChannels.find(c => c.isPreset);
        const defaultBc = presetBc || backendChannels[0];
        const presetCh = channels.find(c => c.isPreset);
        const defaultCh = presetCh || channels[0];
        if (defaultCh) {
          setSelectedChannel(defaultCh);
          const matchedModel = defaultCh.models.find(m => m.id === defaultBc.modelName) || defaultCh.models[0];
          setSelectedModel(matchedModel);
        }
      })
      .catch(() => {
        // 后端不可用时，移除 loading 占位，使用空数组
        setDynamicChannels([]);
      });
  // 仅挂载时执行一次
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── 获取平台预设（兜底）渠道 ── */
  useEffect(() => {
    tokenChannelsApi.getPreset().then(ch => {
      if (ch) setPresetChannel(ch);
    }).catch(() => {});
  }, []);

  const { getAgentById, fetchAgents, createAgent, updateAgent, agents } = useAgentStore();

  const [name, setName]         = useState('');
  const [role, setRole]         = useState('');
  const [style, setStyle]       = useState('极简简洁');
  const [skills, setSkills]         = useState<string[]>([]);
  const [description, setDescription] = useState('');
  const [boundary, setBoundary]     = useState('');
  const [outputFmt, setOutputFmt]   = useState('Markdown');
  const [agentType, setAgentType]   = useState<(typeof AGENT_TYPE_OPTIONS)[number]['value']>('general');
  // Phase 3: 可见性
  const [visibility, setVisibility] = useState<'private' | 'public' | 'template'>('private');
  // Phase 3: Skill 安全管控
  const [skillsConfig, setSkillsConfig] = useState<Record<string, boolean>>({
    exec: false, shell: false, file_write: false, browser: false,
    web_search: true, file_read: true, image_generation: false,
  });
  // memoryTurns：对话记忆轮数（0 = 不限），对应 DB memory_turns
  const [memoryTurns, setMemoryTurns] = useState('');
  // tempOverride：简单温度快捷覆盖，若填写则优先于 CODE 渠道弹窗里的 customTemp
  const [tempOverride, setTempOverride] = useState('');
  const [saving, setSaving]     = useState(false);

  /* ── 辅助：按 id 查找智能体（store + 默认预设双兜底） ─── */
  function findAgent(id: string) {
    return getAgentById(id) ?? DEFAULT_AGENTS.find(a => a.id === id) ?? null;
  }

  /* ── 预填表单 ─────────────────────────────────────────── */
  function fillForm(agent: ReturnType<typeof findAgent>) {
    if (!agent) return;
    if (!dynamicChannels.length) {
      // 渠道还没加载完，但仍需填充非渠道相关字段
      setName(agent.name);
      setRole(agent.systemPrompt ?? '');
      setStyle(agent.writingStyle ?? '极简简洁');
      setSkills(agent.expertise ?? []);
      setDescription(agent.description ?? '');
      setBoundary((agent as any).boundary ?? '');
      setOutputFmt((agent as any).outputFormat ?? 'Markdown');
      setAgentType(((agent as any).agentType ?? 'general') as (typeof AGENT_TYPE_OPTIONS)[number]['value']);
      setVisibility((agent as any).visibility ?? 'private');
      return;
    }
    setName(agent.name);
    // systemPrompt → 角色设定文本框（role state）
    setRole(agent.systemPrompt ?? '');
    // writingStyle → 语言风格标签（style state）；若值不在预设标签中则保留原值
    setStyle(agent.writingStyle ?? '极简简洁');
    setSkills(agent.expertise ?? []);
    setDescription(agent.description ?? '');
    setBoundary((agent as any).boundary ?? '');
    setOutputFmt((agent as any).outputFormat ?? 'Markdown');
    setAgentType(((agent as any).agentType ?? 'general') as (typeof AGENT_TYPE_OPTIONS)[number]['value']);
    // Phase 3: 回填可见性和 Skill 配置
    setVisibility((agent as any).visibility ?? 'private');
    const sc = (agent as any).skillsConfig;
    if (sc && typeof sc === 'object') setSkillsConfig(sc);
    setMemoryTurns((agent as any).memoryTurns != null && (agent as any).memoryTurns !== 0 ? String((agent as any).memoryTurns) : '');
    const to = (agent as any).temperatureOverride;
    setTempOverride(to != null ? String(to) : '');

    // 回填模型参数
    if (agent.modelName) {
      // 从 dynamicChannels（含后台配置渠道）中找到匹配的渠道
      const matchedChannel = dynamicChannels.find(ch =>
        ch.provider === (agent.modelProvider ?? '') || ch.models.some(m => m.id === agent.modelName)
      ) ?? dynamicChannels[0];
      // matchedModel 仅用于 UI 展示（name/badge/desc），实际参数值取 agent 数据库保存的值
      const matchedModelPreset = matchedChannel.models.find(m => m.id === agent.modelName);
      const matchedModel: CodeModel = matchedModelPreset ?? {
        id: agent.modelName!,
        name: agent.modelName!,
        contextWindow: '',
        maxTokens: agent.maxTokens ?? 4096,
        temperature: agent.temperature ?? 0.7,
        topP: agent.topP ?? 1,
        frequencyPenalty: agent.frequencyPenalty ?? 0,
        presencePenalty: agent.presencePenalty ?? 0,
      };
      setSelectedChannel(matchedChannel);
      setSelectedModel(matchedModel);
      // 优先使用数据库保存的参数值，而不是模型预设默认值
      setCustomMaxTokens(agent.maxTokens != null ? String(agent.maxTokens) : String(matchedModel.maxTokens));
      setCustomTemp(agent.temperature != null ? String(agent.temperature) : String(matchedModel.temperature));
      setCustomTopP(agent.topP != null ? String(agent.topP) : String(matchedModel.topP));
      setCustomFreqPenalty(agent.frequencyPenalty != null ? String(agent.frequencyPenalty) : String(matchedModel.frequencyPenalty));
      setCustomPresPenalty(agent.presencePenalty != null ? String(agent.presencePenalty) : String(matchedModel.presencePenalty));
    } else {
      if (!dynamicChannels[0]) return;
      setSelectedChannel(dynamicChannels[0]);
      setSelectedModel(dynamicChannels[0].models[0]);
      setCustomMaxTokens(''); setCustomTemp(''); setCustomTopP('');
      setCustomFreqPenalty(''); setCustomPresPenalty('');
    }

    // 回填 Token 接入字段（从数据库保存的 tokenProvider/tokenApiKey/tokenBaseUrl）
    const savedTokenProvider = (agent as any).tokenProvider ?? '';
    const savedTokenApiKey   = (agent as any).tokenApiKey   ?? '';
    const savedTokenBaseUrl  = (agent as any).tokenBaseUrl  ?? '';
    if (savedTokenProvider && savedTokenApiKey) {
      setTokenValue(savedTokenApiKey);
      setCustomBaseUrl(savedTokenBaseUrl);
      // 同时写入本地缓存，使渠道切换时能自动回填
      saveTokenCache(savedTokenProvider, { apiKey: savedTokenApiKey, baseUrl: savedTokenBaseUrl });
    }
  }

  /* ── 编辑模式：加载智能体数据预填表单 ─────────────────── */
  useEffect(() => {
    if (!isEdit) return;
    if ((editId === '24cf6cc5-da0d-48df-814e-11582e398007' || editId === 'platform-assistant' || editId === 'repaceclaw-platform-assistant') && !isAdmin) {
      showToast('平台助手设置仅管理员可查看', 'warning');
      navigate('/agents');
      return;
    }
    const agent = findAgent(editId!);
    if (agent) {
      fillForm(agent);
    } else {
      // store 里没有，直接调 API 获取
      agentsApi.getById(editId!)
        .then(a => fillForm(a))
        .catch(() => fetchAgents());
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId, isAdmin, navigate]);

  /* ── 渠道加载完成后，编辑模式重新回填表单 ───────────── */
  useEffect(() => {
    if (!isEdit || !editId || !dynamicChannels.length) return;
    const agent = findAgent(editId);
    if (agent) fillForm(agent);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dynamicChannels]);

  /* ── 编辑模式：加载已绑定技能 ID ─────────────────────── */
  useEffect(() => {
    if (!isEdit || !editId) return;
    // 同时加载技能列表和已绑定技能
    Promise.all([
      apiClient.get('/skills').catch(() => ({ data: { data: [] } })),
      apiClient.get(`/skills/agent/${editId}`).catch(() => ({ data: { data: [] } })),
    ]).then(([allRes, boundRes]) => {
      const allSkills: BackendSkill[] = allRes.data.data ?? [];
      const boundSkills: BackendSkill[] = boundRes.data.data ?? [];
      setBackendSkills(allSkills.filter((s: BackendSkill) => s.enabled));
      if (boundSkills.length > 0) {
        setSkills(boundSkills.map((s: BackendSkill) => s.id));
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId]);

  /* ── fetchAgents 完成后再次尝试预填（针对后端智能体） ─── */
  useEffect(() => {
    if (!isEdit || !editId) return;
    const agent = findAgent(editId);
    if (agent) fillForm(agent);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agents]);

  /* ── 从项目跳转过来：预填项目资料到角色设定字段 ─── */
  useEffect(() => {
    if (!fromProject || isEdit) return;
    const lines: string[] = [];
    if (projectTitle) lines.push(`项目名称：${projectTitle}`);
    if (projectDesc)  lines.push(`项目描述：${projectDesc}`);
    if (projectTags)  lines.push(`项目标签：${projectTags}`);
    if (lines.length > 0) {
      setRole(
        `你是负责以下项目的专属智能体，请围绕项目目标提供帮助。\n\n${lines.join('\n')}`
      );
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 处理从模板跳转的参数（location.state）
  useEffect(() => {
    const templateData = (location.state as {
      templateId?: string;
      name?: string;
      model?: string;
      description?: string;
      expertise?: string[];
      systemPrompt?: string;
      vibe?: string;
      category?: string;
    } | null);
    if (!templateData || isEdit) return;
    if (templateData.name) setName(templateData.name);
    if (templateData.description) setDescription(templateData.description);
    if (templateData.category) setAgentType(templateCategoryToAgentType(templateData.category));
    if (templateData.systemPrompt) {
      setRole(templateData.systemPrompt);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── 技能弹窗 ─────────────────────────────────────────── */
  const [skillModalOpen, setSkillModalOpen] = useState(false);
  const [tempSkills, setTempSkills]         = useState<string[]>([]);
  // 后端真实技能列表（id → BackendSkill）
  const [backendSkills, setBackendSkills]   = useState<BackendSkill[]>([]);
  const [skillsLoading, setSkillsLoading]   = useState(false);

  // 加载真实技能列表
  async function loadBackendSkills() {
    if (backendSkills.length > 0) return; // 已加载过
    setSkillsLoading(true);
    try {
      const res = await apiClient.get('/skills');
      setBackendSkills((res.data.data as BackendSkill[]).filter(s => s.enabled));
    } catch {
      // 加载失败不阻断流程
    } finally {
      setSkillsLoading(false);
    }
  }

  function openSkillModal() {
    setTempSkills([...skills]);
    setSkillModalOpen(true);
    loadBackendSkills();
  }
  function closeSkillModal() { setSkillModalOpen(false); }
  function confirmSkillModal() { setSkills([...tempSkills]); setSkillModalOpen(false); }
  function toggleTempSkill(id: string) {
    setTempSkills(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }
  function removeSkill(id: string) { setSkills(prev => prev.filter(x => x !== id)); }

  // 根据 id 获取技能显示名
  function skillDisplayName(id: string): string {
    const found = backendSkills.find(s => s.id === id);
    return found ? found.name : id;
  }

  /* ── CODE 渠道弹窗 — 必须先声明，后面 hasBackendKey 要用 ─── */
  const [codeModelOpen, setCodeModelOpen]     = useState(false);
  const [selectedChannel, setSelectedChannel] = useState<CodeChannel>(CODE_CHANNELS[0]);
  const [tempChannel, setTempChannel]         = useState<CodeChannel>(CODE_CHANNELS[0]);

  /* ── Token 接入弹窗 ───────────────────────────────────── */
  const [tokenModalOpen, setTokenModalOpen]   = useState(false);
  const [tokenValue, setTokenValue]           = useState(() => loadTokenCache(CODE_CHANNELS[0].id)?.apiKey  ?? '');
  const [tempTokenValue, setTempTokenValue]   = useState('');
  const [customBaseUrl, setCustomBaseUrl]     = useState(() => loadTokenCache(CODE_CHANNELS[0].id)?.baseUrl ?? '');
  const [tempCustomUrl, setTempCustomUrl]     = useState('');
  const [showToken, setShowToken]             = useState(false);
  const [copied, setCopied]                   = useState(false);
  const [tempTokenModel, setTempTokenModel]   = useState<CodeModel | null>(null);

  // 计算当前渠道是否已在后台配置了 API Key（前端用户无需填写）
  const hasBackendKey = (() => {
    if (!selectedChannel) return false;
    const bc = dynamicChannels.find(ch => ch.id === selectedChannel.id);
    return !!(bc as any)?.hasBackendKey;
  })();

  function openTokenModal() {
    // 直接使用 CODE 渠道中已选的模型作为初始值
    setTempTokenModel(selectedModel);
    setTempTokenValue(tokenValue);
    setTempCustomUrl(customBaseUrl);
    setShowToken(false);
    setTokenModalOpen(true);
  }
  function closeTokenModal() { setTokenModalOpen(false); }
  function confirmTokenModal() {
    if (!selectedChannel) return;
    // 平台预设 + 后台已配置Key：直接确认，不需要 Key
    if (hasBackendKey) {
      setTokenValue('__backend_key__');
      setCustomBaseUrl('');
      setTokenModalOpen(false);
      return;
    }

    const isCustomChannel = selectedChannel.id === 'custom';
    const resolvedUrl = isCustomChannel ? tempCustomUrl.trim() : selectedChannel.baseUrl;
    const resolvedModelId = tempTokenModel?.id?.trim() || '';

    if (isCustomChannel) {
      if (!resolvedUrl) {
        showToast('请填写自定义渠道的 API Base URL', 'warning');
        return;
      }
      if (!/^https?:\/\//i.test(resolvedUrl)) {
        showToast('自定义 Base URL 必须以 http:// 或 https:// 开头', 'warning');
        return;
      }
      if (!resolvedModelId) {
        showToast('请填写自定义模型 ID', 'warning');
        return;
      }
    }

    if (!tempTokenValue.trim()) {
      showToast('请填写 API Key', 'warning');
      return;
    }

    setTokenValue(tempTokenValue.trim());
    setCustomBaseUrl(resolvedUrl);

    // 写入本地缓存，下次同渠道自动回填
    saveTokenCache(selectedChannel.id, {
      apiKey: tempTokenValue.trim(),
      baseUrl: resolvedUrl,
      modelId: resolvedModelId,
    });

    // 同步 Token 弹窗中选择的模型回 CODE 渠道选中模型
    if (tempTokenModel) {
      setSelectedModel({
        ...tempTokenModel,
        id: resolvedModelId || tempTokenModel.id,
        name: tempTokenModel.name?.trim() || resolvedModelId || tempTokenModel.id,
        maxTokens:        Number(customMaxTokens) || tempTokenModel.maxTokens,
        temperature:      Number(customTemp)       ?? tempTokenModel.temperature,
        topP:             Number(customTopP)        ?? tempTokenModel.topP,
        frequencyPenalty: Number(customFreqPenalty) ?? tempTokenModel.frequencyPenalty,
        presencePenalty:  Number(customPresPenalty) ?? tempTokenModel.presencePenalty,
      });
    }

    setTokenModalOpen(false);
  }
  function handleCopyToken() {
    if (!tokenValue) return;
    navigator.clipboard.writeText(tokenValue).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  /* ── 当前已选模型 ────────────────────────────────────── */
  // 当前已选模型
  const [selectedModel, setSelectedModel]     = useState<CodeModel | null>(
    () => CODE_CHANNELS[0].models[0]
  );
  const [tempModel, setTempModel]             = useState<CodeModel | null>(null);

  // 弹窗内自定义参数
  const [customMaxTokens, setCustomMaxTokens]         = useState('');
  const [customTemp, setCustomTemp]                   = useState('');
  const [customTopP, setCustomTopP]                   = useState('');
  const [customFreqPenalty, setCustomFreqPenalty]     = useState('');
  const [customPresPenalty, setCustomPresPenalty]     = useState('');

  function openCodeModal() {
    setTempChannel(selectedChannel);
    const cached = loadTokenCache(selectedChannel.id);
    const initModel = selectedChannel.id === 'custom'
      ? {
          ...(selectedModel ?? selectedChannel.models[0]),
          id: cached?.modelId || selectedModel?.id || selectedChannel.models[0].id,
          name: cached?.modelId || selectedModel?.name || selectedChannel.models[0].name,
        }
      : (selectedModel ?? selectedChannel.models[0]);
    setTempModel(initModel);
    setCustomMaxTokens(String(initModel.maxTokens));
    setCustomTemp(String(initModel.temperature));
    setCustomTopP(String(initModel.topP));
    setCustomFreqPenalty(String(initModel.frequencyPenalty));
    setCustomPresPenalty(String(initModel.presencePenalty));
    if (selectedChannel.id === 'custom') {
      setTempCustomUrl(cached?.baseUrl || customBaseUrl || '');
      setTempTokenValue(cached?.apiKey || tokenValue || '');
    }
    setCodeModelOpen(true);
  }

  function closeCodeModal() { setCodeModelOpen(false); }

  function selectTempChannel(ch: CodeChannel) {
    setTempChannel(ch);
    const cached = loadTokenCache(ch.id);

    // 切换渠道时默认选第一个模型；自定义渠道优先回填本地缓存的模型名
    const first = ch.id === 'custom'
      ? {
          ...ch.models[0],
          id: cached?.modelId || ch.models[0].id,
          name: cached?.modelId || ch.models[0].name,
        }
      : ch.models[0];

    setTempModel(first);
    setCustomMaxTokens(String(first.maxTokens));
    setCustomTemp(String(first.temperature));
    setCustomTopP(String(first.topP));
    setCustomFreqPenalty(String(first.frequencyPenalty));
    setCustomPresPenalty(String(first.presencePenalty));

    if (ch.id === 'custom') {
      setTempCustomUrl(cached?.baseUrl || customBaseUrl || '');
      setTempTokenValue(cached?.apiKey || tokenValue || '');
    }
  }

  function selectPreset(m: CodeModel) {
    setTempModel(m);
    setCustomMaxTokens(String(m.maxTokens));
    setCustomTemp(String(m.temperature));
    setCustomTopP(String(m.topP));
    setCustomFreqPenalty(String(m.frequencyPenalty));
    setCustomPresPenalty(String(m.presencePenalty));
  }

  function confirmCodeModal() {
    if (!tempModel) return;

    if (tempChannel.id === 'custom') {
      const modelId = tempModel.id?.trim() || '';
      const baseUrl = tempCustomUrl.trim();
      if (!modelId) {
        showToast('请填写自定义模型 ID', 'warning');
        return;
      }
      if (!baseUrl) {
        showToast('请填写自定义渠道的 API Base URL', 'warning');
        return;
      }
    }

    setSelectedChannel(tempChannel);
    setSelectedModel({
      ...tempModel,
      id: tempModel.id?.trim() || tempModel.id,
      name: tempModel.name?.trim() || tempModel.id,
      maxTokens:        Number(customMaxTokens) || tempModel.maxTokens,
      temperature:      Number(customTemp)       ?? tempModel.temperature,
      topP:             Number(customTopP)        ?? tempModel.topP,
      frequencyPenalty: Number(customFreqPenalty) ?? tempModel.frequencyPenalty,
      presencePenalty:  Number(customPresPenalty) ?? tempModel.presencePenalty,
    });
    // 切换渠道后，从缓存自动回填对应渠道的 Token（仅当当前 tokenValue 为空时）
    const cached = loadTokenCache(tempChannel.id);
    if (!tokenValue.trim()) {
      setTokenValue(cached?.apiKey   ?? '');
    }
    if (tempChannel.id === 'custom') {
      setCustomBaseUrl(tempCustomUrl.trim());
    } else if (!customBaseUrl.trim()) {
      setCustomBaseUrl(cached?.baseUrl ?? '');
    }
    setCodeModelOpen(false);
  }

  /* ── 是否为预设智能体（前端 fallback，无后端记录） ──────── */
  const isDefaultAgent = isEdit && editId?.startsWith('default-');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { showToast('请填写智能体名称', 'warning'); return; }

    const activeModel: CodeModel = selectedModel ?? selectedChannel.models[0];
    const isCustomChannel = selectedChannel.id === 'custom';
    if (isCustomChannel) {
      if (!customBaseUrl.trim()) { showToast('请先配置自定义渠道的 Base URL', 'warning'); return; }
      if (!activeModel?.id?.trim()) { showToast('请先配置自定义模型 ID', 'warning'); return; }
      if (!tokenValue.trim()) { showToast('请先填写自定义渠道的 API Key', 'warning'); return; }
    }

    setSaving(true);
    try {
      const isPrivateKey = true;
      // temperatureOverride：快捷温度覆盖框有值时使用，否则用 CODE 弹窗里的 customTemp
      const resolvedTemp = tempOverride !== ''
        ? Number(tempOverride)
        : (Number(customTemp) || activeModel.temperature);

      const payload = {
        name: name.trim(),
        color: '#6366f1',
        // systemPrompt 来自"角色设定"文本框（role）
        systemPrompt: role.trim(),
        // writingStyle 来自"语言风格"标签
        writingStyle: style,
        expertise: skills,
        description: description.trim(),
        status: 'active' as const,
        // 输出格式 & 能力边界
        outputFormat: outputFmt,
        boundary: boundary.trim(),
        // RC 执行分类：用于映射到 OC 固定执行智能体
        agentType,
        // 对话记忆轮数
        memoryTurns: Number(memoryTurns) || 0,
        // 温度覆盖（null = 使用模型默认）
        temperatureOverride: tempOverride !== '' ? Number(tempOverride) : null,
        // CODE 渠道 + 模型参数
        modelName: activeModel.id,
        modelProvider: selectedChannel.id === 'custom' ? 'custom' : selectedChannel.provider,
        temperature: resolvedTemp,
        maxTokens: Number(customMaxTokens) || activeModel.maxTokens,
        topP: Number(customTopP) || activeModel.topP,
        frequencyPenalty: Number(customFreqPenalty) ?? activeModel.frequencyPenalty,
        presencePenalty: Number(customPresPenalty) ?? activeModel.presencePenalty,
        // Token 接入
        tokenProvider: isPrivateKey ? (selectedChannel.id === 'custom' ? 'custom' : selectedChannel.id) : '',
        tokenApiKey: isPrivateKey ? tokenValue : '',
        tokenBaseUrl: isPrivateKey ? customBaseUrl : '',
        // Phase 3: 可见性 + Skill 管控
        visibility,
        skillsConfig,
      };

      let agentId: string;
      if (isEdit && editId && !isDefaultAgent) {
        // 普通编辑：更新已有后端记录
        await updateAgent(editId, payload);
        agentId = editId;
        // 先解绑所有旧技能，再绑定新的（简化处理：全量覆盖）
        try {
          const oldSkillsRes = await apiClient.get(`/skills/agent/${agentId}`);
          const oldSkills: BackendSkill[] = oldSkillsRes.data.data ?? [];
          await Promise.all(oldSkills.map(s =>
            apiClient.delete(`/skills/${s.id}/bind`, { data: { agentId } })
          ));
        } catch { /* 解绑失败不阻断 */ }
      } else {
        // 新建 or 预设智能体编辑 → 另存为新智能体
        const newAgent = await createAgent(payload);
        agentId = newAgent.id;
      }

      // 绑定选中的技能（skills 数组存的是 skillId）
      // 只绑定真实存在于后端的 skill id（排除旧版字符串名称）
      const validSkillIds = skills.filter(id =>
        backendSkills.length === 0 || backendSkills.some(s => s.id === id)
      );
      if (validSkillIds.length > 0) {
        await Promise.allSettled(
          validSkillIds.map(skillId =>
            apiClient.post(`/skills/${skillId}/bind`, { agentId })
          )
        );
      }

      navigate('/agents');
    } catch {
      showToast(isEdit && !isDefaultAgent ? '保存失败，请重试' : '创建失败，请重试', 'error');
    } finally {
      setSaving(false);
    }
  }

  /* ── 样式辅助 ─────────────────────────────────────────── */
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '7px 10px', fontSize: 13,
    border: '1px solid #d1d5db', borderRadius: 7,
    outline: 'none', color: '#111827', background: '#fff',
    boxSizing: 'border-box', transition: 'border-color 0.15s',
    fontFamily: 'inherit',
  };
  const numInputStyle: React.CSSProperties = {
    ...inputStyle, width: '100%', padding: '6px 8px', fontSize: 12,
  };
  function focusStyle(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    e.currentTarget.style.borderColor = '#2a3b4d';
  }
  function blurStyle(e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    e.currentTarget.style.borderColor = '#d1d5db';
  }
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 };
  const fieldStyle: React.CSSProperties = { marginBottom: 10 };

  return (
    <>
      <style>{`
        .ac-wrap {
          width: 100%; flex: 1; min-height: 0;
          display: flex; flex-direction: column;
          font-family: "Microsoft YaHei", "Segoe UI", sans-serif;
          background: #f5f7fa; padding: 16px; box-sizing: border-box; overflow: hidden;
        }
        .ac-card {
          flex: 1; min-height: 0; display: flex; flex-direction: column;
          background: #fafbfc; border: 1px solid #e5e6eb;
          border-radius: 12px; box-shadow: 0 1px 4px rgba(0,0,0,0.05); overflow: hidden;
        }
        .ac-header {
          padding: 16px 32px; border-bottom: 1px solid #e5e6eb;
          background: #ffffff; display: flex; align-items: center; gap: 10px; flex-shrink: 0;
        }
        .ac-scroll {
          flex: 1; min-height: 0; overflow: hidden;
          padding: 16px 20px 0; display: flex; flex-direction: column;
        }
        .ac-form {
          flex: 1; min-height: 0; background: transparent; padding: 0;
          box-sizing: border-box; display: flex; flex-direction: column;
        }
        /* 左右两栏 */
        .ac-cols {
          flex: 1; min-height: 0;
          display: grid; grid-template-columns: 1fr 1fr; gap: 16px;
          overflow: hidden;
        }
        .ac-col {
          display: flex; flex-direction: column; gap: 0;
          min-height: 0; overflow: hidden;
        }
        .ac-footer {
          padding: 10px 24px; border-top: 1px solid #ebebeb;
          background: #fff; display: flex; justify-content: center; gap: 10px; flex-shrink: 0;
        }

        /* ── 技能触发器 ── */
        .ac-skill-trigger {
          display: flex; align-items: center; gap: 10px;
          padding: 7px 10px; border: 1px solid #d1d5db; border-radius: 7px;
          background: #fff; cursor: pointer; transition: border-color 0.15s;
          min-height: 36px; flex-wrap: wrap;
        }
        .ac-skill-trigger:hover { border-color: #2a3b4d; }
        .ac-skill-chip {
          display: inline-flex; align-items: center; gap: 4px;
          padding: 3px 10px; border-radius: 20px;
          background: #2a3b4d12; color: #2a3b4d; font-size: 12px;
          border: 1px solid #2a3b4d30;
        }
        .ac-skill-chip-del {
          display: flex; align-items: center; cursor: pointer; color: #9ca3af;
          background: none; border: none; padding: 0; line-height: 1; transition: color 0.1s;
        }
        .ac-skill-chip-del:hover { color: #2a3b4d; }
        .ac-skill-placeholder { font-size: 13px; color: #9ca3af; flex: 1; }
        .ac-skill-arrow { margin-left: auto; color: #9ca3af; flex-shrink: 0; }

        /* ── CODE 模型触发器 ── */
        .ac-model-trigger {
          display: flex; align-items: center; gap: 10px;
          padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 7px;
          background: #fff; cursor: pointer; transition: border-color 0.15s; min-height: 38px;
        }
        .ac-model-trigger:hover { border-color: #2a3b4d; }
        .ac-model-trigger-icon { color: #2a3b4d; flex-shrink: 0; }
        .ac-model-trigger-info { flex: 1; min-width: 0; }
        .ac-model-trigger-name { font-size: 13px; font-weight: 600; color: #1a202c; }
        .ac-model-trigger-sub  { font-size: 11px; color: #9ca3af; margin-top: 1px; }
        .ac-model-trigger-placeholder { font-size: 13px; color: #9ca3af; flex: 1; }
        .ac-model-badge {
          font-size: 11px; padding: 1px 7px; border-radius: 4px; font-weight: 500;
        }


        /* ── 底部按钮 ── */
        .ac-btn-cancel {
          padding: 7px 18px; border-radius: 7px; border: 1px solid #d1d5db;
          background: #fff; color: #6b7280; font-size: 13px;
          cursor: pointer; transition: all 0.15s; font-family: inherit;
        }
        .ac-btn-cancel:hover { border-color: #e53e3e; color: #e53e3e; background: #fff5f5; }
        .ac-btn-create {
          padding: 7px 22px; border-radius: 7px; border: none;
          background: #2a3b4d; color: #fff; font-size: 13px; font-weight: 600;
          cursor: pointer; transition: background 0.15s; font-family: inherit;
        }
        .ac-btn-create:hover { background: #1e2d3d; }

        /* ── 通用弹窗遮罩 ── */
        .ac-modal-mask {
          position: fixed; inset: 0; z-index: 1000;
          background: rgba(0,0,0,0.25);
          display: flex; align-items: center; justify-content: center;
        }
        .ac-modal {
          background: #fff; border-radius: 12px;
          width: 480px; max-width: 95vw;
          box-shadow: 0 8px 32px rgba(0,0,0,0.14);
          display: flex; flex-direction: column; overflow: hidden; max-height: 80vh;
        }
        .ac-modal-head {
          padding: 14px 18px; border-bottom: 1px solid #f0f0f0;
          display: flex; align-items: center; justify-content: space-between; flex-shrink: 0;
        }
        .ac-modal-title { font-size: 14px; font-weight: 700; color: #1a202c; }
        .ac-modal-close {
          cursor: pointer; color: #9ca3af; display: flex; align-items: center;
          background: none; border: none; padding: 2px; transition: color 0.15s;
        }
        .ac-modal-close:hover { color: #374151; }
        .ac-modal-body { flex: 1; overflow-y: auto; padding: 10px 14px; }
        .ac-modal-item {
          display: flex; align-items: center; gap: 14px;
          padding: 9px 12px; border-radius: 8px; cursor: pointer;
          border: 1.5px solid #e5e7eb; transition: all 0.15s; margin-bottom: 7px; background: #fff;
        }
        .ac-modal-item:last-child { margin-bottom: 0; }
        .ac-modal-item:hover { border-color: #2a3b4d; background: #f5f7fa; }
        .ac-modal-item.selected { border-color: #2a3b4d; background: #2a3b4d08; }
        .ac-modal-check {
          width: 18px; height: 18px; border-radius: 50%; flex-shrink: 0;
          border: 1.5px solid #d1d5db; display: flex; align-items: center; justify-content: center;
          transition: all 0.15s;
        }
        .ac-modal-item.selected .ac-modal-check { background: #2a3b4d; border-color: #2a3b4d; }
        /* CODE 模型 & Token 渠道选中态 */
        .cm-preset-item.selected .ac-modal-check { background: #2a3b4d; border-color: #2a3b4d; }
        .tk-channel-item.selected .ac-modal-check { background: #2a3b4d; border-color: #2a3b4d; }
        .ac-modal-item-info { flex: 1; min-width: 0; }
        .ac-modal-item-name {
          font-size: 13px; font-weight: 600; color: #1a202c; margin-bottom: 2px;
          display: flex; align-items: center; gap: 6px;
        }
        .ac-modal-item-cat {
          font-size: 11px; padding: 1px 7px; border-radius: 4px;
          background: #f3f4f6; color: #6b7280; font-weight: 400;
        }
        .ac-modal-item-desc { font-size: 12px; color: #9ca3af; line-height: 1.5; }
        .ac-modal-foot {
          padding: 12px 18px; border-top: 1px solid #f0f0f0;
          display: flex; align-items: center; justify-content: space-between; flex-shrink: 0;
        }
        .ac-modal-selected-tip { font-size: 12px; color: #9ca3af; }
        .ac-modal-foot-btns { display: flex; gap: 8px; }
        .ac-modal-btn-cancel {
          padding: 7px 18px; border-radius: 7px; border: 1px solid #d1d5db;
          background: #fff; color: #6b7280; font-size: 13px;
          cursor: pointer; transition: all 0.15s; font-family: inherit;
        }
        .ac-modal-btn-cancel:hover { background: #f3f4f6; }
        .ac-modal-btn-confirm {
          padding: 7px 20px; border-radius: 7px; border: none;
          background: #2a3b4d; color: #fff; font-size: 13px; font-weight: 600;
          cursor: pointer; transition: background 0.15s; font-family: inherit;
        }
        .ac-modal-btn-confirm:hover { background: #1e2d3d; }
        .ac-modal-btn-confirm:disabled { background: #9ca3af; cursor: not-allowed; }

        /* ── Token 接入触发器 ── */
        .ac-token-trigger {
          display: flex; align-items: center; gap: 10px;
          padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 7px;
          background: #fff; cursor: pointer; transition: border-color 0.15s; min-height: 38px;
        }
        .ac-token-trigger:hover { border-color: #2a3b4d; }
        .ac-token-trigger-icon { color: #2a3b4d; flex-shrink: 0; }
        .ac-token-trigger-info { flex: 1; min-width: 0; }
        .ac-token-trigger-name { font-size: 13px; font-weight: 600; color: #1a202c; display: flex; align-items: center; gap: 6px; }
        .ac-token-trigger-sub  { font-size: 11px; color: #9ca3af; margin-top: 1px; }
        .ac-token-trigger-placeholder { font-size: 13px; color: #9ca3af; flex: 1; }
        .ac-token-dot {
          width: 7px; height: 7px; border-radius: 50%; background: #22c55e; flex-shrink: 0;
        }

        /* ── Token 弹窗专属 ── */
        .tk-modal { width: 500px; }
        .tk-section-title {
          font-size: 11px; font-weight: 700; color: #9ca3af; text-transform: uppercase;
          letter-spacing: 0.05em; padding: 10px 14px 6px;
        }
        .tk-channel-list { padding: 0 14px 4px; }
        .tk-channel-item {
          display: flex; align-items: flex-start; gap: 12px;
          padding: 10px 12px; border-radius: 8px; cursor: pointer;
          border: 1.5px solid #e5e7eb; transition: all 0.15s; margin-bottom: 7px; background: #fff;
        }
        .tk-channel-item:last-child { margin-bottom: 0; }
        .tk-channel-item:hover { border-color: #2a3b4d; background: #f5f7fa; }
        .tk-channel-item.selected { border-color: #2a3b4d; background: #2a3b4d08; }
        .tk-channel-info { flex: 1; min-width: 0; }
        .tk-channel-name-row { display: flex; align-items: center; gap: 6px; margin-bottom: 2px; }
        .tk-channel-name { font-size: 13px; font-weight: 600; color: #1a202c; }
        .tk-channel-provider { font-size: 11px; padding: 1px 7px; border-radius: 4px; background: #f3f4f6; color: #6b7280; }
        .tk-channel-auth { font-size: 11px; padding: 1px 7px; border-radius: 4px; background: #f0fdf4; color: #15803d; font-weight: 500; }
        .tk-channel-desc { font-size: 12px; color: #9ca3af; line-height: 1.5; }
        .tk-input-area { padding: 4px 14px 14px; display: flex; flex-direction: column; gap: 10px; }
        .tk-input-row { display: flex; flex-direction: column; gap: 4px; }
        .tk-input-label { font-size: 11px; font-weight: 600; color: #374151; }
        .tk-token-wrap { position: relative; display: flex; align-items: center; }
        .tk-token-input {
          width: 100%; padding: 7px 72px 7px 10px; font-size: 12px;
          border: 1px solid #d1d5db; border-radius: 7px;
          outline: none; color: #111827; background: #fff;
          box-sizing: border-box; transition: border-color 0.15s;
          font-family: "Courier New", monospace; letter-spacing: 0.03em;
        }
        .tk-token-input:focus { border-color: #2a3b4d; }
        .tk-token-actions {
          position: absolute; right: 6px; display: flex; align-items: center; gap: 4px;
        }
        .tk-icon-btn {
          display: flex; align-items: center; justify-content: center;
          width: 26px; height: 26px; border-radius: 5px;
          border: none; background: none; cursor: pointer; color: #9ca3af;
          transition: color 0.15s, background 0.15s;
        }
        .tk-icon-btn:hover { color: #2a3b4d; background: #f3f4f6; }
        .tk-docs-link {
          font-size: 11px; color: #1677ff; text-decoration: none; display: inline-flex; align-items: center; gap: 3px;
        }
        .tk-docs-link:hover { text-decoration: underline; }
        .tk-divider { height: 1px; background: #f0f0f0; margin: 4px 0; }

        /* ── CODE 模型弹窗专属 ── */
        /*
         * 弹窗整体宽度 880px，内部分左右两列：
         *   左列（cm-col-models）：固定 380px，展示可滚动的模型预设卡片列表
         *   右列（cm-col-params）：剩余宽度（flex:1），展示参数调节输入区
         *
         * 两列始终并排显示，避免选中模型后右侧区域突然出现导致弹窗高度跳变。
         * 参数 grid 改为单列（右列本身已足够宽），每个参数项独占一行，内容完整展示。
         */
        .cm-modal { width: 880px; }
        .cm-body  { display: flex; flex-direction: column; gap: 0; overflow: hidden; }

        /* 两列容器：左右并排，高度撑满 body */
        .cm-two-cols {
          display: flex;
          flex-direction: row;
          flex: 1;
          min-height: 0;
          overflow: hidden;
        }

        /* 左列：模型列表，固定宽度，内容可独立滚动 */
        .cm-col-models {
          width: 380px;
          flex-shrink: 0;
          border-right: 1px solid #f0f0f0;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
        }

        /* 右列：参数调节，占剩余宽度 */
        .cm-col-params {
          flex: 1;
          min-width: 0;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
        }

        .cm-section-title {
          font-size: 11px; font-weight: 700; color: #9ca3af; text-transform: uppercase;
          letter-spacing: 0.05em; padding: 10px 14px 6px;
          flex-shrink: 0;
        }
        .cm-preset-list { padding: 0 14px 14px; }
        .cm-preset-item {
          display: flex; align-items: flex-start; gap: 12px;
          padding: 10px 12px; border-radius: 8px; cursor: pointer;
          border: 1.5px solid #e5e7eb; transition: all 0.15s; margin-bottom: 7px; background: #fff;
        }
        .cm-preset-item:last-child { margin-bottom: 0; }
        .cm-preset-item:hover { border-color: #2a3b4d; background: #f5f7fa; }
        .cm-preset-item.selected { border-color: #2a3b4d; background: #2a3b4d08; }
        .cm-preset-info { flex: 1; min-width: 0; }
        .cm-preset-name-row {
          display: flex; align-items: center; gap: 6px; margin-bottom: 2px;
        }
        .cm-preset-name  { font-size: 13px; font-weight: 600; color: #1a202c; }
        .cm-preset-provider {
          font-size: 11px; padding: 1px 7px; border-radius: 4px;
          background: #f3f4f6; color: #6b7280;
        }
        .cm-preset-badge {
          font-size: 11px; padding: 1px 7px; border-radius: 4px; font-weight: 500;
        }
        .cm-preset-ctx  { font-size: 11px; color: #6b7280; margin-bottom: 3px; }
        .cm-preset-desc { font-size: 12px; color: #9ca3af; line-height: 1.5; }

        /* 参数调节：单列布局，每行完整展示一个参数 */
        .cm-params-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          padding: 6px 16px 16px;
        }
        .cm-param-item { display: flex; flex-direction: column; gap: 4px; }
        .cm-param-label { font-size: 11px; font-weight: 600; color: #374151; }
        .cm-param-sub   { font-size: 10px; color: #9ca3af; margin-top: 1px; }
        .cm-divider     { height: 1px; background: #f0f0f0; margin: 4px 0; }

        /* 未选中模型时右列占位提示 */
        .cm-params-empty {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #c0c8d4;
          font-size: 13px;
          padding: 40px 20px;
        }

        @media (max-width: 960px) {
          /* 窄屏回退为单列，模型列表在上、参数在下 */
          .cm-modal { width: 95vw; }
          .cm-two-cols { flex-direction: column; }
          .cm-col-models { width: 100%; border-right: none; border-bottom: 1px solid #f0f0f0; }
          .cm-params-grid { grid-template-columns: 1fr 1fr; }
        }
        @media (max-width: 760px) {
          .ac-cols { grid-template-columns: 1fr; overflow-y: auto; }
          .ac-scroll { overflow-y: auto; }
        }
        @media (max-width: 600px) {
          .ac-scroll { padding: 12px; }
          .ac-btn-cancel, .ac-btn-create { width: 100%; }
          .cm-params-grid { grid-template-columns: 1fr; }
        }
      `}</style>

      {/* ══════════════════════ 技能选择弹窗 ══════════════════════ */}
      {skillModalOpen && (
        <div className="ac-modal-mask" onClick={closeSkillModal}>
          <div className="ac-modal" onClick={e => e.stopPropagation()}>
            <div className="ac-modal-head">
              <span className="ac-modal-title">选择核心技能</span>
              <button className="ac-modal-close" onClick={closeSkillModal}><X size={18} /></button>
            </div>
            <div className="ac-modal-body">
              {skillsLoading ? (
                <div style={{ textAlign: 'center', padding: '24px 0', color: '#9ca3af', fontSize: 13 }}>
                  加载技能列表中…
                </div>
              ) : backendSkills.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px 0', color: '#9ca3af', fontSize: 13 }}>
                  暂无可用技能，请先在「技能设置」页面创建技能
                </div>
              ) : backendSkills.map(skill => {
                const sel = tempSkills.includes(skill.id);
                return (
                  <div
                    key={skill.id}
                    className={`ac-modal-item${sel ? ' selected' : ''}`}
                    onClick={() => toggleTempSkill(skill.id)}
                  >
                    <div className="ac-modal-check">
                      {sel && <Check size={13} color="#fff" strokeWidth={3} />}
                    </div>
                    <div className="ac-modal-item-info">
                      <div className="ac-modal-item-name">
                        {skill.name}
                        <span className="ac-modal-item-cat">{skill.category}</span>
                      </div>
                      <div className="ac-modal-item-desc">{skill.description}</div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="ac-modal-foot">
              <span className="ac-modal-selected-tip">已选 {tempSkills.length} 个技能</span>
              <div className="ac-modal-foot-btns">
                <button className="ac-modal-btn-cancel" onClick={closeSkillModal}>取消</button>
                <button className="ac-modal-btn-confirm" onClick={confirmSkillModal}>确认</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════ Token 接入弹窗 ══════════════════════ */}
      {tokenModalOpen && (
        <div className="ac-modal-mask" onClick={closeTokenModal}>
          <div className="ac-modal tk-modal" onClick={e => e.stopPropagation()}>

            <div className="ac-modal-head">
              <span className="ac-modal-title" style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <KeyRound size={16} color="#2a3b4d" />
                Token 接入配置
              </span>
              <button className="ac-modal-close" onClick={closeTokenModal}><X size={18} /></button>
            </div>

            <div className="ac-modal-body" style={{ padding: 0 }}>

              {/* 渠道只读展示（已在 CODE 渠道中选定） */}
              <div className="tk-section-title">接入渠道</div>
              <div style={{ padding: '0 14px 10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', background: '#f0f4ff', border: '1px solid #c7d7fd', borderRadius: 8 }}>
                  <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#2a3b4d', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Check size={12} color="#fff" strokeWidth={3} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{selectedChannel.name}</div>
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>
                      {selectedChannel.provider} · 已在 CODE 渠道中选定
                    </div>
                  </div>
                  {false && (
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: '#dcfce7', color: '#16a34a', fontWeight: 500 }}>无需配置</span>
                  )}
                </div>
              </div>

              {/* 填写 Key（平台预设 + 后台已配置 Key 的渠道无需填） */}
              {!hasBackendKey && !presetChannel && (
                <>
                  <div className="tk-divider" />

                  {/* 模型选择（从当前渠道的模型列表中选） */}
                  <div className="tk-section-title">选择模型</div>
                  <div style={{ padding: '0 14px 10px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {selectedChannel.models.map(m => {
                        const sel = tempTokenModel?.id === m.id;
                        const bc  = m.badge ? BADGE_COLOR[m.badge] : null;
                        return (
                          <div
                            key={m.id}
                            onClick={() => setTempTokenModel(m)}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px',
                              border: `1px solid ${sel ? '#2a3b4d' : '#e5e7eb'}`,
                              borderRadius: 7, cursor: 'pointer',
                              background: sel ? '#f0f4ff' : '#fff',
                              transition: 'all 0.1s',
                            }}
                          >
                            <div style={{ width: 16, height: 16, borderRadius: '50%', border: `2px solid ${sel ? '#2a3b4d' : '#d1d5db'}`, background: sel ? '#2a3b4d' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              {sel && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }} />}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                <span style={{ fontSize: 12, fontWeight: sel ? 600 : 400, color: '#1e293b' }}>{m.name}</span>
                                {m.badge && bc && <span style={{ fontSize: 10, padding: '0 5px', borderRadius: 3, background: bc.bg, color: bc.color }}>{m.badge}</span>}
                                <span style={{ fontSize: 10, color: '#9ca3af' }}>{m.contextWindow}</span>
                              </div>
                              {m.desc && <div style={{ fontSize: 11, color: '#6b7280', marginTop: 1 }}>{m.desc}</div>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="tk-divider" />
                  <div className="tk-section-title">填写认证信息</div>
                  <div className="tk-input-area">

                    {/* Base URL（自定义渠道时才填） */}
                    {selectedChannel.id === 'custom' && (
                      <div className="tk-input-row">
                        <label className="tk-input-label">Base URL</label>
                        <input
                          type="text"
                          style={{ padding: '7px 10px', fontSize: 12, border: '1px solid #d1d5db', borderRadius: 7, outline: 'none', width: '100%', boxSizing: 'border-box', fontFamily: '"Courier New", monospace' }}
                          value={tempCustomUrl}
                          onChange={e => setTempCustomUrl(e.target.value)}
                          placeholder="https://your-api-host.com/v1"
                          onFocus={e => e.currentTarget.style.borderColor = '#2a3b4d'}
                          onBlur={e => e.currentTarget.style.borderColor = '#d1d5db'}
                        />
                      </div>
                    )}

                    {/* API Key */}
                    <div className="tk-input-row">
                      <label className="tk-input-label">
                        {selectedChannel.keyLabel || AUTH_TYPE_LABEL[selectedChannel.authType]}
                      </label>
                      <div className="tk-token-wrap">
                        <input
                          className="tk-token-input"
                          type={showToken ? 'text' : 'password'}
                          value={tempTokenValue}
                          onChange={e => setTempTokenValue(e.target.value)}
                          placeholder={
                            selectedChannel.keyPlaceholder ||
                            (selectedChannel.authType === 'Bearer' ? 'sk-xxxxxxxxxxxxxxxxxxxxxxxx'
                            : selectedChannel.authType === 'ApiKey' ? '输入 API Key'
                            : 'username:password')
                          }
                          autoComplete="off"
                          spellCheck={false}
                        />
                        <div className="tk-token-actions">
                          <button type="button" className="tk-icon-btn" onClick={() => { navigator.clipboard.writeText(tempTokenValue).catch(() => {}); }} title="复制">
                            <Copy size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* 平台预设 + 后台已配置Key：无需配置提示 */}
              {(hasBackendKey) && (
                <div style={{ padding: '20px 14px', textAlign: 'center', color: '#6b7280', fontSize: 13 }}>
                  ✅ {hasBackendKey ? '管理员已配置此渠道，无需填写 API Key' : '使用平台预设，无需填写 API Key，直接确认即可'}
                </div>
              )}
            </div>

            <div className="ac-modal-foot">
              <span className="ac-modal-selected-tip">
                {tempTokenModel ? `${selectedChannel.name} · ${tempTokenModel.name}` : selectedChannel.name}
              </span>
              <div className="ac-modal-foot-btns">
                <button className="ac-modal-btn-cancel" onClick={closeTokenModal}>取消</button>
                <button
                  className="ac-modal-btn-confirm"
                  disabled={true && !hasBackendKey && (!tempTokenValue.trim() || !tempTokenModel)}
                  onClick={confirmTokenModal}
                >确认</button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ══════════════════════ CODE 模型弹窗 ══════════════════════ */}
      {codeModelOpen && (
        <div className="ac-modal-mask" onClick={closeCodeModal}>
          <div className="ac-modal cm-modal" onClick={e => e.stopPropagation()}>

            <div className="ac-modal-head">
              <span className="ac-modal-title" style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <Code2 size={16} color="#2a3b4d" />
                选择 CODE 渠道 &amp; 模型
              </span>
              <button className="ac-modal-close" onClick={closeCodeModal}><X size={18} /></button>
            </div>

            <div className="ac-modal-body cm-body">
              {/* 三列布局：渠道 | 模型列表 | 参数调节 */}
              <div className="cm-two-cols" style={{ display: 'flex', gap: 0, height: '100%' }}>

                {/* ── 第一列：渠道列表（含后台动态渠道）── */}
                <div style={{ width: 160, borderRight: '1px solid #f0f0f0', overflowY: 'auto', flexShrink: 0 }}>
                  <div className="cm-section-title">接入渠道</div>
                  {dynamicChannels.map(ch => {
                    const sel = tempChannel.id === ch.id;
                    const bc  = ch.badge ? BADGE_COLOR[ch.badge] : null;
                    return (
                      <div
                        key={ch.id}
                        onClick={() => selectTempChannel(ch)}
                        style={{
                          padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                          background: sel ? '#f0f4ff' : 'transparent',
                          borderLeft: sel ? '3px solid #2a3b4d' : '3px solid transparent',
                          transition: 'all 0.1s',
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 12, fontWeight: sel ? 600 : 400, color: sel ? '#1e293b' : '#374151' }}>{ch.name}</span>
                            {ch.badge && bc && (
                              <span style={{ fontSize: 10, padding: '0 5px', borderRadius: 3, background: bc.bg, color: bc.color, fontWeight: 500 }}>{ch.badge}</span>
                            )}
                          </div>
                          <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 1 }}>{ch.provider}</div>
                        </div>
                      </div>
                    );
                  })}
                  {/* ── 自定义渠道选项 ── */}
                  <div
                    onClick={() => {
                      const customChannel: CodeChannel = {
                        id: 'custom',
                        name: '自定义',
                        provider: 'custom',
                        badge: '自定义',
                        desc: '使用自定义 API 配置',
                        baseUrl: '',
                        authType: 'Bearer',
                        models: [{ id: 'custom-model', name: '自定义模型', contextWindow: '-', maxTokens: 4096, temperature: 0.7, topP: 0.95, frequencyPenalty: 0, presencePenalty: 0, desc: '请在右侧填写模型名称' }],
                      }; selectTempChannel(customChannel); setTempCustomUrl(customBaseUrl || '');
                    }}
                    style={{
                      padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                      background: tempChannel.id === 'custom' ? '#f0f4ff' : 'transparent',
                      borderLeft: tempChannel.id === 'custom' ? '3px solid #2a3b4d' : '3px solid transparent',
                      transition: 'all 0.1s',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ fontSize: 12, fontWeight: tempChannel.id === 'custom' ? 600 : 400, color: tempChannel.id === 'custom' ? '#1e293b' : '#374151' }}>➕ 自定义</span>
                        <span style={{ fontSize: 10, padding: '0 5px', borderRadius: 3, background: '#fef3c7', color: '#d97706', fontWeight: 500 }}>自定义</span>
                      </div>
                      <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 1 }}>自定义 API 配置</div>
                    </div>
                  </div>
                </div>

                {/* ── 第二列：模型列表 ── */}
                <div className="cm-col-models" style={{ flex: '0 0 220px', borderRight: '1px solid #f0f0f0' }}>
                  <div className="cm-section-title">{tempChannel.id === 'custom' ? '自定义配置' : tempChannel.name + ' 模型'}</div>
                  <div className="cm-preset-list">
                    {/* 自定义渠道：显示输入框 */}
                    {tempChannel.id === 'custom' ? (
                      <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {/* Base URL */}
                        <div>
                          <label style={{ fontSize: 11, fontWeight: 500, color: '#374151', marginBottom: 4, display: 'block' }}>API Base URL</label>
                          <input
                            type="text"
                            placeholder="https://api.example.com/v1"
                            value={tempCustomUrl}
                            onChange={e => setTempCustomUrl(e.target.value)}
                            style={{ width: '100%', padding: '6px 10px', fontSize: 12, border: '1px solid #d1d5db', borderRadius: 6, outline: 'none' }}
                            onFocus={e => e.target.style.borderColor = '#2a3b4d'}
                            onBlur={e => e.target.style.borderColor = '#d1d5db'}
                          />
                          <span style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>OpenAI 兼容格式的 API 地址</span>
                        </div>
                        {/* 模型名称 */}
                        <div>
                          <label style={{ fontSize: 11, fontWeight: 500, color: '#374151', marginBottom: 4, display: 'block' }}>模型 ID</label>
                          <input
                            type="text"
                            placeholder="gpt-4o, claude-3-opus 等"
                            value={tempTokenModel?.id || ''}
                            onChange={e => {
                              const newModel: CodeModel = {
                                id: e.target.value,
                                name: e.target.value || '自定义模型',
                                contextWindow: '-',
                                maxTokens: Number(customMaxTokens) || 4096,
                                temperature: Number(customTemp) || 0.7,
                                topP: Number(customTopP) || 0.95,
                                frequencyPenalty: Number(customFreqPenalty) || 0,
                                presencePenalty: Number(customPresPenalty) || 0,
                                desc: '自定义模型',
                              }; setTempTokenModel(newModel);
                            }}
                            style={{ width: '100%', padding: '6px 10px', fontSize: 12, border: '1px solid #d1d5db', borderRadius: 6, outline: 'none' }}
                            onFocus={e => e.target.style.borderColor = '#2a3b4d'}
                            onBlur={e => e.target.style.borderColor = '#d1d5db'}
                          />
                          <span style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>实际调用的模型名称</span>
                        </div>
                        {/* API Key */}
                        <div>
                          <label style={{ fontSize: 11, fontWeight: 500, color: '#374151', marginBottom: 4, display: 'block' }}>API Key</label>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <input
                              type={showToken ? 'text' : 'password'}
                              placeholder="sk-..."
                              value={tempTokenValue}
                              onChange={e => setTempTokenValue(e.target.value)}
                              style={{ width: '100%', padding: '6px 10px', fontSize: 12, border: '1px solid #d1d5db', borderRadius: 6, outline: 'none' }}
                              onFocus={e => e.target.style.borderColor = '#2a3b4d'}
                              onBlur={e => e.target.style.borderColor = '#d1d5db'}
                            />
                            <button
                              onClick={() => setShowToken(!showToken)}
                              style={{ padding: '4px 8px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 4, cursor: 'pointer' }}
                            >
                              {showToken ? <EyeOff size={14} /> : <Eye size={14} />}
                            </button>
                          </div>
                          <span style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>您的 API 密钥</span>
                        </div>
                      </div>
                    ) : (
                      /* 非自定义渠道：显示模型列表 */
                      tempChannel.models.map(m => {
                        const sel = tempModel?.id === m.id;
                        const bc  = m.badge ? BADGE_COLOR[m.badge] : null;
                        return (
                          <div
                            key={m.id}
                            className={`cm-preset-item${sel ? ' selected' : ''}`}
                            onClick={() => selectPreset(m)}
                          >
                            <div className="ac-modal-check" style={{ marginTop: 2 }}>
                              {sel && <Check size={13} color="#fff" strokeWidth={3} />}
                            </div>
                            <div className="cm-preset-info">
                              <div className="cm-preset-name-row">
                                <span className="cm-preset-name">{m.name}</span>
                                {m.badge && bc && (
                                  <span className="cm-preset-badge" style={{ background: bc.bg, color: bc.color }}>{m.badge}</span>
                                )}
                              </div>
                              <div className="cm-preset-ctx">上下文：{m.contextWindow}</div>
                              {m.desc && <div className="cm-preset-desc">{m.desc}</div>}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* ── 第三列：参数调节 ── */}
                <div className="cm-col-params">
                  <div className="cm-section-title">参数调节</div>
                  {tempModel ? (
                    <div className="cm-params-grid">
                      <div className="cm-param-item">
                        <label className="cm-param-label">Max Tokens</label>
                        <input type="number" min={256} max={32768} step={256} style={numInputStyle} value={customMaxTokens} onChange={e => setCustomMaxTokens(e.target.value)} onFocus={focusStyle} onBlur={blurStyle} placeholder={String(tempModel.maxTokens)} />
                        <span className="cm-param-sub">最大输出 token 数</span>
                      </div>
                      <div className="cm-param-item">
                        <label className="cm-param-label">Temperature</label>
                        <input type="number" min={0} max={2} step={0.05} style={numInputStyle} value={customTemp} onChange={e => setCustomTemp(e.target.value)} onFocus={focusStyle} onBlur={blurStyle} placeholder={String(tempModel.temperature)} />
                        <span className="cm-param-sub">0 = 精准，2 = 发散</span>
                      </div>
                      <div className="cm-param-item">
                        <label className="cm-param-label">Top P</label>
                        <input type="number" min={0} max={1} step={0.05} style={numInputStyle} value={customTopP} onChange={e => setCustomTopP(e.target.value)} onFocus={focusStyle} onBlur={blurStyle} placeholder={String(tempModel.topP)} />
                        <span className="cm-param-sub">核采样概率阈值</span>
                      </div>
                      <div className="cm-param-item">
                        <label className="cm-param-label">Frequency Penalty</label>
                        <input type="number" min={-2} max={2} step={0.1} style={numInputStyle} value={customFreqPenalty} onChange={e => setCustomFreqPenalty(e.target.value)} onFocus={focusStyle} onBlur={blurStyle} placeholder={String(tempModel.frequencyPenalty)} />
                        <span className="cm-param-sub">降低重复词语频率</span>
                      </div>
                      <div className="cm-param-item">
                        <label className="cm-param-label">Presence Penalty</label>
                        <input type="number" min={-2} max={2} step={0.1} style={numInputStyle} value={customPresPenalty} onChange={e => setCustomPresPenalty(e.target.value)} onFocus={focusStyle} onBlur={blurStyle} placeholder={String(tempModel.presencePenalty)} />
                        <span className="cm-param-sub">鼓励引入新话题</span>
                      </div>
                    </div>
                  ) : (
                    <div className="cm-params-empty"><span>← 请先选择一个模型</span></div>
                  )}
                </div>

              </div>
            </div>

            <div className="ac-modal-foot">
              <span className="ac-modal-selected-tip">
                {tempModel ? `${tempChannel.name} · ${tempModel.name}` : '请选择渠道和模型'}
              </span>
              <div className="ac-modal-foot-btns">
                <button className="ac-modal-btn-cancel" onClick={closeCodeModal}>取消</button>
                <button className="ac-modal-btn-confirm" disabled={!tempModel} onClick={confirmCodeModal}>确认</button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ══════════════════════ 主页面 ══════════════════════ */}
      <div className="ac-wrap">
        <div className="ac-card">

          {/* 顶部 header */}
          <div className="ac-header">
            <PlusCircle size={18} color="#2a3b4d" />
            <span style={{ fontWeight: 700, fontSize: 16, color: '#1a202c' }}>
              {isDefaultAgent ? '基于预设创建智能体' : isEdit ? '编辑智能体' : '智能体创建'}
            </span>
            {isDefaultAgent && (
              <span style={{
                fontSize: 11, padding: '2px 7px', borderRadius: 4,
                background: '#fffbe6', color: '#d48806', border: '1px solid #ffe58f',
                marginLeft: 4,
              }}>预设模板</span>
            )}
          </div>

          <div className="ac-scroll">
            <form className="ac-form" onSubmit={handleSubmit}>
              <div className="ac-cols">

                {/* ══ 左栏：基本信息 ══ */}
                <div className="ac-col">

                  {/* 智能体名称 */}
                  <div style={fieldStyle}>
                    <label style={labelStyle}>智能体名称</label>
                    <input
                      style={inputStyle}
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder="例如：前端开发助手、电商客服智能体"
                      onFocus={focusStyle} onBlur={blurStyle}
                    />
                  </div>

                  {/* 简介 */}
                  <div style={fieldStyle}>
                    <label style={labelStyle}>简介</label>
                    <input
                      style={inputStyle}
                      value={description}
                      onChange={e => setDescription(e.target.value)}
                      placeholder="简要描述该智能体的用途..."
                      onFocus={focusStyle} onBlur={blurStyle}
                    />
                  </div>

                  {/* 语言风格 + 输出格式（下拉选择，紧跟简介） */}
                  <div style={{ ...fieldStyle, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label style={labelStyle}>语言风格</label>
                      <select
                        style={{ ...inputStyle, cursor: 'pointer', appearance: 'auto' } as React.CSSProperties}
                        value={style}
                        onChange={e => setStyle(e.target.value)}
                        onFocus={focusStyle} onBlur={blurStyle}
                      >
                        {STYLE_TAGS.map(tag => (
                          <option key={tag} value={tag}>{tag}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>输出格式</label>
                      <select
                        style={{ ...inputStyle, cursor: 'pointer', appearance: 'auto' } as React.CSSProperties}
                        value={outputFmt}
                        onChange={e => setOutputFmt(e.target.value)}
                        onFocus={focusStyle} onBlur={blurStyle}
                      >
                        {OUTPUT_TAGS.map(tag => (
                          <option key={tag} value={tag}>{tag}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* 执行分类 */}
                  <div style={fieldStyle}>
                    <label style={labelStyle}>执行分类</label>
                    <select
                      style={{ ...inputStyle, cursor: 'pointer', appearance: 'auto' } as React.CSSProperties}
                      value={agentType}
                      onChange={e => setAgentType(e.target.value as (typeof AGENT_TYPE_OPTIONS)[number]['value'])}
                      onFocus={focusStyle} onBlur={blurStyle}
                    >
                      {AGENT_TYPE_OPTIONS.map(option => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                    <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>
                      当前将映射到：{AGENT_TYPE_OPTIONS.find(option => option.value === agentType)?.desc}
                    </div>
                  </div>

                  {/* 角色设定 */}
                  <div style={{ ...fieldStyle, flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <label style={labelStyle}>角色设定</label>
                    <textarea
                      style={{ ...inputStyle, flex: 1, resize: 'none', minHeight: 0 } as React.CSSProperties}
                      value={role}
                      onChange={e => setRole(e.target.value)}
                      placeholder="定义智能体的人设和核心定位..."
                      onFocus={focusStyle} onBlur={blurStyle}
                    />
                  </div>

                </div>

                {/* ══ 右栏：配置参数 ══ */}
                <div className="ac-col">

                  {/* 核心技能 */}
                  <div style={fieldStyle}>
                    <label style={labelStyle}>核心技能</label>
                    <div className="ac-skill-trigger" onClick={openSkillModal}>
                      {skills.length === 0
                        ? <span className="ac-skill-placeholder">点击选择技能...</span>
                        : skills.map(s => (
                            <span key={s} className="ac-skill-chip">
                              {skillDisplayName(s)}
                              <button type="button" className="ac-skill-chip-del"
                                onClick={e => { e.stopPropagation(); removeSkill(s); }}>
                                <X size={11} />
                              </button>
                            </span>
                          ))
                      }
                      <span className="ac-skill-arrow"><ChevronDown size={15} /></span>
                    </div>
                  </div>

                  {/* 对话记忆 & 推理温度 */}
                  <div style={{ ...fieldStyle, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label style={labelStyle}>对话记忆（轮）</label>
                      <input
                        type="number" min={0} max={100}
                        style={inputStyle}
                        value={memoryTurns}
                        onChange={e => setMemoryTurns(e.target.value)}
                        placeholder="0 = 不限，例如：10"
                        onFocus={focusStyle} onBlur={blurStyle}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>推理温度（覆盖）</label>
                      <input
                        type="number" min={0} max={2} step={0.05}
                        style={inputStyle}
                        value={tempOverride}
                        onChange={e => setTempOverride(e.target.value)}
                        placeholder="留空使用模型默认"
                        onFocus={focusStyle} onBlur={blurStyle}
                      />
                    </div>
                  </div>

                  {/* CODE 渠道 + Token 接入 */}
                  <div style={{ ...fieldStyle, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label style={labelStyle}>CODE 渠道</label>
                      <div className="ac-model-trigger" onClick={openCodeModal}>
                        <span className="ac-model-trigger-icon"><Code2 size={16} /></span>
                        <div className="ac-model-trigger-info">
                          <div className="ac-model-trigger-name" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            {selectedChannel.name}
                            {selectedChannel.isPreset && <span style={{ fontSize: 13 }}>⭐</span>}
                            <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 4, background: '#f3f4f6', color: '#6b7280' }}>
                              {selectedChannel.provider}
                            </span>
                          </div>
                          <div className="ac-model-trigger-sub">
                            {selectedModel ? `${selectedModel.name} · ${selectedModel.maxTokens}tok` : '请选择模型'}
                          </div>
                        </div>
                        <span style={{ marginLeft: 'auto', color: '#9ca3af', flexShrink: 0 }}><ChevronDown size={15} /></span>
                      </div>
                    </div>
                    <div>
                      <label style={labelStyle}>Token 接入</label>
                      <div className="ac-token-trigger" onClick={openTokenModal}>
                        <span className="ac-token-trigger-icon"><KeyRound size={16} /></span>
                        {true ? (
                          <div className="ac-token-trigger-info">
                            <div className="ac-token-trigger-name">
                              {selectedChannel.name}
                              {selectedChannel.isPreset && <span style={{ fontSize: 13 }}>⭐</span>}
                              {tokenValue && <span className="ac-token-dot" />}
                            </div>
                            <div className="ac-token-trigger-sub">
                              {hasBackendKey
                                ? '管理员已配置，无需填写'
                                : tokenValue
                                  ? `${tokenValue.slice(0, 6)}${'•'.repeat(Math.max(0, Math.min(10, tokenValue.length - 6)))} 已配置`
                                  : '未填写 Token'}
                            </div>
                          </div>
                        ) : (
                          <span className="ac-token-trigger-placeholder">配置 API Token...</span>
                        )}
                        <span style={{ marginLeft: 'auto', color: '#9ca3af', flexShrink: 0 }}><ChevronDown size={15} /></span>
                      </div>
                      {true && tokenValue && (
                        <button
                          type="button"
                          onClick={handleCopyToken}
                          style={{
                            marginTop: 4, display: 'flex', alignItems: 'center', gap: 4,
                            background: 'none', border: 'none', cursor: 'pointer',
                            fontSize: 11, color: copied ? '#15803d' : '#9ca3af', padding: 0,
                            transition: 'color 0.15s',
                          }}
                        >
                          {copied ? <CheckCheck size={12} /> : <Copy size={12} />}
                          {copied ? 'Token 已复制' : '复制 Token'}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* 能力边界 */}
                  <div style={{ ...fieldStyle, flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <label style={labelStyle}>能力边界</label>
                    <textarea
                      style={{ ...inputStyle, flex: 1, resize: 'none', minHeight: 0 } as React.CSSProperties}
                      value={boundary}
                      onChange={e => setBoundary(e.target.value)}
                      placeholder="明确智能体不能做的事..."
                      onFocus={focusStyle} onBlur={blurStyle}
                    />
                  </div>

                  {/* Phase 3: 可见性 */}
                  <div style={fieldStyle}>
                    <label style={labelStyle}>可见性</label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {(['private', 'public', 'template'] as const).map(v => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => setVisibility(v)}
                          style={{
                            flex: 1, padding: '6px 0', border: `1.5px solid ${visibility === v ? '#2a3b4d' : '#d1d5db'}`,
                            borderRadius: 6, background: visibility === v ? '#2a3b4d08' : '#fff',
                            color: visibility === v ? '#2a3b4d' : '#6b7280', fontSize: 12, fontWeight: visibility === v ? 600 : 400,
                            cursor: 'pointer', transition: 'all 0.15s',
                          }}
                        >
                          {v === 'private' ? '🔒 私有' : v === 'public' ? '🌐 公开' : '📋 模板'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Phase 3: Skill 安全管控 */}
                  <div style={fieldStyle}>
                    <label style={labelStyle}>Skill 安全管控</label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                      {Object.entries({
                        exec: { label: '代码执行', risk: 'high' },
                        shell: { label: 'Shell 命令', risk: 'high' },
                        file_write: { label: '文件写入', risk: 'high' },
                        browser: { label: '浏览器控制', risk: 'high' },
                        web_search: { label: '网络搜索', risk: 'low' },
                        file_read: { label: '文件读取', risk: 'low' },
                        image_generation: { label: '图片生成', risk: 'medium' },
                      }).map(([key, { label, risk }]) => (
                        <label
                          key={key}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px',
                            borderRadius: 6, background: skillsConfig[key] ? '#f0fdf4' : '#fef2f2',
                            border: `1px solid ${skillsConfig[key] ? '#bbf7d0' : '#fecaca'}`,
                            cursor: 'pointer', fontSize: 12, userSelect: 'none',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={skillsConfig[key] ?? false}
                            onChange={e => setSkillsConfig(prev => ({ ...prev, [key]: e.target.checked }))}
                            style={{ accentColor: risk === 'high' ? '#dc2626' : risk === 'medium' ? '#f59e0b' : '#16a34a' }}
                          />
                          <span style={{ color: risk === 'high' ? '#dc2626' : risk === 'medium' ? '#f59e0b' : '#16a34a', fontWeight: 500 }}>
                            {risk === 'high' ? '🔴' : risk === 'medium' ? '🟡' : '🟢'}
                          </span>
                          <span style={{ color: '#374151' }}>{label}</span>
                        </label>
                      ))}
                    </div>
                    <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 4 }}>🔴 高危  🟡 中危  🟢 低危 · 高危 Skill 默认禁用</div>
                  </div>

                </div>
              </div>
            </form>
          </div>

          {/* 底部按钮 */}
          <div className="ac-footer">
            <button type="button" className="ac-btn-cancel"
              onClick={() => navigate('/agents')} disabled={saving}>
              取消
            </button>
            <button type="button" className="ac-btn-create" onClick={handleSubmit as any} disabled={saving}>
              {saving
                ? (isEdit && !isDefaultAgent ? '保存中...' : '创建中...')
                : (isDefaultAgent ? '基于此模板创建' : isEdit ? '保存' : '创建')}
            </button>
          </div>

        </div>
      </div>
    </>
  );
}
