import { useState, useEffect } from 'react';
import { Users, Shield, Building, RefreshCw, Search, Edit3, Trash2, Eye } from 'lucide-react';
import { adminOrganizationsApi, OrganizationUser } from '../api/adminOrganizations';
import { useAuthStore } from '../stores/authStore';

const ROLE_MAP: Record<string, { label: string; color: string; bg: string }> = {
  super_admin: { label: '超级管理员', color: '#d97706', bg: '#fef3c7' },
  admin: { label: '管理员', color: '#2563eb', bg: '#eff6ff' },
  user: { label: '普通用户', color: '#6b7280', bg: '#f3f4f6' },
};

const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  active: { label: '活跃', color: '#059669', bg: '#ecfdf5' },
  disabled: { label: '禁用', color: '#dc2626', bg: '#fef2f2' },
};

export function UserManagement() {
  const currentUser = useAuthStore((s) => s.user);
  const [users, setUsers] = useState<OrganizationUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState<OrganizationUser | null>(null);
  const [editingUser, setEditingUser] = useState<OrganizationUser | null>(null);
  const [showUserDetail, setShowUserDetail] = useState(false);

  useEffect(() => {
    loadUsers();
  }, []);

  async function loadUsers() {
    setLoading(true);
    try {
      const data = await adminOrganizationsApi.users();
      setUsers(data);
    } catch (e) {
      console.error('加载用户列表失败:', e);
    }
    setLoading(false);
  }

  async function handleEdit(user: OrganizationUser) {
    setEditingUser(user);
  }

  async function handleSaveEdit() {
    if (!editingUser) return;
    
    try {
      // 更新用户角色/状态
      const updatedUser = await adminOrganizationsApi.updateUser(editingUser.id, {
        role: editingUser.role,
        status: editingUser.status,
        avatar: editingUser.avatar
      });
      
      // 刷新列表
      loadUsers();
      setEditingUser(null);
    } catch (e: any) {
      alert(`更新失败: ${e.message}`);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('确定删除此用户？此操作不可恢复。')) return;
    // TODO: 实现删除用户功能（后端需要添加相应API）
    alert('删除用户功能暂未实现');
  }

  async function handleViewPermissions(userId: string) {
    try {
      const permissions = await adminOrganizationsApi.userPermissions(userId);
      setSelectedUser(users.find(u => u.id === userId) || null);
      setShowUserDetail(true);
    } catch (e: any) {
      alert(`获取权限信息失败: ${e.message}`);
    }
  }

  // 筛选用户
  const filteredUsers = users.filter(user => {
    const matchSearch = !search ||
      user.username.toLowerCase().includes(search.toLowerCase()) ||
      user.email.toLowerCase().includes(search.toLowerCase()) ||
      (user.primaryDepartmentName || '').toLowerCase().includes(search.toLowerCase());
    return matchSearch;
  });

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', background: 'var(--body-bg)', minHeight: '100%' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <Users size={32} color="#6b7280" />
          <span style={{ fontSize: 16, color: '#6b7280' }}>加载用户列表...</span>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, background: 'var(--body-bg)', minHeight: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: '#1a202c', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Users size={20} color="#d97706" /> 用户管理
        </h2>
        <button
          onClick={loadUsers}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, background: '#f3f4f6', color: '#374151', border: '1px solid #e5e7eb', cursor: 'pointer', fontSize: 13 }}
        >
          <RefreshCw size={14} /> 刷新
        </button>
      </div>

      {/* 统计 + 搜索 */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: '#fff', borderRadius: 8, border: '1px solid #e5e7eb' }}>
          <Users size={14} color="#6b7280" />
          <span style={{ fontSize: 13, color: '#374151' }}>共 <b>{users.length}</b> 个用户</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', background: '#fff', borderRadius: 8, border: '1px solid #e5e7eb' }}>
          <Search size={14} color="#9ca3af" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
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
              <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, color: '#6b7280', borderBottom: '1px solid #e5e7eb' }}>角色</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, color: '#6b7280', borderBottom: '1px solid #e5e7eb' }}>状态</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, color: '#6b7280', borderBottom: '1px solid #e5e7eb' }}>所属组织</th>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, color: '#6b7280', borderBottom: '1px solid #e5e7eb' }}>最后登录</th>
              <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: 12, color: '#6b7280', borderBottom: '1px solid #e5e7eb' }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map(user => {
              const roleInfo = ROLE_MAP[user.role] || ROLE_MAP.user;
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
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: roleInfo.bg, color: roleInfo.color, fontWeight: 500 }}>
                      {roleInfo.label}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: statusInfo.bg, color: statusInfo.color, fontWeight: 500 }}>
                      {statusInfo.label}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: '#6b7280' }}>
                    {user.primaryDepartmentName || '-'}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 11, color: '#9ca3af' }}>
                    {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString('zh-CN') : '-'}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
                      <button
                        onClick={() => handleViewPermissions(user.id)}
                        style={{ padding: '4px 8px', borderRadius: 6, background: '#f3f4f6', color: '#374151', border: 'none', cursor: 'pointer', fontSize: 12 }}
                        title="查看权限"
                      >
                        <Eye size={14} />
                      </button>
                      {currentUser?.role === 'super_admin' && (
                        <>
                          <button
                            onClick={() => handleEdit(user)}
                            style={{ padding: '4px 8px', borderRadius: 6, background: '#eff6ff', color: '#2563eb', border: 'none', cursor: 'pointer', fontSize: 12 }}
                            title="编辑"
                          >
                            <Edit3 size={14} />
                          </button>
                          <button
                            onClick={() => handleDelete(user.id)}
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

      {/* 用户详情模态框 */}
      {showUserDetail && selectedUser && (
        <div style={{ 
          position: 'fixed', 
          top: 0, 
          left: 0, 
          right: 0, 
          bottom: 0, 
          background: 'rgba(0,0,0,0.5)', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{ 
            background: '#fff', 
            borderRadius: 12, 
            width: '80%', 
            maxWidth: 800, 
            maxHeight: '80vh', 
            overflow: 'auto'
          }}>
            <div style={{ padding: 24, borderBottom: '1px solid #e5e7eb' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ fontSize: 18, fontWeight: 600, color: '#1a202c' }}>用户权限详情</h3>
                <button 
                  onClick={() => setShowUserDetail(false)}
                  style={{ fontSize: 20, background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  ×
                </button>
              </div>
              
              <div style={{ marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                  {selectedUser.avatar ? (
                    <img src={selectedUser.avatar} alt="" style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: 20, color: '#6b7280', fontWeight: 600 }}>
                        {selectedUser.username.charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 600, color: '#1a202c' }}>{selectedUser.username}</div>
                    <div style={{ fontSize: 13, color: '#6b7280' }}>{selectedUser.email}</div>
                  </div>
                </div>
                
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginTop: 16 }}>
                  <div>
                    <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 4 }}>角色</div>
                    <div style={{ fontSize: 14, color: '#1a202c' }}>
                      {ROLE_MAP[selectedUser.role]?.label || selectedUser.role}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 4 }}>状态</div>
                    <div style={{ fontSize: 14, color: '#1a202c' }}>
                      {STATUS_MAP[selectedUser.status]?.label || selectedUser.status}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 4 }}>所属组织</div>
                    <div style={{ fontSize: 14, color: '#1a202c' }}>
                      {selectedUser.primaryDepartmentName || '-'}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            <div style={{ padding: 24 }}>
              <h4 style={{ fontSize: 14, fontWeight: 600, color: '#1a202c', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Shield size={16} /> 权限范围
              </h4>
              <div style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.5 }}>
                <p>权限详情功能正在开发中，将在后续版本中完善。</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 编辑用户模态框 */}
      {editingUser && (
        <div style={{ 
          position: 'fixed', 
          top: 0, 
          left: 0, 
          right: 0, 
          bottom: 0, 
          background: 'rgba(0,0,0,0.5)', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{ 
            background: '#fff', 
            borderRadius: 12, 
            width: '500px', 
            maxWidth: '90%'
          }}>
            <div style={{ padding: 24, borderBottom: '1px solid #e5e7eb' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ fontSize: 18, fontWeight: 600, color: '#1a202c' }}>编辑用户</h3>
                <button 
                  onClick={() => setEditingUser(null)}
                  style={{ fontSize: 20, background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  ×
                </button>
              </div>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
                {editingUser.avatar ? (
                  <img src={editingUser.avatar} alt="" style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: 20, color: '#6b7280', fontWeight: 600 }}>
                      {editingUser.username.charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
                <div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: '#1a202c' }}>{editingUser.username}</div>
                  <div style={{ fontSize: 13, color: '#6b7280' }}>{editingUser.email}</div>
                </div>
              </div>
              
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 6 }}>角色</label>
                <select
                  value={editingUser.role}
                  onChange={(e) => setEditingUser({...editingUser, role: e.target.value as any})}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 14 }}
                >
                  <option value="super_admin">超级管理员</option>
                  <option value="admin">管理员</option>
                  <option value="user">普通用户</option>
                </select>
              </div>
              
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 6 }}>状态</label>
                <select
                  value={editingUser.status}
                  onChange={(e) => setEditingUser({...editingUser, status: e.target.value})}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 14 }}
                >
                  <option value="active">活跃</option>
                  <option value="disabled">禁用</option>
                </select>
              </div>
              
              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setEditingUser(null)}
                  style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', color: '#374151', fontSize: 14, cursor: 'pointer' }}
                >
                  取消
                </button>
                <button
                  onClick={handleSaveEdit}
                  style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#d97706', color: '#fff', fontSize: 14, cursor: 'pointer', fontWeight: 500 }}
                >
                  保存
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}