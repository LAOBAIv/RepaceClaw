import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import { getDb, saveDb } from "../db/client";
import { IdGenerator } from "../utils/IdGenerator";

const JWT_SECRET = process.env.JWT_SECRET || "repaceclaw_jwt_secret_2026";
const JWT_EXPIRES_IN = "7d";
const SALT_ROUNDS = 10;

export type UserRole = "super_admin" | "admin" | "user";

export interface User {
  id: string;
  /** 业务用户编码：u + 9位随机 */
  user_code?: string;
  username: string;
  email: string;
  role: UserRole;
  status: string;
  avatar: string;
  last_login_at: string;
  created_at: string;
  updated_at: string;
  primary_department_id?: string | null;
  primary_department_name?: string | null;
  primary_department_code?: string | null;
}

export interface RegisterInput {
  username: string;
  email: string;
  password: string;
  role?: UserRole;
}

export interface LoginInput {
  /**
   * 兼容登录标识：优先支持邮箱，同时兼容历史老账号用用户名登录。
   * 前端即使仍沿用 email 字段传值，这里也按“账号标识”处理。
   */
  identifier: string;
  password: string;
}

export interface AuthResult {
  user: User;
  token: string;
}

function rowToUser(row: any[]): User {
  return {
    id: row[0] as string,
    user_code: row[1] as string,
    username: row[2] as string,
    email: row[3] as string,
    role: row[4] as UserRole,
    status: row[5] as string,
    avatar: row[6] as string,
    last_login_at: row[7] as string,
    created_at: row[8] as string,
    updated_at: row[9] as string,
    primary_department_id: (row[10] as string) || null,
    primary_department_name: (row[11] as string) || null,
    primary_department_code: (row[12] as string) || null,
  };
}

export class UserService {
  // 注册
  static async register(input: RegisterInput): Promise<AuthResult> {
    const db = getDb();
    const now = new Date().toISOString();

    // 检查用户名/邮箱是否已存在
    const existEmail = db.exec("SELECT id FROM users WHERE email=?", [input.email]);
    if (existEmail.length && existEmail[0].values.length) {
      throw new Error("该邮箱已被注册");
    }
    const existUsername = db.exec("SELECT id FROM users WHERE username=?", [input.username]);
    if (existUsername.length && existUsername[0].values.length) {
      throw new Error("该用户名已被使用");
    }

    // 第一个注册的用户自动成为超级管理员
    const countRes = db.exec("SELECT COUNT(*) FROM users");
    const count = countRes.length ? (countRes[0].values[0][0] as number) : 0;
    const role: UserRole = count === 0 ? "super_admin" : (input.role || "user");

    const id = uuidv4();
    const userCode = IdGenerator.userCode();
    const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);

    // Dual-code Phase 1：用户注册开始双写 UUID + user_code
    db.run(
      `INSERT INTO users (id, user_code, username, email, password_hash, role, status, avatar, last_login_at, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [id, userCode, input.username, input.email, passwordHash, role, "active", "", "", now, now]
    );
    saveDb();

    const user: User = {
      id, user_code: userCode, username: input.username, email: input.email,
      role, status: "active", avatar: "", last_login_at: "", created_at: now, updated_at: now,
    };

    const token = UserService.generateToken(user);
    return { user, token };
  }

  // 登录
  static async login(input: LoginInput): Promise<AuthResult> {
    const db = getDb();
    const now = new Date().toISOString();
    const identifier = input.identifier.trim();

    const res = db.exec(
      `SELECT id, user_code, username, email, password_hash, role, status, avatar, last_login_at, created_at, updated_at
       FROM users
       WHERE lower(email)=lower(?) OR username=?
       LIMIT 1`,
      [identifier, identifier]
    );
    if (!res.length || !res[0].values.length) {
      throw new Error("账号或密码错误");
    }

    const row = res[0].values[0];
    const passwordHash = row[4] as string;
    const status = row[6] as string;

    if (status !== "active") {
      throw new Error("账号已被禁用，请联系管理员");
    }

    const valid = await bcrypt.compare(input.password, passwordHash);
    if (!valid) {
      throw new Error("账号或密码错误");
    }

    // 更新最后登录时间
    db.run("UPDATE users SET last_login_at=?, updated_at=? WHERE id=?", [now, now, row[0]]);
    saveDb();

    const user = rowToUser([row[0], row[1], row[2], row[3], row[5], row[6], row[7], now, row[9], row[10]]);
    const token = UserService.generateToken(user);
    return { user, token };
  }

  // 获取用户列表（管理员用）
  static listUsers(): User[] {
    const db = getDb();
    const res = db.exec(
      `SELECT
         u.id, u.user_code, u.username, u.email, u.role, u.status, u.avatar, u.last_login_at, u.created_at, u.updated_at,
         d.id as primary_department_id,
         d.name as primary_department_name,
         d.department_code as primary_department_code
       FROM users u
       LEFT JOIN user_org_scope uos ON uos.user_id = u.id AND uos.is_primary = 1 AND uos.status = 'active'
       LEFT JOIN departments d ON d.id = uos.department_id
       ORDER BY u.created_at DESC`
    );
    if (!res.length) return [];
    return res[0].values.map(rowToUser);
  }

  // 获取单个用户
  static getUserById(id: string): User | null {
    const db = getDb();
    const res = db.exec(
      `SELECT
         u.id, u.user_code, u.username, u.email, u.role, u.status, u.avatar, u.last_login_at, u.created_at, u.updated_at,
         d.id as primary_department_id,
         d.name as primary_department_name,
         d.department_code as primary_department_code
       FROM users u
       LEFT JOIN user_org_scope uos ON uos.user_id = u.id AND uos.is_primary = 1 AND uos.status = 'active'
       LEFT JOIN departments d ON d.id = uos.department_id
       WHERE u.id=?`,
      [id]
    );
    if (!res.length || !res[0].values.length) return null;
    return rowToUser(res[0].values[0]);
  }

  // 当前用户更新自己的资料
  static updateProfile(id: string, data: { username?: string; avatar?: string }): User | null {
    const db = getDb();
    const now = new Date().toISOString();
    const current = UserService.getUserById(id);
    if (!current) return null;

    if (data.username !== undefined) {
      const username = data.username.trim();
      if (!username) throw new Error("用户名不能为空");
      const existUsername = db.exec("SELECT id FROM users WHERE username=? AND id<>?", [username, id]);
      if (existUsername.length && existUsername[0].values.length) {
        throw new Error("该用户名已被使用");
      }
      db.run("UPDATE users SET username=?, updated_at=? WHERE id=?", [username, now, id]);
    }

    if (data.avatar !== undefined) {
      db.run("UPDATE users SET avatar=?, updated_at=? WHERE id=?", [data.avatar.trim(), now, id]);
    }

    saveDb();
    return UserService.getUserById(id);
  }

  // 更新用户角色/状态（管理员用）
  static updateUser(id: string, data: { role?: UserRole; status?: string; avatar?: string }): User | null {
    const db = getDb();
    const now = new Date().toISOString();
    if (data.role !== undefined) {
      db.run("UPDATE users SET role=?, updated_at=? WHERE id=?", [data.role, now, id]);
    }
    if (data.status !== undefined) {
      db.run("UPDATE users SET status=?, updated_at=? WHERE id=?", [data.status, now, id]);
    }
    if (data.avatar !== undefined) {
      db.run("UPDATE users SET avatar=?, updated_at=? WHERE id=?", [data.avatar, now, id]);
    }
    saveDb();
    return UserService.getUserById(id);
  }

  // 修改密码
  static async changePassword(id: string, oldPassword: string, newPassword: string): Promise<void> {
    const db = getDb();
    const res = db.exec("SELECT password_hash FROM users WHERE id=?", [id]);
    if (!res.length || !res[0].values.length) throw new Error("用户不存在");

    const hash = res[0].values[0][0] as string;
    const valid = await bcrypt.compare(oldPassword, hash);
    if (!valid) throw new Error("原密码错误");

    const newHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    const now = new Date().toISOString();
    db.run("UPDATE users SET password_hash=?, updated_at=? WHERE id=?", [newHash, now, id]);
    saveDb();
  }

  // 生成 JWT
  static generateToken(user: User): string {
    return jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );
  }

  // 验证 JWT
  static verifyToken(token: string): { id: string; email: string; role: UserRole } {
    return jwt.verify(token, JWT_SECRET) as { id: string; email: string; role: UserRole };
  }
}
