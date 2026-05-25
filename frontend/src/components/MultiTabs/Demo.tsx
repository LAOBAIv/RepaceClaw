/**
 * MultiTabs 组件使用示例
 * 演示如何在项目中使用多标签栏组件
 */

import React, { useState, useCallback, useRef } from 'react';
import { Button, Space, message, Card } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import MultiTabs, { TabItem } from '@/components/MultiTabs';

// ============ 示例组件 ============

const MultiTabsDemo: React.FC = () => {
  // 初始标签数据
  const [tabs, setTabs] = useState<TabItem[]>([
    { key: 'home', label: '首页', type: 'project', fixed: true, iconColor: '#6366f1' },
    { key: 'task-1', label: '数据分析任务', type: 'task', iconColor: '#22c55e' },
    { key: 'project-1', label: '智能助手项目', type: 'project', iconColor: '#f59e0b' },
  ]);

  // 当前激活标签
  const [activeKey, setActiveKey] = useState('home');

  // 标签 ID 计数器
  const idCounter = useRef(3);

  // 标签状态缓存
  const tabStateCache = useRef<Map<string, Record<string, unknown>>>(new Map());

  // ============ 标签操作回调 ============

  // 新增标签
  const handleAdd = useCallback(() => {
    const newId = `tab-${++idCounter.current}`;
    const types: ('task' | 'project')[] = ['task', 'project'];
    const randomType = types[Math.floor(Math.random() * types.length)];

    const newTab: TabItem = {
      key: newId,
      label: `新${randomType === 'task' ? '任务' : '项目'} ${idCounter.current}`,
      type: randomType,
      iconColor: randomType === 'task' ? '#22c55e' : '#f59e0b',
      closable: true,
    };

    setTabs((prev) => [...prev, newTab]);
    setActiveKey(newId);
    message.success('新增标签成功');
  }, []);

  // 切换标签
  const handleChange = useCallback((key: string) => {
    setActiveKey(key);

    // 更新最后访问时间
    setTabs((prev) =>
      prev.map((tab) =>
        tab.key === key ? { ...tab, lastVisited: Date.now() } : tab
      )
    );

    // 恢复缓存的状态
    const cachedState = tabStateCache.current.get(key);
    if (cachedState) {
      console.debug('恢复缓存状态:', key, cachedState);
    }
  }, []);

  // 关闭标签
  const handleClose = useCallback(
    (key: string) => {
      const index = tabs.findIndex((t) => t.key === key);

      setTabs((prev) => prev.filter((t) => t.key !== key));

      // 清理缓存
      tabStateCache.current.delete(key);

      // 如果关闭的是当前标签，切换到相邻标签
      if (activeKey === key) {
        const nextKey =
          tabs[index + 1]?.key || tabs[index - 1]?.key || 'home';
        setActiveKey(nextKey);
      }

      message.info('标签已关闭');
    },
    [tabs, activeKey]
  );

  // 关闭其他标签
  const handleCloseOthers = useCallback(
    (key: string) => {
      setTabs((prev) => prev.filter((t) => t.key === key || t.fixed));

      // 清理其他标签的缓存
      tabs.forEach((tab) => {
        if (tab.key !== key && !tab.fixed) {
          tabStateCache.current.delete(tab.key);
        }
      });

      setActiveKey(key);
      message.info('已关闭其他标签');
    },
    [tabs]
  );

  // 关闭左侧标签
  const handleCloseLeft = useCallback(
    (key: string) => {
      const index = tabs.findIndex((t) => t.key === key);
      const leftKeys = tabs.slice(0, index).map((t) => t.key);

      setTabs((prev) => prev.filter((t, i) => i >= index || t.fixed));

      // 清理左侧标签缓存
      leftKeys.forEach((k) => tabStateCache.current.delete(k));

      message.info('已关闭左侧标签');
    },
    [tabs]
  );

  // 关闭右侧标签
  const handleCloseRight = useCallback(
    (key: string) => {
      const index = tabs.findIndex((t) => t.key === key);
      const rightKeys = tabs.slice(index + 1).map((t) => t.key);

      setTabs((prev) => prev.filter((t, i) => i <= index || t.fixed));

      // 清理右侧标签缓存
      rightKeys.forEach((k) => tabStateCache.current.delete(k));

      message.info('已关闭右侧标签');
    },
    [tabs]
  );

  // 关闭所有标签
  const handleCloseAll = useCallback(() => {
    setTabs((prev) => prev.filter((t) => t.fixed));

    // 清理所有非固定标签缓存
    tabs.forEach((tab) => {
      if (!tab.fixed) {
        tabStateCache.current.delete(tab.key);
      }
    });

    setActiveKey('home');
    message.info('已关闭所有标签');
  }, [tabs]);

  // 刷新标签
  const handleRefresh = useCallback((key: string) => {
    message.info(`刷新标签: ${key}`);
    // 在这里重新加载标签内容
  }, []);

  // 标签排序
  const handleSort = useCallback((newItems: TabItem[]) => {
    setTabs(newItems);
    message.success('标签顺序已更新');
  }, []);

  // ============ 渲染标签内容 ============

  const renderTabContent = (tab: TabItem) => {
    return (
      <div
        style={{
          padding: 24,
          background: '#fafafa',
          minHeight: 300,
          borderRadius: 8,
        }}
      >
        <Card title={tab.label} size="small">
          <p>
            <strong>类型:</strong> {tab.type === 'task' ? '📋 任务' : '📁 项目'}
          </p>
          <p>
            <strong>标签ID:</strong> {tab.key}
          </p>
          <p>
            <strong>最后访问:</strong>{' '}
            {tab.lastVisited
              ? new Date(tab.lastVisited).toLocaleString()
              : '未访问'}
          </p>
          {tab.fixed && <p style={{ color: '#999' }}>📌 固定标签</p>}
        </Card>
      </div>
    );
  };

  // ============ 渲染 ============

  return (
    <div style={{ background: '#f5f5f5', minHeight: '100vh', padding: 24 }}>
      <h2 style={{ marginBottom: 16 }}>多标签栏组件示例</h2>

      {/* 操作按钮区 */}
      <Space style={{ marginBottom: 16 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
          新增标签
        </Button>
        <Button icon={<DeleteOutlined />} onClick={handleCloseAll} danger>
          关闭全部
        </Button>
      </Space>

      {/* 多标签栏 */}
      <MultiTabs
        items={tabs}
        activeKey={activeKey}
        onChange={handleChange}
        onAdd={handleAdd}
        onClose={handleClose}
        onCloseOthers={handleCloseOthers}
        onCloseLeft={handleCloseLeft}
        onCloseRight={handleCloseRight}
        onCloseAll={handleCloseAll}
        onRefresh={handleRefresh}
        onSort={handleSort}
        showAdd
        showRefresh
        draggable
        maxTabs={15}
        style={{ background: '#fff', borderRadius: 8 }}
      />

      {/* 当前标签内容 */}
      {tabs.find((t) => t.key === activeKey) && (
        <div style={{ marginTop: 16 }}>
          {renderTabContent(tabs.find((t) => t.key === activeKey)!)}
        </div>
      )}
    </div>
  );
};

export default MultiTabsDemo;