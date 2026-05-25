/**
 * AgentLibrary/index.tsx - 智能体模板库主入口
 *
 * 整合 LibraryHeader（搜索/筛选）、LibraryGrid（卡片网格）、
 * Pagination（底部分页）和 useLibrary（数据逻辑），
 * 提供完整的智能体模板浏览和创建功能。
 */

import { useNavigate } from "react-router-dom";
import { AgentTemplate } from "../../types";
import { useLibrary } from "./hooks/useLibrary";
import LibraryHeader from "./LibraryHeader";
import LibraryGrid from "./LibraryGrid";
import Pagination from "./Pagination";

export default function AgentLibrary() {
  const navigate = useNavigate();

  const {
    templates,
    categories,
    selectedCategory,
    setSelectedCategory,
    currentPage,
    setCurrentPage,
    searchTerm,
    setSearchTerm,
    loading,
    successMsg,
    paginatedTemplates,
    totalPages,
    grouped,
  } = useLibrary();

  // 跳转到创建页面，携带模板参数
  function handleCreate(template: AgentTemplate) {
    navigate("/agent-create", {
      state: {
        templateId: template.id,
        name: template.name,
        model: template.name,
        description: template.description,
        expertise: template.expertise,
        systemPrompt: template.systemPrompt,
        vibe: template.vibe,
        category: template.category,
      },
    });
  }

  // 加载状态
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">加载 Agent 模板库...</div>
      </div>
    );
  }

  return (
    <>
      {/* 全局样式 */}
      <style>{`
        .al-wrap {
          width: 100%;
          height: 100%;
          min-height: 0;
          display: flex;
          flex-direction: column;
          font-family: "Microsoft YaHei", "Segoe UI", sans-serif;
          background: #f5f7fa;
          padding: 16px;
          box-sizing: border-box;
          overflow: hidden;
        }
        .al-card {
          flex: 1;
          min-height: 0;
          display: flex;
          flex-direction: column;
          background: #fafbfc;
          border: 1px solid #e5e6eb;
          border-radius: 12px;
          box-shadow: 0 1px 4px rgba(0,0,0,0.05);
          overflow: hidden;
        }
        .al-header {
          padding: 16px 32px;
          min-height: 58px;
          border-bottom: 1px solid #e5e6eb;
          background: #ffffff;
          display: flex;
          align-items: center;
          gap: 10px;
          flex-shrink: 0;
          box-sizing: border-box;
        }
        .al-scroll {
          flex: 1;
          min-height: 0;
          overflow-y: auto;
          overflow-x: hidden;
          padding: 14px 20px 0;
          box-sizing: border-box;
        }
        .al-panel {
          background: transparent;
          border: none;
          border-radius: 0;
          box-shadow: none;
        }
        .create-btn {
          border: none;
          border-radius: 8px;
          background: #2a3b4d;
          color: #fff;
          cursor: pointer;
          transition: background 0.15s ease;
          font-family: inherit;
        }
        .create-btn:hover {
          background: #1e2d3d;
        }
        .al-footer {
          padding: 10px 24px;
          border-top: 1px solid #ebebeb;
          background: #fff;
          display: flex;
          justify-content: center;
          gap: 10px;
          flex-shrink: 0;
          min-height: 52px;
        }
      `}</style>

      <div className="al-wrap">
        <div className="al-card">
          {/* 顶部标题栏 */}
          <div className="al-header">
            <div style={{ display: "flex", alignItems: "center" }}>
              <span
                style={{
                  fontWeight: 700,
                  fontSize: 16,
                  color: "#1a202c",
                  margin: 0,
                }}
              >
                🎭 Agent 模板库
              </span>
              <span
                style={{
                  fontSize: 12,
                  color: "rgb(156, 163, 175)",
                  marginLeft: 10,
                }}
              >
                共 {templates.length}个智能体模版
              </span>
            </div>
          </div>

          {/* 可滚动内容区 */}
          <div className="al-scroll">
            <div style={{ width: "100%", maxWidth: "none", margin: 0 }}>
              {/* 成功提示 */}
              {successMsg && (
                <div
                  className="mb-4 p-3 rounded-xl text-sm al-panel"
                  style={{
                    background: "#f0fdf4",
                    border: "1px solid #bbf7d0",
                    color: "#16a34a",
                  }}
                >
                  {successMsg}
                </div>
              )}

              {/* 搜索 + 分类筛选 */}
              <LibraryHeader
                templates={templates}
                categories={categories}
                searchTerm={searchTerm}
                onSearchChange={(term) => {
                  setSearchTerm(term);
                  setCurrentPage(1); // 搜索时重置到第一页
                }}
                selectedCategory={selectedCategory}
                onCategoryChange={(cat) => {
                  setSelectedCategory(cat);
                  setCurrentPage(1); // 切换分类时重置到第一页
                }}
              />

              {/* 卡片网格 */}
              <div className="al-panel" style={{ padding: 0 }}>
                <LibraryGrid
                  selectedCategory={selectedCategory}
                  paginatedTemplates={paginatedTemplates}
                  totalPages={totalPages}
                  totalItems={paginatedTemplates.length}
                  grouped={grouped}
                  currentPage={currentPage}
                  onPageChange={(page) => setCurrentPage(page)}
                  onCreate={handleCreate}
                />
              </div>
            </div>
          </div>

          {/* 底部分页栏（仅"全部模板"视图） */}
          {selectedCategory === "all" && totalPages > 0 && (
            <div className="al-footer">
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                totalItems={paginatedTemplates.length}
                onPageChange={(page) => setCurrentPage(page)}
                inFooter
              />
            </div>
          )}
        </div>
      </div>
    </>
  );
}
