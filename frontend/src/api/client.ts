import axios from "axios";

const BASE_URL = "/api";
const AUTH_KEY = "repaceclaw-auth";

function getAuthSnapshot() {
  const raw = sessionStorage.getItem(AUTH_KEY) || localStorage.getItem(AUTH_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export const apiClient = axios.create({
  baseURL: BASE_URL,
  headers: { "Content-Type": "application/json" },
  timeout: 10000,
});

// 自动注入 JWT token
apiClient.interceptors.request.use((config) => {
  const state = getAuthSnapshot();
  const token = state?.state?.token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (res) => res,
  (err) => {
    console.error("[API Error]", err.response?.data || err.message);
    if (err.response?.status === 401) {
      sessionStorage.removeItem(AUTH_KEY);
      localStorage.removeItem(AUTH_KEY);
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);

export default apiClient;
