/**
 * 移动端智能体创建页面
 * 适配移动端UI风格，提供智能体创建功能
 * 字段和逻辑对齐PC端 AgentCreate.tsx
 */
import { useState, useCallback, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Check, ChevronDown } from 'lucide-react';
import { useAgentStore } from '../stores/agentStore';
import { apiClient } from '../api/client';

/* ─────────────────────────────────────────────
 * 颜色选项
 * ───────────────────────────────────────────── */
const COLOR_OPTIONS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e',
  '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#0ea5e9', '#3b82f6', '#a855f7', '#64748b',
];

/* ─────────────────────────────────────────────
 * 智能体类型选项
 * ───────────────────────────────────────────── */
const AGENT_TYPE_OPTIONS = [
  { id: 'dev',      label: '开发/工程类' },
  { id: 'data',     label: '数据分析类' },
  { id: 'creative', label: '内容/创作类' },
  { id: 'pm',       label: '产品/管理类' },
  { id: 'research', label: 'AI/研究类' },
  { id: 'ops',      label: '运营类' },
  { id: 'decision', label: '决策类' },
  { id: 'general',  label: '通用/助手类' },
];

/* ─────────────────────────────────────────────
 * 输出格式选项（对齐PC端 AgentCreate.tsx 第26行）
 * ───────────────────────────────────────────── */
const OUTPUT_TAGS = ['纯文本', 'Markdown', 'Markdown+完整代码', '结构化JSON'];

/* ─────────────────────────────────────────────
 * 可用模型列表
 * ───────────────────────────────────────────── */
const AVAILABLE_MODELS = [
  { id: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
  { id: 'glm-5',           label: 'GLM-5' },
  { id: 'glm-5.1',         label: 'GLM-5.1' },
  { id: 'qwen3-max-2026-01-23', label: 'Qwen3 Max' },
  { id: 'qwen3.6-plus',    label: 'Qwen3.6 Plus' },
  { id: 'kimi-k2.5',       label: 'Kimi K2.5' },
  { id: 'minimax-m2.5',    label: 'MiniMax M2.5' },
  { id: 'doubao-pro-32k',  label: 'Doubao Pro 32K' },
  { id: 'qwen-max',        label: 'Qwen Max' },
];

/* ─────────────────────────────────────────────
 * 可见性选项
 * ───────────────────────────────────────────── */
const VISIBILITY_OPTIONS = [
  { id: 'private' as const, label: '私有', desc: '仅自己可见' },
  { id: 'public' as const, label: '公开', desc: '所有用户可见' },
  { id: 'template' as const, label: '模板', desc: '作为模板使用' },
];

/* ─────────────────────────────────────────────
 * 技能权限配置
 * ───────────────────────────────────────────── */
const SKILL_OPTIONS = [
  { id: 'web_search', label: '网络搜索', default: true },
  { id: 'file_read', label: '文件读取', default: true },
  { id: 'exec', label: '命令执行', default: false },
  { id: 'shell', label: 'Shell', default: false },
  { id: 'file_write', label: '文件写入', default: false },
  { id: 'browser', label: '浏览器', default: false },
  { id: 'image_generation', label: '图片生成', default: false },
];

/* ─────────────────────────────────────────────
 * Props接口
 * ───────────────────────────────────────────── */
interface Props {
  onBack: () => void;
  // ⚠️ 防回归说明：当该页面由 MobileWorkspace 内部视图切入时，
  // 模板预填数据来自父组件内存态，而不是 react-router location.state。
  // 这里保留 initialTemplateState，就是为了避免再次依赖路由跳转。
  initialTemplateState?: {
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
}

/* ─────────────────────────────────────────────
 * 颜色常量
 * ───────────────────────────────────────────── */
const COLORS = {
  bgPrimary: '#0f0f12',
  bgSecondary: '#1a1a1f',
  bgTertiary: '#252530',
  textPrimary: '#f5f5f7',
  textSecondary: '#a0a0a8',
  textMuted: '#6b6b75',
  border: '#353540',
  accent: '#6366f1',
  accentHover: '#7c7cf5',
  danger: '#f43f5e',
};

export function MobileAgentCreate({ onBack, initialTemplateState }: Props) {
  const navigate = useNavigate();
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
        const enabledChannels = data.filter((c: any) => c.enabled);
        setChannels(enabledChannels);
        if (enabledChannels.length > 0) {
          const preset = enabledChannels.find((c: any) => c.isPreset) || enabledChannels[0];
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
      const payload: Record<string, any> = {
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

  /* ── 样式复用 ── */
  const sectionStyle: React.CSSProperties = {
    marginBottom: 24,
    background: COLORS.bgSecondary,
    borderRadius: 12,
    padding: 16,
  };

  const sectionTitleStyle: React.CSSProperties = {
    fontSize: 14,
    fontWeight: 600,
    color: COLORS.textPrimary,
    marginBottom: 14,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 6,
    display: 'block',
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    height: 44,
    background: COLORS.bgTertiary,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 8,
    padding: '0 14px',
    fontSize: 14,
    color: COLORS.textPrimary,
    outline: 'none',
    boxSizing: 'border-box',
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: COLORS.bgPrimary,
      color: COLORS.textPrimary,
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* ═══════════════════════════════════
       * 顶部导航栏
       * ═══════════════════════════════════ */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        padding: '12px 16px',
        background: COLORS.bgSecondary,
        borderBottom: `1px solid ${COLORS.border}`,
        gap: 12,
        position: 'sticky',
        top: 0,
        zIndex: 10,
      }}>
        <button onClick={onBack} style={{
          background: 'none', border: 'none', color: COLORS.textPrimary,
          cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center',
        }}>
          <ArrowLeft size={20} />
        </button>
        <div style={{ fontSize: 16, fontWeight: 600, flex: 1 }}>创建智能体</div>
        <button
          onClick={handleCreate}
          disabled={loading}
          style={{
            background: loading ? COLORS.bgTertiary : COLORS.accent,
            border: 'none', borderRadius: 8, padding: '8px 16px',
            color: '#fff', fontSize: 14, fontWeight: 500,
            cursor: loading ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', gap: 4,
          }}
        >
          {loading ? '创建中...' : <><Check size={16} /> 创建</>}
        </button>
      </div>

      {/* ═══════════════════════════════════
       * 表单内容
       * ═══════════════════════════════════ */}
      <div style={{ padding: 16, paddingBottom: 100, flex: 1, overflow: 'auto' }}>

        {/* ── 基本信息 ── */}
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>基本信息</div>

          {/* 名称 */}
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>智能体名称 <span style={{ color: COLORS.danger }}>*</span></label>
            <input
              type="text" value={name} onChange={(e) => setName(e.target.value)}
              placeholder="例如：前端开发助手" style={inputStyle}
            />
          </div>

          {/* 颜色选择 */}
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>标签颜色</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {COLOR_OPTIONS.map((c) => (
                <button key={c} onClick={() => setColor(c)} style={{
                  width: 32, height: 32, borderRadius: 8, background: c,
                  border: color === c ? '2px solid #fff' : '2px solid transparent',
                  cursor: 'pointer',
                }} />
              ))}
            </div>
          </div>

          {/* 类型选择 */}
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>智能体类型</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {AGENT_TYPE_OPTIONS.map((t) => (
                <button key={t.id} onClick={() => setAgentType(t.id)} style={{
                  padding: '8px 12px', borderRadius: 8,
                  background: agentType === t.id ? COLORS.accent : COLORS.bgTertiary,
                  border: `1px solid ${agentType === t.id ? COLORS.accent : COLORS.border}`,
                  color: agentType === t.id ? '#fff' : COLORS.textSecondary,
                  fontSize: 13, cursor: 'pointer',
                }}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* 描述 */}
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>简介</label>
            <input
              type="text" value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="简要描述该智能体的用途" style={inputStyle}
            />
          </div>

          {/* 输出格式 */}
          <div>
            <label style={labelStyle}>输出格式</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {OUTPUT_TAGS.map((fmt) => (
                <button key={fmt} onClick={() => setOutputFormat(fmt)} style={{
                  padding: '8px 12px', borderRadius: 8,
                  background: outputFormat === fmt ? COLORS.accent : COLORS.bgTertiary,
                  border: `1px solid ${outputFormat === fmt ? COLORS.accent : COLORS.border}`,
                  color: outputFormat === fmt ? '#fff' : COLORS.textSecondary,
                  fontSize: 13, cursor: 'pointer',
                }}>
                  {fmt}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── 模型与渠道配置 ── */}
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>模型与渠道</div>

          {/* 渠道选择 */}
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>渠道</label>
            <div style={{ position: 'relative' }}>
              <button onClick={() => setChannelDropdownOpen(!channelDropdownOpen)} style={{
                width: '100%', height: 44, background: COLORS.bgTertiary,
                border: `1px solid ${COLORS.border}`, borderRadius: 8,
                padding: '0 14px', fontSize: 14, color: COLORS.textPrimary,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                boxSizing: 'border-box',
              }}>
                <span>
                  {channels.length === 0 ? '加载中...' :
                   selectedChannel === 'custom' ? '自定义渠道' :
                   channels.find(c => c.provider === selectedChannel)?.provider || '选择渠道'}
                </span>
                <ChevronDown size={16} color={COLORS.textMuted} />
              </button>
              {channelDropdownOpen && channels.length > 0 && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, right: 0,
                  background: COLORS.bgTertiary, border: `1px solid ${COLORS.border}`,
                  borderRadius: 8, marginTop: 4, zIndex: 20, overflow: 'hidden',
                }}>
                  {channels.map((ch) => (
                    <button key={ch.provider} onClick={() => {
                      setSelectedChannel(ch.provider);
                      if (ch.modelName) setModelName(ch.modelName);
                      setChannelDropdownOpen(false);
                    }} style={{
                      width: '100%', padding: '12px 14px', background: 'transparent',
                      border: 'none', borderBottom: `1px solid ${COLORS.border}`,
                      color: selectedChannel === ch.provider ? COLORS.accent : COLORS.textPrimary,
                      fontSize: 14, textAlign: 'left', cursor: 'pointer',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}>
                      <span>{ch.provider}</span>
                      {ch.isPreset && <span style={{ fontSize: 11, color: COLORS.textMuted }}>预设</span>}
                    </button>
                  ))}
                  <button onClick={() => { setSelectedChannel('custom'); setChannelDropdownOpen(false); }} style={{
                    width: '100%', padding: '12px 14px', background: 'transparent',
                    border: 'none', color: COLORS.accent, fontSize: 14, textAlign: 'left',
                    cursor: 'pointer',
                  }}>
                    + 自定义渠道
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* 模型选择（非自定义时显示） */}
          {!isCustomChannel && (
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>模型</label>
              <select
                value={modelName} onChange={(e) => setModelName(e.target.value)}
                style={{
                  ...inputStyle, appearance: 'none',
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b6b75' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 14px center',
                  paddingRight: 36,
                }}
              >
                {AVAILABLE_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
            </div>
          )}

          {/* 自定义渠道字段 */}
          {isCustomChannel && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={labelStyle}>Base URL <span style={{ color: COLORS.danger }}>*</span></label>
                <input
                  type="text" value={customBaseUrl} onChange={(e) => setCustomBaseUrl(e.target.value)}
                  placeholder="https://api.openai.com/v1" style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>API Key <span style={{ color: COLORS.danger }}>*</span></label>
                <input
                  type="password" value={customApiKey} onChange={(e) => setCustomApiKey(e.target.value)}
                  placeholder="sk-..." style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>模型 ID <span style={{ color: COLORS.danger }}>*</span></label>
                <input
                  type="text" value={customModelId} onChange={(e) => setCustomModelId(e.target.value)}
                  placeholder="gpt-4o" style={inputStyle}
                />
              </div>
            </div>
          )}

          {/* 高级参数 */}
          <div style={{ marginTop: 16, display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>记忆轮数</label>
              <input
                type="number" value={memoryTurns} onChange={(e) => setMemoryTurns(e.target.value)}
                placeholder="0=不限" style={inputStyle}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>温度覆盖</label>
              <input
                type="number" value={temperatureOverride} onChange={(e) => setTemperatureOverride(e.target.value)}
                placeholder="默认" step="0.1" min="0" max="2" style={inputStyle}
              />
            </div>
          </div>
        </div>

        {/* ── 权限配置 ── */}
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>权限配置</div>

          {/* 可见性 */}
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>可见性</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {VISIBILITY_OPTIONS.map((v) => (
                <button key={v.id} onClick={() => setVisibility(v.id)} style={{
                  flex: 1, padding: '10px 8px', borderRadius: 8,
                  background: visibility === v.id ? COLORS.accent : COLORS.bgTertiary,
                  border: `1px solid ${visibility === v.id ? COLORS.accent : COLORS.border}`,
                  color: visibility === v.id ? '#fff' : COLORS.textSecondary,
                  fontSize: 13, cursor: 'pointer', textAlign: 'center',
                }}>
                  <div style={{ fontWeight: 500 }}>{v.label}</div>
                  <div style={{ fontSize: 10, marginTop: 2, opacity: 0.7 }}>{v.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* 技能权限 */}
          <div>
            <label style={labelStyle}>技能权限</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {SKILL_OPTIONS.map((skill) => (
                <div key={skill.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 14px', borderRadius: 8, background: COLORS.bgTertiary,
                }}>
                  <span style={{ fontSize: 14, color: COLORS.textPrimary }}>{skill.label}</span>
                  <button
                    onClick={() => setSkillsConfig(prev => ({ ...prev, [skill.id]: !prev[skill.id] }))}
                    style={{
                      width: 44, height: 24, borderRadius: 12,
                      background: skillsConfig[skill.id] ? COLORS.accent : COLORS.border,
                      border: 'none', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', padding: '0 2px',
                      transition: 'background 0.2s',
                    }}
                  >
                    <div style={{
                      width: 20, height: 20, borderRadius: 10, background: '#fff',
                      transform: skillsConfig[skill.id] ? 'translateX(20px)' : 'translateX(0)',
                      transition: 'transform 0.2s',
                    }} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── 系统设定 ── */}
        <div style={sectionStyle}>
          <div style={sectionTitleStyle}>系统设定</div>

          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>系统提示词</label>
            <textarea
              value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="定义智能体的行为和角色" rows={8} style={{
                width: '100%', minHeight: 200, background: COLORS.bgTertiary,
                border: `1px solid ${COLORS.border}`, borderRadius: 8,
                padding: '12px 14px', fontSize: 14, color: COLORS.textPrimary,
                outline: 'none', resize: 'vertical', fontFamily: 'inherit',
                boxSizing: 'border-box',
              }}
            />
          </div>
        </div>

      </div>

      {/* ═══════════════════════════════════
       * Toast 通知
       * ═══════════════════════════════════ */}
      {showToast && (
        <div style={{
          position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)',
          zIndex: 300, background: COLORS.bgTertiary,
          borderRadius: 8, padding: '10px 20px',
          fontSize: 13, color: COLORS.textPrimary,
          boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
        }}>
          {showToast}
        </div>
      )}
    </div>
  );
}
