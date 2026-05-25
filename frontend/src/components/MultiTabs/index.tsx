/**
 * 多标签栏组件
 * 基于 Ant Design Tabs 二次封装
 * 支持标签切换、新增、关闭、拖拽排序、状态缓存
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Tabs, Dropdown, Button, Tooltip, message } from 'antd';
import {
  PlusOutlined,
  CloseOutlined,
  ReloadOutlined,
  CloseCircleOutlined,
  VerticalRightOutlined,
  VerticalLeftOutlined,
  HolderOutlined,
} from '@ant-design/icons';
import type { TabsProps, MenuProps } from 'antd';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import type { TabItem, MultiTabsProps } from './types';
import DraggableTab from './DraggableTab';
import TabIcon from './TabIcon';

// 重新导出类型，保持向后兼容
export type { TabItem, MultiTabsProps } from './types';

// ============ 主组件 ============

const MultiTabs: React.FC<MultiTabsProps> = ({
  items,
  activeKey,
  onChange,
  onAdd,
  onClose,
  onCloseOthers,
  onCloseLeft,
  onCloseRight,
  onCloseAll,
  onRefresh,
  onSort,
  showAdd = true,
  showRefresh = true,
  draggable = true,
  maxTabs = 20,
  style,
  className,
}) => {
  // 内部标签列表（用于拖拽排序）
  const [internalItems, setInternalItems] = useState<TabItem[]>(items);
  // 缓存的标签状态
  const cacheRef = useRef<Map<string, Record<string, unknown>>>(new Map());

  // 同步外部 items
  useEffect(() => {
    setInternalItems(items);
  }, [items]);

  // 更新缓存
  useEffect(() => {
    internalItems.forEach((item) => {
      if (item.cachedState) {
        cacheRef.current.set(item.key, item.cachedState);
      }
    });
  }, [internalItems]);

  // 拖拽排序处理
  const moveTab = useCallback(
    (dragIndex: number, hoverIndex: number) => {
      const dragItem = internalItems[dragIndex];
      if (dragItem?.fixed) return; // 固定标签不可拖拽

      const newItems = [...internalItems];
      newItems.splice(dragIndex, 1);
      newItems.splice(hoverIndex, 0, dragItem);
      setInternalItems(newItems);
      onSort?.(newItems);
    },
    [internalItems, onSort]
  );

  // 关闭单个标签
  const handleClose = useCallback(
    (key: string, e?: React.MouseEvent) => {
      e?.stopPropagation();
      const item = internalItems.find((i) => i.key === key);
      if (item?.fixed) {
        message.warning('固定标签不可关闭');
        return;
      }
      // 保存状态到缓存
      cacheRef.current.delete(key);
      onClose?.(key);
    },
    [internalItems, onClose]
  );

  // 右键菜单
  const getContextMenu = useCallback(
    (key: string): MenuProps['items'] => {
      const item = internalItems.find((i) => i.key === key);
      const currentIndex = internalItems.findIndex((i) => i.key === key);
      const leftCount = currentIndex;
      const rightCount = internalItems.length - currentIndex - 1;
      const otherCount = internalItems.filter((i) => i.key !== key && !i.fixed).length;

      return [
        {
          key: 'refresh',
          icon: <ReloadOutlined />,
          label: '刷新',
          onClick: () => onRefresh?.(key),
        },
        { type: 'divider' },
        {
          key: 'close',
          icon: <CloseOutlined />,
          label: '关闭',
          disabled: item?.fixed,
          onClick: () => handleClose(key),
        },
        {
          key: 'closeOthers',
          icon: <CloseCircleOutlined />,
          label: `关闭其他 (${otherCount})`,
          disabled: otherCount === 0,
          onClick: () => onCloseOthers?.(key),
        },
        { type: 'divider' },
        {
          key: 'closeLeft',
          icon: <VerticalRightOutlined />,
          label: `关闭左侧 (${leftCount})`,
          disabled: leftCount === 0,
          onClick: () => onCloseLeft?.(key),
        },
        {
          key: 'closeRight',
          icon: <VerticalLeftOutlined />,
          label: `关闭右侧 (${rightCount})`,
          disabled: rightCount === 0,
          onClick: () => onCloseRight?.(key),
        },
        { type: 'divider' },
        {
          key: 'closeAll',
          icon: <CloseCircleOutlined />,
          label: '关闭全部',
          onClick: () => onCloseAll?.(),
        },
      ];
    },
    [internalItems, handleClose, onCloseOthers, onCloseLeft, onCloseRight, onCloseAll, onRefresh]
  );

  // 渲染标签
  const renderTabLabel = useCallback(
    (item: TabItem, index: number) => {
      const isActive = item.key === activeKey;

      const labelContent = (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '0 4px',
          }}
        >
          <TabIcon type={item.type} color={item.iconColor} />
          <span
            style={{
              maxWidth: 120,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {item.label}
          </span>
          {item.closable !== false && !item.fixed && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => handleClose(item.key, e)}
              onKeyDown={(e) => e.key === 'Enter' && handleClose(item.key)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 16,
                height: 16,
                marginLeft: 4,
                borderRadius: 4,
                cursor: 'pointer',
                opacity: isActive ? 1 : 0.6,
                transition: 'all 0.15s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(0,0,0,0.08)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              <CloseOutlined style={{ fontSize: 10 }} />
            </span>
          )}
        </div>
      );

      // 固定标签不需要拖拽
      if (item.fixed || !draggable) {
        return labelContent;
      }

      return (
        <DraggableTab item={item} index={index} moveTab={moveTab}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <HolderOutlined
              style={{
                fontSize: 12,
                color: '#999',
                marginRight: 4,
                cursor: 'grab',
              }}
            />
            {labelContent}
          </div>
        </DraggableTab>
      );
    },
    [activeKey, draggable, handleClose, moveTab]
  );

  // 构建 Tabs items
  const tabItems: TabsProps['items'] = useMemo(
    () =>
      internalItems.map((item, index) => ({
        key: item.key,
        label: (
          <Dropdown menu={{ items: getContextMenu(item.key) }} trigger={['contextMenu']}>
            {renderTabLabel(item, index)}
          </Dropdown>
        ),
        closable: item.closable !== false && !item.fixed,
        children: (
          <div key={item.key} data-tab-key={item.key}>
            {/* 子内容由外部渲染 */}
          </div>
        ),
      })),
    [internalItems, getContextMenu, renderTabLabel]
  );

  // 标签栏额外操作
  const tabBarExtraContent = useMemo(
    () => (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {showRefresh && (
          <Tooltip title="刷新当前标签">
            <Button
              type="text"
              size="small"
              icon={<ReloadOutlined />}
              onClick={() => onRefresh?.(activeKey)}
            />
          </Tooltip>
        )}
        {showAdd && (
          <Tooltip title={`新增标签 (${internalItems.length}/${maxTabs})`}>
            <Button
              type="text"
              size="small"
              icon={<PlusOutlined />}
              disabled={internalItems.length >= maxTabs}
              onClick={onAdd}
            />
          </Tooltip>
        )}
      </div>
    ),
    [showAdd, showRefresh, internalItems.length, maxTabs, activeKey, onAdd, onRefresh]
  );

  // 标签栏样式
  const tabBarStyle: React.CSSProperties = {
    background: '#fff',
    marginBottom: 0,
    padding: '4px 12px 0',
    borderBottom: '1px solid #f0f0f0',
  };

  // 不使用拖拽时直接渲染
  if (!draggable) {
    return (
      <div className={className} style={style}>
        <Tabs
          activeKey={activeKey}
          items={tabItems}
          onChange={onChange}
          tabBarStyle={tabBarStyle}
          tabBarExtraContent={tabBarExtraContent}
          type="editable-card"
          hideAdd
          onEdit={(targetKey, action) => {
            if (action === 'remove' && typeof targetKey === 'string') {
              handleClose(targetKey);
            }
          }}
        />
      </div>
    );
  }

  // 使用 DndProvider 包裹支持拖拽
  return (
    <div className={className} style={style}>
      <DndProvider backend={HTML5Backend}>
        <Tabs
          activeKey={activeKey}
          items={tabItems}
          onChange={onChange}
          tabBarStyle={tabBarStyle}
          tabBarExtraContent={tabBarExtraContent}
          type="editable-card"
          hideAdd
          onEdit={(targetKey, action) => {
            if (action === 'remove' && typeof targetKey === 'string') {
              handleClose(targetKey);
            }
          }}
        />
      </DndProvider>
    </div>
  );
};

export default MultiTabs;
