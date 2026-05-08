import apiClient from "./client";

type UserRole = "super_admin" | "admin" | "user";

export interface DepartmentNode {
  id: string;
  departmentCode: string;
  name: string;
  parentId: string | null;
  ownerUserId: string;
  description: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  userCount: number;
  children: DepartmentNode[];
}

export interface OrganizationUser {
  id: string;
  userCode?: string;
  username: string;
  email: string;
  role: "super_admin" | "admin" | "user";
  status: string;
  avatar: string;
  lastLoginAt: string;
  createdAt: string;
  updatedAt: string;
  primaryDepartmentId: string | null;
  primaryDepartmentName: string | null;
  primaryDepartmentCode: string | null;
}

export interface UserPermissionSummary {
  stage: string;
  user: {
    id: string;
    userCode: string;
    username: string;
    email: string;
    role: string;
    status: string;
  };
  primaryDepartment: {
    id: string;
    name: string;
    code: string;
  } | null;
  scopes: Array<{
    id: string;
    departmentId: string | null;
    departmentName: string | null;
    departmentCode: string | null;
    roleId: string | null;
    roleName: string | null;
    roleCode: string | null;
    permissionTemplateId: string | null;
    permissionTemplateName: string | null;
    permissionTemplateCode: string | null;
    title: string;
    isPrimary: boolean;
    status: string;
    joinedAt: string;
    rolePermissions: Record<string, any>;
    templateConfig: Record<string, any>;
  }>;
  proxyGrants: Array<{
    id: string;
    agentId: string;
    grantType: string;
    scopeType: string;
    scopeId: string;
    createdBy: string;
    createdAt: string;
    updatedAt: string;
  }>;
  dataGrants: Array<{
    id: string;
    resourceType: string;
    resourceId: string;
    grantType: string;
    scopeType: string;
    scopeId: string;
    createdBy: string;
    createdAt: string;
    updatedAt: string;
  }>;
  effectivePermissions: {
    source: string[];
    raw: Record<string, any>;
    flags: {
      canViewOrganization: boolean;
      canEditOrganization: boolean;
      canAssignPrimaryDepartment: boolean;
      canUseGrantedAgent: boolean;
      canReadGrantedData: boolean;
    };
  };
}

export const adminOrganizationsApi = {
  async tree(): Promise<DepartmentNode[]> {
    const res = await apiClient.get("/admin/organizations/tree");
    return res.data.data || [];
  },

  async departments(): Promise<DepartmentNode[]> {
    const res = await apiClient.get("/admin/organizations/departments");
    return res.data.data || [];
  },

  async createDepartment(data: {
    name: string;
    parentId?: string | null;
    ownerUserId?: string;
    description?: string;
    status?: "active" | "disabled";
  }): Promise<DepartmentNode> {
    const res = await apiClient.post("/admin/organizations/departments", data);
    return res.data.data;
  },

  async updateDepartment(
    id: string,
    data: {
      name?: string;
      parentId?: string | null;
      ownerUserId?: string;
      description?: string;
      status?: "active" | "disabled";
    }
  ): Promise<DepartmentNode> {
    const res = await apiClient.put(`/admin/organizations/departments/${id}`, data);
    return res.data.data;
  },

  async deleteDepartment(id: string): Promise<void> {
    await apiClient.delete(`/admin/organizations/departments/${id}`);
  },

  async users(): Promise<OrganizationUser[]> {
    const res = await apiClient.get("/admin/organizations/users");
    return res.data.data || [];
  },

  async assignUserDepartment(userId: string, departmentId: string | null): Promise<OrganizationUser> {
    const res = await apiClient.put(`/admin/organizations/users/${userId}/department`, { departmentId });
    return res.data.data;
  },

  async updateUser(userId: string, data: { role?: UserRole; status?: string; avatar?: string }): Promise<OrganizationUser> {
    const res = await apiClient.put(`/admin/organizations/users/${userId}`, data);
    return res.data.data;
  },

  async userPermissions(userId: string): Promise<UserPermissionSummary> {
    const res = await apiClient.get(`/admin/organizations/users/${userId}/permissions`);
    return res.data.data;
  },
};
