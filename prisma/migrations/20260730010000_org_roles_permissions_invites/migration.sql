-- Permissions catalog
CREATE TABLE IF NOT EXISTS "permissions" (
  "key" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "description" TEXT,
  "group_key" TEXT NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "permissions_pkey" PRIMARY KEY ("key")
);

-- Org roles
CREATE TABLE IF NOT EXISTS "org_roles" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "account_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "is_system" BOOLEAN NOT NULL DEFAULT false,
  "system_key" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "org_roles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "org_roles_account_id_system_key_key"
  ON "org_roles"("account_id", "system_key");

CREATE INDEX IF NOT EXISTS "org_roles_account_id_idx" ON "org_roles"("account_id");

ALTER TABLE "org_roles"
  DROP CONSTRAINT IF EXISTS "org_roles_account_id_fkey";
ALTER TABLE "org_roles"
  ADD CONSTRAINT "org_roles_account_id_fkey"
  FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Org role permissions
CREATE TABLE IF NOT EXISTS "org_role_permissions" (
  "org_role_id" UUID NOT NULL,
  "permission_key" TEXT NOT NULL,
  CONSTRAINT "org_role_permissions_pkey" PRIMARY KEY ("org_role_id", "permission_key")
);

ALTER TABLE "org_role_permissions"
  DROP CONSTRAINT IF EXISTS "org_role_permissions_org_role_id_fkey";
ALTER TABLE "org_role_permissions"
  ADD CONSTRAINT "org_role_permissions_org_role_id_fkey"
  FOREIGN KEY ("org_role_id") REFERENCES "org_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "org_role_permissions"
  DROP CONSTRAINT IF EXISTS "org_role_permissions_permission_key_fkey";
ALTER TABLE "org_role_permissions"
  ADD CONSTRAINT "org_role_permissions_permission_key_fkey"
  FOREIGN KEY ("permission_key") REFERENCES "permissions"("key") ON DELETE CASCADE ON UPDATE CASCADE;

-- Profile.org_role_id
ALTER TABLE "profiles" ADD COLUMN IF NOT EXISTS "org_role_id" UUID;
CREATE INDEX IF NOT EXISTS "profiles_org_role_id_idx" ON "profiles"("org_role_id");
ALTER TABLE "profiles"
  DROP CONSTRAINT IF EXISTS "profiles_org_role_id_fkey";
ALTER TABLE "profiles"
  ADD CONSTRAINT "profiles_org_role_id_fkey"
  FOREIGN KEY ("org_role_id") REFERENCES "org_roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Invitation email + org_role_id
ALTER TABLE "account_invitations" ADD COLUMN IF NOT EXISTS "email" TEXT;
ALTER TABLE "account_invitations" ADD COLUMN IF NOT EXISTS "org_role_id" UUID;
ALTER TABLE "account_invitations"
  DROP CONSTRAINT IF EXISTS "account_invitations_org_role_id_fkey";
ALTER TABLE "account_invitations"
  ADD CONSTRAINT "account_invitations_org_role_id_fkey"
  FOREIGN KEY ("org_role_id") REFERENCES "org_roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- User.email already unique in schema; ensure index exists
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_key" ON "users"("email");
