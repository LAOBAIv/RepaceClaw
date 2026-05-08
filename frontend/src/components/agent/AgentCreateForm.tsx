import { useState, useEffect } from "react";
import type { Agent } from "../../types";
import apiClient from "@/api/client";

/* ── 渠道数据（从后端 token_channels 实时拉取）── */
interface ChannelInfo {
  id: string;
  provider: string;
  modelName: string;
  baseUrl: string;
  enabled: boolean;
  priority: number;
  // apiKey 不暴露给前端
}

const SKILL_OPTIONS = [
  "文案写作", "代码生成", "数据分析", "翻译润色",
  "逻辑推理", "创意策划", "摘要提炼", "问答对话",
  "情感支持", "知识检索", "图表解读", "任务规划",
];

const OUTPUT_FORMATS = ["纯文本", "Markdown", "JSON", "列表", "表格", "Markdown+完整代码"];
const MEMORY_OPTIONS = ["短期（8K）", "中期（32K）", "长期（128K）"];
const TEMP_OPTIONS = ["0.1", "0.3", "0.5", "0.7", "0.9", "1.0"];

interface Props {
  onCancel: () => void;
  onCreate: (data: Omit<Agent, "id" | "createdAt">) => void;
}

const inputBase: React.CSSProperties = {
  width: "100%",
  padding: "10px 14px",
  border: "1px solid #E5E5E5",
  borderRadius: 8,
  fontSize: 13,
  color: "#333333",
  background: "#FAFAFA",
  outline: "none",
  transition: "border-color 0.15s, background 0.15s",
  boxSizing: "border-box",
  fontFamily: "inherit",
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: "#666666",
  marginBottom: 8,
  display: "block",
};

function TagSelect({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {options.map((opt) => {
        const active = value === opt;
        return (
          <button
            key={opt}
            onClick={() => onChange(opt)}
            style={{
              padding: "4px 12px",
              borderRadius: 20,
              fontSize: 12,
              border: `1px solid ${active ? "#A5C8FF" : "#E5E5E5"}`,
              background: active ? "#EBF4FF" : "#FAFAFA",
              color: active ? "#2478E5" : "#555555",
              cursor: "pointer",
              fontWeight: active ? 600 : 400,
              transition: "all 0.15s",
            }}
            onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = "#F0F0F0"; }}
            onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "#FAFAFA"; }}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

function SkillPickerModal({
  selected,
  onConfirm,
  onClose,
}: {
  selected: string[];
  onConfirm: (v: string[]) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Set<string>>(new Set(selected));

  function toggle(skill: string) {
    setDraft((prev) => {
      const next = new Set(prev);
      next.has(skill) ? next.delete(skill) : next.add(skill);
      return next;
    });
  }

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0,
      background: "rgba(0,0,0,0.25)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 1000,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: "#FFFFFF", borderRadius: 12,
        padding: "24px 28px 20px", width: 460,
        boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
      }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#333333", marginBottom: 16 }}>
          选择核心技能
          <span style={{ fontSize: 12, color: "#999", fontWeight: 400, marginLeft: 6 }}>
            已选 {draft.size} 项
          </span>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
          {SKILL_OPTIONS.map((skill) => {
            const active = draft.has(skill);
            return (
              <button
                key={skill}
                onClick={() => toggle(skill)}
                style={{
                  padding: "6px 16px", borderRadius: 20, fontSize: 12,
                  border: `1px solid ${active ? "#A5C8FF" : "#E5E5E5"}`,
                  background: active ? "#EBF4FF" : "#FAFAFA",
                  color: active ? "#2478E5" : "#555555",
                  cursor: "pointer", fontWeight: active ? 600 : 400,
                  transition: "all 0.15s",
                }}
                onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = "#F0F0F0"; }}
                onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "#FAFAFA"; }}
              >
                {active ? "✓ " : ""}{skill}
              </button>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "7px 18px", background: "#F5F5F5", color: "#666666", border: "none", borderRadius: 7, fontSize: 13, cursor: "pointer" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#EBEBEB")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "#F5F5F5")}
          >取消</button>
          <button onClick={() => { onConfirm([...draft]); onClose(); }} style={{ padding: "7px 22px", background: "#2478E5", color: "#FFFFFF", border: "none", borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#1A68D0")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "#2478E5")}
          >确认</button>
        </div>
      </div>
    </div>
  );
}

/** 模型/渠道选择弹窗 — 从后端 token_channels 实时拉取 */
function ModelPickerModal({
  selectedModel,
  selectedProvider,
  onConfirm,
  onClose,
}: {
  selectedModel: string;
  selectedProvider: string;
  onConfirm: (model: string, provider: string) => void;
  onClose: () => void;
}) {
  const [channels, setChannels] = useState<ChannelInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [draftModel, setDraftModel] = useState(selectedModel);
  const [draftProvider, setDraftProvider] = useState(selectedProvider);

  useEffect(() => {
    // 从后端拉取已启用的渠道
    apiClient.get("/token-channels")
      .then(res => {
        const list: ChannelInfo[] = (res.data.data || []).filter((c: ChannelInfo) => c.enabled);
        setChannels(list);
        setLoading(false);
      })
      .catch(() => {
        setChannels([]);
        setLoading(false);
      });
  }, []);

  // 按 provider 分组
  const groups: Record<string, ChannelInfo[]> = {};
  channels.forEach(ch => {
    const key = ch.provider;
    if (!groups[key]) groups[key] = [];
    groups[key].push(ch);
  });

  function confirm() {
    onConfirm(draftModel, draftProvider);
    onClose();
  }

  // 渠道图标映射
  const providerIcons: Record<string, string> = {
    doubao: "🫘", deepseek: "🔮", qwen: "🌟", openai: "🤖",
    anthropic: "🌀", minimax: "⚡", custom: "🔧",
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0,
        background: "rgba(0,0,0,0.25)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 1000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#FFFFFF",
          borderRadius: 12,
          padding: "24px 28px 20px",
          width: 520,
          maxWidth: "calc(100vw - 32px)",
          maxHeight: "80vh",
          overflowY: "auto",
          boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 700, color: "#333333", marginBottom: 4 }}>
          选择渠道与模型
        </div>
        <div style={{ fontSize: 11, color: "#999", marginBottom: 16 }}>
          渠道来自管理后台「模型渠道」配置
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: "24px 0", color: "#999", fontSize: 13 }}>
            加载渠道配置中…
          </div>
        ) : channels.length === 0 ? (
          <div style={{ textAlign: "center", padding: "24px 0", color: "#999", fontSize: 13 }}>
            暂无可用渠道，请先在管理后台配置
          </div>
        ) : (
          Object.entries(groups).map(([provider, chs]) => {
            const icon = providerIcons[provider.toLowerCase()] || "📡";
            return (
              <div key={provider} style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "#888", marginBottom: 8, display: "flex", alignItems: "center", gap: 5 }}>
                  <span>{icon}</span>
                  <span style={{ textTransform: "uppercase", letterSpacing: 1 }}>{provider}</span>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {chs.map((ch) => {
                    const modelName = ch.modelName || "默认模型";
                    const isActive = draftProvider === provider && draftModel === modelName;
                    return (
                      <button
                        key={ch.id}
                        onClick={() => {
                          setDraftModel(modelName);
                          setDraftProvider(provider);
                        }}
                        style={{
                          padding: "6px 16px",
                          borderRadius: 20,
                          fontSize: 12,
                          border: `1.5px solid ${isActive ? "#A5C8FF" : "#E5E5E5"}`,
                          background: isActive ? "#EBF4FF" : "#FAFAFA",
                          color: isActive ? "#2478E5" : "#555555",
                          cursor: "pointer",
                          fontWeight: isActive ? 600 : 400,
                          transition: "all 0.15s",
                          display: "flex",
                          alignItems: "center",
                          gap: 5,
                        }}
                        onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = "#F0F0F0"; }}
                        onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = "#FAFAFA"; }}
                      >
                        {isActive && (
                          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                            <path d="M1.5 5L4 7.5L8.5 2.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                        {modelName}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}

        {/* 当前选中展示 */}
        {draftProvider && draftModel && (
          <div style={{
            marginTop: 12, padding: "8px 14px", borderRadius: 8,
            background: "#F0F7FF", border: "1px solid #C8E0FF",
            fontSize: 12, color: "#2478E5", display: "flex", alignItems: "center", gap: 6,
          }}>
            <span style={{ fontWeight: 600 }}>已选：</span>
            {providerIcons[draftProvider.toLowerCase()] || "📡"} {draftProvider}
            <span style={{ opacity: 0.5 }}>/</span>
            {draftModel}
          </div>
        )}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 14 }}>
          <button
            onClick={onClose}
            style={{ padding: "7px 18px", background: "#F5F5F5", color: "#666666", border: "none", borderRadius: 7, fontSize: 13, cursor: "pointer" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#EBEBEB")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "#F5F5F5")}
          >取消</button>
          <button
            onClick={confirm}
            disabled={!draftProvider || !draftModel}
            style={{
              padding: "7px 22px", background: "#2478E5", color: "#FFFFFF", border: "none", borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: "pointer",
              opacity: (!draftProvider || !draftModel) ? 0.5 : 1,
            }}
            onMouseEnter={(e) => { if (draftProvider && draftModel) e.currentTarget.style.background = "#1A68D0"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "#2478E5"; }}
          >确认</button>
        </div>
      </div>
    </div>
  );
}

export function AgentCreateForm({ onCancel, onCreate }: Props) {
  const [name, setName] = useState("");
  const [model, setModel] = useState("GPT-4o");
  const [tokenProvider, setTokenProvider] = useState("");
  const [role, setRole] = useState("");
  const [style, setStyle] = useState("");
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [skillModalOpen, setSkillModalOpen] = useState(false);
  const [modelModalOpen, setModelModalOpen] = useState(false);
  const [boundary, setBoundary] = useState("");
  const [outputFormat, setOutputFormat] = useState("Markdown");
  const [memory, setMemory] = useState("中期（32K）");
  const [temperature, setTemperature] = useState("0.7");

  const handleCreate = () => {
    if (!name.trim()) return;
    onCreate({
      name: name.trim(),
      color: "#6366f1",
      systemPrompt: role.trim(),
      writingStyle: style.trim(),
      expertise: selectedSkills,
      description: boundary.trim(),
      status: "idle",
      modelName: model,
      modelProvider: tokenProvider,
      tokenProvider: tokenProvider,
    });
    setName(""); setRole(""); setStyle("");
    setSelectedSkills([]); setBoundary("");
    setModel("GPT-4o"); setTokenProvider("");
    setOutputFormat("纯文本"); setMemory("中期（32K）"); setTemperature("0.7");
  };

  const focusInput = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    e.currentTarget.style.borderColor = "#A5C8FF";
    e.currentTarget.style.background = "#FFFFFF";
  };
  const blurInput = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    e.currentTarget.style.borderColor = "#E5E5E5";
    e.currentTarget.style.background = "#FAFAFA";
  };

  return (
    <>
      {skillModalOpen && (
        <SkillPickerModal
          selected={selectedSkills}
          onConfirm={(v) => setSelectedSkills(v)}
          onClose={() => setSkillModalOpen(false)}
        />
      )}
      {modelModalOpen && (
        <ModelPickerModal
          selectedModel={model}
          selectedProvider={tokenProvider}
          onConfirm={(m, p) => { setModel(m); setTokenProvider(p); }}
          onClose={() => setModelModalOpen(false)}
        />
      )}

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden", padding: "16px 32px 28px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

          {/* 名称 + 语言风格 */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div>
              <label style={labelStyle}>智能体名称</label>
              <input style={inputBase} value={name} onChange={(e) => setName(e.target.value)}
                placeholder="例：写作助手" onFocus={focusInput} onBlur={blurInput} />
            </div>
            <div>
              <label style={labelStyle}>语言风格</label>
              <input style={inputBase} value={style} onChange={(e) => setStyle(e.target.value)}
                placeholder="例：严谨学术 / 轻松口语" onFocus={focusInput} onBlur={blurInput} />
            </div>
          </div>

          {/* 角色设定 */}
          <div>
            <label style={labelStyle}>角色设定</label>
            <textarea
              style={{ ...inputBase, resize: "none", lineHeight: 1.6 } as React.CSSProperties}
              rows={3} value={role} onChange={(e) => setRole(e.target.value)}
              placeholder="描述该智能体的角色定位与核心职责…"
              onFocus={focusInput as unknown as React.FocusEventHandler<HTMLTextAreaElement>}
              onBlur={blurInput as unknown as React.FocusEventHandler<HTMLTextAreaElement>}
            />
          </div>

          {/* 核心技能 + 模型切换 — 同一排两列 */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>

            {/* 核心技能 — 弹窗多选 */}
            <div>
              <label style={labelStyle}>核心技能</label>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                {selectedSkills.length > 0 ? (
                  selectedSkills.map((s) => (
                    <span
                      key={s}
                      style={{
                        padding: "4px 12px",
                        borderRadius: 20,
                        fontSize: 12,
                        background: "#EBF4FF",
                        color: "#2478E5",
                        border: "1px solid #A5C8FF",
                        fontWeight: 600,
                      }}
                    >
                      {s}
                    </span>
                  ))
                ) : (
                  <span style={{ fontSize: 12, color: "#AAAAAA" }}>未选择任何技能</span>
                )}
                <button
                  onClick={() => setSkillModalOpen(true)}
                  style={{
                    padding: "5px 14px",
                    borderRadius: 20,
                    fontSize: 12,
                    border: "1px dashed #C0D8F5",
                    background: "#F5FAFF",
                    color: "#2478E5",
                    cursor: "pointer",
                    transition: "all 0.15s",
                    marginLeft: selectedSkills.length > 0 ? 4 : 0,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#EBF4FF")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "#F5FAFF")}
                >
                  {selectedSkills.length > 0 ? "编辑" : "+ 选择技能"}
                </button>
              </div>
            </div>

            {/* 模型/渠道切换 — 弹窗单选（从管理后台同步） */}
            <div>
              <label style={labelStyle}>CODE 渠道 / 模型</label>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {tokenProvider ? (
                  <>
                    <span style={{
                      padding: "4px 14px",
                      borderRadius: 20,
                      fontSize: 12,
                      background: "#EBF4FF",
                      color: "#2478E5",
                      border: "1px solid #A5C8FF",
                      fontWeight: 600,
                    }}>
                      {tokenProvider} / {model}
                    </span>
                  </>
                ) : (
                  <span style={{
                    padding: "4px 14px",
                    borderRadius: 20,
                    fontSize: 12,
                    background: "#F5F5F5",
                    color: "#999",
                    border: "1px solid #E5E5E5",
                  }}>
                    {model}（未选渠道）
                  </span>
                )}
                <button
                  onClick={() => setModelModalOpen(true)}
                  style={{
                    padding: "5px 14px",
                    borderRadius: 20,
                    fontSize: 12,
                    border: "1px dashed #C0D8F5",
                    background: "#F5FAFF",
                    color: "#2478E5",
                    cursor: "pointer",
                    transition: "all 0.15s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#EBF4FF")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "#F5FAFF")}
                >
                  切换
                </button>
              </div>
            </div>

          </div>

          {/* 能力边界 */}
          <div>
            <label style={labelStyle}>能力边界</label>
            <textarea
              style={{ ...inputBase, resize: "none", lineHeight: 1.6 } as React.CSSProperties}
              rows={2} value={boundary} onChange={(e) => setBoundary(e.target.value)}
              placeholder="描述该智能体不应处理的任务范围或限制…"
              onFocus={focusInput as unknown as React.FocusEventHandler<HTMLTextAreaElement>}
              onBlur={blurInput as unknown as React.FocusEventHandler<HTMLTextAreaElement>}
            />
          </div>

          {/* 输出格式 / 记忆长度 / 温度值 — 同一排 */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
            <div>
              <label style={labelStyle}>输出格式</label>
              <TagSelect options={OUTPUT_FORMATS} value={outputFormat}
                onChange={(v) => setOutputFormat(v)} />
            </div>
            <div>
              <label style={labelStyle}>记忆长度</label>
              <TagSelect options={MEMORY_OPTIONS} value={memory}
                onChange={(v) => setMemory(v)} />
            </div>
            <div>
              <label style={labelStyle}>温度值</label>
              <TagSelect options={TEMP_OPTIONS} value={temperature}
                onChange={(v) => setTemperature(v)} />
            </div>
          </div>

        </div>
      </div>

      {/* 底部操作栏 */}
      <div style={{
        padding: "14px 32px",
        borderTop: "1px solid #F0F0F0",
        display: "flex",
        justifyContent: "flex-end",
        gap: 12,
        flexShrink: 0,
        background: "#FFFFFF",
      }}>
        <button
          onClick={onCancel}
          style={{
            padding: "9px 24px",
            borderRadius: 8,
            fontSize: 13,
            border: "1px solid #E5E5E5",
            background: "#FFFFFF",
            color: "#666666",
            cursor: "pointer",
            transition: "all 0.15s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "#F5F5F5"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "#FFFFFF"; }}
        >取消</button>
        <button
          onClick={handleCreate}
          disabled={!name.trim()}
          style={{
            padding: "9px 28px",
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            border: "none",
            background: name.trim() ? "#2478E5" : "#E5E5E5",
            color: name.trim() ? "#FFFFFF" : "#999999",
            cursor: name.trim() ? "pointer" : "not-allowed",
            transition: "all 0.15s",
          }}
          onMouseEnter={(e) => { if (name.trim()) e.currentTarget.style.background = "#1A68D0"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = name.trim() ? "#2478E5" : "#E5E5E5"; }}
        >创建智能体</button>
      </div>
    </>
  );
}
