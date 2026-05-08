import { Router, Request, Response } from "express";
import { z } from "zod";
import { authenticate, requireRole } from "../middleware/auth";
import { OrganizationService } from "../services/OrganizationService";
import { PermissionService } from "../services/PermissionService";
import { UserService } from "../services/UserService";

const router = Router();
const adminOnly = [authenticate, requireRole(["super_admin", "admin"])];

const DepartmentSchema = z.object({
  name: z.string().min(1, "组织名称不能为空"),
  parentId: z.string().optional().nullable(),
  ownerUserId: z.string().optional(),
  description: z.string().optional(),
  status: z.enum(["active", "disabled"]).optional(),
});

const DepartmentUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  parentId: z.string().optional().nullable(),
  ownerUserId: z.string().optional(),
  description: z.string().optional(),
  status: z.enum(["active", "disabled"]).optional(),
});

const AssignUserSchema = z.object({
  departmentId: z.string().optional().nullable(),
});

router.get("/tree", ...adminOnly, (_req: Request, res: Response) => {
  res.json({ data: OrganizationService.buildDepartmentTree() });
});

router.get("/departments", ...adminOnly, (_req: Request, res: Response) => {
  res.json({ data: OrganizationService.listDepartments() });
});

router.post("/departments", ...adminOnly, (req: Request, res: Response) => {
  const parsed = DepartmentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  try {
    const data = OrganizationService.createDepartment({
      name: parsed.data.name,
      parentId: parsed.data.parentId,
      ownerUserId: parsed.data.ownerUserId,
      description: parsed.data.description,
      status: parsed.data.status,
    });
    res.status(201).json({ data });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "创建组织失败" });
  }
});

router.put("/departments/:id", ...adminOnly, (req: Request, res: Response) => {
  const parsed = DepartmentUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  try {
    const data = OrganizationService.updateDepartment(req.params.id, parsed.data);
    if (!data) return res.status(404).json({ error: "组织不存在" });
    res.json({ data });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "更新组织失败" });
  }
});

router.delete("/departments/:id", ...adminOnly, (req: Request, res: Response) => {
  try {
    OrganizationService.deleteDepartment(req.params.id);
    res.json({ data: { success: true } });
  } catch (err: any) {
    const msg = err.message || "删除组织失败";
    const status = msg.includes("不存在") ? 404 : 400;
    res.status(status).json({ error: msg });
  }
});

router.get("/users", ...adminOnly, (_req: Request, res: Response) => {
  res.json({ data: OrganizationService.listUsersWithOrganization() });
});

router.put("/users/:id/department", ...adminOnly, (req: Request, res: Response) => {
  const parsed = AssignUserSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  try {
    const data = OrganizationService.assignPrimaryDepartment(req.params.id, parsed.data.departmentId ?? null);
    if (!data) return res.status(404).json({ error: "用户不存在" });
    res.json({ data });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "组织分配失败" });
  }
});

router.get("/users/:id/permissions", ...adminOnly, (req: Request, res: Response) => {
  try {
    const data = PermissionService.getUserPermissionSummary(req.params.id);
    if (!data) return res.status(404).json({ error: "用户不存在" });
    res.json({ data });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "获取权限摘要失败" });
  }
});

router.put("/users/:id", ...adminOnly, (req: Request, res: Response) => {
  const UserUpdateSchema = z.object({
    role: z.enum(["super_admin", "admin", "user"]).optional(),
    status: z.enum(["active", "disabled"]).optional(),
    avatar: z.string().optional(),
  });

  const parsed = UserUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  try {
    const data = UserService.updateUser(req.params.id, parsed.data);
    if (!data) return res.status(404).json({ error: "用户不存在" });
    res.json({ data });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "更新用户失败" });
  }
});

router.delete("/users/:id", ...adminOnly, (req: Request, res: Response) => {
  // TODO: 实现删除用户功能（需要处理关联数据）
  res.status(501).json({ error: "删除用户功能暂未实现" });
});

export default router;
