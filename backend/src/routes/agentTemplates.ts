import { Router, Request, Response } from "express";
import { AgentTemplateService } from "../services/AgentTemplateService";
import { authenticate, requireRole } from "../middleware/auth";
import { z } from "zod";

const router = Router();

// GET /api/agent-templates — 获取所有模板（支持 ?category= 过滤）
router.get("/", authenticate, (req: Request, res: Response) => {
  const category = req.query.category as string | undefined;
  const templates = AgentTemplateService.list(category);
  res.json({ data: templates });
});

// GET /api/agent-templates/categories — 获取所有分类
router.get("/categories", authenticate, (req: Request, res: Response) => {
  const categories = AgentTemplateService.listCategories();
  res.json({ data: categories });
});

// GET /api/agent-templates/:id — 获取单个模板详情
router.get("/:id", authenticate, (req: Request, res: Response) => {
  const template = AgentTemplateService.getById(req.params.id);
  if (!template) return res.status(404).json({ error: "Template not found" });
  res.json({ data: template });
});

// POST /api/agent-templates/:id/create — 基于模板创建 Agent
const CreateSchema = z.object({
  name: z.string().min(1).optional(),
  agentType: z.enum(['dev', 'data', 'creative', 'pm', 'research', 'ops', 'decision', 'general']).optional(),
  modelName: z.string().optional(),
  modelProvider: z.string().optional(),
  temperature: z.number().optional(),
  maxTokens: z.number().optional(),
  tokenProvider: z.string().optional(),
  tokenApiKey: z.string().optional(),
  tokenBaseUrl: z.string().optional(),
}).passthrough();

router.post("/:id/create", authenticate, (req: Request, res: Response) => {
  const userId = (req as any).user?.id;
  const parsed = CreateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  try {
    const agent = AgentTemplateService.createAgentFromTemplate(req.params.id, { ...parsed.data, userId });
    res.status(201).json({ data: agent });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
