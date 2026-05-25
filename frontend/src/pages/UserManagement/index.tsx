/**
 * @file index.tsx
 * @description 用户与组织管理主组件
 * @description 组合 UserListTable、UserDetailModal、EditUserModal、DepartmentTree 子组件
 */

import { useState, useEffect } from 'react';
import { Users, FolderTree, RefreshCw } from 'lucide-react';
import { adminOrganizationsApi, OrganizationUser, DepartmentNode } from '../../api/adminOrganizations';
import { useAuthStore } from '../../stores/authStore';
import { UserListTable } from './UserListTable';
import { UserDetailModal, EditUserModal } from './UserDetailModal';
import { DepartmentTree } from './DepartmentTree';

export function UserManagement() {
  const currentUser = useAuthStore((s) => s.user);
  const [users, setUsers] = useState<OrganizationUser[]>([]);
  const [departments, setDepartments] = useState<DepartmentNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState<OrganizationUser | null>(null);
  const [editingUser, setEditingUser] = useState<OrganizationUser | null>(null);
  const [editDepartmentId, setEditDepartmentId] = useState<string | null>(null);
  const [showUserDetail, setShowUserDetail] = useState(false);
  // Tab 切换 + 组织管理状态
  const [activeTab, setActiveTab] = useState<'users' | 'org'>('users');
  const [newDeptName, setNewDeptName] = useState('');
  const [newDeptCode, setNewDeptCode] = useState('');
  const [newDeptParentId, setNewDeptParentId] = useState<string | null>(null);
  const [editingDept, setEditingDept] = useState<DepartmentNode | null>(null);
  const [editDeptName, setEditDeptName] = useState('');
  const [editDeptCode, setEditDeptCode] = useState('');

  useEffect(() => {
    loadUsers();
    loadDepartments();
  }, []);

  async function loadDepartments() {
    try {
      const data = await adminOrganizationsApi.departments();
      setDepartments(data);
    } catch (e) {
      console.error('加载组织列表失败:', e);
    }
  }

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
    setEditDepartmentId(user.primaryDepartmentId || null);
  }

  async function handleSaveEdit() {
    if (!editingUser) return;

    try {
      // 更新用户角色/状态
      await adminOrganizationsApi.updateUser(editingUser.id, {
        role: editingUser.role,
        status: editingUser.status,
        avatar: editingUser.avatar
      });

      // 更新组织架构归属
      if (editDepartmentId !== editingUser.primaryDepartmentId) {
        await adminOrganizationsApi.assignUserDepartment(editingUser.id, editDepartmentId);
      }

      // 刷新列表
      loadUsers();
      setEditingUser(null);
    // [2026-05-24] 类型安全
    } catch (e: unknown) {
      alert(`更新失败: ${e instanceof Error ? e.message : '未知错误'}`);
    }
  }

  // 实现删除用户功能
  async function handleDelete(id: string) {
    const user = users.find(u => u.id === id);
    if (!user) return;
    if (user.role === 'super_admin') {
      alert('不能删除超级管理员');
      return;
    }
    if (!confirm(`确定删除用户「${user.username}」？\n此操作将删除该用户的所有数据（会话、智能体、微信绑定等），不可恢复。`)) return;
    try {
      await adminOrganizationsApi.deleteUser(id);
      loadUsers();
    // [2026-05-24] 类型安全
    } catch (e: unknown) {
      alert(`删除失败: ${e instanceof Error ? e.message : '未知错误'}`);
    }
  }

  async function handleViewPermissions(userId: string) {
    try {
      await adminOrganizationsApi.userPermissions(userId);
      setSelectedUser(users.find(u => u.id === userId) || null);
      setShowUserDetail(true);
    // [2026-05-24] 类型安全
    } catch (e: unknown) {
      alert(`获取权限信息失败: ${e instanceof Error ? e.message : '未知错误'}`);
    }
  }

  // 组织架构管理方法
  async function handleCreateDept() {
    if (!newDeptName.trim()) { alert('请输入部门名称'); return; }
    try {
      await adminOrganizationsApi.createDepartment({
        name: newDeptName.trim(),
        departmentCode: newDeptCode.trim() || undefined,
        parentId: newDeptParentId || undefined,
      });
      setNewDeptName('');
      setNewDeptCode('');
      setNewDeptParentId(null);
      loadDepartments();
    // [2026-05-24] 类型安全
    } catch (e: unknown) {
      alert(`创建失败: ${e instanceof Error ? e.message : '未知错误'}`);
    }
  }

  async function handleUpdateDept() {
    if (!editingDept) return;
    try {
      await adminOrganizationsApi.updateDepartment(editingDept.id, {
        name: editDeptName.trim() || undefined,
        departmentCode: editDeptCode.trim() || undefined,
      });
      setEditingDept(null);
      loadDepartments();
    // [2026-05-24] 类型安全
    } catch (e: unknown) {
      alert(`更新失败: ${e instanceof Error ? e.message : '未知错误'}`);
    }
  }

  async function handleDeleteDept(id: string, name: string) {
    if (!confirm(`确定删除部门「${name}」？`)) return;
    try {
      await adminOrganizationsApi.deleteDepartment(id);
      loadDepartments();
    // [2026-05-24] 类型安全
    } catch (e: unknown) {
      alert(`删除失败: ${e instanceof Error ? e.message : '未知错误'}`);
    }
  }

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
          <Users size={20} color="#d97706" /> 用户与组织管理
        </h2>
        <button
          onClick={() => { loadUsers(); loadDepartments(); }}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, background: '#f3f4f6', color: '#374151', border: '1px solid #e5e7eb', cursor: 'pointer', fontSize: 13 }}
        >
          <RefreshCw size={14} /> 刷新
        </button>
      </div>

      {/* Tab 切换 */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: '2px solid #e5e7eb' }}>
        <button
          onClick={() => setActiveTab('users')}
          style={{ padding: '10px 20px', fontSize: 14, fontWeight: activeTab === 'users' ? 600 : 400, color: activeTab === 'users' ? '#d97706' : '#6b7280', background: 'none', border: 'none', borderBottom: activeTab === 'users' ? '2px solid #d97706' : '2px solid transparent', marginBottom: -2, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <Users size={15} /> 用户管理
        </button>
        <button
          onClick={() => setActiveTab('org')}
          style={{ padding: '10px 20px', fontSize: 14, fontWeight: activeTab === 'org' ? 600 : 400, color: activeTab === 'org' ? '#d97706' : '#6b7280', background: 'none', border: 'none', borderBottom: activeTab === 'org' ? '2px solid #d97706' : '2px solid transparent', marginBottom: -2, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <FolderTree size={15} /> 组织架构
        </button>
      </div>

      {activeTab === 'users' && (<>
        <UserListTable
          users={users}
          search={search}
          onSearchChange={setSearch}
          onViewPermissions={handleViewPermissions}
          onEdit={handleEdit}
          onDelete={handleDelete}
          canEdit={currentUser?.role === 'super_admin'}
        />

        {/* 用户详情模态框 */}
        {showUserDetail && selectedUser && (
          <UserDetailModal
            user={selectedUser}
            onClose={() => setShowUserDetail(false)}
          />
        )}

        {/* 编辑用户模态框 */}
        {editingUser && (
          <EditUserModal
            user={editingUser}
            departments={departments}
            editDepartmentId={editDepartmentId}
            onDepartmentChange={setEditDepartmentId}
            onRoleChange={(role) => setEditingUser({ ...editingUser, role })}
            onStatusChange={(status) => setEditingUser({ ...editingUser, status })}
            onSave={handleSaveEdit}
            onCancel={() => setEditingUser(null)}
          />
        )}
      </>)}

      {/* 组织架构 Tab */}
      {activeTab === 'org' && (
        <DepartmentTree
          departments={departments}
          users={users}
          newDeptName={newDeptName}
          newDeptCode={newDeptCode}
          newDeptParentId={newDeptParentId}
          editingDept={editingDept}
          editDeptName={editDeptName}
          editDeptCode={editDeptCode}
          onNewDeptNameChange={setNewDeptName}
          onNewDeptCodeChange={setNewDeptCode}
          onNewDeptParentIdChange={setNewDeptParentId}
          onCreateDept={handleCreateDept}
          onUpdateDept={handleUpdateDept}
          onDeleteDept={handleDeleteDept}
          onEditDept={(dept) => { setEditingDept(dept); setEditDeptName(dept.name); setEditDeptCode(dept.departmentCode || ''); }}
          onEditDeptNameChange={setEditDeptName}
          onEditDeptCodeChange={setEditDeptCode}
          onCancelEditDept={() => setEditingDept(null)}
        />
      )}
    </div>
  );
}
