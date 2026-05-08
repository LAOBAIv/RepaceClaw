import { Router, Request, Response } from "express";
import { UserService } from "../services/UserService";
import { authenticate, requireRole } from "../middleware/auth";
import { AuditService } from "../services/AuditService";

const router = Router();

// POST /api/auth/register
router.post("/register", async (req: Request, res: Response) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ error: "用户名、邮箱和密码不能为空" });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: "密码长度不能少于6位" });
    }
    const result = await UserService.register({ username, email, password });
    // 审计日志
    AuditService.log({
      userId: result.user.id,
      action: 'register',
      resource: 'user',
      resourceId: result.user.id,
      detail: { username, email },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      requestId: (req as any).requestId,
    });
    res.status(201).json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/auth/login
router.post("/login", async (req: Request, res: Response) => {
  try {
    const { email, username, identifier, password } = req.body;
    const loginIdentifier = String(identifier || email || username || "").trim();
    if (!loginIdentifier || !password) {
      return res.status(400).json({ error: "账号和密码不能为空" });
    }
    const result = await UserService.login({ identifier: loginIdentifier, password });
    // 审计日志
    AuditService.log({
      userId: result.user.id,
      action: 'login',
      resource: 'user',
      resourceId: result.user.id,
      detail: { identifier: loginIdentifier },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      requestId: (req as any).requestId,
    });
    res.json(result);
  } catch (err: any) {
    res.status(401).json({ error: err.message });
  }
});

// GET /api/auth/me — 获取当前用户信息
router.get("/me", authenticate, (req: Request, res: Response) => {
  const user = UserService.getUserById((req as any).user.id);
  if (!user) return res.status(404).json({ error: "用户不存在" });
  res.json(user);
});

// PUT /api/auth/me — 当前用户修改个人资料
router.put("/me", authenticate, (req: Request, res: Response) => {
  try {
    const { username, avatar } = req.body;
    const user = UserService.updateProfile((req as any).user.id, { username, avatar });
    if (!user) return res.status(404).json({ error: "用户不存在" });
    res.json(user);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/auth/password — 修改密码
router.put("/password", authenticate, async (req: Request, res: Response) => {
  try {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ error: "原密码和新密码不能为空" });
    }
    await UserService.changePassword((req as any).user.id, oldPassword, newPassword);
    res.json({ message: "密码修改成功" });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ── 用户管理（管理员） ────────────────────────────────────────────────────────

// GET /api/auth/users — 获取用户列表
router.get("/users", authenticate, requireRole(["super_admin", "admin"]), (req: Request, res: Response) => {
  const users = UserService.listUsers();
  res.json(users);
});

// PUT /api/auth/users/:id — 更新用户角色/状态
router.put("/users/:id", authenticate, requireRole(["super_admin", "admin"]), (req: Request, res: Response) => {
  const { role, status, avatar } = req.body;
  const user = UserService.updateUser(req.params.id, { role, status, avatar });
  if (!user) return res.status(404).json({ error: "用户不存在" });
  res.json(user);
});

export default router;
