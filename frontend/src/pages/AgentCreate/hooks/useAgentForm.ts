/**
 * useAgentForm - 智能体表单状态管理 Hook
 *
 * 职责：
 * - 管理所有表单字段状态（名称、角色、风格、技能、描述等）
 * - 提供 findAgent / fillForm 辅助函数用于编辑模式回填
 * - 提供 handleSubmit 提交逻辑
 * - 提供样式辅助函数（inputStyle、focusStyle 等）
 */
import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { useAgentStore } from '@/stores/agentStore';
import { useAuthStore } from '@/stores/authStore';
import { DEFAULT_AGENTS } from '@/data/defaultAgents';
import { showToast } from '@/components/Toast';
import apiClient from '@/api/client';
import { agentsApi } from '@/api/agents';
import type { BackendSkill, CodeChannel, CodeModel } from '../types';

// [2026-05-24] 类型安全 — 智能体表单回填数据结构
interface AgentFormData {
  name: string;
  systemPrompt?: string;
  writingStyle?: string;
  expertise?: string[];
  description?: string;
  boundary?: string;
  outputFormat?: string;
  agentType?: string;
  visibility?: string;
  skillsConfig?: Record<string, boolean>;
  memoryTurns?: number | string;
  temperatureOverride?: number | string;
  modelName?: string;
  modelProvider?: string;
  maxTokens?: number | string;
  temperature?: number | string;
  topP?: number | string;
  frequencyPenalty?: number | string;
  presencePenalty?: number | string;
  tokenProvider?: string;
  tokenApiKey?: string;
  tokenBaseUrl?: string;
}
import { AGENT_TYPE_OPTIONS } from '../constants';
import { templateCategoryToAgentType, saveTokenCache } from '../utils';

export interface UseAgentFormReturn {
  // 表单字段
  name: string; setName: (v: string) => void;
  role: string; setRole: (v: string) => void;
  style: string; setStyle: (v: string) => void;
  skills: string[]; setSkills: (v: string[] | ((p: string[]) => string[])) => void;
  description: string; setDescription: (v: string) => void;
  boundary: string; setBoundary: (v: string) => void;
  outputFmt: string; setOutputFmt: (v: string) => void;
  agentType: (typeof AGENT_TYPE_OPTIONS)[number]['value']; setAgentType: (v: (typeof AGENT_TYPE_OPTIONS)[number]['value']) => void;
  visibility: 'private' | 'public' | 'template'; setVisibility: (v: 'private' | 'public' | 'template') => void;
  skillsConfig: Record<string, boolean>; setSkillsConfig: (v: Record<string, boolean> | ((p: Record<string, boolean>) => Record<string, boolean>)) => void;
  memoryTurns: string; setMemoryTurns: (v: string) => void;
  tempOverride: string; setTempOverride: (v: string) => void;
  saving: boolean;
  // 状态标志
  isEdit: boolean; editId: string | null; isAdmin: boolean; isDefaultAgent: boolean;
  // 辅助函数
  // [2026-05-24] 类型安全
  findAgent: (id: string) => AgentFormData | null;
  // [2026-05-24] 类型安全
  fillForm: (agent: AgentFormData) => void;
  handleSubmit: (e: React.FormEvent, backendSkills: BackendSkill[], selectedChannel: CodeChannel, selectedModel: CodeModel | null, customMaxTokens: string, customTemp: string, customTopP: string, customFreqPenalty: string, customPresPenalty: string, tokenValue: string, customBaseUrl: string) => Promise<void>;
  // 样式
  inputStyle: React.CSSProperties;
  numInputStyle: React.CSSProperties;
  focusStyle: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void;
  blurStyle: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void;
  labelStyle: React.CSSProperties;
  fieldStyle: React.CSSProperties;
  // 导航
  navigate: ReturnType<typeof useNavigate>;
}

export function useAgentForm(
  dynamicChannels: CodeChannel[],
  setSelectedChannel: (ch: CodeChannel) => void,
  setSelectedModel: (m: CodeModel | null) => void,
  setCustomMaxTokens: (v: string) => void,
  setCustomTemp: (v: string) => void,
  setCustomTopP: (v: string) => void,
  setCustomFreqPenalty: (v: string) => void,
  setCustomPresPenalty: (v: string) => void,
  setTokenValue: (v: string) => void,
  setCustomBaseUrl: (v: string) => void,
): UseAgentFormReturn {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  const editId = searchParams.get('id');
  const isEdit = !!editId;

  // 从项目跳转过来时携带的参数
  const fromProject   = searchParams.get('fromProject') === '1';
  const projectTitle  = searchParams.get('projectTitle') ?? '';
  const projectDesc   = searchParams.get('projectDesc') ?? '';
  const projectTags   = searchParams.get('projectTags') ?? '';

  const { getAgentById, fetchAgents, createAgent, updateAgent, agents } = useAgentStore();

  /* ── 表单字段状态 ── */
  const [name, setName]         = useState('');
  const [role, setRole]         = useState('');
  const [style, setStyle]       = useState('极简简洁');
  const [skills, setSkills]     = useState<string[]>([]);
  const [description, setDescription] = useState('');
  const [boundary, setBoundary]     = useState('');
  const [outputFmt, setOutputFmt]   = useState('Markdown');
  const [agentType, setAgentType]   = useState<(typeof AGENT_TYPE_OPTIONS)[number]['value']>('general');
  const [visibility, setVisibility] = useState<'private' | 'public' | 'template'>('private');
  const [skillsConfig, setSkillsConfig] = useState<Record<string, boolean>>({
    exec: false, shell: false, file_write: false, browser: false,
    web_search: true, file_read: true, image_generation: false,
  });
  const [memoryTurns, setMemoryTurns] = useState('');
  const [tempOverride, setTempOverride] = useState('');
  const [saving, setSaving]     = useState(false);

  /* ── 辅助：按 id 查找智能体 ── */
  const findAgent = useCallback((id: string) => {
    return getAgentById(id) ?? DEFAULT_AGENTS.find(a => a.id === id) ?? null;
  }, [getAgentById]);

  /* ── 预填表单 ── */
  const fillForm = useCallback((agent: AgentFormData) => {
    if (!agent) return;
    // [2026-05-24] 类型安全
    if (!dynamicChannels.length) {
      setName(agent.name);
      setRole(agent.systemPrompt ?? '');
      setStyle(agent.writingStyle ?? '极简简洁');
      setSkills(agent.expertise ?? []);
      setDescription(agent.description ?? '');
      setBoundary(agent.boundary ?? '');
      setOutputFmt(agent.outputFormat ?? 'Markdown');
      setAgentType((agent.agentType ?? 'general') as (typeof AGENT_TYPE_OPTIONS)[number]['value']);
      setVisibility(agent.visibility ?? 'private');
      return;
    }
    setName(agent.name);
    setRole(agent.systemPrompt ?? '');
    setStyle(agent.writingStyle ?? '极简简洁');
    setSkills(agent.expertise ?? []);
    setDescription(agent.description ?? '');
    setBoundary(agent.boundary ?? '');
    setOutputFmt(agent.outputFormat ?? 'Markdown');
    setAgentType((agent.agentType ?? 'general') as (typeof AGENT_TYPE_OPTIONS)[number]['value']);
    setVisibility(agent.visibility ?? 'private');
    const sc = agent.skillsConfig;
    if (sc && typeof sc === 'object') setSkillsConfig(sc);
    setMemoryTurns(agent.memoryTurns != null && agent.memoryTurns !== 0 ? String(agent.memoryTurns) : '');
    const to = agent.temperatureOverride;
    setTempOverride(to != null ? String(to) : '');

    // 回填模型参数
    if (agent.modelName) {
      const matchedChannel = dynamicChannels.find((ch: CodeChannel) =>
        ch.provider === (agent.modelProvider ?? '') || ch.models.some((m: CodeModel) => m.id === agent.modelName)
      ) ?? dynamicChannels[0];
      const matchedModelPreset = matchedChannel.models.find((m: CodeModel) => m.id === agent.modelName);
      const matchedModel: CodeModel = matchedModelPreset ?? {
        id: agent.modelName,
        name: agent.modelName,
        contextWindow: '',
        maxTokens: agent.maxTokens ?? 4096,
        temperature: agent.temperature ?? 0.7,
        topP: agent.topP ?? 1,
        frequencyPenalty: agent.frequencyPenalty ?? 0,
        presencePenalty: agent.presencePenalty ?? 0,
      };
      setSelectedChannel(matchedChannel);
      setSelectedModel(matchedModel);
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

    // 回填 Token 接入字段
    const savedTokenProvider = agent.tokenProvider ?? '';
    const savedTokenApiKey   = agent.tokenApiKey   ?? '';
    const savedTokenBaseUrl  = agent.tokenBaseUrl  ?? '';
    if (savedTokenProvider && savedTokenApiKey) {
      setTokenValue(savedTokenApiKey);
      setCustomBaseUrl(savedTokenBaseUrl);
      saveTokenCache(savedTokenProvider, { apiKey: savedTokenApiKey, baseUrl: savedTokenBaseUrl });
    }
  }, [dynamicChannels, setSelectedChannel, setSelectedModel, setCustomMaxTokens, setCustomTemp, setCustomTopP, setCustomFreqPenalty, setCustomPresPenalty, setTokenValue, setCustomBaseUrl]);

  /* ── 编辑模式：加载智能体数据 ── */
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
      agentsApi.getById(editId!)
        // [2026-05-24] 类型安全
        .then((a: AgentFormData) => fillForm(a))
        .catch(() => fetchAgents());
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId, isAdmin, navigate]);

  /* ── 渠道加载完成后，编辑模式重新回填 ── */
  useEffect(() => {
    if (!isEdit || !editId || !dynamicChannels.length) return;
    const agent = findAgent(editId);
    if (agent) fillForm(agent);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dynamicChannels]);

  /* ── fetchAgents 完成后再次尝试预填 ── */
  useEffect(() => {
    if (!isEdit || !editId) return;
    const agent = findAgent(editId);
    if (agent) fillForm(agent);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agents]);

  /* ── 从项目跳转过来：预填项目资料 ── */
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

  /* ── 从模板跳转的参数（location.state） ── */
  useEffect(() => {
    const templateData = location.state as {
      templateId?: string;
      name?: string;
      model?: string;
      description?: string;
      expertise?: string[];
      systemPrompt?: string;
      vibe?: string;
      category?: string;
    } | null;
    if (!templateData || isEdit) return;
    if (templateData.name) setName(templateData.name);
    if (templateData.description) setDescription(templateData.description);
    if (templateData.category) setAgentType(templateCategoryToAgentType(templateData.category));
    if (templateData.systemPrompt) setRole(templateData.systemPrompt);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── 是否为预设智能体 ── */
  const isDefaultAgent = isEdit && editId?.startsWith('default-');

  /* ── 提交表单 ── */
  const handleSubmit = useCallback(async (
    e: React.FormEvent,
    backendSkills: BackendSkill[],
    selChannel: CodeChannel,
    selModel: CodeModel | null,
    cMaxTokens: string,
    cTemp: string,
    cTopP: string,
    cFreqPenalty: string,
    cPresPenalty: string,
    tValue: string,
    cBaseUrl: string,
  ) => {
    e.preventDefault();
    if (!name.trim()) { showToast('请填写智能体名称', 'warning'); return; }

    const activeModel: CodeModel = selModel ?? selChannel.models[0];
    const isCustomChannel = selChannel.id === 'custom';
    if (isCustomChannel) {
      if (!cBaseUrl.trim()) { showToast('请先配置自定义渠道的 Base URL', 'warning'); return; }
      if (!activeModel?.id?.trim()) { showToast('请先配置自定义模型 ID', 'warning'); return; }
      if (!tValue.trim()) { showToast('请先填写自定义渠道的 API Key', 'warning'); return; }
    }

    setSaving(true);
    try {
      const isPrivateKey = true;
      // temperatureOverride：快捷温度覆盖框有值时使用，否则用 CODE 弹窗里的 customTemp
      const resolvedTemp = tempOverride !== ''
        ? Number(tempOverride)
        : (Number(cTemp) || activeModel.temperature);

      const payload = {
        name: name.trim(),
        color: '#6366f1',
        systemPrompt: role.trim(),
        writingStyle: style,
        expertise: skills,
        description: description.trim(),
        status: 'active' as const,
        outputFormat: outputFmt,
        boundary: boundary.trim(),
        agentType,
        memoryTurns: Number(memoryTurns) || 0,
        temperatureOverride: tempOverride !== '' ? Number(tempOverride) : null,
        modelName: activeModel.id,
        modelProvider: selChannel.id === 'custom' ? 'custom' : selChannel.provider,
        temperature: resolvedTemp,
        maxTokens: Number(cMaxTokens) || activeModel.maxTokens,
        topP: Number(cTopP) || activeModel.topP,
        frequencyPenalty: Number(cFreqPenalty) || activeModel.frequencyPenalty,
        presencePenalty: Number(cPresPenalty) || activeModel.presencePenalty,
        tokenProvider: isPrivateKey ? (selChannel.id === 'custom' ? 'custom' : selChannel.id) : '',
        tokenApiKey: isPrivateKey ? tValue : '',
        tokenBaseUrl: isPrivateKey ? cBaseUrl : '',
        visibility,
        skillsConfig,
      };

      let agentId: string;
      if (isEdit && editId && !isDefaultAgent) {
        await updateAgent(editId, payload);
        agentId = editId;
        // 先解绑所有旧技能，再绑定新的
        try {
          const oldSkillsRes = await apiClient.get(`/skills/agent/${agentId}`);
          const oldSkills: BackendSkill[] = oldSkillsRes.data.data ?? [];
          await Promise.all(oldSkills.map(s =>
            apiClient.delete(`/skills/${s.id}/bind`, { data: { agentId } })
          ));
        } catch { /* 解绑失败不阻断 */ }
      } else {
        const newAgent = await createAgent(payload);
        agentId = newAgent.id;
      }

      // 绑定选中的技能
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
  }, [name, role, style, skills, description, outputFmt, boundary, agentType, memoryTurns, tempOverride, isEdit, editId, isDefaultAgent, updateAgent, createAgent, navigate, visibility, skillsConfig]);

  /* ── 样式辅助 ── */
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
  const focusStyle = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    e.currentTarget.style.borderColor = '#2a3b4d';
  };
  const blurStyle = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    e.currentTarget.style.borderColor = '#d1d5db';
  };
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 };
  const fieldStyle: React.CSSProperties = { marginBottom: 10 };

  return {
    name, setName, role, setRole, style, setStyle,
    skills, setSkills, description, setDescription, boundary, setBoundary,
    outputFmt, setOutputFmt, agentType, setAgentType,
    visibility, setVisibility, skillsConfig, setSkillsConfig,
    memoryTurns, setMemoryTurns, tempOverride, setTempOverride,
    saving, isEdit, editId, isAdmin, isDefaultAgent,
    findAgent, fillForm, handleSubmit,
    inputStyle, numInputStyle, focusStyle, blurStyle, labelStyle, fieldStyle,
    navigate,
  };
}
