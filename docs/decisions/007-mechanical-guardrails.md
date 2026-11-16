# 007 — Enforce conventions mechanically

**Status:** accepted · **Date:** 2026-11-16

## Context
This template is built for agentic development. Agents follow prose rules unreliably, and reviewing every
change by eye (human or model) is slow, costly and non-deterministic.

## Options
1. Conventions in docs, caught in review: cheap to write, easy to miss.
2. Conventions as checks (lint rules, types, tests, hooks, required CI): more setup, then free and certain.

## Decision
Option 2, using only what existing tools support (no custom plugins or extra dependencies). A convention
that can be a check becomes one; docs keep only what can't. Don't remove a rule,
hook or check because it looks like noise: change it with a new decision note.

## Consequences
New conventions cost a rule or test up front. CLAUDE.md and rules.md stay short.
