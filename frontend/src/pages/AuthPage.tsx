import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { authApi } from "../api/auth";
import { useAuthStore } from "../stores/authStore";
import { initTabSession, clearUserData, clearAllRcStorage } from "../lib/storageScope";

type Mode = "login" | "register";

export function AuthPage() {
  const navigate = useNavigate();
  const fromPath = (window.history.state?.usr as any)?.fromPath || '/workspace';
  const { login } = useAuthStore();
  const [mode, setMode] = useState<Mode>("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");


  const [form, setForm] = useState({
    username: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    setError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (mode === "register") {
      if (!form.username.trim()) return setError("请输入用户名");
      if (form.password !== form.confirmPassword) return setError("两次密码不一致");
      if (form.password.length < 6) return setError("密码长度不能少于6位");
    }

    setLoading(true);
    try {
      let result;
      if (mode === "login") {
        result = await authApi.login({ identifier: form.email.trim(), password: form.password });
      } else {
        result = await authApi.register({
          username: form.username,
          email: form.email,
          password: form.password,
        });
      }
      login(result.user, result.token);
      // Plan C 登录竞态修复：authStore 已迁移到 sessionStorage，
      // 这里后面又会立刻整页跳转到 /workspace。
      // 不能只依赖 zustand persist 的异步/内部写入时机，
      // 必须先把最小认证快照同步写入 sessionStorage，避免首屏被误判为未登录。
      sessionStorage.setItem('repaceclaw-auth', JSON.stringify({
        state: {
          user: result.user,
          token: result.token,
          isAuthenticated: true,
        },
        version: 0,
      }));
      // Plan C: 初始化 tabId（确保 sessionStorage 中有 tabId）
      initTabSession();
      // 清理旧用户的缓存，防止跨用户数据串扰
      // - localStorage: 清历史遗留 key
      // - rc: 前缀: 清当前 tab / 调试残留的 Plan C 缓存
      // zustand persist 的 name 在模块加载时执行一次，不会随登录动态更新
      // 必须清理后刷新，让新用户的 key 生效
      clearUserData();
      clearAllRcStorage();
      // 强制刷新页面，store 用新用户的 auth 重新初始化
      window.location.replace(fromPath);
    } catch (err: any) {
      setError(err.response?.data?.error || "操作失败，请重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "#030712",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "16px",
    }}>
      <div style={{ width: "100%", maxWidth: 440 }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: 56, height: 56, borderRadius: 16, background: "#4f46e5", marginBottom: 16,
          }}>
            <svg width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: "#fff", margin: 0 }}>RepaceClaw</h1>
          <p style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>AI 智能体协作平台</p>
        </div>

        {/* Card */}
        <div style={{
          background: "#111827",
          border: "1px solid #1f2937",
          borderRadius: 20,
          padding: 32,
        }}>
          {/* Tab */}
          <div style={{
            display: "flex", background: "#1f2937",
            borderRadius: 10, padding: 4, marginBottom: 24,
          }}>
            {(["login", "register"] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); setError(""); }}
                style={{
                  flex: 1, padding: "8px 0",
                  borderRadius: 8, border: "none",
                  background: mode === m ? "#4f46e5" : "transparent",
                  color: mode === m ? "#fff" : "#9ca3af",
                  fontWeight: mode === m ? 600 : 400,
                  fontSize: 14, cursor: "pointer",
                  transition: "all 0.15s",
                }}
              >
                {m === "login" ? "登录" : "注册"}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {mode === "register" && (
              <div>
                <label style={{ display: "block", fontSize: 13, color: "#9ca3af", marginBottom: 6 }}>用户名</label>
                <input
                  name="username" type="text" value={form.username}
                  onChange={handleChange} placeholder="请输入用户名" required
                  style={inputStyle}
                />
              </div>
            )}

            <div>
              <label style={{ display: "block", fontSize: 13, color: "#9ca3af", marginBottom: 6 }}>账号</label>
              <input
                name="email" type="text" value={form.email}
                onChange={handleChange} placeholder={mode === "login" ? "请输入邮箱或用户名" : "请输入邮箱"} required
                style={inputStyle}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: 13, color: "#9ca3af", marginBottom: 6 }}>密码</label>
              <input
                name="password" type="password" value={form.password}
                onChange={handleChange} placeholder={mode === "register" ? "至少6位" : "请输入密码"} required
                style={inputStyle}
              />
            </div>

            {mode === "register" && (
              <div>
                <label style={{ display: "block", fontSize: 13, color: "#9ca3af", marginBottom: 6 }}>确认密码</label>
                <input
                  name="confirmPassword" type="password" value={form.confirmPassword}
                  onChange={handleChange} placeholder="再次输入密码" required
                  style={inputStyle}
                />
              </div>
            )}

            {error && (
              <div style={{
                background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)",
                borderRadius: 10, padding: "12px 16px", color: "#f87171", fontSize: 13,
              }}>
                {error}
              </div>
            )}

            <button
              type="submit" disabled={loading}
              style={{
                background: loading ? "#3730a3" : "#4f46e5",
                color: "#fff", border: "none", borderRadius: 10,
                padding: "11px 0", fontSize: 14, fontWeight: 600,
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.7 : 1,
                transition: "all 0.15s", marginTop: 4,
              }}
            >
              {loading ? "请稍候..." : mode === "login" ? "登录" : "注册"}
            </button>
          </form>

          {mode === "login" && (
            <p style={{ textAlign: "center", fontSize: 13, color: "#6b7280", marginTop: 16 }}>
              还没有账号？
              <button
                onClick={() => { setMode("register"); setError(""); }}
                style={{ color: "#818cf8", background: "none", border: "none", cursor: "pointer", marginLeft: 4 }}
              >
                立即注册
              </button>
            </p>
          )}
        </div>
      </div>
      {/* 备案信息 */}
      <div style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        textAlign: "center",
        padding: "12px 0",
        background: "rgba(15, 17, 23, 0.8)",
        borderTop: "1px solid #2e3148",
        fontSize: 12,
        color: "#6b7280",
      }}>
        南京瑞派斯品牌管理有限公司 备案号：
        <a
          href="https://beian.miit.gov.cn/"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "#6b7280", textDecoration: "none" }}
        >
          苏ICP备2026013998号-1
        </a>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "#1f2937",
  border: "1px solid #374151",
  borderRadius: 10,
  padding: "10px 14px",
  color: "#fff",
  fontSize: 14,
  outline: "none",
  boxSizing: "border-box",
};
