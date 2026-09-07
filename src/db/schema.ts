import { pgTable, uniqueIndex, uuid, varchar, text, integer, boolean, timestamp, index, foreignKey, check, jsonb, primaryKey, pgEnum } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const apiKeyStatus = pgEnum("api_key_status", ['active', 'revoked', 'expired'])
export const appStatus = pgEnum("app_status", ['active', 'disabled'])
export const auditAction = pgEnum("audit_action", ['user_created', 'user_updated', 'user_deleted', 'role_assigned', 'role_revoked', 'login_success', 'login_failed', 'oauth_token_issued', 'api_key_created', 'api_key_revoked'])
export const membershipStatus = pgEnum("membership_status", ['active', 'invited', 'removed'])
export const menuStatus = pgEnum("menu_status", ['active', 'disabled'])
export const menuType = pgEnum("menu_type", ['group', 'page', 'action'])
export const oauthGrantType = pgEnum("oauth_grant_type", ['authorization_code', 'refresh_token', 'client_credentials', 'password'])
export const tenantStatus = pgEnum("tenant_status", ['active', 'suspended', 'archived'])
export const userStatus = pgEnum("user_status", ['active', 'invited', 'suspended', 'disabled'])


export const apps = pgTable("apps", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	code: varchar({ length: 64 }).notNull(),
	name: varchar({ length: 255 }).notNull(),
	description: text(),
	icon: varchar({ length: 64 }),
	sortOrder: integer("sort_order").default(0).notNull(),
	status: appStatus().default('active').notNull(),
	clientId: varchar("client_id", { length: 128 }).notNull(),
	clientSecretHash: varchar("client_secret_hash", { length: 255 }),
	redirectUris: text("redirect_uris").array().default(["RAY"]).notNull(),
	scopes: text().array().default(["RAY"]).notNull(),
	grantTypes: oauthGrantType("grant_types").array().default(["RAY"]).notNull(),
	isFirstParty: boolean("is_first_party").default(false).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => {
	return {
		clientIdUnique: uniqueIndex("apps_client_id_unique").using("btree", table.clientId.asc().nullsLast().op("text_ops")),
		codeUnique: uniqueIndex("apps_code_unique").using("btree", table.code.asc().nullsLast().op("text_ops")),
	}
});

export const auditEvents = pgTable("audit_events", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	tenantId: uuid("tenant_id").notNull(),
	actorUserId: uuid("actor_user_id"),
	action: auditAction().notNull(),
	targetUserId: uuid("target_user_id"),
	metadata: jsonb().default({}).notNull(),
	occurredAt: timestamp("occurred_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => {
	return {
		idxAuditEventsAction: index("idx_audit_events_action").using("btree", table.action.asc().nullsLast().op("enum_ops")),
		idxAuditEventsActor: index("idx_audit_events_actor").using("btree", table.actorUserId.asc().nullsLast().op("uuid_ops")),
		idxAuditEventsMetadataGin: index("idx_audit_events_metadata_gin").using("gin", table.metadata.asc().nullsLast().op("jsonb_ops")),
		idxAuditEventsTarget: index("idx_audit_events_target").using("btree", table.targetUserId.asc().nullsLast().op("uuid_ops")),
		idxAuditEventsTenantOccurred: index("idx_audit_events_tenant_occurred").using("btree", table.tenantId.asc().nullsLast().op("uuid_ops"), table.occurredAt.desc().nullsLast().op("uuid_ops")),
		auditEventsTenantIdTenantsIdFk: foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenants.id],
			name: "audit_events_tenant_id_tenants_id_fk"
		}).onDelete("cascade"),
		auditEventsActorUserIdUsersIdFk: foreignKey({
			columns: [table.actorUserId],
			foreignColumns: [users.id],
			name: "audit_events_actor_user_id_users_id_fk"
		}).onDelete("set null"),
		auditEventsTargetUserIdUsersIdFk: foreignKey({
			columns: [table.targetUserId],
			foreignColumns: [users.id],
			name: "audit_events_target_user_id_users_id_fk"
		}).onDelete("set null"),
		auditEventsMetadataIsObject: check("audit_events_metadata_is_object", sql`(metadata IS NOT NULL) AND (jsonb_typeof(metadata) = 'object'::text)`),
	}
});

export const roles = pgTable("roles", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	tenantId: uuid("tenant_id").notNull(),
	code: varchar({ length: 64 }).notNull(),
	name: varchar({ length: 255 }).notNull(),
	description: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => {
	return {
		idxRolesCodeGlobal: index("idx_roles_code_global").using("btree", table.code.asc().nullsLast().op("text_ops")),
		idxRolesTenantId: index("idx_roles_tenant_id").using("btree", table.tenantId.asc().nullsLast().op("uuid_ops")),
		tenantCodeUnique: uniqueIndex("roles_tenant_code_unique").using("btree", table.tenantId.asc().nullsLast().op("uuid_ops"), table.code.asc().nullsLast().op("uuid_ops")),
		rolesTenantIdTenantsIdFk: foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenants.id],
			name: "roles_tenant_id_tenants_id_fk"
		}).onDelete("cascade"),
	}
});

export const auditRetentionPolicies = pgTable("audit_retention_policies", {
	tenantId: uuid("tenant_id").primaryKey().notNull(),
	retentionDays: integer("retention_days").default(90).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => {
	return {
		auditRetentionPoliciesTenantIdTenantsIdFk: foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenants.id],
			name: "audit_retention_policies_tenant_id_tenants_id_fk"
		}).onDelete("cascade"),
		auditRetentionDaysPositive: check("audit_retention_days_positive", sql`(retention_days >= 1) AND (retention_days <= 3650)`),
	}
});

export const roleMenuGrants = pgTable("role_menu_grants", {
	roleId: uuid("role_id").primaryKey().notNull(),
	tenantId: uuid("tenant_id").notNull(),
	menuIds: uuid("menu_ids").array().default(["RAY"]).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => {
	return {
		idxRoleMenuGrantsMenuIdsGin: index("idx_role_menu_grants_menu_ids_gin").using("gin", table.menuIds.asc().nullsLast().op("array_ops")),
		idxRoleMenuGrantsTenantId: index("idx_role_menu_grants_tenant_id").using("btree", table.tenantId.asc().nullsLast().op("uuid_ops")),
		roleMenuGrantsRoleIdRolesIdFk: foreignKey({
			columns: [table.roleId],
			foreignColumns: [roles.id],
			name: "role_menu_grants_role_id_roles_id_fk"
		}).onDelete("cascade"),
		roleMenuGrantsTenantIdTenantsIdFk: foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenants.id],
			name: "role_menu_grants_tenant_id_tenants_id_fk"
		}).onDelete("cascade"),
	}
});

export const tenantMemberships = pgTable("tenant_memberships", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	userId: uuid("user_id").notNull(),
	tenantId: uuid("tenant_id").notNull(),
	roleIds: uuid("role_ids").array().default(["RAY"]).notNull(),
	status: membershipStatus().default('invited').notNull(),
	joinedAt: timestamp("joined_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => {
	return {
		idxMembershipsRoleIdsGin: index("idx_memberships_role_ids_gin").using("gin", table.roleIds.asc().nullsLast().op("array_ops")),
		idxMembershipsTenantId: index("idx_memberships_tenant_id").using("btree", table.tenantId.asc().nullsLast().op("uuid_ops")),
		idxMembershipsUserId: index("idx_memberships_user_id").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
		membershipsUserTenantUnique: uniqueIndex("memberships_user_tenant_unique").using("btree", table.userId.asc().nullsLast().op("uuid_ops"), table.tenantId.asc().nullsLast().op("uuid_ops")),
		tenantMembershipsUserIdUsersIdFk: foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "tenant_memberships_user_id_users_id_fk"
		}).onDelete("cascade"),
		tenantMembershipsTenantIdTenantsIdFk: foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenants.id],
			name: "tenant_memberships_tenant_id_tenants_id_fk"
		}).onDelete("cascade"),
	}
});

export const permissions = pgTable("permissions", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	code: varchar({ length: 128 }).notNull(),
	name: varchar({ length: 255 }).notNull(),
	description: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => {
	return {
		codeUnique: uniqueIndex("permissions_code_unique").using("btree", table.code.asc().nullsLast().op("text_ops")),
	}
});

export const tenants = pgTable("tenants", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	code: varchar({ length: 64 }).notNull(),
	name: varchar({ length: 255 }).notNull(),
	status: tenantStatus().default('active').notNull(),
	settings: jsonb().default({}).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => {
	return {
		codeUnique: uniqueIndex("tenants_code_unique").using("btree", table.code.asc().nullsLast().op("text_ops")),
		tenantsSettingsIsObject: check("tenants_settings_is_object", sql`(settings IS NOT NULL) AND (jsonb_typeof(settings) = 'object'::text)`),
	}
});

export const menus = pgTable("menus", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	appId: uuid("app_id").notNull(),
	parentId: uuid("parent_id"),
	code: varchar({ length: 64 }).notNull(),
	name: varchar({ length: 255 }).notNull(),
	path: varchar({ length: 512 }),
	icon: varchar({ length: 64 }),
	type: menuType().default('page').notNull(),
	sortOrder: integer("sort_order").default(0).notNull(),
	status: menuStatus().default('active').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => {
	return {
		idxMenusAppId: index("idx_menus_app_id").using("btree", table.appId.asc().nullsLast().op("uuid_ops")),
		idxMenusAppType: index("idx_menus_app_type").using("btree", table.appId.asc().nullsLast().op("enum_ops"), table.type.asc().nullsLast().op("enum_ops")),
		idxMenusParentId: index("idx_menus_parent_id").using("btree", table.parentId.asc().nullsLast().op("uuid_ops")),
		appCodeUnique: uniqueIndex("menus_app_code_unique").using("btree", table.appId.asc().nullsLast().op("uuid_ops"), table.code.asc().nullsLast().op("text_ops")),
		menusAppIdAppsIdFk: foreignKey({
			columns: [table.appId],
			foreignColumns: [apps.id],
			name: "menus_app_id_apps_id_fk"
		}).onDelete("cascade"),
		menusParentIdMenusIdFk: foreignKey({
			columns: [table.parentId],
			foreignColumns: [table.id],
			name: "menus_parent_id_menus_id_fk"
		}).onDelete("cascade"),
	}
});

export const apiKeys = pgTable("api_keys", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	tenantId: uuid("tenant_id").notNull(),
	name: varchar({ length: 128 }).notNull(),
	prefix: varchar({ length: 16 }).notNull(),
	secretHash: varchar("secret_hash", { length: 255 }).notNull(),
	status: apiKeyStatus().default('active').notNull(),
	scopes: text().array().default(["RAY"]).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	lastUsedAt: timestamp("last_used_at", { withTimezone: true, mode: 'string' }),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'string' }),
	revokedAt: timestamp("revoked_at", { withTimezone: true, mode: 'string' }),
}, (table) => {
	return {
		tenantPrefixUnique: uniqueIndex("api_keys_tenant_prefix_unique").using("btree", table.tenantId.asc().nullsLast().op("uuid_ops"), table.prefix.asc().nullsLast().op("uuid_ops")),
		idxApiKeysExpiresAt: index("idx_api_keys_expires_at").using("btree", table.expiresAt.asc().nullsLast().op("timestamptz_ops")),
		idxApiKeysPrefixGlobal: index("idx_api_keys_prefix_global").using("btree", table.prefix.asc().nullsLast().op("text_ops")),
		idxApiKeysStatus: index("idx_api_keys_status").using("btree", table.status.asc().nullsLast().op("enum_ops")),
		idxApiKeysTenantId: index("idx_api_keys_tenant_id").using("btree", table.tenantId.asc().nullsLast().op("uuid_ops")),
		apiKeysTenantIdTenantsIdFk: foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenants.id],
			name: "api_keys_tenant_id_tenants_id_fk"
		}).onDelete("cascade"),
		apiKeysRevokedAtConsistency: check("api_keys_revoked_at_consistency", sql`((status = 'revoked'::api_key_status) AND (revoked_at IS NOT NULL)) OR (status <> 'revoked'::api_key_status)`),
	}
});

export const users = pgTable("users", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	tenantId: uuid("tenant_id").notNull(),
	username: varchar({ length: 64 }).notNull(),
	email: varchar({ length: 255 }).notNull(),
	displayName: varchar("display_name", { length: 255 }),
	status: userStatus().default('invited').notNull(),
	passwordHash: varchar("password_hash", { length: 255 }),
	roleIds: uuid("role_ids").array().default(["RAY"]).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => {
	return {
		idxUsersEmailGlobal: index("idx_users_email_global").using("btree", table.email.asc().nullsLast().op("text_ops")),
		idxUsersTenantId: index("idx_users_tenant_id").using("btree", table.tenantId.asc().nullsLast().op("uuid_ops")),
		tenantEmailUnique: uniqueIndex("users_tenant_email_unique").using("btree", table.tenantId.asc().nullsLast().op("text_ops"), table.email.asc().nullsLast().op("uuid_ops")),
		tenantUsernameUnique: uniqueIndex("users_tenant_username_unique").using("btree", table.tenantId.asc().nullsLast().op("uuid_ops"), table.username.asc().nullsLast().op("text_ops")),
		usersTenantIdTenantsIdFk: foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenants.id],
			name: "users_tenant_id_tenants_id_fk"
		}).onDelete("cascade"),
		usersEmailFormat: check("users_email_format", sql`(email)::text ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'::text`),
	}
});

export const oauthCodes = pgTable("oauth_codes", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	code: varchar({ length: 255 }).notNull(),
	grantType: varchar("grant_type", { length: 32 }).default('authorization_code').notNull(),
	appId: uuid("app_id").notNull(),
	userId: uuid("user_id"),
	tenantId: uuid("tenant_id").notNull(),
	redirectUri: varchar("redirect_uri", { length: 2048 }),
	scope: varchar({ length: 512 }),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'string' }).notNull(),
	consumedAt: timestamp("consumed_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => {
	return {
		idxOauthCodesAppId: index("idx_oauth_codes_app_id").using("btree", table.appId.asc().nullsLast().op("uuid_ops")),
		idxOauthCodesExpiresAt: index("idx_oauth_codes_expires_at").using("btree", table.expiresAt.asc().nullsLast().op("timestamptz_ops")),
		idxOauthCodesUserId: index("idx_oauth_codes_user_id").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
		codeUnique: uniqueIndex("oauth_codes_code_unique").using("btree", table.code.asc().nullsLast().op("text_ops")),
		oauthCodesAppIdAppsIdFk: foreignKey({
			columns: [table.appId],
			foreignColumns: [apps.id],
			name: "oauth_codes_app_id_apps_id_fk"
		}).onDelete("cascade"),
		oauthCodesGrantTypeCheck: check("oauth_codes_grant_type_check", sql`(grant_type)::text = ANY ((ARRAY['authorization_code'::character varying, 'refresh_token'::character varying])::text[])`),
	}
});

export const rolePermissions = pgTable("role_permissions", {
	roleId: uuid("role_id").notNull(),
	permissionId: uuid("permission_id").notNull(),
	grantedAt: timestamp("granted_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => {
	return {
		idxRolePermissionsPermissionId: index("idx_role_permissions_permission_id").using("btree", table.permissionId.asc().nullsLast().op("uuid_ops")),
		idxRolePermissionsRoleId: index("idx_role_permissions_role_id").using("btree", table.roleId.asc().nullsLast().op("uuid_ops")),
		rolePermissionsRoleIdRolesIdFk: foreignKey({
			columns: [table.roleId],
			foreignColumns: [roles.id],
			name: "role_permissions_role_id_roles_id_fk"
		}).onDelete("cascade"),
		rolePermissionsPermissionIdPermissionsIdFk: foreignKey({
			columns: [table.permissionId],
			foreignColumns: [permissions.id],
			name: "role_permissions_permission_id_permissions_id_fk"
		}).onDelete("cascade"),
		rolePermissionsRoleIdPermissionIdPk: primaryKey({ columns: [table.roleId, table.permissionId], name: "role_permissions_role_id_permission_id_pk"}),
	}
});
