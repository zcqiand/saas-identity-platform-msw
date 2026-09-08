import { pgTable, unique, uuid, varchar, text, integer, boolean, smallint, timestamp, index, uniqueIndex, foreignKey, primaryKey } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"



export const oauthClient = pgTable("oauth_client", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	clientId: varchar("client_id", { length: 64 }).notNull(),
	clientSecret: varchar("client_secret", { length: 255 }).notNull(),
	clientName: varchar("client_name", { length: 128 }).notNull(),
	grantTypes: varchar("grant_types", { length: 255 }).notNull(),
	redirectUris: text("redirect_uris").notNull(),
	scopes: varchar({ length: 255 }),
	accessTokenValidity: integer("access_token_validity").default(7200).notNull(),
	refreshTokenValidity: integer("refresh_token_validity").default(2592000).notNull(),
	autoApprove: boolean("auto_approve").default(false).notNull(),
	status: smallint().default(1).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => {
	return {
		ukOauthClientId: unique("uk_oauth_client_id").on(table.clientId),
	}
});

export const oauthAccessToken = pgTable("oauth_access_token", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	tokenId: varchar("token_id", { length: 128 }).notNull(),
	accessToken: text("access_token").notNull(),
	clientId: varchar("client_id", { length: 64 }).notNull(),
	userId: uuid("user_id"),
	tenantId: uuid("tenant_id"),
	scope: varchar({ length: 255 }),
	tokenType: varchar("token_type", { length: 32 }).default('Bearer').notNull(),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'string' }).notNull(),
	revoked: boolean().default(false).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => {
	return {
		idxAccessTokenExpires: index("idx_access_token_expires").using("btree", table.expiresAt.asc().nullsLast().op("timestamptz_ops")),
		idxAccessTokenUserTenant: index("idx_access_token_user_tenant").using("btree", table.userId.asc().nullsLast().op("uuid_ops"), table.tenantId.asc().nullsLast().op("uuid_ops")),
		ukAccessTokenId: uniqueIndex("uk_access_token_id").using("btree", table.tokenId.asc().nullsLast().op("text_ops")),
		oauthAccessTokenClientIdOauthClientClientIdFk: foreignKey({
			columns: [table.clientId],
			foreignColumns: [oauthClient.clientId],
			name: "oauth_access_token_client_id_oauth_client_client_id_fk"
		}).onDelete("cascade"),
		oauthAccessTokenUserIdSysUserIdFk: foreignKey({
			columns: [table.userId],
			foreignColumns: [sysUser.id],
			name: "oauth_access_token_user_id_sys_user_id_fk"
		}).onDelete("set null"),
		oauthAccessTokenTenantIdTenantIdFk: foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenant.id],
			name: "oauth_access_token_tenant_id_tenant_id_fk"
		}).onDelete("set null"),
	}
});

export const tenant = pgTable("tenant", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	tenantKey: varchar("tenant_key", { length: 64 }).notNull(),
	name: varchar({ length: 128 }).notNull(),
	status: smallint().default(1).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => {
	return {
		ukTenantKey: uniqueIndex("uk_tenant_key").using("btree", table.tenantKey.asc().nullsLast().op("text_ops")),
	}
});

export const tenantMember = pgTable("tenant_member", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	tenantId: uuid("tenant_id").notNull(),
	userId: uuid("user_id").notNull(),
	memberName: varchar("member_name", { length: 64 }),
	isOwner: boolean("is_owner").default(false).notNull(),
	status: smallint().default(1).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => {
	return {
		idxTenantMemberTenantId: index("idx_tenant_member_tenant_id").using("btree", table.tenantId.asc().nullsLast().op("uuid_ops")),
		idxTenantMemberUserId: index("idx_tenant_member_user_id").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
		ukTenantUser: uniqueIndex("uk_tenant_user").using("btree", table.tenantId.asc().nullsLast().op("uuid_ops"), table.userId.asc().nullsLast().op("uuid_ops")),
		tenantMemberTenantIdTenantIdFk: foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenant.id],
			name: "tenant_member_tenant_id_tenant_id_fk"
		}).onDelete("cascade"),
		tenantMemberUserIdSysUserIdFk: foreignKey({
			columns: [table.userId],
			foreignColumns: [sysUser.id],
			name: "tenant_member_user_id_sys_user_id_fk"
		}).onDelete("cascade"),
	}
});

export const sysUser = pgTable("sys_user", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	username: varchar({ length: 64 }).notNull(),
	password: varchar({ length: 255 }).notNull(),
	email: varchar({ length: 128 }),
	mobile: varchar({ length: 32 }),
	status: smallint().default(1).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	failedAttempts: integer("failed_attempts").default(0).notNull(),
	lockedUntil: timestamp("locked_until", { withTimezone: true, mode: 'string' }),
}, (table) => {
	return {
		ukSysUserEmail: uniqueIndex("uk_sys_user_email").using("btree", table.email.asc().nullsLast().op("text_ops")),
		ukSysUserMobile: uniqueIndex("uk_sys_user_mobile").using("btree", table.mobile.asc().nullsLast().op("text_ops")),
		ukSysUserUsername: uniqueIndex("uk_sys_user_username").using("btree", table.username.asc().nullsLast().op("text_ops")),
	}
});

export const oauthCode = pgTable("oauth_code", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	code: varchar({ length: 128 }).notNull(),
	clientId: varchar("client_id", { length: 64 }).notNull(),
	userId: uuid("user_id").notNull(),
	tenantId: uuid("tenant_id").notNull(),
	redirectUri: varchar("redirect_uri", { length: 500 }),
	scope: varchar({ length: 255 }),
	codeChallenge: varchar("code_challenge", { length: 128 }),
	codeChallengeMethod: varchar("code_challenge_method", { length: 16 }),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'string' }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => {
	return {
		idxOauthCodeClientUserTenant: index("idx_oauth_code_client_user_tenant").using("btree", table.clientId.asc().nullsLast().op("uuid_ops"), table.userId.asc().nullsLast().op("text_ops"), table.tenantId.asc().nullsLast().op("uuid_ops")),
		idxOauthCodeExpires: index("idx_oauth_code_expires").using("btree", table.expiresAt.asc().nullsLast().op("timestamptz_ops")),
		ukOauthCode: uniqueIndex("uk_oauth_code").using("btree", table.code.asc().nullsLast().op("text_ops")),
		oauthCodeClientIdOauthClientClientIdFk: foreignKey({
			columns: [table.clientId],
			foreignColumns: [oauthClient.clientId],
			name: "oauth_code_client_id_oauth_client_client_id_fk"
		}).onDelete("cascade"),
		oauthCodeUserIdSysUserIdFk: foreignKey({
			columns: [table.userId],
			foreignColumns: [sysUser.id],
			name: "oauth_code_user_id_sys_user_id_fk"
		}).onDelete("cascade"),
		oauthCodeTenantIdTenantIdFk: foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenant.id],
			name: "oauth_code_tenant_id_tenant_id_fk"
		}).onDelete("cascade"),
	}
});

export const oauthRefreshToken = pgTable("oauth_refresh_token", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	refreshToken: varchar("refresh_token", { length: 128 }).notNull(),
	accessTokenId: uuid("access_token_id").notNull(),
	clientId: varchar("client_id", { length: 64 }).notNull(),
	userId: uuid("user_id"),
	tenantId: uuid("tenant_id"),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'string' }).notNull(),
	revoked: boolean().default(false).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => {
	return {
		idxRefreshTokenAccessId: index("idx_refresh_token_access_id").using("btree", table.accessTokenId.asc().nullsLast().op("uuid_ops")),
		idxRefreshTokenUserTenant: index("idx_refresh_token_user_tenant").using("btree", table.userId.asc().nullsLast().op("uuid_ops"), table.tenantId.asc().nullsLast().op("uuid_ops")),
		ukRefreshToken: uniqueIndex("uk_refresh_token").using("btree", table.refreshToken.asc().nullsLast().op("text_ops")),
		oauthRefreshTokenAccessTokenIdOauthAccessTokenIdFk: foreignKey({
			columns: [table.accessTokenId],
			foreignColumns: [oauthAccessToken.id],
			name: "oauth_refresh_token_access_token_id_oauth_access_token_id_fk"
		}).onDelete("cascade"),
		oauthRefreshTokenClientIdOauthClientClientIdFk: foreignKey({
			columns: [table.clientId],
			foreignColumns: [oauthClient.clientId],
			name: "oauth_refresh_token_client_id_oauth_client_client_id_fk"
		}).onDelete("cascade"),
		oauthRefreshTokenUserIdSysUserIdFk: foreignKey({
			columns: [table.userId],
			foreignColumns: [sysUser.id],
			name: "oauth_refresh_token_user_id_sys_user_id_fk"
		}).onDelete("set null"),
		oauthRefreshTokenTenantIdTenantIdFk: foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenant.id],
			name: "oauth_refresh_token_tenant_id_tenant_id_fk"
		}).onDelete("set null"),
	}
});

export const sysRole = pgTable("sys_role", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	tenantId: uuid("tenant_id").notNull(),
	clientId: varchar("client_id", { length: 64 }).notNull(),
	roleCode: varchar("role_code", { length: 64 }).notNull(),
	roleName: varchar("role_name", { length: 64 }).notNull(),
	description: varchar({ length: 255 }),
	isPreset: boolean("is_preset").default(false).notNull(),
	status: smallint().default(1).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => {
	return {
		idxSysRoleTenantClient: index("idx_sys_role_tenant_client").using("btree", table.tenantId.asc().nullsLast().op("text_ops"), table.clientId.asc().nullsLast().op("uuid_ops")),
		ukTenantClientRoleCode: uniqueIndex("uk_tenant_client_role_code").using("btree", table.tenantId.asc().nullsLast().op("uuid_ops"), table.clientId.asc().nullsLast().op("uuid_ops"), table.roleCode.asc().nullsLast().op("uuid_ops")),
		sysRoleTenantIdTenantIdFk: foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenant.id],
			name: "sys_role_tenant_id_tenant_id_fk"
		}).onDelete("cascade"),
		sysRoleClientIdOauthClientClientIdFk: foreignKey({
			columns: [table.clientId],
			foreignColumns: [oauthClient.clientId],
			name: "sys_role_client_id_oauth_client_client_id_fk"
		}).onDelete("cascade"),
	}
});

export const sysMenu = pgTable("sys_menu", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	clientId: varchar("client_id", { length: 64 }).notNull(),
	parentId: uuid("parent_id").default(sql`'00000000-0000-0000-0000-000000000000'`).notNull(),
	title: varchar({ length: 64 }).notNull(),
	type: smallint().notNull(),
	path: varchar({ length: 255 }),
	component: varchar({ length: 255 }),
	perms: varchar({ length: 128 }),
	icon: varchar({ length: 128 }),
	sortOrder: integer("sort_order").default(0).notNull(),
	status: smallint().default(1).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => {
	return {
		idxSysMenuClientParent: index("idx_sys_menu_client_parent").using("btree", table.clientId.asc().nullsLast().op("text_ops"), table.parentId.asc().nullsLast().op("text_ops")),
		idxSysMenuClientType: index("idx_sys_menu_client_type").using("btree", table.clientId.asc().nullsLast().op("text_ops"), table.type.asc().nullsLast().op("text_ops")),
		sysMenuClientIdOauthClientClientIdFk: foreignKey({
			columns: [table.clientId],
			foreignColumns: [oauthClient.clientId],
			name: "sys_menu_client_id_oauth_client_client_id_fk"
		}).onDelete("cascade"),
	}
});

export const tenantApplication = pgTable("tenant_application", {
	id: uuid().default(sql`uuid_generate_v4()`).primaryKey().notNull(),
	tenantId: uuid("tenant_id").notNull(),
	clientId: varchar("client_id", { length: 64 }).notNull(),
	status: smallint().default(1).notNull(),
	expireTime: timestamp("expire_time", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => {
	return {
		idxTenantApplicationClientId: index("idx_tenant_application_client_id").using("btree", table.clientId.asc().nullsLast().op("text_ops")),
		ukTenantClient: uniqueIndex("uk_tenant_client").using("btree", table.tenantId.asc().nullsLast().op("text_ops"), table.clientId.asc().nullsLast().op("text_ops")),
		tenantApplicationTenantIdTenantIdFk: foreignKey({
			columns: [table.tenantId],
			foreignColumns: [tenant.id],
			name: "tenant_application_tenant_id_tenant_id_fk"
		}).onDelete("cascade"),
		tenantApplicationClientIdOauthClientClientIdFk: foreignKey({
			columns: [table.clientId],
			foreignColumns: [oauthClient.clientId],
			name: "tenant_application_client_id_oauth_client_client_id_fk"
		}).onDelete("cascade"),
	}
});

export const sysRoleMenu = pgTable("sys_role_menu", {
	roleId: uuid("role_id").notNull(),
	menuId: uuid("menu_id").notNull(),
}, (table) => {
	return {
		idxSysRoleMenuMenuId: index("idx_sys_role_menu_menu_id").using("btree", table.menuId.asc().nullsLast().op("uuid_ops")),
		sysRoleMenuRoleIdSysRoleIdFk: foreignKey({
			columns: [table.roleId],
			foreignColumns: [sysRole.id],
			name: "sys_role_menu_role_id_sys_role_id_fk"
		}).onDelete("cascade"),
		sysRoleMenuMenuIdSysMenuIdFk: foreignKey({
			columns: [table.menuId],
			foreignColumns: [sysMenu.id],
			name: "sys_role_menu_menu_id_sys_menu_id_fk"
		}).onDelete("cascade"),
		sysRoleMenuRoleIdMenuIdPk: primaryKey({ columns: [table.roleId, table.menuId], name: "sys_role_menu_role_id_menu_id_pk"}),
	}
});

export const tenantMemberRole = pgTable("tenant_member_role", {
	memberId: uuid("member_id").notNull(),
	roleId: uuid("role_id").notNull(),
}, (table) => {
	return {
		idxTenantMemberRoleRoleId: index("idx_tenant_member_role_role_id").using("btree", table.roleId.asc().nullsLast().op("uuid_ops")),
		tenantMemberRoleMemberIdTenantMemberIdFk: foreignKey({
			columns: [table.memberId],
			foreignColumns: [tenantMember.id],
			name: "tenant_member_role_member_id_tenant_member_id_fk"
		}).onDelete("cascade"),
		tenantMemberRoleRoleIdSysRoleIdFk: foreignKey({
			columns: [table.roleId],
			foreignColumns: [sysRole.id],
			name: "tenant_member_role_role_id_sys_role_id_fk"
		}).onDelete("cascade"),
		tenantMemberRoleMemberIdRoleIdPk: primaryKey({ columns: [table.memberId, table.roleId], name: "tenant_member_role_member_id_role_id_pk"}),
	}
});
