---
name: Night Sound Machine — dim mode & prefs architecture
description: How the night overlay dim feature works, where prefs live, and key decisions made when building it.
---

# Night overlay dim mode

## The rule
`NightModeOverlay` owns dim state internally. Parent passes three prefs as props: `dimEnabled`, `dimDelaySecs`, `dimColor`.

## How it works
- `isDimmed` / `isDimmedRef` track dim state; `dimTimerRef` holds the idle timeout.
- `useEffect([active, dimEnabled, dimDelaySecs])` resets dim state and restarts the timer on any change.
- `useEffect([isAlarming])` wakes from dim when alarm fires.
- `handleActivity()` — attached to `onMouseMove`, `onClick`, `onTouchStart` on the overlay div — wakes and restarts the timer.
- When dimmed: panel and clock content are conditionally removed from DOM (`{!isDimmed && ...}`), overlay background transitions to `var(--dim-color)` (fully opaque), and `cursor:none` is applied.
- Panel auto-close also fires `setPanelOpen(false)` when dim timer triggers.

**Why:** Conditional rendering (not CSS opacity) ensures clicks on child elements don't accidentally register. The alarm always wakes the display since `isAlarming` effect clears `isDimmedRef` synchronously.

## Prefs schema additions (PREFS_STORAGE_KEY)
- `nightDimEnabled: boolean` — default `true`
- `nightDimDelaySecs: number` — default `20`, min 5, max 3600
- `nightDimColor: string` — default `#050310`, one of `DIM_COLORS` array

## Header dropdown
- Replaced the single CircleHelp `?` button with a `header-menu-wrap` div containing a toggle + `header-dropdown`.
- Items: "Full screen" (toggles `document.fullscreenElement`, tracked via `fullscreenchange` event), "Help" (opens `helpOpen` modal).
- `headerMenuRef` + `mousedown` document listener closes the dropdown on outside click.
- `isFullscreen` state tracks actual fullscreen status for the button label.
