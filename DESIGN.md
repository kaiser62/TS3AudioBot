# Design

<!-- Scope: the browser-side senders. Main surface: deploy/userscript/ts3audiobot.user.js (YouTube). Mode: Operate. -->

## World

The YouTube userscript is a guest inside YouTube's own interface. It doesn't have a visual identity of its own. It borrows YouTube's tokens, type, shapes and motion so its controls look native in light and dark themes, and on www, m and music.youtube.com.

## Tokens

All colours are `--tsab-*` aliases defined on `:root`. Each one points at a YouTube `--yt-spec-*` token and has a fallback. Dark fallbacks are under `html[dark], html:has(ytmusic-app)`.

| Alias | YouTube token | Use |
|---|---|---|
| `--tsab-fg` / `--tsab-fg2` | `text-primary` / `text-secondary` | Text and secondary text |
| `--tsab-surface` | `menu-background` | Tray, menu and dialog |
| `--tsab-tonal` / `--tsab-tonal-hover` | `badge-chip-background` / `button-chip-background-hover` | Secondary buttons and the bot chip |
| `--tsab-line` / `--tsab-line-strong` | `10-percent-layer` / `20-percent-layer` | Dividers and input borders |
| `--tsab-accent` | `call-to-action` | Primary button, checkboxes, focus ring and progress bar |
| `--tsab-inverse` | `inverted-background` | Snackbar |
| `--tsab-error` | `error-indicator` | Errors |
| `--tsab-ok` | (own, #2ba640 / #3fb950) | "Online" dot and success check |

The font is Roboto/Arial: 14px for controls, 13px for secondary lines, 12px for hints and 20px for the dialog title. Command text such as `!api token` is set in Roboto Mono.

## Shape and depth

- Buttons are 36px pills; small buttons are 32px.
- Menus and the tray have a 12–16px radius. Inputs have an 8px radius.
- Every floating surface shares one shadow: `--tsab-shadow`, two offset soft layers.
- Icons are inline SVG built from Material Symbols paths on a 24px grid, drawn at 20px (16px in the now-playing line). Unicode glyphs are never used as icons.

## Components

- **Bot chip.** Shows a status dot, the bot name and a caret, always preceded by a muted "on" (`.tsab-dest`). It appears next to every send control. Clicking it opens the bot menu: a radio list of bots with server and online state, plus Connection settings. The chosen bot is the sticky default everywhere.
- **Watch bar**, under the video title:
  - Primary **Play**, tonal **Queue**, then "on" and the bot chip.
  - A now-playing line underneath, with a blue equaliser icon while the bot is playing.
  - In the music.youtube player bar and on Shorts it switches to a compact, icon-only form.
  - When the script isn't set up, the bar shows a single **Connect TS3AudioBot** button instead.
- **Row checkbox.** A native checkbox with an accent colour, placed before the index of each Mix or playlist row. Shift+click selects a range.
- **Panel "Select all N".** One small tonal button in the Mix panel header. Its icon shows whether every song is selected.
- **Tray.** One floating surface with four states:
  - It sits inside the bottom edge of the Mix panel while the panel is visible, and otherwise centres at the bottom of the page.
  - **idle** (playlist page only): an invitation plus Select all.
  - **select**: clear, the count, and **Queue N** on the bot.
  - **job**: a spinner, "Queueing i of N on bot", the current title, **Stop** and a progress bar.
  - **result**: queued count and failures. **Why?** expands the reasons, **Try N again** resends, and close dismisses it. A fully successful result dismisses itself after 6s.
- **Snackbar.** Appears bottom left with the inverse colours, as YouTube's does. It covers single sends, with busy, ok and error states. It can carry one action, such as **Settings** for connection or login errors. It rises above the centred tray when the two would overlap.
- **Hover buttons.** Two 32px dark round buttons at the top left of a thumbnail. A small tooltip says "Play now on ‹bot›". After a send the icon turns into a check for 1.4s.
- **Connection dialog.** A native `<dialog>` (focus trap, Esc, backdrop). It contains:
  - The fields with their hints, and a **Check connection** button that shows its status inline.
  - The default-bot radio list.
  - The thumbnail-button toggle.
  - Save, which runs the check first if it hasn't been run.

## Motion

There is one entrance: `tsab-rise`, a 12px `translate` plus a fade at 350ms `cubic-bezier(.16,1,.3,1)`. It plays on the tray, snackbar, menu and dialog. Spinners rotate. `prefers-reduced-motion` turns the entrances off.

## Rules

- Never use innerHTML. YouTube enforces Trusted Types, so the DOM is built with `h()` and `icon()`.
- Write to the DOM only when something changed. The MutationObserver re-runs `decorateLists()` on every mutation, so the tray rebuilds only when its state key changes, and text is set only when it differs.
- Never let a click on our controls reach YouTube, or it would navigate.
- Always say which bot gets the songs before sending, and what happened afterwards.
