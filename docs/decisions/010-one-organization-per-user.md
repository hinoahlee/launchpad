# 010 — One organization per user, by default

**Status:** accepted · **Date:** 2026-11-22

## Context
Apps built from this template may later need teams (shared data, invites, roles). Moving data from "belongs to
a user" to "belongs to an organization" later is the hardest migration an app makes. But teams bring rules
(at least one owner, last-owner races, invites) that most apps built from this template will never need.

## Options
1. No organizations: data keyed on users. Simplest now, but adding teams later means migrating every table.
2. Full teams now: several orgs per user, invites, switching. Many rules to enforce, for a feature few apps use.
3. Organizations now, locked to one person: Better Auth's plugin and tables exist, every user owns exactly one org.

## Decision
Option 3. Data belongs to organizations from 12.3, so teams need no data migration, only lifted limits. Postgres
enforces the rule (unique `members.user_id` and `members.organization_id`). The plugin's settings refuse
creating, deleting, renaming and inviting. The API creates the org with its owner in one transaction.

## Consequences
Nothing to see in the UI; one org lookup per request. Turning on teams: replace the two unique indexes with one
on `(organization_id, user_id)`, lift the plugin limits, then add invites, switching, and last-owner rules
enforced with a row lock on the organization (leave, remove, demote, account deletion).
