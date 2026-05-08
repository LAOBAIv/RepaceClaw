import { v4 as uuidv4 } from "uuid";
import { getDb, saveDb } from "../db/client";

function categoryToAgentType(category?: string): string {
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
    case 'support':
      return 'general';
    case 'specialized':
      return 'general';
    default:
      return 'general';
  }
}

export interface AgentTemplate {
  id: string;
  name: string;
  category: string;
  emoji: string;
  color: string;
  vibe: string;
  description: string;
  systemPrompt: string;
  writingStyle: string;
  expertise: string[];
  outputFormat: string;
  githubSource: string;
  createdAt: string;
}

function rowToTemplate(obj: any): AgentTemplate {
  return {
    id: obj.id,
    name: obj.name,
    category: obj.category,
    emoji: obj.emoji,
    color: obj.color,
    vibe: obj.vibe,
    description: obj.description,
    systemPrompt: obj.system_prompt,
    writingStyle: obj.writing_style,
    expertise: JSON.parse(obj.expertise || "[]"),
    outputFormat: obj.output_format,
    githubSource: obj.github_source,
    createdAt: obj.created_at,
  };
}

export const AgentTemplateService = {
  /** 获取所有模板，支持按分类筛选 */
  list(category?: string): AgentTemplate[] {
    const db = getDb();
    const sql = category
      ? "SELECT * FROM agent_templates WHERE category = ? ORDER BY name ASC"
      : "SELECT * FROM agent_templates ORDER BY category ASC, name ASC";
    const params = category ? [category] : [];
    const result = db.exec(sql, params);
    if (!result.length) return [];
    const cols = result[0].columns;
    return result[0].values.map((row) => {
      const obj: any = {};
      cols.forEach((c, i) => (obj[c] = row[i]));
      return rowToTemplate(obj);
    });
  },

  /** 获取单个模板 */
  getById(id: string): AgentTemplate | null {
    const db = getDb();
    const result = db.exec("SELECT * FROM agent_templates WHERE id = ?", [id]);
    if (!result.length || !result[0].values.length) return null;
    const cols = result[0].columns;
    const obj: any = {};
    cols.forEach((c, i) => (obj[c] = result[0].values[0][i]));
    return rowToTemplate(obj);
  },

  /** 获取所有分类列表 */
  listCategories(): string[] {
    const db = getDb();
    const result = db.exec("SELECT DISTINCT category FROM agent_templates ORDER BY category ASC");
    if (!result.length) return [];
    return result[0].values.map((row) => row[0] as string);
  },

  /** 基于模板创建真实 Agent */
  createAgentFromTemplate(templateId: string, overrides: Record<string, any>): any {
    const template = this.getById(templateId);
    if (!template) throw new Error("Template not found");

    const { AgentService } = require("./AgentService");
    const agentType = overrides.agentType || categoryToAgentType(template.category);
    const agent = AgentService.create({
      name: overrides.name || template.name,
      color: template.color,
      systemPrompt: template.systemPrompt,
      writingStyle: template.writingStyle,
      expertise: template.expertise,
      description: template.description,
      outputFormat: template.outputFormat,
      userId: overrides.userId,  // Phase 3: 绑定当前用户
      agentType,
      ...overrides,
    });
    return agent;
  },

  /** 创建新模板 */
  create(data: Partial<AgentTemplate>): AgentTemplate {
    const db = getDb();
    const id = uuidv4();
    const now = new Date().toISOString();
    const template: AgentTemplate = {
      id,
      name: data.name || "",
      category: data.category || "general",
      emoji: data.emoji || "🤖",
      color: data.color || "#3b82f6",
      vibe: data.vibe || "专业",
      description: data.description || "",
      systemPrompt: data.systemPrompt || "",
      writingStyle: data.writingStyle || "专业",
      expertise: data.expertise || [],
      outputFormat: data.outputFormat || "markdown",
      githubSource: data.githubSource || "",
      createdAt: now,
    };

    db.run(
      `INSERT INTO agent_templates (
        id, name, category, emoji, color, vibe, description, system_prompt,
        writing_style, expertise, output_format, github_source, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        template.id, template.name, template.category, template.emoji, template.color,
        template.vibe, template.description, template.systemPrompt, template.writingStyle,
        JSON.stringify(template.expertise), template.outputFormat, template.githubSource, template.createdAt
      ]
    );
    saveDb();
    return template;
  },

  /** 更新模板 */
  update(id: string, data: Partial<AgentTemplate>): AgentTemplate | null {
    const existing = this.getById(id);
    if (!existing) return null;

    const db = getDb();
    const updates: string[] = [];
    const values: any[] = [];

    if (data.name !== undefined) { updates.push("name = ?"); values.push(data.name); }
    if (data.category !== undefined) { updates.push("category = ?"); values.push(data.category); }
    if (data.emoji !== undefined) { updates.push("emoji = ?"); values.push(data.emoji); }
    if (data.color !== undefined) { updates.push("color = ?"); values.push(data.color); }
    if (data.vibe !== undefined) { updates.push("vibe = ?"); values.push(data.vibe); }
    if (data.description !== undefined) { updates.push("description = ?"); values.push(data.description); }
    if (data.systemPrompt !== undefined) { updates.push("system_prompt = ?"); values.push(data.systemPrompt); }
    if (data.writingStyle !== undefined) { updates.push("writing_style = ?"); values.push(data.writingStyle); }
    if (data.expertise !== undefined) { updates.push("expertise = ?"); values.push(JSON.stringify(data.expertise)); }
    if (data.outputFormat !== undefined) { updates.push("output_format = ?"); values.push(data.outputFormat); }
    if (data.githubSource !== undefined) { updates.push("github_source = ?"); values.push(data.githubSource); }

    if (updates.length === 0) return existing;

    values.push(id);
    db.run(`UPDATE agent_templates SET ${updates.join(", ")} WHERE id = ?`, values);
    saveDb();
    return this.getById(id);
  },

  /** 删除模板 */
  delete(id: string): boolean {
    const existing = this.getById(id);
    if (!existing) return false;

    const db = getDb();
    db.run("DELETE FROM agent_templates WHERE id = ?", [id]);
    saveDb();
    return true;
  },
};
