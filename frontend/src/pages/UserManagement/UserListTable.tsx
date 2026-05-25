/**
 * @file UserListTable.tsx
 * @description 用户列表表格组件（搜索 / 筛选 / 操作按钮）
 */

import { Users, Search, Edit3, Trash2, Eye, MessageCircle } from 'lucide-react';
import { OrganizationUser } from '../../api/adminOrganizations';
import { STATUS_MAP } from './constants';

interface UserListTableProps {
  users: OrganizationUser[];
  search: string;
  onSearchChange: (v: string) => void;
  onViewPermissions: (userId: string) => void;
  onEdit: (user: OrganizationUser) => void;
  onDelete: (userId: string) => void;
  canEdit: boolean;
}

/** 用户列表表格 */
export function UserListTable({
  users,
  search,
  onSearchChange,
  onViewPermissions,
  onEdit,
  onDelete,
  canEdit,
}: UserListTableProps) {
  // 筛选用户
  const filteredUsers = users.filter(user => {
    const matchSearch = !search ||
      user.username.toLowerCase().includes(search.toLowerCase()) ||
      user.email.toLowerCase().includes(search.toLowerCase()) ||
      (user.primaryDepartmentName || '').toLowerCase().includes(search.toLowerCase());
    return matchSearch;
  });

  return (
    <>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: '#fff', borderRadius: 8, border: '1px solid #e5e7eb' }}>
          <Users size={14} color="#6b7280" />
          <span style={{ fontSize: 13, color: '#374151' }}>共 <b>{users.length}</b> 个用户</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', background: '#fff', borderRadius: 8, border: '1px solid #e5e7eb' }}>
          <Search size={14} color="#9ca3af" />
          <input
            value={search}
            onChange={e => onSearchChange(e.target.value)}
            placeholder="搜索用户名 / 邮箱 / 组织"
            style={{ border: 'none', outline: 'none', fontSize: 13, width: 220, background: 'transparent' }}
          />
        </div>
      </div>

      {/* 用户表格 */}
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f9fafb' }}>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, color: '#6b7280', borderBottom: '1px solid #e5e7eb' }}>用户名</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, color: '#6b7280', borderBottom: '1px solid #e5e7eb' }}>邮箱</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, color: '#6b7280', borderBottom: '1px solid #e5e7eb' }}>状态</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, color: '#6b7280', borderBottom: '1px solid #e5e7eb' }}>所属组织</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, color: '#6b7280', borderBottom: '1px solid #e5e7eb' }}>微信绑定</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, color: '#6b7280', borderBottom: '1px solid #e5e7eb' }}>注册时间</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, color: '#6b7280', borderBottom: '1px solid #e5e7eb' }}>最后登录</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: 12, color: '#6b7280', borderBottom: '1px solid #e5e7eb' }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map(user => {
              const statusInfo = STATUS_MAP[user.status] || STATUS_MAP.active;
              return (
                <tr key={user.id} style={{ borderBottom: '1px solid #f5f5f5' }}>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {user.avatar ? (
                        <img src={user.avatar} alt="" style={{ width: 24, height: 24, borderRadius: '50%', objectFit: 'cover' }} />
                      ) : (
                        <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 600 }}>
                            {user.username.charAt(0).toUpperCase()}
                          </span>
                        </div>
                      )}
                      <span style={{ fontSize: 13, fontWeight: 500, color: '#1a202c' }}>{user.username}</span>
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: '#6b7280' }}>{user.email}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: statusInfo.bg, color: statusInfo.color, fontWeight: 500 }}>
                      {statusInfo.label}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: '#6b7280' }}>
                    {user.primaryDepartmentName || '-'}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    {user.wechatBound ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, padding: '2px 8px', borderRadius: 4, background: '#ecfdf5', color: '#059669', fontWeight: 500 }}>
                        <MessageCircle size={12} /> 已绑定
                      </span>
                    ) : (
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: '#f3f4f6', color: '#9ca3af' }}>未绑定</span>
                    )}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 11, color: '#9ca3af' }}>
                    {user.createdAt ? new Date(user.createdAt).toLocaleString('zh-CN') : '-'}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 11, color: '#9ca3af' }}>
                    {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString('zh-CN') : '-'}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
                      <button
                        onClick={() => onViewPermissions(user.id)}
                        style={{ padding: '4px 8px', borderRadius: 6, background: '#f3f4f6', color: '#374151', border: 'none', cursor: 'pointer', fontSize: 12 }}
                        title="查看权限"
                      >
                        <Eye size={14} />
                      </button>
                      {canEdit && (
                        <>
                          <button
                            onClick={() => onEdit(user)}
                            style={{ padding: '4px 8px', borderRadius: 6, background: '#eff6ff', color: '#2563eb', border: 'none', cursor: 'pointer', fontSize: 12 }}
                            title="编辑"
                          >
                            <Edit3 size={14} />
                          </button>
                          <button
                            onClick={() => onDelete(user.id)}
                            style={{ padding: '4px 8px', borderRadius: 6, background: '#fef2f2', color: '#dc2626', border: 'none', cursor: 'pointer', fontSize: 12 }}
                            title="删除"
                          >
                            <Trash2 size={14} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filteredUsers.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>
            {users.length === 0 ? '暂无用户' : '没有匹配的搜索结果'}
          </div>
        )}
      </div>
    </>
  );
}
