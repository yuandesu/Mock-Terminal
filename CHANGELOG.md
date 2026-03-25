# Changelog

All notable changes to Terminal Practice are documented here.
Format: `[version] YYYY-MM-DD — description`

---

## [1.3.0] 2026-03-25 — Tips panel

### Added
- **Tips button** (⌨ Tips) — floating semi-transparent button at bottom-right of terminal
- **Mode-aware shortcut panel** — slides in from right, content changes based on current mode:
  - Terminal mode: Ctrl shortcuts (Ctrl+A/E/U/K/W/C/L + arrows, history, Tab)
  - Vim Normal mode: hjkl movement, insert-entry keys, dd/x, command-mode shortcuts
  - Vim Insert mode: arrow navigation, Esc, Backspace, Tab
- **Clickable shortcut items** — each tip can be clicked to execute the action directly
- Tips panel re-renders on every keypress to stay in sync with mode changes
- Full i18n support for all tip group names and descriptions (zh / en / ja)

---

## [1.2.0] 2026-03-25 — Vim bug fixes

### Fixed
- `dd` now correctly requires pressing `d` twice to delete a line (was deleting on single `d`)
- Arrow keys (↑ ↓ ← →) now work in Vim insert mode for cursor navigation
- Added `pendingOp` state to `viState` so `Escape` properly cancels a pending `d` operator

---

## [1.1.0] 2026-03-25 — Light/Dark mode + i18n (zh / en / ja)

### Added
- **Theme toggle** (☀️ / 🌙) in top bar — switches between dark and light mode
- **Language switcher** (中 / EN / 日) in top bar — Traditional Chinese, English, Japanese
- Light mode CSS with full variable override (terminal, keyboard, hints, status bar)
- Translated: welcome messages, command explanations, Ctrl shortcut hints, Vim hints, help output

### Changed
- Single-file `terminal-practice.html` refactored into maintainable multi-file structure:
  - `index.html` — HTML entry point
  - `style.css` — All styles (dark + light mode variables)
  - `filesystem.js` — Virtual filesystem data
  - `app.js` — Core application logic (language-agnostic)
  - `lang/zh.js` — Traditional Chinese translations
  - `lang/en.js` — English translations
  - `lang/ja.js` — Japanese translations

---

## [1.0.0] 2026-03-25 — Initial release

### Features
- macOS-style terminal emulator running in the browser (pure HTML/CSS/JS, zero dependencies)
- Virtual filesystem at `/home/user` with Documents, Downloads, projects
- Supported commands: `ls` `cd` `pwd` `cat` `head` `tail` `wc` `mkdir` `touch` `cp` `mv` `rm` `grep` `find` `echo` `clear` `vi/vim` `whoami` `date` `help`
- Ctrl shortcuts: `Ctrl+A/E/B/F/U/K/W/C/L`
- Tab autocomplete with nested path support
- Vim editor with Normal / Insert / Command sub-modes
- Command history (↑ ↓ navigation)
- Virtual MacBook keyboard with real-time highlight sync
- Hint toast system — explains each command on the right after execution
- Google Fonts: JetBrains Mono
