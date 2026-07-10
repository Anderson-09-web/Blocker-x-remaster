---
name: Dashboard routing sidebar glitch
description: Root cause and fix for the sidebar text glitch when navigating between dashboard pages
---

**Rule:** All dashboard routes must share a single `DashboardLayout` instance. Never wrap individual routes with their own layout.

**Why:** In wouter's `Switch`, each matched `Route` that renders its own `<DashboardLayout>` causes React to unmount the old layout and mount a fresh one on every navigation. This unmounts the entire sidebar including `Sidebar`, `SidebarContent`, and all `NavGroup` components — causing the text-disappearing glitch on every click.

**Root cause found in:** `artifacts/blockerx/src/App.tsx` — every route (`/dashboard`, `/bots`, `/bots/:botId`, etc.) had its own `<DashboardLayout>` wrapper inside the `Switch`.

**Fix:** Extract a `DashboardRoutes` component that renders ONE `<DashboardLayout>` containing a nested `Switch` with all protected routes. The outer `AppRoutes` Switch falls through to `<DashboardRoutes>` for any path not matched by public routes.

**How to apply:** Any time you add a new dashboard route, add a `<Route>` inside the nested `Switch` in `DashboardRoutes`, NOT as a new `Route` with its own `DashboardLayout` in `AppRoutes`.
