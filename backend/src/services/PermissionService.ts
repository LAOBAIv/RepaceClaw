import { getDb } from "../db/client";

export interface UserPermissionScope {
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
}

export interface UserProxyGrant {
  id: string;
  agentId: string;
  grantType: string;
  scopeType: string;
  scopeId: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserDataGrant {
  id: string;
  resourceType: string;
  resourceId: string;
  grantType: string;
  scopeType: string;
  scopeId: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
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
  scopes: UserPermissionScope[];
  proxyGrants: UserProxyGrant[];
  dataGrants: UserDataGrant[];
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

const DEFAULT_LAYER_PERMISSIONS: Record<string, any> = {
  organization: {
    read: true,
    write: true,
  },
  department: {
    read: true,
    write: true,
  },
  member: {
    read: true,
    assignPrimaryDepartment: true,
  },
  role: {
    read: true,
  },
  permissionTemplate: {
    read: true,
  },
  agent: {
    useShared: true,
  },
  data: {
    readScoped: true,
  },
};

function execRows(db: any, sql: string, params: any[] = []): any[] {
  const result = db.exec(sql, params);
  if (!result.length) return [];
  const cols = result[0].columns;
  return result[0].values.map((row: any[]) => {
    const obj: any = {};
    cols.forEach((c: string, i: number) => {
      obj[c] = row[i];
    });
    return obj;
  });
}

function isPlainObject(value: any): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJsonObject(raw: any): Record<string, any> {
  if (!raw) return {};
  if (isPlainObject(raw)) return raw;
  try {
    const parsed = JSON.parse(String(raw));
    return isPlainObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function deepMerge(base: Record<string, any>, patch: Record<string, any>): Record<string, any> {
  const output: Record<string, any> = { ...base };

  for (const [key, value] of Object.entries(patch)) {
    if (isPlainObject(value) && isPlainObject(output[key])) {
      output[key] = deepMerge(output[key], value);
    } else if (isPlainObject(value)) {
      output[key] = deepMerge({}, value);
    } else {
      output[key] = value;
    }
  }

  return output;
}

export class PermissionService {
  static listUserScopes(userId: string): UserPermissionScope[] {
    const db = getDb();
    const rows = execRows(
      db,
      `SELECT
         uos.id,
         uos.department_id,
         d.name AS department_name,
         d.department_code,
         uos.role_id,
         r.name AS role_name,
         r.role_code,
         r.permissions_json,
         uos.permission_template_id,
         pt.name AS permission_template_name,
         pt.template_code,
         pt.config_json,
         uos.title,
         uos.is_primary,
         uos.status,
         uos.joined_at
       FROM user_org_scope uos
       LEFT JOIN departments d ON d.id = uos.department_id
       LEFT JOIN roles r ON r.id = uos.role_id
       LEFT JOIN permission_templates pt ON pt.id = uos.permission_template_id
       WHERE uos.user_id = ? AND uos.status = 'active'
       ORDER BY uos.is_primary DESC, uos.created_at ASC`,
      [userId]
    );

    return rows.map((row) => ({
      id: String(row.id),
      departmentId: row.department_id ? String(row.department_id) : null,
      departmentName: row.department_name ? String(row.department_name) : null,
      departmentCode: row.department_code ? String(row.department_code) : null,
      roleId: row.role_id ? String(row.role_id) : null,
      roleName: row.role_name ? String(row.role_name) : null,
      roleCode: row.role_code ? String(row.role_code) : null,
      permissionTemplateId: row.permission_template_id ? String(row.permission_template_id) : null,
      permissionTemplateName: row.permission_template_name ? String(row.permission_template_name) : null,
      permissionTemplateCode: row.template_code ? String(row.template_code) : null,
      title: String(row.title || ""),
      isPrimary: Number(row.is_primary || 0) === 1,
      status: String(row.status || "active"),
      joinedAt: String(row.joined_at || ""),
      rolePermissions: parseJsonObject(row.permissions_json),
      templateConfig: parseJsonObject(row.config_json),
    }));
  }

  static getUserPermissionSummary(userId: string): UserPermissionSummary | null {
    const db = getDb();
    const userRows = execRows(
      db,
      `SELECT id, user_code, username, email, role, status
       FROM users
       WHERE id = ?
       LIMIT 1`,
      [userId]
    );

    if (!userRows.length) return null;

    const user = userRows[0];
    const scopes = this.listUserScopes(userId);

    const proxyGrants = execRows(
      db,
      `SELECT id, agent_id, grant_type, scope_type, scope_id, created_by, created_at, updated_at
       FROM user_proxy_grants
       WHERE user_id = ?
       ORDER BY created_at DESC`,
      [userId]
    ).map((row) => ({
      id: String(row.id),
      agentId: String(row.agent_id || ""),
      grantType: String(row.grant_type || ""),
      scopeType: String(row.scope_type || ""),
      scopeId: String(row.scope_id || ""),
      createdBy: String(row.created_by || ""),
      createdAt: String(row.created_at || ""),
      updatedAt: String(row.updated_at || ""),
    }));

    const dataGrants = execRows(
      db,
      `SELECT id, resource_type, resource_id, grant_type, scope_type, scope_id, created_by, created_at, updated_at
       FROM user_data_grants
       WHERE user_id = ?
       ORDER BY created_at DESC`,
      [userId]
    ).map((row) => ({
      id: String(row.id),
      resourceType: String(row.resource_type || ""),
      resourceId: String(row.resource_id || ""),
      grantType: String(row.grant_type || ""),
      scopeType: String(row.scope_type || ""),
      scopeId: String(row.scope_id || ""),
      createdBy: String(row.created_by || ""),
      createdAt: String(row.created_at || ""),
      updatedAt: String(row.updated_at || ""),
    }));

    const hasOrgScope = scopes.length > 0;
    const isPlatformAdmin = ["super_admin", "admin"].includes(String(user.role || "user"));

    let mergedPermissions: Record<string, any> = hasOrgScope ? deepMerge({}, DEFAULT_LAYER_PERMISSIONS) : {};
    const source = hasOrgScope ? ["default:org-layer-same-permissions"] : [];

    for (const scope of scopes) {
      if (Object.keys(scope.rolePermissions).length > 0) {
        mergedPermissions = deepMerge(mergedPermissions, scope.rolePermissions);
        if (scope.roleId) source.push(`role:${scope.roleId}`);
      }
      if (Object.keys(scope.templateConfig).length > 0) {
        mergedPermissions = deepMerge(mergedPermissions, scope.templateConfig);
        if (scope.permissionTemplateId) source.push(`template:${scope.permissionTemplateId}`);
      }
    }

    const primaryScope = scopes.find((item) => item.isPrimary && item.departmentId);

    return {
      stage: "v1-baseline-same-permissions",
      user: {
        id: String(user.id),
        userCode: String(user.user_code || ""),
        username: String(user.username || ""),
        email: String(user.email || ""),
        role: String(user.role || "user"),
        status: String(user.status || "active"),
      },
      primaryDepartment: primaryScope?.departmentId
        ? {
            id: primaryScope.departmentId,
            name: primaryScope.departmentName || "",
            code: primaryScope.departmentCode || "",
          }
        : null,
      scopes,
      proxyGrants,
      dataGrants,
      effectivePermissions: {
        source,
        raw: mergedPermissions,
        flags: {
          canViewOrganization: isPlatformAdmin || hasOrgScope,
          canEditOrganization: isPlatformAdmin || hasOrgScope,
          canAssignPrimaryDepartment: isPlatformAdmin || hasOrgScope,
          canUseGrantedAgent: isPlatformAdmin || hasOrgScope || proxyGrants.length > 0,
          canReadGrantedData: isPlatformAdmin || hasOrgScope || dataGrants.length > 0,
        },
      },
    };
  }
}
