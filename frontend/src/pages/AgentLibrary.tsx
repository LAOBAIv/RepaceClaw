import { useState, useEffect } from "react";
import { AgentTemplate } from "../types";
import { useNavigate } from "react-router-dom";
import { agentTemplatesApi } from "../api/agentTemplates";

// 分类中文映射
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

// 模板名称中文映射（常用模板）
const TEMPLATE_NAME_CN: Record<string, string> = {
  // Engineering
  "Frontend Developer": "前端开发工程师",
  "Backend Architect": "后端架构师",
  "AI Engineer": "AI 工程师",
  "DevOps Automator": "DevOps 自动化专家",
  "Mobile App Builder": "移动端开发工程师",
  "Security Engineer": "安全工程师",
  "Database Optimizer": "数据库优化师",
  "Technical Writer": "技术文档工程师",
  "SRE": "站点可靠性工程师",
  "Code Reviewer": "代码审查员",
  "Data Engineer": "数据工程师",
  "Rapid Prototyper": "快速原型师",
  "Senior Developer": "高级开发工程师",
  "Software Architect": "软件架构师",
  "Incident Response Commander": "故障应急响应指挥官",
  "Git Workflow Master": "Git 工作流大师",
  "WeChat Mini Program Developer": "微信小程序开发工程师",
  "Embedded Firmware Engineer": "嵌入式固件工程师",
  "Solidity Smart Contract Engineer": "Solidity 智能合约工程师",
  "Threat Detection Engineer": "威胁检测工程师",
  "Filament Optimization Specialist": "Filament 优化专家",
  "Autonomous Optimization Architect": "自主优化架构师",
  "CMS Developer": "CMS 开发工程师",
  "Email Intelligence Engineer": "邮件智能分析工程师",
  "Feishu Integration Developer": "飞书集成开发工程师",
  "AI Data Remediation Engineer": "AI 数据修复工程师",
  // Design
  "UI Designer": "UI 设计师",
  "UX Researcher": "UX 研究员",
  "UX Architect": "UX 架构师",
  "Brand Guardian": "品牌守护者",
  "Visual Storyteller": "视觉叙事师",
  "Whimsy Injector": "趣味注入师",
  "Image Prompt Engineer": "AI 图像提示词工程师",
  "Inclusive Visuals Specialist": "包容性视觉专家",
  // Marketing
  "SEO Specialist": "SEO 专家",
  "Content Creator": "内容创作者",
  "Growth Hacker": "增长黑客",
  "Social Media Strategist": "社交媒体策略师",
  "TikTok Strategist": "TikTok 策略师",
  "Douyin Strategist": "抖音策略师",
  "Xiaohongshu Specialist": "小红书运营专家",
  "Bilibili Content Strategist": "B站内容策略师",
  "WeChat Official Account Manager": "微信公众号运营",
  "Weibo Strategist": "微博策略师",
  "Zhihu Strategist": "知乎策略师",
  "Kuaishou Strategist": "快手策略师",
  "Twitter Engager": "Twitter 互动专家",
  "Reddit Community Builder": "Reddit 社区建设师",
  "LinkedIn Content Creator": "LinkedIn 内容创作者",
  "Podcast Strategist": "播客策略师",
  "Livestream Commerce Coach": "直播带货教练",
  "Short-Video Editing Coach": "短视频剪辑教练",
  "App Store Optimizer": "应用商店优化师",
  "Baidu SEO Specialist": "百度 SEO 专家",
  "China Market Localization Strategist": "中国市场本地化策略师",
  "Cross-Border E-Commerce Specialist": "跨境电商专家",
  "Private Domain Operator": "私域运营专家",
  "China E-Commerce Operator": "中国电商运营",
  "Carousel Growth Engine": "轮播图增长引擎",
  "Video Optimization Specialist": "视频优化专家",
  "AI Citation Strategist": "AI 引用策略师",
  "Book Co-Author": "联合创作者",
  // Sales
  "Outbound Strategist": "外展策略师",
  "Discovery Coach": "需求挖掘教练",
  "Deal Strategist": "交易策略师",
  "Sales Engineer": "售前工程师",
  "Proposal Strategist": "方案策略师",
  "Pipeline Analyst": "销售管道分析师",
  "Account Strategist": "客户策略师",
  "Sales Coach": "销售教练",
  // Product
  "Product Manager": "产品经理",
  "Sprint Prioritizer": "迭代优先级规划师",
  "Trend Researcher": "趋势研究员",
  "Feedback Synthesizer": "用户反馈整合师",
  "Behavioral Nudge Engine": "行为引导引擎",
  // Specialized
  "Developer Advocate": "开发者关系倡导者",
  "Document Generator": "文档生成器",
  "Model QA Specialist": "模型 QA 专家",
  "MCP Builder": "MCP 构建师",
  "Salesforce Architect": "Salesforce 架构师",
  "Workflow Architect": "工作流架构师",
  "Agents Orchestrator": "智能体编排师",
  "Compliance Auditor": "合规审计师",
  "Recruitment Specialist": "招聘专家",
  "Blockchain Security Auditor": "区块链安全审计师",
  "Civil Engineer": "土木工程师",
  "Cultural Intelligence Strategist": "文化情报策略师",
  "Supply Chain Strategist": "供应链策略师",
  "Study Abroad Advisor": "留学顾问",
  "Government Digital Presales Consultant": "政务数字化售前顾问",
  "Healthcare Marketing Compliance Specialist": "医疗营销合规专家",
  "Corporate Training Designer": "企业培训设计师",
  "French Consulting Market Navigator": "法国咨询市场顾问",
  "Korean Business Navigator": "韩国商务顾问",
  "ZK Steward": "零知识证明管家",
  "Identity Graph Operator": "身份图谱运营",
  "Agentic Identity & Trust Architect": "智能体身份与信任架构师",
  "Automation Governance Architect": "自动化治理架构师",
  "Data Consolidation Agent": "数据整合专家",
  "LSP/Index Engineer": "语言服务器协议工程师",
  "Report Distribution Agent": "报告分发专家",
  "Sales Data Extraction Agent": "销售数据提取专家",
  "Accounts Payable Agent": "应付账款专员",
  // Support
  "Support Responder": "客服响应专员",
  "Analytics Reporter": "数据分析报告员",
  "Executive Summary Generator": "执行摘要生成器",
  "Finance Tracker": "财务追踪员",
  "Infrastructure Maintainer": "基础设施维护员",
  "Legal Compliance Checker": "法律合规检查员",
  // Testing
  "API Tester": "API 测试员",
  "Accessibility Auditor": "无障碍审计员",
  "Performance Benchmarker": "性能基准测试员",
  "Reality Checker": "现实核查员",
  "Tool Evaluator": "工具评估员",
  "Evidence Collector": "证据收集员",
  "Test Results Analyzer": "测试结果分析师",
  "Workflow Optimizer": "工作流优化员",
  // Academic
  "Anthropologist": "人类学家",
  "Historian": "历史学家",
  "Psychologist": "心理学家",
  "Geographer": "地理学家",
  "Narratologist": "叙事学家",
};

// 描述中文翻译（通用模板）
const TEMPLATE_DESC_CN: Record<string, string> = {
  "Frontend Developer": "构建响应式、可访问的现代 Web 应用，精通 React/Vue/Angular 框架和性能优化",
  "Backend Architect": "设计可扩展的 API、微服务和数据库架构，构建稳健的后端系统",
  "AI Engineer": "开发机器学习功能、数据管道和 AI 驱动的应用程序",
  "DevOps Automator": "CI/CD 流水线、基础设施自动化、云运维和监控",
  "Security Engineer": "威胁建模、安全代码审查、安全架构和漏洞评估",
  "UI Designer": "视觉设计、组件库、设计系统和品牌一致性",
  "UX Researcher": "用户测试、行为分析和设计洞察",
  "Product Manager": "产品战略、路线图规划、需求分析和团队协作",
  "SEO Specialist": "搜索引擎优化、关键词策略、技术 SEO 和排名提升",
  "Content Creator": "内容策划、文案撰写、多平台内容分发",
  "Growth Hacker": "数据驱动的增长策略、A/B 测试和用户获取",
  "SRE": "SLO 管理、错误预算、可观测性、混沌工程和生产可靠性",
  "Code Reviewer": "建设性代码审查、安全性评估和可维护性建议",
  "Database Optimizer": "Schema 设计、查询优化、索引策略和慢查询调试",
  "Technical Writer": "开发者文档、API 参考、教程和技术写作",
};

function cnName(name: string): string {
  return name; // 数据库已存储中文名称，直接返回
}

function cnDesc(name: string, desc: string): string {
  return TEMPLATE_DESC_CN[name] || desc || "";
}

// expertise 中文翻译
const EXPERTISE_CN: Record<string, string> = {
  "devops": "DevOps",
  "ai-ml": "AI/ML",
  "backend": "后端",
  "frontend": "前端",
  "security": "安全",
  "design": "设计",
  "product": "产品",
  "sales": "销售",
  "marketing": "营销",
  "testing": "测试",
  "data": "数据",
  "cloud": "云服务",
  "mobile": "移动端",
  "integration": "集成",
  "automation": "自动化",
  "compliance": "合规",
  "strategy": "策略",
  "academic": "学术",
  "database": "数据库",
  "engineering": "工程",
  "paid-media": "付费媒体",
  "project-management": "项目管理",
  "specialized": "专业",
  "support": "支持",
};

// writingStyle 中文翻译
const WRITING_STYLE_CN: Record<string, string> = {
  "professional": "专业",
  "casual": "轻松",
  "technical": "技术",
  "creative": "创意",
  "concise": "简洁",
  "detailed": "详细",
};

// outputFormat 中文翻译
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

// vibe 中文翻译
const VIBE_CN: Record<string, string> = {
  // Engineering
  "AI Citation Strategist": "分析 AI 推荐竞争对手的原因，重塑内容策略",
  "AI Data Remediation Engineer": "用 AI 精准修复损坏的数据",
  "AI Engineer": "将 ML 模型转化为可规模化上线的生产功能",
  "API Tester": "在用户之前发现 API 问题",
  "Backend Architect": "设计支撑一切的系统架构",
  "Code Reviewer": "像导师一样审查代码",
  "Data Engineer": "构建管道，将原始数据转化为可信的数据资产",
  "Database Optimizer": "索引、查询计划和 Schema 设计",
  "DevOps Automator": "自动化基础设施，让团队交付更快",
  "Embedded Firmware Engineer": "编写生产级固件",
  "Frontend Developer": "构建响应式、可访问的现代 Web 应用",
  "Git Workflow Master": "清理历史、原子提交、分支叙事",
  "Infrastructure Maintainer": "保持服务器运行、告警安静",
  "LSP/Index Engineer": "通过 LSP 构建统一代码智能",
  "Mobile App Builder": "快速交付 iOS 和 Android 原生应用",
  "Rapid Prototyper": "会议结束前将想法转化为原型",
  "Senior Developer": "高端全栈工匠",
  "Software Architect": "设计能超越构建团队的系统",
  "Solidity Smart Contract Engineer": "实战经验丰富的 Solidity 开发者",
  "Threat Detection Engineer": "构建检测层，捕获攻击者",
  "WeChat Mini Program Developer": "构建高性能微信小程序",
  // DevOps & SRE
  "SRE (Site Reliability Engineer): Reliability": "可靠性是功能，错误预算驱动速度",
  "Incident Response Commander": "将生产混乱转化为结构化解决方案",
  "MCP Builder": "构建让 AI 智能体真正有用的工具",
  "Filament Optimization Specialist": "务实完美主义者，优化复杂管理环境",
  "Autonomous Optimization Architect": "系统治理者，让一切更快",
  "Workflow Optimizer": "发现瓶颈、修复流程、自动化",
  // Design
  "Brand Guardian": "品牌最坚定的守护者和倡导者",
  "Image Prompt Engineer": "将视觉概念转化为精准的提示词",
  "Inclusive Visuals Specialist": "击败系统性 AI 偏见",
  "UI Designer": "创建美观、一致、可访问的界面",
  "UX Architect": "为开发者提供坚实基础和清晰指令",
  "UX Researcher": "用真实用户数据验证设计决策",
  "Visual Storyteller": "将复杂信息转化为可视化叙事",
  "Whimsy Injector": "添加意想不到的惊喜时刻",
  // Marketing
  "App Store Optimizer": "让应用被发现、下载和喜爱",
  "Baidu SEO Specialist": "精通百度算法",
  "Bilibili Content Strategist": "精通弹幕文化，在 B站 建立品牌",
  "Carousel Growth Engine": "从任何 URL 自动生成病毒式轮播",
  "China E-Commerce Operator": "运营淘宝、天猫、拼多多、京东店铺",
  "China Market Localization Strategist": "将中国混乱的趋势转化为精准指南",
  "Content Creator": "为每个平台创作引人入胜的故事",
  "Cross-Border E-Commerce Specialist": "从中国工厂到全球畅销",
  "Douyin Strategist": "精通抖音算法",
  "Growth Hacker": "找到未被开发的增长渠道",
  "Instagram Curator": "精通网格美学",
  "Kuaishou Strategist": "在快手培养草根受众",
  "LinkedIn Content Creator": "将专业专长转化为引人入胜的内容",
  "Livestream Commerce Coach": "培训直播主播",
  "Podcast Strategist": "指导播客从概念到忠实听众",
  "Private Domain Operator": "构建微信私域流量帝国",
  "Short-Video Editing Coach": "将原始素材转化为短视频",
  "Social Media Strategist": "策划跨平台营销活动",
  "TikTok Strategist": "驾驭算法，建立社区",
  "Twitter Engager": "通过 280 字符建立思想领导力",
  "Video Optimization Specialist": "专注于受众增长的视频优化",
  "WeChat Official Account Manager": "通过一致内容建立微信订阅社区",
  "Weibo Strategist": "在微博建立品牌话题",
  "Xiaohongshu Specialist": "精通小红书生活方式内容",
  "Zhihu Strategist": "通过知乎知识分享建立品牌权威",
  // Paid Media
  "Ad Creative Strategist": "将广告创意从猜测转化为可重复的科学",
  "Paid Media Auditor": "在 CFO 之前发现广告浪费",
  "Paid Social Strategist": "让 Meta、LinkedIn、TikTok 广告效果最大化",
  "PPC Campaign Strategist": "构建从 $10K 到 $10M+ 月费的 PPC 广告",
  "Programmatic & Display Buyer": "精准大规模购买展示和视频广告",
  "Search Query Analyst": "挖掘搜索查询发现竞争对手遗漏的黄金",
  "Tracking & Measurement Specialist": "如果追踪不正确，就等于没发生",
  // Sales
  "Account Strategist": "映射组织、发现空白",
  "Deal Strategist": "像外科医生一样评估交易",
  "Discovery Coach": "比别人多问一个问题",
  "Outbound Strategist": "在竞争对手之前将购买信号转化为会议",
  "Pipeline Analyst": "在你意识到之前告诉你预测是错的",
  "Proposal Strategist": "将 RFP 响应转化为买家无法放下的故事",
  "Sales Coach": "提出让销售重新思考整个交易的问题",
  "Sales Engineer": "在采购之前赢得技术决策",
  // Product
  "Behavioral Nudge Engine": "通过软件交互最大化用户动力",
  "Product Manager": "交付正确的东西",
  "Sprint Prioritizer": "通过数据驱动的优先级最大化迭代价值",
  "Trend Researcher": "在主流之前发现新兴趋势",
  "Feedback Synthesizer": "将千个用户声音提炼为五个关键",
  // Specialized
  "Agentic Identity & Trust Architect": "确保每个 AI 智能体都能证明身份",
  "Agents Orchestrator": "运行整个开发流程的指挥家",
  "Automation Governance Architect": "冷静、质疑、运营导向",
  "Blockchain Security Auditor": "在攻击者之前发现智能合约漏洞",
  "Civil Engineer": "设计跨边界的结构",
  "Cultural Intelligence Strategist": "检测隐形排斥",
  "Data Consolidation Agent": "整合分散的销售数据",
  "Developer Advocate": "连接产品团队和开发者社区",
  "Document Generator": "从代码生成专业文档",
  "Feishu Integration Developer": "在飞书平台构建企业集成",
  "French Consulting Market Navigator": "解读法国咨询市场",
  "Government Digital Presales Consultant": "导航中国政府 IT 采购迷宫",
  "Healthcare Marketing Compliance Specialist": "在中国严格监管的医疗营销中保持合规",
  "Identity Graph Operator": "确保多智能体系统中的身份一致性",
  "Korean Business Navigator": "西方直接性与韩国关系之间的桥梁",
  "Model QA Specialist": "端到端审计 ML 模型",
  "Recruitment Specialist": "构建全周期招聘引擎",
  "Report Distribution Agent": "自动分发销售报告",
  "Sales Data Extraction Agent": "监控 Excel 文件并提取关键指标",
  "Salesforce Architect": "将混乱的 Salesforce 组织转化为有序架构",
  "Studio Operations": "保持工作室运转顺畅",
  "Studio Producer": "协调创意愿景和业务目标",
  "Study Abroad Advisor": "指导中国学生留学之旅",
  "Supply Chain Strategist": "构建采购引擎和供应链韧性",
  "Workflow Architect": "映射、命名、规范每个系统路径",
  "ZK Steward": "用 Zettelkasten 构建连接的知识",
  "CMS Developer": "WordPress/Drupal 开发",
  // Support & Testing
  "Accessibility Auditor": "如果没用屏幕阅读器测试，就不算可访问",
  "Analytics Reporter": "将原始数据转化为洞察",
  "Evidence Collector": "截图痴迷的 QA",
  "Executive Summary Generator": "像 McKinsey 顾问思考，为 C-suite 写作",
  "Experiment Tracker": "设计实验、追踪结果",
  "Finance Tracker": "保持账目清晰、现金流顺畅",
  "Legal Compliance Checker": "确保每个司法管辖区的合规",
  "Performance Benchmarker": "测量一切、优化重要",
  "Reality Checker": "默认需要工作",
  "Support Responder": "将沮丧用户转化为忠诚倡导者",
  "Test Results Analyzer": "像侦探一样阅读测试结果",
  "Tool Evaluator": "测试并推荐正确的工具",
  // Academic
  "Anthropologist": "没有文化是随机的",
  "Geographer": "地理决定命运",
  "Historian": "历史不重复，但会押韵",
  "Narratologist": "每个故事都是论证",
  "Psychologist": "人们做事总有原因",
  // Others
  "Book Co-Author": "将粗略专长转化为可引用的书",
  "Corporate Training Designer": "设计驱动真实行为改变的培训",
  "Jira Workflow Steward": "强制可追踪的提交和结构化 PR",
  "Project Shepherd": "将跨职能混乱转化为按时交付",
  "Senior Project Manager": "将规格转化为任务",
  "Accounts Payable Agent": "跨任何轨道移动资金",
  // 补充遗漏
  "Email Intelligence Engineer": "将杂乱的 MIME 转化为可推理的上下文",
  "Security Engineer": "威胁建模、安全审计、漏洞评估",
  "SRE (Site Reliability Engineer)": "可靠性是功能，错误预算驱动速度",
  "Technical Writer": "开发者文档、API 参考和技术写作",
  "Reddit Community Builder": "精通 Reddit，建立社区信任",
  "SEO Specialist": "技术 SEO 和关键词策略驱动可持续流量",
  "Compliance Auditor": "从准备评估到证据收集的合规审计",
};

export default function AgentLibrary() {
  const [templates, setTemplates] = useState<AgentTemplate[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [sortBy, setSortBy] = useState<"random" | "favorite">("random");
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const pageSize = 9;
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState("");
const navigate = useNavigate();

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
    } finally {
      setLoading(false);
    }
  }

  function handleCreate(template: AgentTemplate) {
    // 直接跳转到创建页面，携带模板参数
    navigate("/agent-create", {
      state: {
        templateId: template.id,
        name: cnName(template.name),
        model: template.name,
        description: template.description,
        expertise: template.expertise,
        systemPrompt: template.systemPrompt,
        vibe: template.vibe,
        category: template.category,
      }
    });
  }

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

  // 排序逻辑（仅用于"全部模板"视图）
  const sortedTemplates = selectedCategory === "all"
    ? [...filtered].sort((a, b) => {
        if (sortBy === "random") {
          return Math.random() - 0.5;
        }
        return 0;
      })
    : filtered;

  // 分页逻辑（仅用于"全部模板"视图）
  const totalPages = Math.ceil(sortedTemplates.length / pageSize);
  const paginatedTemplates = sortedTemplates.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // 按分类分组（仅用于分类视图）
  const grouped: Record<string, AgentTemplate[]> = {};
  if (selectedCategory !== "all") {
    filtered.forEach((t) => {
      if (!grouped[t.category]) grouped[t.category] = [];
      grouped[t.category].push(t);
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">加载 Agent 模板库...</div>
      </div>
    );
  }

  return (
    <>
      <style>{`
        .al-wrap {
          width: 100%;
          height: 100%;
          min-height: 0;
          display: flex;
          flex-direction: column;
          font-family: "Microsoft YaHei", "Segoe UI", sans-serif;
          background: #f5f7fa;
          padding: 16px;
          box-sizing: border-box;
          overflow: hidden;
        }
        .al-card {
          flex: 1;
          min-height: 0;
          display: flex;
          flex-direction: column;
          background: #fafbfc;
          border: 1px solid #e5e6eb;
          border-radius: 12px;
          box-shadow: 0 1px 4px rgba(0,0,0,0.05);
          overflow: hidden;
        }
        .al-header {
          padding: 16px 32px;
          min-height: 58px;
          border-bottom: 1px solid #e5e6eb;
          background: #ffffff;
          display: flex;
          align-items: center;
          gap: 10px;
          flex-shrink: 0;
          box-sizing: border-box;
        }
        .al-scroll {
          flex: 1;
          min-height: 0;
          overflow-y: auto;
          overflow-x: hidden;
          padding: 14px 20px 0;
          box-sizing: border-box;
        }
        .al-panel {
          background: transparent;
          border: none;
          border-radius: 0;
          box-shadow: none;
        }
        .create-btn {
          border: none;
          border-radius: 8px;
          background: #2a3b4d;
          color: #fff;
          cursor: pointer;
          transition: background 0.15s ease;
          font-family: inherit;
        }
        .create-btn:hover {
          background: #1e2d3d;
        }
        .al-footer {
          padding: 10px 24px;
          border-top: 1px solid #ebebeb;
          background: #fff;
          display: flex;
          justify-content: center;
          gap: 10px;
          flex-shrink: 0;
          min-height: 52px;
        }
      `}</style>
      <div className="al-wrap">
        <div className="al-card">
          <div className="al-header">
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <span style={{ fontWeight: 700, fontSize: 16, color: '#1a202c', margin: 0 }}>
                🎭 Agent 模板库
              </span>
              <span style={{ fontSize: 12, color: 'rgb(156, 163, 175)', marginLeft: 10 }}>
                共 {templates.length}个智能体模版
              </span>
            </div>
          </div>
          <div className="al-scroll">
            <div style={{ width: '100%', maxWidth: 'none', margin: 0 }}>
              {/* Success message */}
              {successMsg && (
                <div className="mb-4 p-3 rounded-xl text-sm al-panel" style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", color: "#16a34a" }}>
                  {successMsg}
                </div>
              )}

              {/* Search */}
              <div className="mb-3 al-panel" style={{ padding: 0 }}>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
                  <input
                    type="text"
                    placeholder="搜索智能体（名称、描述、简介、角色设定）..."
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      setCurrentPage(1); // 重置到第一页
                    }}
                    className="w-full px-4 py-2 pl-10 rounded-xl text-sm"
                    style={{ border: "1px solid #d1d5db", background: "#fff", color: "#333333" }}
                  />
                </div>
              </div>

              {/* Category filter */}
              <div className="mb-3 al-panel" style={{ padding: '10px 12px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10 }}>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setSelectedCategory("all")}
                    className="px-3 py-1.5 text-sm rounded-full min-w-[120px]" style={{ background: selectedCategory === "all" ? "#2a3b4d" : "#f3f4f6", color: selectedCategory === "all" ? "#fff" : "#4b5563", fontWeight: selectedCategory === "all" ? 600 : 400, border: '1px solid ' + (selectedCategory === "all" ? '#2a3b4d' : '#e5e7eb') }} > 全部模板 ({templates.length})
                  </button>
                  {categories.map((cat) => {
                    const count = templates.filter((t) => t.category === cat).length;
                    return (
                      <button
                        key={cat}
                        onClick={() => setSelectedCategory(cat)}
                        className="px-3 py-1.5 text-sm rounded-full min-w-[120px]" style={{ background: selectedCategory === cat ? "#2a3b4d" : "#f3f4f6", color: selectedCategory === cat ? "#fff" : "#4b5563", fontWeight: selectedCategory === cat ? 600 : 400, border: '1px solid ' + (selectedCategory === cat ? '#2a3b4d' : '#e5e7eb') }}
                      >
                        {CATEGORY_LABELS[cat] || cat} ({count})
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Templates display */}
              <div className="al-panel" style={{ padding: 0 }}>
                {selectedCategory === "all" ? (
          // 全部模板：扁平列表 + 分页
          <>
            {paginatedTemplates.length === 0 ? (
              <div className="text-center py-12" style={{ color: "var(--text-muted)" }}>
                暂无模板
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {paginatedTemplates.map((t) => {
                    const displayName = cnName(t.name);
                    const displayDesc = cnDesc(t.name, t.description);
                    const execType = templateCategoryToAgentType(t.category);
                    return (
                      <div
                        key={t.id}
                        className="border rounded-xl p-4 hover:shadow-md transition-shadow bg-card"
                        style={{ border: "1px solid #e5e7eb", background: "#fff", height: "165px", overflow: "hidden", display: "flex", flexDirection: "column" }}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-2xl" style={{ lineHeight: 1, display: 'flex', alignItems: 'center' }}>{t.emoji}</span>
                            <h3 className="font-semibold truncate" style={{ color: "#333333", fontSize: 14, fontFamily: "inherit", margin: 0 }}>
                              {displayName}
                            </h3>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCreate(t);
                            }}
                            className="create-btn px-4 py-1.5 text-sm font-semibold min-w-[60px]"
                          >
                            创建
                          </button>
                        </div>
                        <p className="text-xs mt-2 line-clamp-2" style={{ color: "var(--text-muted)", fontFamily: "inherit" }}>
                          {displayDesc}
                        </p>
                        <div className="mt-2 pt-2 border-t text-xs space-y-1.5" style={{ borderTop: "1px solid #e5e7eb", fontFamily: "inherit" }}>
                          <p className="line-clamp-2" style={{ color: "#9ca3af", lineHeight: 1.5, margin: 0, fontFamily: "inherit" }}>
                            <span style={{ fontWeight: 500, color: "#94a3b8", fontFamily: "inherit" }}>系统提示：</span>
                            {t.description}
                          </p>
                          <div className="flex flex-wrap gap-3" style={{ color: "#9ca3af", fontFamily: "inherit" }}>
                            <span>风格: {WRITING_STYLE_CN[t.writingStyle] || t.writingStyle}</span>
                            <span>输出: {OUTPUT_FORMAT_CN[t.outputFormat] || t.outputFormat}</span>
                            <span>执行分类: {AGENT_TYPE_LABELS[execType]}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {/* 分页组件移入统一 footer，这里只保留内容区 */}
                <div className="flex justify-center items-center gap-2 mt-4" style={{ padding: "8px 0 0", display: 'none' }}>
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-1.5 text-sm rounded-lg font-medium"
                    style={{ 
                      background: currentPage === 1 ? "#e5e7eb" : "var(--accent)", 
                      color: currentPage === 1 ? "#9ca3af" : "#fff",
                      cursor: currentPage === 1 ? "not-allowed" : "pointer"
                    }}
                  >
                    上一页
                  </button>
                  {/* 页码按钮 - 最多显示6个 */}
                  <div className="flex items-center gap-1" style={{ minWidth: "200px", justifyContent: "center" }}>
                    {(() => {
                      const pages: (number | string)[] = [];
                      const total = totalPages || 1;
                      const maxShow = 6;
                      
                      if (total <= maxShow) {
                        // 总页数 <= 6，显示所有
                        for (let i = 1; i <= total; i++) pages.push(i);
                      } else {
                        // 总页数 > 6，显示当前页附近的页码 + 省略号
                        pages.push(1);
                        
                        if (currentPage <= 3) {
                          // 当前页在开头
                          for (let i = 2; i <= 5; i++) pages.push(i);
                          pages.push("...");
                          pages.push(total);
                        } else if (currentPage >= total - 2) {
                          // 当前页在结尾
                          pages.push("...");
                          for (let i = total - 4; i <= total; i++) pages.push(i);
                        } else {
                          // 当前页在中间
                          pages.push("...");
                          for (let i = currentPage - 1; i <= currentPage + 1; i++) pages.push(i);
                          pages.push("...");
                          pages.push(total);
                        }
                      }
                      
                      return pages.map((p, idx) => {
                        if (p === "...") {
                          return <span key={`ellipsis-${idx}`} style={{ color: "#9ca3af", padding: "0 4px" }}>...</span>;
                        }
                        return (
                          <button
                            key={p}
                            onClick={() => setCurrentPage(p as number)}
                            className="px-3 py-1.5 text-sm rounded-lg font-medium min-w-[32px]"
                            style={{
                              background: currentPage === p ? "var(--accent)" : "#fff",
                              color: currentPage === p ? "#fff" : "#374151",
                              border: "1px solid #d1d5db",
                              cursor: "pointer"
                            }}
                          >
                            {p}
                          </button>
                        );
                      });
                    })()}
                  </div>
                  <span className="text-sm px-2" style={{ color: "var(--text-secondary)" }}>
                    共 {sortedTemplates.length} 个
                  </span>
                  <button
                    onClick={() => setCurrentPage(p => Math.min(totalPages || 1, p + 1))}
                    disabled={currentPage === totalPages || totalPages === 0}
                    className="px-3 py-1.5 text-sm rounded-lg font-medium"
                    style={{ 
                      background: currentPage === totalPages || totalPages === 0 ? "#e5e7eb" : "var(--accent)", 
                      color: currentPage === totalPages || totalPages === 0 ? "#9ca3af" : "#fff",
                      cursor: currentPage === totalPages || totalPages === 0 ? "not-allowed" : "pointer"
                    }}
                  >
                    下一页
                  </button>
                </div>
              </>
            )}
          </>
        ) : (
          // 分类视图：按分类分组
          <div className="space-y-8">
            {Object.entries(grouped).map(([cat, items]) => (
              <div key={cat}>
                <h2 className="text-lg font-semibold mb-3" style={{ color: "#333333" }}>
                  {CATEGORY_LABELS[cat] || cat}
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {items.map((t) => {
                    const displayName = cnName(t.name);
                    const displayDesc = cnDesc(t.name, t.description);
                    const execType = templateCategoryToAgentType(t.category);
                    return (
                      <div
                        key={t.id}
                        className="border rounded-xl p-4 hover:shadow-md transition-shadow bg-card"
                        style={{ border: "1px solid #e5e7eb", background: "#fff", height: "165px", overflow: "hidden", display: "flex", flexDirection: "column" }}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-2xl" style={{ lineHeight: 1, display: 'flex', alignItems: 'center' }}>{t.emoji}</span>
                            <h3 className="font-semibold truncate" style={{ color: "#333333", fontSize: 14, fontFamily: "inherit", margin: 0 }}>
                              {displayName}
                            </h3>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCreate(t);
                            }}
                            className="create-btn px-4 py-1.5 text-sm font-semibold min-w-[60px]"
                          >
                            创建
                          </button>
                        </div>
                        <p className="text-xs mt-2 line-clamp-2" style={{ color: "var(--text-muted)", fontFamily: "inherit" }}>
                          {displayDesc}
                        </p>
                        <div className="mt-2 pt-2 border-t text-xs space-y-1.5" style={{ borderTop: "1px solid #e5e7eb", fontFamily: "inherit" }}>
                          <p className="line-clamp-2" style={{ color: "#9ca3af", lineHeight: 1.5, margin: 0, fontFamily: "inherit" }}>
                            <span style={{ fontWeight: 500, color: "#94a3b8", fontFamily: "inherit" }}>系统提示：</span>
                            {t.description}
                          </p>
                          <div className="flex flex-wrap gap-3" style={{ color: "#9ca3af", fontFamily: "inherit" }}>
                            <span>风格: {WRITING_STYLE_CN[t.writingStyle] || t.writingStyle}</span>
                            <span>输出: {OUTPUT_FORMAT_CN[t.outputFormat] || t.outputFormat}</span>
                            <span>执行分类: {AGENT_TYPE_LABELS[execType]}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
              </div>
            </div>
          </div>
          {selectedCategory === "all" && totalPages > 0 && (
            <div className="al-footer">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1.5 text-sm rounded-lg font-medium"
                style={{
                  background: currentPage === 1 ? "#e5e7eb" : "#2a3b4d",
                  color: currentPage === 1 ? "#9ca3af" : "#fff",
                  cursor: currentPage === 1 ? "not-allowed" : "pointer"
                }}
              >
                上一页
              </button>
              <div className="flex items-center gap-1" style={{ minWidth: "200px", justifyContent: "center" }}>
                {(() => {
                  const pages: (number | string)[] = [];
                  const total = totalPages || 1;
                  const maxShow = 6;
                  if (total <= maxShow) {
                    for (let i = 1; i <= total; i++) pages.push(i);
                  } else {
                    pages.push(1);
                    if (currentPage <= 3) {
                      for (let i = 2; i <= 5; i++) pages.push(i);
                      pages.push("...");
                      pages.push(total);
                    } else if (currentPage >= total - 2) {
                      pages.push("...");
                      for (let i = total - 4; i <= total; i++) pages.push(i);
                    } else {
                      pages.push("...");
                      for (let i = currentPage - 1; i <= currentPage + 1; i++) pages.push(i);
                      pages.push("...");
                      pages.push(total);
                    }
                  }
                  return pages.map((p, idx) => {
                    if (p === "...") {
                      return <span key={`footer-ellipsis-${idx}`} style={{ color: "#9ca3af", padding: "0 4px" }}>...</span>;
                    }
                    return (
                      <button
                        key={`footer-page-${p}`}
                        onClick={() => setCurrentPage(p as number)}
                        className="px-3 py-1.5 text-sm rounded-lg font-medium min-w-[32px]"
                        style={{
                          background: currentPage === p ? "#2a3b4d" : "#fff",
                          color: currentPage === p ? "#fff" : "#374151",
                          border: "1px solid #d1d5db",
                          cursor: "pointer"
                        }}
                      >
                        {p}
                      </button>
                    );
                  });
                })()}
              </div>
              
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages || 1, p + 1))}
                disabled={currentPage === totalPages || totalPages === 0}
                className="px-3 py-1.5 text-sm rounded-lg font-medium"
                style={{
                  background: currentPage === totalPages || totalPages === 0 ? "#e5e7eb" : "#2a3b4d",
                  color: currentPage === totalPages || totalPages === 0 ? "#9ca3af" : "#fff",
                  cursor: currentPage === totalPages || totalPages === 0 ? "not-allowed" : "pointer"
                }}
              >
                下一页
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
