import { useState } from 'react';
import { Puzzle, Plus, Trash2, ToggleLeft, ToggleRight, ExternalLink } from 'lucide-react';

interface Plugin {
  id: number;
  name: string;
  desc: string;
  category: string;
  version: string;
  author: string;
  enabled: boolean;
}

const INIT_PLUGINS: Plugin[] = [
  { id: 1, name: 'GitHub 集成', desc: '连接 GitHub 仓库，支持代码搜索、Issue 管理、PR 自动化操作。', category: '代码管理', version: '1.2.0', author: 'GitHub Inc.', enabled: true },
  { id: 2, name: 'Jira 同步', desc: '与 Jira 项目看板双向同步，自动创建任务、更新状态与优先级。', category: '项目管理', version: '2.0.3', author: 'Atlassian', enabled: true },
  { id: 3, name: 'Slack 通知', desc: '将智能体执行结果、错误警报等实时推送至指定 Slack 频道。', category: '消息通知', version: '1.0.5', author: 'Slack', enabled: false },
  { id: 4, name: 'MySQL 查询', desc: '直连 MySQL 数据库，执行 SQL 查询并以结构化表格返回结果。', category: '数据库', version: '3.1.0', author: 'Oracle', enabled: true },
  { id: 5, name: 'Notion 文档', desc: '读写 Notion 页面与数据库，支持块级内容操作与页面模板套用。', category: '文档协作', version: '1.4.2', author: 'Notion Labs', enabled: false },
  { id: 6, name: '飞书表格', desc: '读取与更新飞书多维表格数据，支持行列筛选与批量写入。', category: '文档协作', version: '2.3.1', author: 'ByteDance', enabled: true },
  { id: 7, name: 'Webhook 触发', desc: '通过 HTTP Webhook 接收外部事件，触发智能体工作流自动执行。', category: '自动化', version: '1.1.0', author: 'Community', enabled: true },
  { id: 8, name: 'Redis 缓存', desc: '读写 Redis 键值存储，适用于上下文缓存与高频数据临时存储场景。', category: '数据库', version: '1.0.2', author: 'Redis Ltd.', enabled: false },
];

const CATEGORIES = ['全部', '代码管理', '项目管理', '消息通知', '数据库', '文档协作', '自动化'];

export function PluginSettings() {
  const [plugins, setPlugins] = useState<Plugin[]>(INIT_PLUGINS);
  const [activeCategory, setActiveCategory] = useState('全部');

  function toggleEnabled(id: number) {
    setPlugins(prev => prev.map(p => p.id === id ? { ...p, enabled: !p.enabled } : p));
  }

  function deletePlugin(id: number) {
    setPlugins(prev => prev.filter(p => p.id !== id));
  }

  const filtered = activeCategory === '全部' ? plugins : plugins.filter(p => p.category === activeCategory);
  const enabledCount = plugins.filter(p => p.enabled).length;

  return (
    <>
      <style>{`
        .ps-wrap {
          width: 100%;
          flex: 1; min-height: 0;
          display: flex; flex-direction: column;
          font-family: "Microsoft YaHei", "Segoe UI", sans-serif;
          background: #f5f7fa;
          padding: 16px; box-sizing: border-box;
          overflow: hidden;
        }
        .ps-shell {
          flex: 1; min-height: 0; display: flex; flex-direction: column;
          background: #fafbfc; border: 1px solid #e5e6eb;
          border-radius: 12px; box-shadow: 0 1px 4px rgba(0,0,0,0.05);
          overflow: hidden;
        }
        /* header */
        .ps-header {
          padding: 16px 32px;
          min-height: 58px;
          border-bottom: 1px solid #e5e6eb;
          background: #ffffff;
          display: flex; align-items: center; justify-content: space-between;
          flex-shrink: 0;
          box-sizing: border-box;
        }
        .ps-header-left { display: flex; align-items: center; gap: 10px; }
        .ps-add-btn {
          display: flex; align-items: center; gap: 6px;
          padding: 8px 16px; border-radius: 8px; border: none;
          background: #2a3b4d; color: #fff;
          font-weight: 600; font-size: 13px; cursor: pointer;
          font-family: inherit; transition: background 0.15s;
        }
        .ps-add-btn:hover { background: #1e2d3d; }
        /* 分类筛选栏 */
        .ps-filter {
          display: flex; align-items: center; gap: 8px;
          padding: 12px 32px;
          border-bottom: 1px solid #f0f0f0;
          background: #fff;
          flex-shrink: 0; flex-wrap: wrap;
        }
        .ps-cat-tag {
          padding: 5px 14px; border-radius: 20px;
          font-size: 13px; cursor: pointer;
          border: 1px solid #e5e7eb;
          background: #fff; color: #4a5568;
          transition: all 0.15s; user-select: none;
        }
        .ps-cat-tag.active {
          background: #2a3b4d; border-color: #2a3b4d; color: #fff;
        }
        .ps-cat-tag:hover:not(.active) { border-color: #2a3b4d; color: #2a3b4d; }
        /* 列表区 */
        .ps-scroll { flex: 1; overflow-y: auto; padding: 20px 32px; }
        .ps-list {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 10px;
        }
        @media (max-width: 640px) {
          .ps-list { grid-template-columns: 1fr; }
        }
        /* 插件卡片 */
        .ps-item {
          display: flex; align-items: flex-start; gap: 14px;
          padding: 16px 20px;
          background: #ffffff;
          border: 1px solid #e5e5e5;
          border-radius: 12px;
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .ps-item:hover {
          border-color: #b0b0b0;
          box-shadow: 0 2px 10px rgba(0,0,0,0.05);
        }
        /* 插件图标占位 */
        .ps-icon {
          width: 40px; height: 40px; border-radius: 10px;
          background: linear-gradient(135deg, #e8f0fe 0%, #d0e4ff 100%);
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }
        .ps-item-info { flex: 1; min-width: 0; }
        .ps-item-name {
          font-size: 14px; font-weight: 600; color: #333333;
          display: flex; align-items: center; gap: 8px;
          margin-bottom: 4px;
        }
        .ps-item-cat {
          font-size: 11px; padding: 2px 8px; border-radius: 4px;
          background: #f0f4f8; color: #4a5568; font-weight: 400;
        }
        .ps-item-desc {
          font-size: 13px; color: #666666; line-height: 1.5;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
          margin-bottom: 6px;
        }
        .ps-item-meta {
          display: flex; align-items: center; gap: 10px;
          font-size: 12px; color: #9ca3af;
        }
        .ps-item-actions {
          display: flex; flex-direction: column;
          align-items: center; gap: 8px; flex-shrink: 0;
          padding-top: 2px;
        }
        .ps-toggle { cursor: pointer; display: flex; align-items: center; }
        .ps-link {
          cursor: pointer; color: #ccc;
          transition: color 0.15s;
          display: flex; align-items: center;
          background: none; border: none; padding: 0;
        }
        .ps-link:hover { color: #4299e1; }
        .ps-delete {
          cursor: pointer; color: #ccc;
          transition: color 0.15s;
          display: flex; align-items: center;
          background: none; border: none; padding: 0;
        }
        .ps-delete:hover { color: #e53e3e; }
        @media (max-width: 768px) {
          .ps-scroll { padding: 16px; }
          .ps-header { padding: 14px 16px; }
          .ps-filter { padding: 10px 16px; }
        }
      `}</style>

      <div className="ps-wrap">
        <div className="ps-shell">

          {/* 顶部 header */}
          <div className="ps-header">
            <div className="ps-header-left">
              <Puzzle size={18} color="#2a3b4d" />
              <div>
                <span style={{ fontWeight: 700, fontSize: 16, color: '#1a202c' }}>插件设置</span>
                <span style={{ fontSize: 12, color: '#9ca3af', marginLeft: 10 }}>
                  共 {plugins.length} 个插件 · 已启用 {enabledCount} 个
                </span>
              </div>
            </div>
            <button className="ps-add-btn">
              <Plus size={14} /> 安装插件
            </button>
          </div>

          {/* 分类筛选 */}
          <div className="ps-filter">
            {CATEGORIES.map(cat => (
              <span
                key={cat}
                className={`ps-cat-tag${activeCategory === cat ? ' active' : ''}`}
                onClick={() => setActiveCategory(cat)}
              >{cat}</span>
            ))}
          </div>

          {/* 插件列表 */}
          <div className="ps-scroll">
            <div className="ps-list">
              {filtered.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#aaa', padding: '40px 0', fontSize: 14 }}>
                  暂无插件
                </div>
              ) : filtered.map(plugin => (
                <div key={plugin.id} className="ps-item">
                  {/* 图标 */}
                  <div className="ps-icon">
                    <Puzzle size={20} color="#4299e1" />
                  </div>

                  {/* 信息 */}
                  <div className="ps-item-info">
                    <div className="ps-item-name">
                      {plugin.name}
                      <span className="ps-item-cat">{plugin.category}</span>
                    </div>
                    <div className="ps-item-desc">{plugin.desc}</div>
                    <div className="ps-item-meta">
                      <span>v{plugin.version}</span>
                      <span>·</span>
                      <span>{plugin.author}</span>
                    </div>
                  </div>

                  {/* 操作 */}
                  <div className="ps-item-actions">
                    <span
                      className="ps-toggle"
                      onClick={() => toggleEnabled(plugin.id)}
                      title={plugin.enabled ? '点击禁用' : '点击启用'}
                    >
                      {plugin.enabled
                        ? <ToggleRight size={26} color="#4299e1" />
                        : <ToggleLeft size={26} color="#cbd5e0" />
                      }
                    </span>
                    <button className="ps-link" title="查看详情">
                      <ExternalLink size={14} />
                    </button>
                    <button
                      className="ps-delete"
                      onClick={() => deletePlugin(plugin.id)}
                      title="卸载插件"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </>
  );
}
