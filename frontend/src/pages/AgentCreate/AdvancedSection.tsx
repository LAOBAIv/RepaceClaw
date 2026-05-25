/**
 * AdvancedSection - 高级设置区组件
 *
 * 职责：渲染高级配置表单字段
 * - 对话记忆轮数 + 推理温度覆盖（同行两列）
 * - 可见性选择（私有/公开/模板）
 * - Skill 安全管控（7 个 checkbox，按风险等级着色）
 */

interface AdvancedSectionProps {
  memoryTurns: string;
  setMemoryTurns: (v: string) => void;
  tempOverride: string;
  setTempOverride: (v: string) => void;
  visibility: 'private' | 'public' | 'template';
  setVisibility: (v: 'private' | 'public' | 'template') => void;
  skillsConfig: Record<string, boolean | undefined>;
  setSkillsConfig: (v: Record<string, boolean> | ((p: Record<string, boolean>) => Record<string, boolean>)) => void;
  // 样式
  inputStyle: React.CSSProperties;
  focusStyle: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void;
  blurStyle: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void;
  labelStyle: React.CSSProperties;
  fieldStyle: React.CSSProperties;
}

/* 技能风险等级配置 */
const SKILL_RISK_CONFIG: Record<string, { label: string; risk: 'high' | 'medium' | 'low' }> = {
  exec: { label: '代码执行', risk: 'high' },
  shell: { label: 'Shell 命令', risk: 'high' },
  file_write: { label: '文件写入', risk: 'high' },
  browser: { label: '浏览器控制', risk: 'high' },
  web_search: { label: '网络搜索', risk: 'low' },
  file_read: { label: '文件读取', risk: 'low' },
  image_generation: { label: '图片生成', risk: 'medium' },
};

const RISK_COLORS: Record<string, string> = {
  high: '#dc2626',
  medium: '#f59e0b',
  low: '#16a34a',
};

const RISK_ICONS: Record<string, string> = {
  high: '🔴',
  medium: '🟡',
  low: '🟢',
};

export function AdvancedSection({
  memoryTurns, setMemoryTurns, tempOverride, setTempOverride,
  visibility, setVisibility,
  skillsConfig, setSkillsConfig,
  inputStyle, focusStyle, blurStyle, labelStyle, fieldStyle,
}: AdvancedSectionProps) {
  return (
    <>
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

      {/* 可见性 */}
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

      {/* Skill 安全管控 */}
      <div style={fieldStyle}>
        <label style={labelStyle}>Skill 安全管控</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {Object.entries(SKILL_RISK_CONFIG).map(([key, { label, risk }]) => (
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
                style={{ accentColor: RISK_COLORS[risk] }}
              />
              <span style={{ color: RISK_COLORS[risk], fontWeight: 500 }}>
                {RISK_ICONS[risk]}
              </span>
              <span style={{ color: '#374151' }}>{label}</span>
            </label>
          ))}
        </div>
        <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 4 }}>🔴 高危  🟡 中危  🟢 低危 · 高危 Skill 默认禁用</div>
      </div>
    </>
  );
}
