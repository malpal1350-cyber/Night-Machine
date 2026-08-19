---
name: Night Sound Machine — icon picker
description: How group icons are stored, resolved, and pre-populated in the edit modal.
---

# Icon picker

## The rule
Always use `iconKeyForGroup(name, icon?)` (returns string key) when pre-populating the modal, not `group.icon` directly.

**Why:** Default groups (Rain, Thunder, Crickets, Ocean) have no stored `icon` field. `iconKeyForGroup` applies the same name-detection logic as `iconForGroup` but returns the string key, so editing those groups shows the correct icon pre-selected.

## Key identifiers
- `GROUP_ICONS` — ordered `{ key, Component }[]`, 65 icons in 8 categories
- `GROUP_ICON_MAP` — `Record<string, IconType>` for fast key→component lookup
- `iconForGroup(name, icon?)` — resolves component; stored key first, then name detection
- `iconKeyForGroup(name, icon?)` — same logic, returns string key
- `groupIcon` / `iconPickerOpen` — modal state in App component
- `openEditGroup` calls `iconKeyForGroup(group.name, group.icon)` to pre-seed `groupIcon`
