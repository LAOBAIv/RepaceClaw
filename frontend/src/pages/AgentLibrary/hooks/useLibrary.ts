/**
 * hooks/useLibrary.ts - AgentLibrary 数据加载与筛选逻辑
 *
 * 封装：模板加载、搜索过滤、分类过滤、排序、分页、分组等逻辑。
 * 返回状态和回调函数供 UI 组件使用。
 */

import { useState, useEffect, useMemo } from "react";
import { AgentTemplate } from "../../../types";
import { agentTemplatesApi } from "../../../api/agentTemplates";

export interface UseLibraryReturn {
  templates: AgentTemplate[];
  categories: string[];
  selectedCategory: string;
  setSelectedCategory: (cat: string) => void;
  sortBy: "random" | "favorite";
  setSortBy: (sort: "random" | "favorite") => void;
  currentPage: number;
  setCurrentPage: (page: number | ((p: number) => number)) => void;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  loading: boolean;
  creating: string | null;
  setCreating: (id: string | null) => void;
  successMsg: string;
  setSuccessMsg: (msg: string) => void;
  /** 分页后的模板列表（仅"全部模板"视图使用） */
  paginatedTemplates: AgentTemplate[];
  /** 总页数 */
  totalPages: number;
  /** 按分类分组的数据（仅分类视图使用） */
  grouped: Record<string, AgentTemplate[]>;
  /** 重新加载模板 */
  loadTemplates: () => Promise<void>;
}

const PAGE_SIZE = 9;

export function useLibrary(): UseLibraryReturn {
  const [templates, setTemplates] = useState<AgentTemplate[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [sortBy, setSortBy] = useState<"random" | "favorite">("random");
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState("");

  // 加载模板和分类数据
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

  useEffect(() => {
    loadTemplates();
  }, []);

  // 搜索过滤：匹配名称、描述、vibe、systemPrompt
  const searchFiltered = useMemo(
    () =>
      searchTerm
        ? templates.filter(
            (t) =>
              t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
              t.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
              (t.vibe &&
                t.vibe.toLowerCase().includes(searchTerm.toLowerCase())) ||
              (t.systemPrompt &&
                t.systemPrompt
                  .toLowerCase()
                  .includes(searchTerm.toLowerCase()))
          )
        : templates,
    [templates, searchTerm]
  );

  // 分类过滤
  const filtered = useMemo(
    () =>
      selectedCategory === "all"
        ? searchFiltered
        : searchFiltered.filter((t) => t.category === selectedCategory),
    [searchFiltered, selectedCategory]
  );

  // 排序逻辑（仅"全部模板"视图）
  const sortedTemplates = useMemo(
    () =>
      selectedCategory === "all"
        ? [...filtered].sort(() => {
            if (sortBy === "random") {
              return Math.random() - 0.5;
            }
            return 0;
          })
        : filtered,
    [filtered, selectedCategory, sortBy]
  );

  // 分页计算
  const totalPages = Math.ceil(sortedTemplates.length / PAGE_SIZE);
  const paginatedTemplates = useMemo(
    () =>
      sortedTemplates.slice(
        (currentPage - 1) * PAGE_SIZE,
        currentPage * PAGE_SIZE
      ),
    [sortedTemplates, currentPage]
  );

  // 按分类分组（仅分类视图）
  const grouped = useMemo(() => {
    if (selectedCategory === "all") return {};
    const g: Record<string, AgentTemplate[]> = {};
    filtered.forEach((t) => {
      if (!g[t.category]) g[t.category] = [];
      g[t.category].push(t);
    });
    return g;
  }, [filtered, selectedCategory]);

  return {
    templates,
    categories,
    selectedCategory,
    setSelectedCategory,
    sortBy,
    setSortBy,
    currentPage,
    setCurrentPage,
    searchTerm,
    setSearchTerm,
    loading,
    creating,
    setCreating,
    successMsg,
    setSuccessMsg,
    paginatedTemplates,
    totalPages,
    grouped,
    loadTemplates,
  };
}
