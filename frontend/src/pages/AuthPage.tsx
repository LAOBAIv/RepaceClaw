import { useState, useEffect, useRef } from "react";
import { authApi } from "../api/auth";
import { useAuthStore } from "../stores/authStore";
import { initTabSession, clearUserData, clearAllRcStorage } from "../lib/storageScope";
import apiClient from "../api/client";

type Mode = "login" | "register";

export function AuthPage() {
  const fromPath = (window.history.state?.usr as { fromPath?: string } | null)?.fromPath || '/workspace';
  const { login } = useAuthStore();
  const [mode, setMode] = useState<Mode>("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // [2026-05-19] 微信扫码登录
  const [showQrcode, setShowQrcode] = useState(false);
  const [qrcodeUrl, setQrcodeUrl] = useState('');
  const [qrLoading, setQrLoading] = useState(false);
  const qrPollRef = useRef<ReturnType<typeof setInterval> | null>(null);


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
      // [2026-05-19] 不再依赖 localStorage 恢复会话，改用后端 active 状态
      clearAllRcStorage();
      // 强制刷新页面，store 用新用户的 auth 重新初始化
      window.location.replace(fromPath);
    } catch (err: unknown) { // [2026-05-24] 类型安全
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        || (err as { message?: string })?.message || '操作失败，请重试';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  // [2026-05-19] 微信扫码登录
  async function handleWechatLogin() {
    setQrLoading(true);
    setError('');
    try {
      interface WechatQrRes { data?: { data?: { qrcode_url?: string; qrcode?: string } } }
      const res: WechatQrRes = await apiClient.post('/wechat-clawbot/qrcode');
      const d = res.data?.data;
      if (!d?.qrcode_url) { setError('获取二维码失败'); setQrLoading(false); return; }
      setQrcodeUrl(d.qrcode_url);
      setShowQrcode(true);
      const qrToken = d.qrcode;
      // 轮询扫码状态
      qrPollRef.current = setInterval(async () => {
        try {
          interface WechatQrStatusRes { data?: { data?: { status?: string; credentials?: { ilink_user_id?: string } } } }
          const r: WechatQrStatusRes = await apiClient.post('/wechat-clawbot/qrcode/status', { qrcode: qrToken });
          const status = r.data?.data?.status;
          if (status === 'confirmed') {
            const ilinkUserId = r.data?.data?.credentials?.ilink_user_id;
            if (ilinkUserId) {
              // 调用后端扫码登录接口
              interface WechatLoginData { token?: string; user?: unknown }
              interface WechatLoginRes { data?: WechatLoginData }
              const loginRes: WechatLoginRes = await apiClient.post('/auth/wechat/callback', { openid: ilinkUserId });
              const loginData = loginRes.data;
              if (loginData?.token && loginData?.user) {
                login(loginData.user, loginData.token);
                sessionStorage.setItem('repaceclaw-auth', JSON.stringify({
                  state: { user: loginData.user, token: loginData.token, isAuthenticated: true },
                  version: 0,
                }));
                initTabSession();
                clearUserData();
                clearAllRcStorage();
                window.location.replace('/workspace');
              }
            }
            if (qrPollRef.current) clearInterval(qrPollRef.current);
            setShowQrcode(false);
          } else if (status === 'expired') {
            if (qrPollRef.current) clearInterval(qrPollRef.current);
            setShowQrcode(false);
            setError('二维码已过期，请重新获取');
          }
        } catch (e) { console.warn("[RC]", e); }
      }, 3000);
      // 3分钟超时
      setTimeout(() => {
        if (qrPollRef.current) { clearInterval(qrPollRef.current); qrPollRef.current = null; }
        setShowQrcode(false);
      }, 180000);
    } catch { // [2026-05-24] 类型安全
      setError('获取微信二维码失败');
    } finally {
      setQrLoading(false);
    }
  }

  // 清理轮询
  useEffect(() => {
    return () => { if (qrPollRef.current) clearInterval(qrPollRef.current); };
  }, []);

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
            <>
              {/* [2026-05-19] 微信扫码登录 */}
              <div style={{ textAlign: 'center', margin: '18px 0 10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'center', marginBottom: 14 }}>
                  <div style={{ flex: 1, height: 1, background: '#374151' }} />
                  <span style={{ fontSize: 12, color: '#6b7280' }}>或</span>
                  <div style={{ flex: 1, height: 1, background: '#374151' }} />
                </div>
                <button
                  onClick={handleWechatLogin}
                  disabled={qrLoading}
                  style={{ width: '100%', padding: '10px', borderRadius: 8, border: '1px solid #374151', background: '#1f2937', color: '#10b981', fontSize: 14, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="#10b981"><path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178A1.17 1.17 0 0 1 4.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178 1.17 1.17 0 0 1-1.162-1.178c0-.651.52-1.18 1.162-1.18zm5.34 2.867c-1.797-.052-3.746.512-5.28 1.786-1.72 1.428-2.687 3.72-1.78 6.22.942 2.453 3.666 4.229 6.884 4.229.826 0 1.622-.12 2.361-.336a.722.722 0 0 1 .598.082l1.584.926a.272.272 0 0 0 .14.045c.134 0 .24-.111.24-.247 0-.06-.023-.12-.038-.177l-.327-1.233a.582.582 0 0 1-.023-.156.49.49 0 0 1 .201-.398C23.024 18.48 24 16.82 24 14.98c0-3.21-2.931-5.837-6.656-6.088V8.89c-.135-.01-.27-.03-.407-.03zm-2.53 3.274c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.97-.982zm4.844 0c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.969-.982z"/></svg>
                  {qrLoading ? '加载中...' : '微信扫码登录'}
                </button>
              </div>
              <p style={{ textAlign: "center", fontSize: 13, color: "#6b7280", marginTop: 12 }}>
                还没有账号？
              <button
                onClick={() => { setMode("register"); setError(""); }}
                style={{ color: "#818cf8", background: "none", border: "none", cursor: "pointer", marginLeft: 4 }}
              >
                立即注册
              </button>
            </p>

            {/* 微信扫码弹窗 */}
            {showQrcode && (
              <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)' }} onClick={() => { setShowQrcode(false); if (qrPollRef.current) clearInterval(qrPollRef.current); }}>
                <div style={{ background: '#fff', borderRadius: 16, padding: '32px', textAlign: 'center', minWidth: 300 }} onClick={e => e.stopPropagation()}>
                  <h3 style={{ margin: '0 0 8px', fontSize: 18, color: '#1f2937' }}>微信扫码登录</h3>
                  <p style={{ margin: '0 0 16px', fontSize: 13, color: '#6b7280' }}>请用微信扫描下方二维码</p>
                  <img src={qrcodeUrl} alt="扫码登录" style={{ width: 200, height: 200, borderRadius: 8 }} />
                  <p style={{ margin: '12px 0 0', fontSize: 12, color: '#9ca3af' }}>扫码后自动登录，3分钟内有效</p>
                </div>
              </div>
            )}
            </>
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
