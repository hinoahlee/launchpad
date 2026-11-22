# Phase 12 — Organizations

**Goal:** the foundation for multi-tenancy: data belongs to organizations. By default each user has exactly one,
which they own alone (decision 010). Teams (invites, several members, switching) are a later feature of their own.

### 12.1 Organizations + roles
- **Build:** Better Auth organization plugin, tables and roles (`owner`, `admin`, `member`), locked to one
  person, one organization: each user's organization made with its owner, active on every session; creating,
  deleting, renaming and inviting refused; unique indexes so Postgres refuses a second membership. Decision 010.
- **Terms:** multi-tenancy, tenant, role-based access control (RBAC).
- **Done when:** tests prove every user has exactly one organization, and every way to change that is refused.

### 12.2 Org-scoped data
- **Build:** move files under organizations; one `requireMembership(orgId, minRole)` helper used by every
  org-scoped route. Decision: app-level scoping vs. Postgres row-level security.
- **Terms:** tenant isolation, row-level security (RLS).
- **Ref:** mixmallow `projects/access.ts`, `test/members.test.ts`.
- **Done when:** tests prove org A's members can't touch org B's data.

Dropped from this phase (decision 010): invites (a teams feature) and the membership audit log (no membership or
role changes happen). Security events go to an audit log in phase 14 (see the roadmap's follow-ups).
