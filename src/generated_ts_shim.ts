// Type shim for shared DTOs. Lets msw 仓 avoid type-checking the entire
// orval-generated api-client (which has implicit-any issues from React Query
// hooks that aren't relevant for MSW handlers).
// Keep in sync with @saas/identity-platform-shared's openapi.yaml.

export type TenantStatus = "active" | "suspended" | "archived";

export interface TenantSettings {
  themeColor?: string;
  locale?: string;
  maxUsers?: number;
}

export interface Tenant {
  id: string;
  code: string;
  name: string;
  status: TenantStatus;
  settings?: TenantSettings;
  createdAt: string;
  updatedAt: string;
}

export type UserStatus = "active" | "invited" | "suspended" | "disabled";

export interface User {
  id: string;
  tenantId: string;
  username: string;
  email: string;
  displayName?: string;
  status: UserStatus;
  roleIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Role {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  description?: string;
  permissionIds: string[];
  createdAt: string;
  updatedAt: string;
}

export type ApiKeyStatus = "active" | "revoked" | "expired";

export interface ApiKey {
  id: string;
  tenantId: string;
  name: string;
  prefix: string;
  status: ApiKeyStatus;
  scopes: string[];
  createdAt: string;
  lastUsedAt?: string;
  expiresAt?: string;
  revokedAt?: string;
}

export type AuditAction =
  | "user_created"
  | "user_updated"
  | "user_deleted"
  | "role_assigned"
  | "role_revoked"
  | "login_success"
  | "login_failed"
  | "oauth_token_issued"
  | "api_key_created"
  | "api_key_revoked";

export interface AuditEvent {
  id: string;
  tenantId: string;
  actorUserId?: string;
  action: AuditAction;
  targetUserId?: string;
  metadata?: Record<string, unknown>;
  occurredAt: string;
}

export type MembershipStatus = "active" | "invited" | "removed";

export interface TenantMembership {
  id: string;
  userId: string;
  tenantId: string;
  roleIds: string[];
  status: MembershipStatus;
  joinedAt: string;
}

// === M04 — Apps (platform-level; unified OAuth client + menu host) ===
export type AppStatus = "active" | "disabled";
export type OAuthGrantType =
  | "authorization_code"
  | "refresh_token"
  | "client_credentials"
  | "password";

export interface App {
  id: string;
  code: string;
  name: string;
  description?: string;
  icon?: string;
  sortOrder: number;
  status: AppStatus;
  clientId: string;
  clientSecret?: string;
  redirectUris: string[];
  scopes: string[];
  grantTypes: OAuthGrantType[];
  isFirstParty: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAppRequest {
  code: string;
  name: string;
  description?: string;
  icon?: string;
  sortOrder?: number;
  status?: AppStatus;
  clientId: string;
  clientSecret?: string;
  redirectUris: string[];
  scopes?: string[];
  grantTypes?: OAuthGrantType[];
  isFirstParty?: boolean;
}

export interface UpdateAppRequest {
  name?: string;
  description?: string;
  icon?: string;
  sortOrder?: number;
  status?: AppStatus;
  redirectUris?: string[];
  scopes?: string[];
  grantTypes?: OAuthGrantType[];
  isFirstParty?: boolean;
}

// === M08 — Menus (nested under an App) ===
export type MenuType = "group" | "page" | "action";
export type MenuStatus = "active" | "disabled";

export interface Menu {
  id: string;
  appId: string;
  parentId?: string;
  code: string;
  name: string;
  path?: string;
  icon?: string;
  type: MenuType;
  sortOrder: number;
  status: MenuStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMenuRequest {
  parentId?: string;
  code: string;
  name: string;
  path?: string;
  icon?: string;
  type?: MenuType;
  sortOrder?: number;
  status?: MenuStatus;
}

export interface UpdateMenuRequest {
  parentId?: string;
  name?: string;
  path?: string;
  icon?: string;
  type?: MenuType;
  sortOrder?: number;
  status?: MenuStatus;
}

export interface ReorderMenuRequest {
  orderedMenuIds: string[];
}

// === M09 — Role ↔ Menu grant ===
export interface RoleMenuGrant {
  roleId: string;
  menuIds: string[];
  updatedAt: string;
}

export interface SetRoleMenusRequest {
  menuIds: string[];
}

export interface EffectiveMenuNode {
  id: string;
  appId: string;
  parentId?: string;
  code: string;
  name: string;
  path?: string;
  icon?: string;
  type: MenuType;
  sortOrder: number;
  children: EffectiveMenuNode[];
}