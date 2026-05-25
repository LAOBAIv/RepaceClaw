/**
 * BasicInfoSection - 基本信息区组件
 *
 * 职责：渲染智能体基本信息表单字段
 * - 智能体名称
 * - 简介
 * - 语言风格（下拉选择）
 * - 输出格式（下拉选择）
 * - 执行分类（下拉选择 + 映射提示）
 */
import { STYLE_TAGS, OUTPUT_TAGS, AGENT_TYPE_OPTIONS } from './constants';

interface BasicInfoSectionProps {
  name: string;
  setName: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  style: string;
  setStyle: (v: string) => void;
  outputFmt: string;
  setOutputFmt: (v: string) => void;
  agentType: (typeof AGENT_TYPE_OPTIONS)[number]['value'];
  setAgentType: (v: (typeof AGENT_TYPE_OPTIONS)[number]['value']) => void;
  // 样式
  inputStyle: React.CSSProperties;
  focusStyle: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void;
  blurStyle: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void;
  labelStyle: React.CSSProperties;
  fieldStyle: React.CSSProperties;
}

export function BasicInfoSection({
  name, setName, description, setDescription,
  style, setStyle, outputFmt, setOutputFmt,
  agentType, setAgentType,
  inputStyle, focusStyle, blurStyle, labelStyle, fieldStyle,
}: BasicInfoSectionProps) {
  return (
    <>
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

      {/* 语言风格 + 输出格式 */}
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
    </>
  );
}
