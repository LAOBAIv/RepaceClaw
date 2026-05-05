# 🔒 RepaceClaw 安全备注

> 最后更新：2026-05-05

## 敏感信息管理规范

### 🚫 禁止提交的内容

| 类型 | 文件/内容 | 说明 |
|------|-----------|------|
| API 密钥 | `ANTHROPIC_API_KEY`、`OPENCLAW_GATEWAY_TOKEN` 等 | 一律用 `<REPLACE_WITH_XXX>` 占位 |
| 数据库密码 | `.env` 中的 `POSTGRES_PASSWORD` | 同上 |
| JWT 密钥 | `JWT_SECRET` | 同上 |
| 真实 `.env` | 包含真实值的 .env 文件 | 使用 `.env.example` 模板 |

### ✅ 可以提交的内容

| 类型 | 说明 |
|------|------|
| 配置文件模板 | 含占位符的 `.claude/settings.json`、`.claude-code*.json` |
| `.env.example` | 环境变量模板 |
| 代码逻辑 | 所有 .ts / .tsx 源代码 |

### 📝 提交前检查清单

```bash
# 1. 检查是否有真实密钥
grep -rn "cp_\|sk-\|Bearer\|token_" --include="*.json" --include="*.env" --include="*.ts" | grep -v "REPLACE\|example\|node_modules"

# 2. 检查 git status
git status

# 3. 确认 .gitignore 生效
git check-ignore -v <可疑文件>
```

### 🏗️ 本地开发配置

真实密钥通过以下方式注入（不提交到 Git）：

1. **后端**：`backend/.env` 文件（需自行创建，参考 `.env.example`）
2. **Claude Code**：`.claude-code.local.json` 文件（在 .gitignore 中排除）
3. **CI/CD**：通过 GitHub Secrets / 环境变量注入

### 🚨 历史事件

**2026-05-04/05**：Git 历史中曾提交真实 API 密钥，已执行以下操作：
- 从 Git 历史中删除含真实密钥的版本（`git filter-branch`）
- 恢复为占位符版本 + 安全备注
- 加强 .gitignore 防止再次发生
- 修复循环重启 bug（`docs/CRASH_LOOP_FIX.md`）

> **建议**：所有曾泄露的 API 密钥应在对应平台重新生成。
