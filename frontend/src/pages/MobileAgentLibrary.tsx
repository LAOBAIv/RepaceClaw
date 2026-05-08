/**
 * 移动端智能体模板库页面
 * 适配移动端UI风格，提供模板浏览和选择功能
 */
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, X } from 'lucide-react';
import { AgentTemplate } from '../types';
import { agentTemplatesApi } from '../api/agentTemplates';

/* ─────────────────────────────────────────────
 * 颜色常量（对齐开发计划要求）
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

/* ─────────────────────────────────────────────
 * 分类中文映射（对齐PC端）
 * ───────────────────────────────────────────── */
const CATEGORY_LABELS: Record<string, string> = {
  all: "全部模板",
  engineering: "💻 工程开发",
  design: "🎨 设计创意",
  "paid-media": "💰 付费媒体",
  sales: "💼 销售推广",
  marketing: "📢 营销推广",
  product: "📦 产品管理",
  "project-management": "📋 项目管理",
  specialized: "🔬 专业领域",
  support: "🛟 支持服务",
  testing: "🧪 测试验证",
  academic: "🎓 学术研究",
  integrations: "🔗 集成开发",
  strategy: "♟️ 策略规划",
};

/* ─────────────────────────────────────────────
 * 中文翻译映射（对齐PC端）
 * ───────────────────────────────────────────── */
const WRITING_STYLE_CN: Record<string, string> = {
  "professional": "专业",
  "casual": "轻松",
  "technical": "技术",
  "creative": "创意",
  "concise": "简洁",
  "detailed": "详细",
};

const OUTPUT_FORMAT_CN: Record<string, string> = {
  "markdown": "Markdown",
  "json": "JSON",
  "text": "文本",
  "code": "代码",
  "report": "报告",
  "bullet-points": "要点列表",
};

const AGENT_TYPE_LABELS: Record<string, string> = {
  dev: '工程开发类',
  data: '数据分析类',
  creative: '内容生成类',
  pm: '项目管理类',
  research: '知识推理类',
  ops: '平台策略类',
  decision: '决策支持类',
  general: '通用助手类',
};

function templateCategoryToAgentType(category?: string): keyof typeof AGENT_TYPE_LABELS {
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

/* ─────────────────────────────────────────────
 * Props接口
 * ───────────────────────────────────────────── */
interface Props {
  onBack: () => void;
  // ⚠️ 防回归说明：当该页面由 MobileWorkspace 内部视图承载时，
  // 选模板后必须通过回调把模板状态交还给父组件，再切到内部 agent-create 视图。
  // 不要强制改回 navigate('/mobile/agent-create')，否则会重新走路由，破坏左抽屉“无重建返回工作区”的修复。
  onUseTemplateState?: (state: {
    templateId?: string;
    name?: string;
    model?: string;
    description?: string;
    expertise?: string[];
    systemPrompt?: string;
    vibe?: string;
    category?: string;
    outputFormat?: string;
  }) => void;
}


export function MobileAgentLibrary({ onBack, onUseTemplateState }: Props) {
  const navigate = useNavigate();
  // ── 状态管理 ──
  const [templates, setTemplates] = useState<AgentTemplate[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  
  const pageSize = 10; // 移动端每页显示10个

  // ── 加载模板数据 ──
  useEffect(() => {
    loadTemplates();
  }, []);

  async function loadTemplates() {
    setLoading(true);
    try {
      const [cats, temps] = await Promise.all([
        agentTemplatesApi.categories(),
        agentTemplatesApi.list(),
      ]);
      setCategories(cats);
      setTemplates(temps);
    } catch (err) {
      console.error("加载模板失败:", err);
      setToast("加载模板失败");
    } finally {
      setLoading(false);
    }
  }

  // ── 使用模板：跳转到创建页，携带模板参数（和PC端一致） ──
  const handleUseTemplate = useCallback((template: AgentTemplate) => {
    const nextState = {
      templateId: template.id,
      name: template.name,
      model: template.name,
      description: template.description,
      expertise: template.expertise,
      systemPrompt: template.systemPrompt,
      vibe: template.vibe,
      category: template.category,
      outputFormat: template.outputFormat,
    };
    if (onUseTemplateState) {
      onUseTemplateState(nextState);
      return;
    }
    navigate('/mobile/agent-create', {
      state: nextState,
    });
  }, [navigate, onUseTemplateState]);

  // ── 过滤和分页逻辑 ──
  // 搜索过滤
  const searchFiltered = searchTerm
    ? templates.filter((t) =>
        t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (t.vibe && t.vibe.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (t.systemPrompt && t.systemPrompt.toLowerCase().includes(searchTerm.toLowerCase()))
      )
    : templates;

  // 分类过滤
  const filtered =
    selectedCategory === "all"
      ? searchFiltered
      : searchFiltered.filter((t) => t.category === selectedCategory);

  // 分页
  const totalPages = Math.ceil(filtered.length / pageSize);
  const paginatedTemplates = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // ── Toast自动隐藏 ──
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 2000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // ── 渲染分类标签 ──
  const renderCategoryTags = () => {
    return (
      <div style={{ 
        display: 'flex', 
        gap: 8, 
        overflowX: 'auto', 
        padding: '8px 0',
        scrollbarWidth: 'none',
        msOverflowStyle: 'none',
      }}>
        <button
          onClick={() => {
            setSelectedCategory("all");
            setCurrentPage(1);
          }}
          style={{
            flexShrink: 0,
            padding: '8px 16px',
            borderRadius: 20,
            background: selectedCategory === "all" ? COLORS.accent : COLORS.bgTertiary,
            border: `1px solid ${selectedCategory === "all" ? COLORS.accent : COLORS.border}`,
            color: selectedCategory === "all" ? '#fff' : COLORS.textSecondary,
            fontSize: 13,
            fontWeight: selectedCategory === "all" ? 600 : 400,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          全部模板 ({templates.length})
        </button>
        {categories.map((cat) => {
          const count = templates.filter((t) => t.category === cat).length;
          return (
            <button
              key={cat}
              onClick={() => {
                setSelectedCategory(cat);
                setCurrentPage(1);
              }}
              style={{
                flexShrink: 0,
                padding: '8px 16px',
                borderRadius: 20,
                background: selectedCategory === cat ? COLORS.accent : COLORS.bgTertiary,
                border: `1px solid ${selectedCategory === cat ? COLORS.accent : COLORS.border}`,
                color: selectedCategory === cat ? '#fff' : COLORS.textSecondary,
                fontSize: 13,
                fontWeight: selectedCategory === cat ? 600 : 400,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {CATEGORY_LABELS[cat] || cat} ({count})
            </button>
          );
        })}
      </div>
    );
  };

  // ── 渲染模板卡片 ──
  const renderTemplateCards = () => {
    if (paginatedTemplates.length === 0) {
      return (
        <div style={{ 
          textAlign: 'center', 
          padding: '40px 0',
          color: COLORS.textMuted,
          fontSize: 14,
        }}>
          暂无模板
        </div>
      );
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {paginatedTemplates.map((template) => {
          const execType = templateCategoryToAgentType(template.category);
          return (
            <div
              key={template.id}
              onClick={() => handleUseTemplate(template)}
              style={{
                background: COLORS.bgTertiary,
                border: `1px solid ${COLORS.border}`,
                borderRadius: 12,
                padding: 16,
                cursor: 'pointer',
                transition: 'background 0.2s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <span style={{ fontSize: 20, flexShrink: 0 }}>{template.emoji}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 style={{ 
                    fontSize: 15, 
                    fontWeight: 600, 
                    color: COLORS.textPrimary, 
                    margin: 0,
                    marginBottom: 4,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {template.name}
                  </h3>
                  <p style={{ 
                    fontSize: 13, 
                    color: COLORS.textSecondary, 
                    lineHeight: 1.4,
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}>
                    {template.description}
                  </p>
                </div>
              </div>
              
              {/* 标签区域 */}
              <div style={{ 
                display: 'flex', 
                gap: 8, 
                marginTop: 12, 
                flexWrap: 'wrap' 
              }}>
                <span style={{ 
                  background: COLORS.bgSecondary, 
                  color: COLORS.textSecondary, 
                  fontSize: 11, 
                  padding: '4px 8px', 
                  borderRadius: 4,
                }}>
                  {AGENT_TYPE_LABELS[execType]}
                </span>
                <span style={{ 
                  background: COLORS.bgSecondary, 
                  color: COLORS.textSecondary, 
                  fontSize: 11, 
                  padding: '4px 8px', 
                  borderRadius: 4,
                }}>
                  {WRITING_STYLE_CN[template.writingStyle] || template.writingStyle}
                </span>
                <span style={{ 
                  background: COLORS.bgSecondary, 
                  color: COLORS.textSecondary, 
                  fontSize: 11, 
                  padding: '4px 8px', 
                  borderRadius: 4,
                }}>
                  {OUTPUT_FORMAT_CN[template.outputFormat] || template.outputFormat}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // ── 渲染分页控件 ──
  const renderPagination = () => {
    if (totalPages <= 1) return null;
    
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        gap: 8,
        padding: '16px 0',
      }}>
        <button
          onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
          disabled={currentPage === 1}
          style={{
            padding: '8px 16px',
            background: currentPage === 1 ? COLORS.bgTertiary : COLORS.accent,
            border: 'none',
            borderRadius: 8,
            color: currentPage === 1 ? COLORS.textMuted : '#fff',
            fontSize: 14,
            fontWeight: 500,
            cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
          }}
        >
          上一页
        </button>
        
        <span style={{ 
          color: COLORS.textSecondary, 
          fontSize: 13,
          minWidth: 80,
          textAlign: 'center',
        }}>
          第 {currentPage} / {totalPages} 页
        </span>
        
        <button
          onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
          disabled={currentPage === totalPages}
          style={{
            padding: '8px 16px',
            background: currentPage === totalPages ? COLORS.bgTertiary : COLORS.accent,
            border: 'none',
            borderRadius: 8,
            color: currentPage === totalPages ? COLORS.textMuted : '#fff',
            fontSize: 14,
            fontWeight: 500,
            cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
          }}
        >
          下一页
        </button>
      </div>
    );
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
      }}>
        <button onClick={onBack} style={{
          background: 'none',
          border: 'none',
          color: COLORS.textPrimary,
          cursor: 'pointer',
          padding: 4,
          display: 'flex',
          alignItems: 'center',
        }}>
          <ArrowLeft size={20} />
        </button>
        <div style={{ fontSize: 16, fontWeight: 600 }}>Agent 模板库</div>
      </div>

      {/* ═══════════════════════════════════
       * 主要内容区域
       * ═══════════════════════════════════ */}
      <div style={{ 
        padding: 16, 
        flex: 1, 
        overflow: 'auto',
        paddingBottom: 16,
      }}>
        {/* 搜索框 */}
        <div style={{ marginBottom: 16 }}>
          <div style={{
            position: 'relative',
            background: COLORS.bgTertiary,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
          }}>
            <Search size={16} color={COLORS.textMuted} style={{ marginLeft: 12 }} />
            <input
              type="text"
              placeholder="搜索智能体（名称、描述、简介、角色设定）..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              style={{
                flex: 1,
                height: 44,
                background: 'transparent',
                border: 'none',
                padding: '0 12px 0 8px',
                fontSize: 14,
                color: COLORS.textPrimary,
                outline: 'none',
              }}
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                style={{
                  marginRight: 8,
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 4,
                }}
              >
                <X size={16} color={COLORS.textMuted} />
              </button>
            )}
          </div>
        </div>

        {/* 分类标签 */}
        {renderCategoryTags()}

        {/* 加载状态 */}
        {loading && (
          <div style={{ 
            textAlign: 'center', 
            padding: '40px 0',
            color: COLORS.textSecondary,
            fontSize: 14,
          }}>
            加载中...
          </div>
        )}

        {/* 模板列表 */}
        {!loading && renderTemplateCards()}

        {/* 分页控件 */}
        {!loading && renderPagination()}
      </div>

      {/* ═══════════════════════════════════
       * Toast通知
       * ═══════════════════════════════════ */}
      {toast && (
        <div style={{
          position: 'fixed', 
          bottom: 80, 
          left: '50%', 
          transform: 'translateX(-50%)',
          zIndex: 300,
          background: COLORS.bgTertiary,
          borderRadius: 8, 
          padding: '10px 20px',
          fontSize: 13, 
          color: COLORS.textPrimary,
          boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
        }}>
          {toast}
        </div>
      )}
    </div>
  );
}