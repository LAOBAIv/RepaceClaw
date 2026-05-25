/**
 * MobileAgentCreate 主组件入口
 * 管理所有状态、业务逻辑，并渲染 AgentForm 表单
 * 路由兼容：该目录替代原 MobileAgentCreate.tsx 文件
 */
import { useState, useCallback, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAgentStore } from '../../stores/agentStore';
import { apiClient } from '../../api/client';
import { COLOR_OPTIONS } from './constants';
import { Props } from './types';
import { AgentForm } from './AgentForm';

/**
 * MobileAgentCreate 移动端智能体创建页面
 * 适配移动端UI风格，提供智能体创建功能
 * 字段和逻辑对齐PC端 AgentCreate.tsx
 */
export function MobileAgentCreate({ onBack, initialTemplateState }: Props) {
  const location = useLocation();
  const { fetchAgents } = useAgentStore();

  // ── 从路由 state 接收模板参数（和PC端一致） ──
  const templateState = (initialTemplateState || location.state) as {
    templateId?: string;
    name?: string;
    model?: string;
    description?: string;
    expertise?: string;
    systemPrompt?: string;
    vibe?: string;
    category?: string;
    outputFormat?: string;
  } | null;

  // ── 表单状态（有模板时预填） ──
  const [name, setName] = useState(templateState?.name || '');
  const [color, setColor] = useState(COLOR_OPTIONS[0]);
  const [agentType, setAgentType] = useState(templateState?.category || 'general');
  const [modelName, setModelName] = useState(templateState?.model || 'glm-5');
  const [systemPrompt, setSystemPrompt] = useState(templateState?.systemPrompt || '');
  const [description, setDescription] = useState(templateState?.description || '');
  const [outputFormat, setOutputFormat] = useState(templateState?.outputFormat || 'Markdown');
  const [loading, setLoading] = useState(false);
  const [showToast, setShowToast] = useState<string | null>(null);

  // ── 渠道配置 ──
  const [channels, setChannels] = useState<Array<{ id: string; provider: string; modelName: string; baseUrl: string; isPreset: boolean }>>([]);
  const [selectedChannel, setSelectedChannel] = useState<string>('');
  const [channelDropdownOpen, setChannelDropdownOpen] = useState(false);

  // ── 自定义渠道 ──
  const [customBaseUrl, setCustomBaseUrl] = useState('');
  const [customApiKey, setCustomApiKey] = useState('');
  const [customModelId, setCustomModelId] = useState('');

  // ── 高级参数 ──
  const [memoryTurns, setMemoryTurns] = useState('');
  const [temperatureOverride, setTemperatureOverride] = useState('');

  // ── 权限配置 ──
  const [visibility, setVisibility] = useState<'private' | 'public' | 'template'>('private');
  const [skillsConfig, setSkillsConfig] = useState<Record<string, boolean>>({
    exec: false, shell: false, file_write: false, browser: false,
    web_search: true, file_read: true, image_generation: false,
  });

  // ── 加载渠道列表 ──
  useEffect(() => {
    apiClient.get('/token-channels')
      .then(res => {
        const data = res.data?.data || [];
        const enabledChannels = data.filter((c: { enabled?: boolean }) => c.enabled); // [2026-05-24] 类型安全
        setChannels(enabledChannels);
        if (enabledChannels.length > 0) {
          const preset = enabledChannels.find((c: { isPreset?: boolean; provider?: string; modelName?: string }) => c.isPreset) || enabledChannels[0]; // [2026-05-24] 类型安全
          setSelectedChannel(preset.provider);
          if (preset.modelName) setModelName(preset.modelName);
        }
      })
      .catch(() => {
        // 后端不可用时使用空列表
      });
  }, []);

  const isCustomChannel = selectedChannel === 'custom';

  // ── 创建智能体 ──
  const handleCreate = useCallback(async () => {
    if (!name.trim()) {
      setShowToast('请输入智能体名称');
      return;
    }

    // 自定义渠道校验
    if (isCustomChannel) {
      if (!customBaseUrl.trim()) {
        setShowToast('请填写自定义渠道 Base URL');
        return;
      }
      if (!customModelId.trim()) {
        setShowToast('请填写自定义模型 ID');
        return;
      }
      if (!customApiKey.trim()) {
        setShowToast('请填写自定义渠道 API Key');
        return;
      }
    }

    setLoading(true);
    try {
      const payload: Record<string, unknown> = {
        name: name.trim(),
        color,
        agentType,
        systemPrompt: systemPrompt.trim(),
        description: description.trim(),
        outputFormat,
        status: 'active',
        // 渠道配置
        modelProvider: isCustomChannel ? 'custom' : selectedChannel,
        modelName: isCustomChannel ? customModelId.trim() : modelName,
        // Token 接入
        tokenProvider: isCustomChannel ? 'custom' : selectedChannel,
        tokenApiKey: isCustomChannel ? customApiKey.trim() : '',
        tokenBaseUrl: isCustomChannel ? customBaseUrl.trim() : '',
        // 高级参数
        memoryTurns: Number(memoryTurns) || 0,
        temperatureOverride: temperatureOverride !== '' ? Number(temperatureOverride) : null,
        // 权限配置
        visibility,
        skillsConfig,
      };

      const res = await apiClient.post('/agents', payload);

      if (res.status === 200 || res.status === 201) {
        await fetchAgents();
        setShowToast('智能体创建成功');
        setTimeout(() => onBack(), 1500);
      } else {
        setShowToast(res.data?.message || '创建失败');
      }
    } catch (e) {
      console.error('[MobileAgentCreate]', e);
      setShowToast('创建失败');
    }
    setLoading(false);
  }, [name, color, agentType, modelName, systemPrompt, description, outputFormat,
      selectedChannel, customBaseUrl, customApiKey, customModelId, isCustomChannel,
      memoryTurns, temperatureOverride, visibility, skillsConfig,
      fetchAgents, onBack]);

  // Toast auto-hide
  useEffect(() => {
    if (showToast) {
      const timer = setTimeout(() => setShowToast(null), 2000);
      return () => clearTimeout(timer);
    }
  }, [showToast]);

  return (
    <AgentForm
      onBack={onBack}
      name={name} setName={setName}
      color={color} setColor={setColor}
      agentType={agentType} setAgentType={setAgentType}
      description={description} setDescription={setDescription}
      outputFormat={outputFormat} setOutputFormat={setOutputFormat}
      channels={channels}
      selectedChannel={selectedChannel} setSelectedChannel={setSelectedChannel}
      channelDropdownOpen={channelDropdownOpen} setChannelDropdownOpen={setChannelDropdownOpen}
      modelName={modelName} setModelName={setModelName}
      isCustomChannel={isCustomChannel}
      customBaseUrl={customBaseUrl} setCustomBaseUrl={setCustomBaseUrl}
      customApiKey={customApiKey} setCustomApiKey={setCustomApiKey}
      customModelId={customModelId} setCustomModelId={setCustomModelId}
      memoryTurns={memoryTurns} setMemoryTurns={setMemoryTurns}
      temperatureOverride={temperatureOverride} setTemperatureOverride={setTemperatureOverride}
      visibility={visibility} setVisibility={setVisibility}
      skillsConfig={skillsConfig} setSkillsConfig={setSkillsConfig}
      systemPrompt={systemPrompt} setSystemPrompt={setSystemPrompt}
      loading={loading}
      handleCreate={handleCreate}
      showToast={showToast}
    />
  );
}
