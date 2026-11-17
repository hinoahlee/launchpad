# Phase 12 — Organizations

**Goal:** multi-tenancy: data belongs to organizations, people belong to organizations with roles.

### 12.1 Organizations + roles
- **Build:** Better Auth organization plugin: organizations, members, roles (`owner`, `admin`, `member`),
  active organization; a personal org on sign-up.
- **Terms:** multi-tenancy, tenant, role-based access control (RBAC).
- **Done when:** you can create and switch organizations.

### 12.2 Invites
- **Build:** invite by email (through the job queue); accept flow for new and existing users.
- **Done when:** an invite from the deployed app lets a second account join.

### 12.3 Org-scoped data
- **Build:** move files under organizations; one `requireMembership(orgId, minRole)` helper used by every
  org-scoped route. Decision: app-level scoping vs. Postgres row-level security.
- **Terms:** tenant isolation, row-level security (RLS).
- **Ref:** mixmallow `projects/access.ts`, `test/members.test.ts`.
- **Done when:** tests prove org A's members can't touch org B's data.

### 12.4 Audit log
- **Build:** append-only `audit_events` written on membership and role changes; visible to owners.
- **Terms:** audit trail, append-only.
- **Done when:** role changes appear in the log.
