// ==UserScript==
// @name         TS3AudioBot Sender
// @namespace    https://github.com/kaiser62/TS3AudioBot
// @version      1.3.2
// @description  Send YouTube videos, or songs picked from Mixes and playlists, to a TS3AudioBot TeamSpeak music bot.
// @author       kaiser62
// @match        https://www.youtube.com/*
// @match        https://m.youtube.com/*
// @match        https://music.youtube.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @connect      *
// @run-at       document-idle
// @homepageURL  https://github.com/kaiser62/TS3AudioBot/tree/master/deploy/userscript
// @downloadURL  https://raw.githubusercontent.com/kaiser62/TS3AudioBot/master/deploy/userscript/ts3audiobot.user.js
// @updateURL    https://raw.githubusercontent.com/kaiser62/TS3AudioBot/master/deploy/userscript/ts3audiobot.user.js
// ==/UserScript==

/*
 * Design direction: a guest inside YouTube's own interface.
 * - Colours, type and shapes come from YouTube's --yt-spec-* tokens (light and dark), Roboto, 18px pills, drawn SVG icons.
 * - The receiving bot is always shown next to every send control (the bot chip), and every send reports what happened.
 * - Picking many songs is the main job: a checkbox per row, one "Select all" per list, and one tray that shows the
 *   selection, then live progress, then the result (failed songs stay selected with their reason).
 * - YouTube enforces Trusted Types, so all DOM and SVG is built by hand (no innerHTML).
 */
(function () {
	"use strict";

	// ---------- settings ----------
	const DEFAULTS = { baseUrl: "", uid: "", token: "", botId: 0, botName: "", hoverButtons: true, introSeen: false };
	const cfg = {};
	for (const k of Object.keys(DEFAULTS)) cfg[k] = GM_getValue(k, DEFAULTS[k]);
	const save = () => { for (const k of Object.keys(DEFAULTS)) GM_setValue(k, cfg[k]); };
	const ready = () => !!(cfg.baseUrl && cfg.uid && cfg.token);
	let bots = [], botsError = null;

	// ---------- DOM helpers ----------
	function h(tag, props, ...children) {
		const el = document.createElement(tag);
		for (const [k, v] of Object.entries(props || {})) {
			if (v == null || v === false) continue;
			if (k === "style") Object.assign(el.style, v);
			else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
			else if (k === "class") el.className = v;
			else if (k.includes("-") || k === "role" || k === "for") el.setAttribute(k, v);
			else el[k] = v;
		}
		for (const c of children.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : String(c));
		return el;
	}

	// Material Symbols paths (24px grid, filled)
	const ICONS = {
		play: "M8 5v14l11-7z",
		queue: "M14 10H3v2h11v-2zm0-4H3v2h11V6zm4 8v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zM3 16h7v-2H3v2z",
		check: "M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z",
		close: "M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z",
		error: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z",
		caret: "M7 10l5 5 5-5z",
		eq: "M7 18h2V6H7v12zm4 4h2V2h-2v20zm-8-8h2v-4H3v4zm12 4h2V6h-2v12zm4-8v4h2v-4h-2z",
		boxOff: "M19 5v14H5V5h14m0-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z",
		boxOn: "M19 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.11 0 2-.9 2-2V5c0-1.1-.89-2-2-2zm-9 14l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z",
		gear: "M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.48.48 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.48.48 0 0 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z",
	};
	const SVGNS = "http://www.w3.org/2000/svg";
	function icon(name, extra) {
		const s = document.createElementNS(SVGNS, "svg");
		s.setAttribute("viewBox", "0 0 24 24");
		s.setAttribute("aria-hidden", "true");
		s.setAttribute("class", "tsab-ic" + (extra ? " " + extra : ""));
		const p = document.createElementNS(SVGNS, "path");
		p.setAttribute("d", ICONS[name]);
		s.append(p);
		return s;
	}
	// replaceChildren() would print null/false as text
	const present = (...nodes) => nodes.filter((n) => n != null && n !== false);
	const spinner = () => h("span", { class: "tsab-spin", "aria-hidden": "true" });

	function button(label, iconName, cls, onclick, title) {
		return h("button", { type: "button", class: "tsab-btn " + (cls || ""), title: title || null, "aria-label": label, onclick },
			spinner(), iconName && icon(iconName), h("span", { class: "tsab-label", textContent: label }));
	}
	function setBusy(btn, on) {
		if (!btn) return;
		btn.classList.toggle("busy", on);
		btn.disabled = on;
	}
	// brief check mark in place of the button's icon after a successful send
	function flash(btn) {
		const p = btn && btn.querySelector(".tsab-ic path");
		if (!p) return;
		if (!p.dataset.d) p.dataset.d = p.getAttribute("d"); // the real icon, even if a check is showing
		p.setAttribute("d", ICONS.check);
		clearTimeout(p.flashTimer);
		p.flashTimer = setTimeout(() => p.setAttribute("d", p.dataset.d), 1400);
	}

	const css = `
:root{
  --tsab-fg:var(--yt-spec-text-primary,#0f0f0f);
  --tsab-fg2:var(--yt-spec-text-secondary,#606060);
  --tsab-surface:var(--yt-spec-menu-background,#fff);
  --tsab-tonal:var(--yt-spec-badge-chip-background,rgba(0,0,0,.05));
  --tsab-tonal-hover:var(--yt-spec-button-chip-background-hover,rgba(0,0,0,.1));
  --tsab-line:var(--yt-spec-10-percent-layer,rgba(0,0,0,.1));
  --tsab-line-strong:var(--yt-spec-20-percent-layer,rgba(0,0,0,.2));
  --tsab-accent:var(--yt-spec-call-to-action,#065fd4);
  --tsab-on-accent:var(--yt-spec-text-primary-inverse,#fff);
  --tsab-inverse:var(--yt-spec-inverted-background,#0f0f0f);
  --tsab-on-inverse:var(--yt-spec-text-primary-inverse,#fff);
  --tsab-accent-inv:#3ea6ff;
  --tsab-error:var(--yt-spec-error-indicator,#cc0000);
  --tsab-error-inv:#ff7a73;
  --tsab-ok:#2ba640;
  --tsab-shadow:0 4px 12px rgba(0,0,0,.1),0 12px 32px rgba(0,0,0,.16);
  --tsab-font:"Roboto","Arial",sans-serif;
  --tsab-ease:cubic-bezier(.16,1,.3,1);
}
html[dark],html:has(ytmusic-app){
  --tsab-fg:var(--yt-spec-text-primary,#f1f1f1);
  --tsab-fg2:var(--yt-spec-text-secondary,#aaa);
  --tsab-surface:var(--yt-spec-menu-background,#282828);
  --tsab-tonal:var(--yt-spec-badge-chip-background,rgba(255,255,255,.1));
  --tsab-tonal-hover:var(--yt-spec-button-chip-background-hover,rgba(255,255,255,.2));
  --tsab-line:var(--yt-spec-10-percent-layer,rgba(255,255,255,.1));
  --tsab-line-strong:var(--yt-spec-20-percent-layer,rgba(255,255,255,.2));
  --tsab-accent:var(--yt-spec-call-to-action,#3ea6ff);
  --tsab-on-accent:var(--yt-spec-text-primary-inverse,#0f0f0f);
  --tsab-inverse:var(--yt-spec-inverted-background,#f1f1f1);
  --tsab-on-inverse:var(--yt-spec-text-primary-inverse,#0f0f0f);
  --tsab-accent-inv:#065fd4;
  --tsab-error:var(--yt-spec-error-indicator,#ff4e45);
  --tsab-error-inv:#cc0000;
  --tsab-ok:#3fb950;
  --tsab-shadow:0 4px 12px rgba(0,0,0,.35),0 12px 32px rgba(0,0,0,.45);
}
@keyframes tsab-rise{from{translate:0 12px;opacity:0}}
@keyframes tsab-spin{to{rotate:360deg}}

.tsab-ic{width:20px;height:20px;fill:currentColor;flex:none}
.tsab-spin{display:none;width:16px;height:16px;margin:0 2px;box-sizing:border-box;border-radius:50%;flex:none;
  border:2px solid currentColor;border-right-color:transparent;animation:tsab-spin .8s linear infinite}
:where(.tsab-bar,.tsab-tray,.tsab-pop,.tsab-dialog,.tsab-snack,.tsab-hover,.tsab-panel-all) :focus-visible,
.tsab-panel-all:focus-visible,.tsab-cb:focus-visible{outline:2px solid var(--tsab-accent);outline-offset:2px}

.tsab-btn{display:inline-flex;align-items:center;gap:6px;height:36px;padding:0 16px;border:0;border-radius:18px;box-sizing:border-box;
  background:var(--tsab-tonal);color:var(--tsab-fg);font:500 14px/36px var(--tsab-font);white-space:nowrap;cursor:pointer;
  transition:background-color .15s,filter .15s}
.tsab-btn:hover{background:var(--tsab-tonal-hover)}
.tsab-btn>.tsab-ic{margin-left:-6px}
.tsab-btn.primary{background:var(--tsab-accent);color:var(--tsab-on-accent)}
.tsab-btn.primary:hover{filter:brightness(1.1)}
.tsab-btn.quiet{background:transparent}
.tsab-btn.quiet:hover{background:var(--tsab-tonal)}
.tsab-btn.icon-only{width:36px;padding:0;justify-content:center}
.tsab-btn.icon-only>.tsab-ic{margin:0}
.tsab-btn.icon-only .tsab-label{display:none}
.tsab-btn.small{height:32px;line-height:32px;padding:0 12px;font-size:13px}
.tsab-btn:disabled{opacity:.5;cursor:default;filter:none}
.tsab-btn.busy{opacity:1}
.tsab-btn.busy .tsab-spin{display:inline-block;margin-left:-4px}
.tsab-btn.busy>.tsab-ic{display:none}

.tsab-chip{gap:8px;max-width:240px;padding:0 8px 0 12px;font-weight:500}
.tsab-chip .name{overflow:hidden;text-overflow:ellipsis}
.tsab-chip>.tsab-ic{margin:0 0 0 -4px}
.tsab-dot{width:8px;height:8px;border-radius:50%;flex:none;background:var(--tsab-line-strong)}
.tsab-dot.on{background:var(--tsab-ok)}
.tsab-on{color:var(--tsab-fg2);font:400 14px var(--tsab-font)}

.tsab-bar{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:12px 0 0;color:var(--tsab-fg);font:400 14px var(--tsab-font)}
.tsab-np{display:flex;align-items:center;gap:6px;flex-basis:100%;min-width:0;min-height:18px;color:var(--tsab-fg2);font-size:13px;line-height:18px}
.tsab-np:empty{display:none}
.tsab-np span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tsab-np .tsab-ic{width:16px;height:16px}
.tsab-np.live .tsab-ic{fill:var(--tsab-accent)}
.tsab-setup-note{color:var(--tsab-fg2);font-size:13px}
.tsab-bar.compact{flex-wrap:nowrap;margin:0 8px;gap:4px}
.tsab-bar.compact .tsab-btn:not(.tsab-chip){width:36px;padding:0;justify-content:center}
.tsab-bar.compact .tsab-btn>.tsab-ic{margin:0}
.tsab-bar.compact .tsab-btn:not(.tsab-chip) .tsab-label,.tsab-bar.compact .tsab-on,.tsab-bar.compact .tsab-np,.tsab-bar.compact .tsab-setup-note{display:none}
.tsab-bar.compact .tsab-chip{max-width:150px}

.tsab-hover{position:fixed;z-index:2200;display:flex;align-items:center;gap:4px;font:400 12px/16px var(--tsab-font)}
.tsab-hover button{display:grid;place-items:center;width:32px;height:32px;padding:0;border:0;border-radius:50%;
  background:rgba(0,0,0,.72);color:#fff;cursor:pointer;transition:background-color .15s}
.tsab-hover button:hover{background:rgba(0,0,0,.92)}
.tsab-hover button.busy .tsab-spin{display:inline-block;margin:0}
.tsab-hover button.busy .tsab-ic{display:none}
.tsab-hover .tip{margin-left:2px;padding:4px 8px;border-radius:4px;background:rgba(0,0,0,.85);color:#fff;white-space:nowrap;
  opacity:0;transition:opacity .12s}
.tsab-hover:hover .tip,.tsab-hover:focus-within .tip{opacity:1}

.tsab-cb{width:18px;height:18px;margin:0 8px 0 4px;flex:none;align-self:center;cursor:pointer;accent-color:var(--tsab-accent)}
.tsab-panel-all{margin:4px 0 4px 8px}
.tsab-panel-all>.tsab-ic{width:18px;height:18px}
.tsab-panel-all[aria-pressed=true]>.tsab-ic{fill:var(--tsab-accent)}

.tsab-tray{position:fixed;z-index:2100;box-sizing:border-box;max-width:calc(100vw - 16px);padding:8px;border-radius:16px;
  border:1px solid var(--tsab-line);background:var(--tsab-surface);color:var(--tsab-fg);box-shadow:var(--tsab-shadow);
  font:400 14px/20px var(--tsab-font);animation:tsab-rise .35s var(--tsab-ease)}
.tsab-tray-row{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.tsab-tray .msg{display:flex;flex-direction:column;flex:1 1 auto;min-width:0;padding:0 4px}
.tsab-tray .msg b{font-weight:500}
.tsab-tray .msg small{overflow:hidden;color:var(--tsab-fg2);font-size:12px;line-height:16px;text-overflow:ellipsis;white-space:nowrap}
.tsab-tray .lead{display:grid;place-items:center;width:36px;height:36px;flex:none}
.tsab-tray .lead .tsab-spin{display:inline-block;width:20px;height:20px;color:var(--tsab-accent)}
.tsab-tray .lead.ok .tsab-ic{fill:var(--tsab-ok)}
.tsab-tray .lead.err .tsab-ic{fill:var(--tsab-error)}
.tsab-tray .send{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-left:auto}
.tsab-tray .tsab-actions{justify-content:flex-end;margin-top:4px}
.tsab-dest{display:inline-flex;align-items:center;gap:8px;min-width:0}
.tsab-progress{height:4px;margin:8px 4px 2px;overflow:hidden;border-radius:2px;background:var(--tsab-line)}
.tsab-progress i{display:block;height:100%;background:var(--tsab-accent);transform-origin:left;transition:transform .4s var(--tsab-ease)}
.tsab-fails{max-height:180px;margin:8px 0 0;padding:8px 4px 0;overflow:auto;border-top:1px solid var(--tsab-line);list-style:none;
  font-size:13px;line-height:18px;scrollbar-width:thin;scrollbar-color:var(--tsab-line-strong) transparent}
.tsab-fails li{padding:4px 0}
.tsab-fails .why{display:block;color:var(--tsab-fg2)}

.tsab-snack{position:fixed;left:24px;bottom:24px;z-index:2400;display:flex;align-items:center;gap:12px;box-sizing:border-box;
  min-width:288px;max-width:min(560px,calc(100vw - 48px));min-height:48px;padding:4px 4px 4px 16px;border-radius:8px;
  background:var(--tsab-inverse);color:var(--tsab-on-inverse);box-shadow:var(--tsab-shadow);font:400 14px/20px var(--tsab-font);
  animation:tsab-rise .35s var(--tsab-ease)}
.tsab-snack .txt{flex:1;min-width:0;padding:10px 0}
.tsab-snack .tsab-spin{display:inline-block}
.tsab-snack.ok>.tsab-ic{fill:var(--tsab-accent-inv)}
.tsab-snack.err>.tsab-ic{fill:var(--tsab-error-inv)}
.tsab-snack button{height:36px;padding:0 12px;border:0;border-radius:18px;background:transparent;cursor:pointer;font:500 14px var(--tsab-font)}
.tsab-snack .act{color:var(--tsab-accent-inv)}
.tsab-snack .x{display:grid;place-items:center;width:36px;padding:0;color:inherit}
.tsab-snack button:hover{background:rgba(127,127,127,.2)}
.tsab-snack :focus-visible{outline-color:var(--tsab-accent-inv)}

.tsab-pop{position:fixed;z-index:2300;box-sizing:border-box;min-width:260px;max-width:min(340px,calc(100vw - 16px));padding:8px 0;
  border-radius:12px;background:var(--tsab-surface);color:var(--tsab-fg);box-shadow:var(--tsab-shadow);font:400 14px/20px var(--tsab-font);
  animation:tsab-rise .25s var(--tsab-ease)}
.tsab-pop-head{padding:6px 16px 6px;color:var(--tsab-fg2);font-size:13px}
.tsab-pop-note{margin:0;padding:8px 16px;color:var(--tsab-fg2)}
.tsab-pop-note.err{color:var(--tsab-error)}
.tsab-item{display:flex;align-items:center;gap:12px;width:100%;min-height:44px;padding:6px 16px;border:0;background:none;color:inherit;
  font:inherit;text-align:left;cursor:pointer}
.tsab-item:hover{background:var(--tsab-tonal)}
.tsab-item:focus-visible{outline-offset:-2px;background:var(--tsab-tonal)}
.tsab-item .main{display:flex;flex:1;flex-direction:column;min-width:0}
.tsab-item .main span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tsab-item small{color:var(--tsab-fg2);font-size:12px;line-height:16px}
.tsab-item .tick{fill:var(--tsab-accent);visibility:hidden}
.tsab-item[aria-checked=true] .tick{visibility:visible}
.tsab-item[aria-checked=true] .main span{font-weight:500}
.tsab-sep{height:1px;margin:8px 0;background:var(--tsab-line)}

.tsab-dialog{box-sizing:border-box;width:min(480px,calc(100vw - 32px));max-height:calc(100vh - 32px);padding:0;border:0;border-radius:12px;
  background:var(--tsab-surface);color:var(--tsab-fg);box-shadow:var(--tsab-shadow);font:400 14px/20px var(--tsab-font)}
.tsab-dialog[open]{display:flex;animation:tsab-rise .35s var(--tsab-ease)}
.tsab-dialog::backdrop{background:rgba(0,0,0,.5)}
.tsab-dialog form{display:flex;flex-direction:column;width:100%;max-height:calc(100vh - 32px)}
.tsab-dialog ::selection{background:color-mix(in srgb,var(--tsab-accent) 30%,transparent)}
.tsab-dlg-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:16px 12px 4px 24px}
.tsab-dlg-head h2{margin:0;font:500 20px/28px var(--tsab-font);text-wrap:balance}
.tsab-dlg-body{padding:4px 24px 8px;overflow:auto;scrollbar-width:thin;scrollbar-color:var(--tsab-line-strong) transparent}
.tsab-lede{max-width:60ch;margin:0 0 20px;color:var(--tsab-fg2)}
.tsab-field{margin:0 0 18px}
.tsab-field>label{display:block;margin-bottom:6px;font-weight:500}
.tsab-input{width:100%;height:40px;box-sizing:border-box;padding:0 12px;border:1px solid var(--tsab-line-strong);border-radius:8px;
  background:transparent;color:var(--tsab-fg);caret-color:var(--tsab-accent);font:400 14px var(--tsab-font)}
.tsab-input::placeholder{color:var(--tsab-fg2);opacity:1}
.tsab-input:focus{outline:none;border-color:var(--tsab-accent);box-shadow:0 0 0 1px var(--tsab-accent)}
.tsab-input[aria-invalid=true]{border-color:var(--tsab-error)}
.tsab-with-btn{display:flex;gap:8px}
.tsab-hint{margin-top:6px;color:var(--tsab-fg2);font-size:12px;line-height:16px}
.tsab-hint code{padding:1px 5px;border-radius:4px;background:var(--tsab-tonal);color:var(--tsab-fg);font:500 12px "Roboto Mono",Consolas,monospace}
.tsab-check-row{display:flex;flex-wrap:wrap;align-items:center;gap:12px;margin:0 0 18px}
.tsab-status{display:flex;flex:1 1 200px;align-items:center;gap:8px;min-height:20px;font-size:13px}
.tsab-status .tsab-spin{display:inline-block;color:var(--tsab-accent)}
.tsab-status.ok .tsab-ic{fill:var(--tsab-ok)}
.tsab-status.err{color:var(--tsab-error)}
.tsab-bots{margin:0 0 18px;padding:0;border:0}
.tsab-bots legend{margin-bottom:6px;padding:0;font-weight:500}
.tsab-bots .list{border:1px solid var(--tsab-line-strong);border-radius:8px;overflow:hidden}
.tsab-bot-opt{display:flex;align-items:center;gap:12px;padding:8px 12px;cursor:pointer}
.tsab-bot-opt+.tsab-bot-opt{border-top:1px solid var(--tsab-line)}
.tsab-bot-opt:hover{background:var(--tsab-tonal)}
.tsab-bot-opt input{margin:0;accent-color:var(--tsab-accent)}
.tsab-bot-opt .main{display:flex;flex:1;flex-direction:column;min-width:0}
.tsab-bot-opt small{color:var(--tsab-fg2);font-size:12px;line-height:16px}
.tsab-toggle{display:flex;align-items:flex-start;gap:12px;cursor:pointer}
.tsab-toggle input{width:18px;height:18px;margin:1px 0 0;accent-color:var(--tsab-accent)}
.tsab-dlg-foot{display:flex;justify-content:flex-end;gap:8px;padding:12px 16px 16px;border-top:1px solid var(--tsab-line)}

@media (max-width:600px){
  .tsab-snack{left:8px;right:8px;bottom:8px;min-width:0;max-width:none}
}
@media (prefers-reduced-motion:reduce){
  .tsab-tray,.tsab-snack,.tsab-pop,.tsab-dialog[open]{animation:none}
  .tsab-progress i{transition:none}
}
`;
	document.head.append(h("style", { textContent: css }));

	// ---------- API ----------
	function api(path, conn = cfg) {
		return new Promise((resolve, reject) => {
			const fail = (msg, fixable) => { const e = new Error(msg); e.fixable = fixable; reject(e); };
			if (!conn.baseUrl) return fail("No bot server is set up yet.", true);
			const headers = {};
			if (conn.uid && conn.token) headers.Authorization = "Basic " + btoa(unescape(encodeURIComponent(conn.uid + ":" + conn.token)));
			let host = conn.baseUrl;
			try { host = new URL(conn.baseUrl).host; } catch (_) { /* shown as typed */ }
			GM_xmlhttpRequest({
				method: "GET",
				url: conn.baseUrl.replace(/\/+$/, "") + "/api" + path,
				headers,
				timeout: 40000,
				onload: (r) => {
					let body = null;
					try { body = r.responseText ? JSON.parse(r.responseText) : null; } catch (_) { body = r.responseText; }
					if (r.status >= 200 && r.status < 300) return resolve(body);
					if (r.status === 401 || r.status === 403) return fail("The bot didn't accept your unique ID and token.", true);
					fail((body && body.ErrorMessage) || `The bot answered with an error (HTTP ${r.status}).`, false);
				},
				onerror: () => fail(`Can't reach ${host}. Check the server address.`, true),
				ontimeout: () => fail(`${host} didn't answer within 40 seconds.`, true),
			});
		});
	}
	// Same escaping as the official web interface: encodeURIComponent plus parentheses.
	const seg = (s) => "/" + encodeURIComponent(s).replace(/\(/g, "%28").replace(/\)/g, "%29");
	const onBot = (id, ...cmd) => `/bot/use/${id}/(${cmd.map(seg).join("")})`;

	async function loadBots() {
		try {
			const r = await api("/bot/list");
			bots = Array.isArray(r) ? r : [];
			botsError = null;
			const cur = bots.find((b) => b.Id === cfg.botId);
			if (cur && cur.Name !== cfg.botName) { cfg.botName = cur.Name; save(); }
			return bots;
		} catch (e) {
			botsError = e;
			throw e;
		} finally {
			updateChips();
			renderTray();
		}
	}
	const findBot = (id) => bots.find((b) => b.Id === id);
	const botName = (id) => (findBot(id) || {}).Name || (id === cfg.botId && cfg.botName) || `Bot ${id}`;
	const botOnline = (id) => { const b = findBot(id); return b ? b.Status === 2 : null; };

	function setBot(id) {
		cfg.botId = id;
		cfg.botName = botName(id);
		save();
		updateChips();
		renderTray();
		refreshNowPlaying();
	}

	async function send(videoId, mode, btn) {
		if (!videoId) return notify("There's no video on this page to send.", { kind: "err" });
		if (!ready()) return openSettings();
		const botId = cfg.botId, name = botName(botId);
		setBusy(btn, true);
		notify(mode === "play" ? `Starting it on ${name}…` : `Adding it to the queue on ${name}…`, { kind: "busy" });
		try {
			await api(onBot(botId, mode, `https://youtu.be/${videoId}`));
			notify(mode === "play" ? `Now playing on ${name}` : `Added to the queue on ${name}`, { kind: "ok" });
			flash(btn);
			refreshNowPlaying();
		} catch (e) {
			notify(e.message, { kind: "err", action: fixAction(e) });
		} finally {
			setBusy(btn, false);
		}
	}

	// ---------- snackbar ----------
	let snack, snackTimer;
	function notify(text, { kind = "info", action, ms } = {}) {
		clearTimeout(snackTimer);
		if (!snack || !snack.isConnected) {
			snack = h("div", { role: "status", "aria-live": "polite" });
			document.body.append(snack);
		}
		snack.className = "tsab-snack " + kind;
		snack.replaceChildren(...present(
			kind === "busy" ? spinner() : kind === "err" ? icon("error") : kind === "ok" ? icon("check") : null,
			h("span", { class: "txt", textContent: text }),
			action && h("button", { type: "button", class: "act", textContent: action.label, onclick: () => { hideSnack(); action.fn(); } }),
			h("button", { type: "button", class: "x", "aria-label": "Dismiss", title: "Dismiss", onclick: hideSnack }, icon("close"))));
		placeSnack();
		if (kind !== "busy") snackTimer = setTimeout(hideSnack, ms || (kind === "err" ? 9000 : 4000));
	}
	function hideSnack() { clearTimeout(snackTimer); if (snack) snack.remove(); snack = null; }
	const fixAction = (e) => (e && e.fixable ? { label: "Settings", fn: openSettings } : undefined);
	// keep the snackbar clear of a centred selection tray
	function placeSnack() {
		if (!snack) return;
		const lift = tray && tray.isConnected && tray.dataset.anchored === "0" && innerWidth < 1100 ? tray.offsetHeight + 16 : 0;
		const b = lift ? `${(innerWidth <= 600 ? 8 : 24) + lift}px` : "";
		if (snack.style.bottom !== b) snack.style.bottom = b;
	}

	// ---------- video ids ----------
	function videoIdFrom(href) {
		try {
			const u = new URL(href, location.href);
			if (u.hostname === "youtu.be") return u.pathname.slice(1, 12);
			if (u.pathname === "/watch") return u.searchParams.get("v");
			const m = u.pathname.match(/^\/(shorts|live|embed)\/([\w-]{11})/);
			return m ? m[2] : null;
		} catch (_) { return null; }
	}
	const currentVideoId = () => videoIdFrom(location.href);

	// ---------- bot chip + menu ----------
	function botChip() {
		const dot = h("span", { class: "tsab-dot" });
		const name = h("span", { class: "name" });
		const chip = h("button", { type: "button", class: "tsab-btn tsab-chip", "aria-haspopup": "menu", "aria-expanded": "false",
			onclick: (e) => { e.stopPropagation(); openBotMenu(chip); } }, dot, name, icon("caret"));
		chip.sync = () => {
			const n = botName(cfg.botId), on = botOnline(cfg.botId);
			if (name.textContent !== n) name.textContent = n;
			const dc = "tsab-dot" + (on ? " on" : "");
			if (dot.className !== dc) dot.className = dc;
			const t = `Songs go to ${n}${on === false ? " (offline)" : ""}. Click to choose another bot.`;
			if (chip.title !== t) { chip.title = t; chip.setAttribute("aria-label", `Bot: ${n}${on === false ? ", offline" : ""}. Change bot`); }
		};
		chip.sync();
		return chip;
	}
	// "on <bot>" never wraps apart
	const dest = (chip) => h("span", { class: "tsab-dest" }, h("span", { class: "tsab-on", textContent: "on" }), chip);
	function updateChips() { document.querySelectorAll(".tsab-chip").forEach((c) => c.sync && c.sync()); }

	let pop;
	function closePop() {
		if (!pop) return;
		pop.anchor.setAttribute("aria-expanded", "false");
		pop.remove();
		pop = null;
	}
	document.addEventListener("mousedown", (e) => {
		if (pop && !pop.contains(e.target) && !pop.anchor.contains(e.target)) closePop();
	}, true);

	function openBotMenu(anchor) {
		if (pop && pop.anchor === anchor) { closePop(); return; }
		closePop();
		pop = h("div", { class: "tsab-pop", role: "menu", "aria-label": "Choose the bot that receives songs" });
		pop.anchor = anchor;
		anchor.setAttribute("aria-expanded", "true");
		const fill = () => {
			const items = [h("div", { class: "tsab-pop-head", textContent: "Send songs to" })];
			if (!ready()) items.push(h("p", { class: "tsab-pop-note", textContent: "Not connected to a bot server yet." }));
			else if (!bots.length && botsError) items.push(h("p", { class: "tsab-pop-note err", textContent: botsError.message }));
			else if (!bots.length) items.push(h("p", { class: "tsab-pop-note", textContent: "Loading bots…" }));
			for (const b of bots) {
				const on = b.Status === 2;
				items.push(h("button", { type: "button", class: "tsab-item", role: "menuitemradio", "aria-checked": String(b.Id === cfg.botId),
					onclick: () => { setBot(b.Id); closePop(); anchor.focus(); } },
					h("span", { class: "tsab-dot" + (on ? " on" : "") }),
					h("span", { class: "main" }, h("span", { textContent: b.Name }),
						h("small", { textContent: [b.Server, on ? "Online" : "Offline"].filter(Boolean).join(" · ") })),
					icon("check", "tick")));
			}
			items.push(h("div", { class: "tsab-sep", role: "separator" }));
			items.push(h("button", { type: "button", class: "tsab-item", role: "menuitem", onclick: () => { closePop(); openSettings(); } },
				icon("gear"), h("span", { class: "main" }, h("span", { textContent: "Connection settings" }))));
			pop.replaceChildren(...items);
			place();
		};
		const place = () => {
			const r = anchor.getBoundingClientRect(), pw = pop.offsetWidth, ph = pop.offsetHeight;
			const top = r.bottom + 6 + ph <= innerHeight - 8 ? r.bottom + 6 : Math.max(8, r.top - 6 - ph);
			pop.style.top = `${top}px`;
			const vw = document.documentElement.clientWidth || innerWidth; // excludes the scrollbar
			pop.style.left = `${Math.max(8, Math.min(r.left, vw - pw - 8))}px`;
		};
		pop.addEventListener("keydown", (e) => {
			const items = [...pop.querySelectorAll(".tsab-item")];
			const i = items.indexOf(document.activeElement);
			if (e.key !== "Tab") e.stopPropagation(); // keep arrows/Space away from YouTube's player shortcuts
			if (e.key === "Escape") { e.stopPropagation(); closePop(); anchor.focus(); }
			else if (e.key === "ArrowDown") { e.preventDefault(); items[(i + 1) % items.length].focus(); }
			else if (e.key === "ArrowUp") { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
			else if (e.key === "Tab") closePop();
		});
		document.body.append(pop);
		fill();
		(pop.querySelector("[aria-checked=true]") || pop.querySelector(".tsab-item")).focus({ preventScroll: true });
		if (ready()) {
			const reopen = () => { if (pop && pop.anchor === anchor) { const had = pop.contains(document.activeElement); fill(); if (had) (pop.querySelector("[aria-checked=true]") || pop.querySelector(".tsab-item")).focus({ preventScroll: true }); } };
			loadBots().then(reopen, reopen);
		}
	}

	// ---------- connection settings ----------
	let dlg;
	function openSettings() {
		closePop();
		hideSnack();
		if (dlg) return;
		let tested = null; // { key, bots } from the last successful check

		const field = (id, label, input, hint) => h("div", { class: "tsab-field" },
			h("label", { for: id, textContent: label }), input, hint && h("div", { class: "tsab-hint", id: id + "-hint" }, hint));
		const input = (id, props) => {
			const el = h("input", Object.assign({ id, class: "tsab-input", autocomplete: "off", "aria-describedby": id + "-hint" }, props));
			el.spellcheck = false;
			return el;
		};

		const server = input("tsab-server", { type: "text", inputMode: "url", value: cfg.baseUrl, placeholder: "https://music.example.org" });
		const uid = input("tsab-uid", { type: "text", value: cfg.uid, placeholder: "e.g. kXa1bC2dE3fG4hI5jK6lM7nO8p0=" });
		const token = input("tsab-token", { type: "password", value: cfg.token, placeholder: "Paste the token the bot sent you" });
		const reveal = h("button", { type: "button", class: "tsab-btn small quiet", textContent: "Show", "aria-pressed": "false",
			onclick: () => { const show = token.type === "password"; token.type = show ? "text" : "password"; reveal.textContent = show ? "Hide" : "Show"; reveal.setAttribute("aria-pressed", String(show)); } });
		const hover = h("input", { type: "checkbox", id: "tsab-hover", checked: cfg.hoverButtons });
		const status = h("div", { class: "tsab-status", role: "status", "aria-live": "polite" });
		const botList = h("div", { class: "list" });
		const botSet = h("fieldset", { class: "tsab-bots", hidden: true }, h("legend", { textContent: "Default bot" }), botList);
		const checkBtn = button("Check connection", null, "", () => check());

		const read = () => {
			let baseUrl = server.value.trim().replace(/\/+$/, "").replace(/\/api$/, "");
			if (baseUrl && !/^https?:\/\//i.test(baseUrl)) baseUrl = "https://" + baseUrl;
			return { baseUrl, uid: uid.value.trim(), token: token.value.trim() };
		};
		const keyOf = (c) => [c.baseUrl, c.uid, c.token].join("\n");
		const setStatus = (kind, text) => {
			status.className = "tsab-status " + kind;
			status.replaceChildren(...present(kind === "busy" ? spinner() : kind === "ok" ? icon("check") : kind === "err" ? icon("error") : null,
				h("span", { textContent: text })));
		};
		const showBots = (list) => {
			const pick = list.some((b) => b.Id === cfg.botId) ? cfg.botId : ((list.find((b) => b.Status === 2) || list[0]) || {}).Id;
			botList.replaceChildren(...list.map((b) => h("label", { class: "tsab-bot-opt" },
				h("input", { type: "radio", name: "tsab-bot", value: b.Id, checked: b.Id === pick }),
				h("span", { class: "tsab-dot" + (b.Status === 2 ? " on" : "") }),
				h("span", { class: "main" }, h("span", { textContent: b.Name }),
					h("small", { textContent: [b.Server, b.Status === 2 ? "Online" : "Offline"].filter(Boolean).join(" · ") })))));
			botSet.hidden = !list.length;
		};
		const markInvalid = (el, bad) => el.setAttribute("aria-invalid", String(bad));

		async function check() {
			const c = read();
			markInvalid(server, !c.baseUrl);
			markInvalid(uid, !c.uid);
			markInvalid(token, !c.token);
			if (!c.baseUrl || !c.uid || !c.token) {
				setStatus("err", !c.baseUrl ? "Enter the server address first." : "Enter your unique ID and token first.");
				(!c.baseUrl ? server : !c.uid ? uid : token).focus();
				return false;
			}
			const plain = /^http:\/\/(?!(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)[^/]*)/i.test(c.baseUrl);
			if (plain) {
				markInvalid(server, true);
				setStatus("err", "Use an https:// address. Over plain http your token would travel unencrypted.");
				server.focus();
				return false;
			}
			setStatus("busy", "Checking…");
			setBusy(checkBtn, true);
			try {
				const r = await api("/bot/list", c);
				const list = Array.isArray(r) ? r : [];
				tested = { key: keyOf(c), bots: list };
				const online = list.filter((b) => b.Status === 2).length;
				setStatus("ok", list.length ? `Connected. ${list.length} bot${list.length === 1 ? "" : "s"}, ${online} online.` : "Connected, but this server has no bots running.");
				showBots(list);
				return true;
			} catch (e) {
				tested = null;
				setStatus("err", e.message);
				return false;
			} finally {
				setBusy(checkBtn, false);
			}
		}

		const form = h("form", { onsubmit: async (e) => {
			e.preventDefault();
			const c = read();
			if (!tested || tested.key !== keyOf(c)) { if (!(await check())) return; }
			if (!self.open) return; // closed while the check was running: keep the old settings
			Object.assign(cfg, c);
			cfg.hoverButtons = hover.checked;
			bots = tested.bots;
			botsError = null;
			const picked = botList.querySelector("input:checked");
			if (picked) cfg.botId = Number(picked.value);
			cfg.botName = botName(cfg.botId);
			cfg.introSeen = true;
			save();
			self.close();
			if (!cfg.hoverButtons) hideHover();
			rebuildBar();
			updateChips();
			decorateLists();
			notify(bots.length ? `Connected. Songs go to ${botName(cfg.botId)}.` : "Connected, but the server has no bots yet.", { kind: "ok" });
		} },
			h("div", { class: "tsab-dlg-head" },
				h("h2", { id: "tsab-dlg-title", textContent: ready() ? "TS3AudioBot connection" : "Connect to your TS3AudioBot" }),
				h("button", { type: "button", class: "tsab-btn icon-only quiet", "aria-label": "Close", title: "Close", onclick: () => dlg.close() }, icon("close"))),
			h("div", { class: "tsab-dlg-body" },
				h("p", { class: "tsab-lede", textContent: "Send YouTube songs to a TeamSpeak music bot. You need the bot server's address and a personal token, which the bot gives you." }),
				field("tsab-server", "Server address", server, "The web address of the bot's API. Ask whoever runs the bot."),
				field("tsab-uid", "Your TeamSpeak unique ID", uid, "In TeamSpeak: Tools > Identities > Unique ID. It ends with \"=\"."),
				field("tsab-token", "API token", h("div", { class: "tsab-with-btn" }, token, reveal),
					h("span", {}, "Send any bot a private message ", h("code", { textContent: "!api token" }), ". It replies with your token.")),
				h("div", { class: "tsab-check-row" }, checkBtn, status),
				botSet,
				h("label", { class: "tsab-toggle", for: "tsab-hover" }, hover,
					h("span", {}, "Show Play and Queue buttons on thumbnails",
						h("span", { class: "tsab-hint", style: { display: "block", marginTop: "2px" }, textContent: "They appear when you point at a video anywhere on YouTube." })))),
			h("div", { class: "tsab-dlg-foot" },
				h("button", { type: "button", class: "tsab-btn quiet", textContent: "Cancel", onclick: () => dlg.close() }),
				h("button", { type: "submit", class: "tsab-btn primary", textContent: "Save" })));

		const self = dlg = h("dialog", { class: "tsab-dialog", "aria-labelledby": "tsab-dlg-title" }, form);
		// keep YouTube's keyboard shortcuts from firing while typing
		for (const ev of ["keydown", "keyup", "keypress"]) dlg.addEventListener(ev, (e) => e.stopPropagation());
		// backdrop click closes, but not a text-selection drag that ends outside the form
		let downOnBackdrop = false;
		dlg.addEventListener("mousedown", (e) => { downOnBackdrop = e.target === dlg; });
		dlg.addEventListener("click", (e) => { if (e.target === dlg && downOnBackdrop) dlg.close(); });
		dlg.addEventListener("close", () => { dlg.remove(); dlg = null; });
		document.body.append(dlg);
		dlg.showModal();
		(!server.value ? server : !uid.value ? uid : !token.value ? token : checkBtn).focus();
		if (ready()) check();
	}
	GM_registerMenuCommand("Connection settings", openSettings);
	GM_registerMenuCommand("Play this video now", () => send(currentVideoId(), "play"));
	GM_registerMenuCommand("Add this video to the queue", () => send(currentVideoId(), "add"));

	// ---------- watch page bar ----------
	let bar, npEl, npSeq = 0;
	async function refreshNowPlaying() {
		if (!npEl || !npEl.isConnected || !ready() || document.hidden) return;
		const el = npEl, name = botName(cfg.botId), seq = ++npSeq;
		let text, live = false;
		try {
			const s = await api(onBot(cfg.botId, "song"));
			if (s && s.Title) { text = `${s.Paused ? "Paused" : "Playing"} on ${name}: ${s.Title}`; live = !s.Paused; }
			else text = `Nothing is playing on ${name}`;
		} catch (e) {
			text = e.fixable ? e.message : `Nothing is playing on ${name}`;
		}
		if (seq !== npSeq || el.dataset.t === text) return; // a newer request already answered
		el.dataset.t = text;
		el.classList.toggle("live", live);
		el.replaceChildren(icon("eq"), h("span", { textContent: text }));
	}

	function removeBar() { if (bar) bar.remove(); bar = null; npEl = null; }
	function rebuildBar() { removeBar(); ensureBar(); }

	function ensureBar() {
		if (!currentVideoId()) { removeBar(); return; }
		const anchor = document.querySelector("ytd-watch-metadata #title, #above-the-fold #title, ytd-reel-video-renderer[is-active] #metapanel, ytmusic-player-bar .middle-controls");
		if (!anchor) return;
		const mode = ready() ? "ready" : "setup";
		if (bar && bar.isConnected && bar.previousElementSibling === anchor && bar.dataset.mode === mode) return;
		removeBar();
		const compact = !!anchor.closest("ytmusic-player-bar, ytd-reel-video-renderer");
		const cls = "tsab-bar" + (compact ? " compact" : "");
		if (mode === "setup") {
			bar = h("div", { class: cls, "data-mode": mode },
				button("Connect TS3AudioBot", "gear", "", openSettings, "Set up sending videos to your TeamSpeak music bot"),
				h("span", { class: "tsab-setup-note", textContent: "Send this video to your TeamSpeak music bot." }));
		} else {
			npEl = h("div", { class: "tsab-np" });
			bar = h("div", { class: cls, "data-mode": mode, role: "group", "aria-label": "Send to TeamSpeak bot" },
				button("Play", "play", "primary", (e) => send(currentVideoId(), "play", e.currentTarget), "Play this video now on the TeamSpeak bot (Alt+P)"),
				button("Queue", "queue", "", (e) => send(currentVideoId(), "add", e.currentTarget), "Add this video to the end of the bot's queue (Alt+Q)"),
				dest(botChip()),
				npEl);
		}
		anchor.after(bar);
		if (mode === "ready") {
			if (!bots.length) loadBots().catch(() => {});
			refreshNowPlaying();
		}
	}

	// ---------- hover buttons on thumbnails ----------
	let hoverBox, hoverFor, hoverThumb, hoverTimer;
	function hideHover() { if (hoverBox) hoverBox.remove(); clearTimeout(hoverTimer); hoverBox = hoverFor = hoverThumb = null; }
	// YouTube's hover autoplay lays a separate preview player over the thumbnail; it counts as the same thumbnail
	const PREVIEW = "ytd-video-preview, #video-preview, ytd-moving-thumbnail-renderer, #inline-preview-player";
	const VIDEO_LINK = "a[href*='/watch?v='], a[href^='/shorts/'], a[href*='youtu.be/']";
	const inZone = (t) => !!(t && t.nodeType === 1 && ((hoverBox && hoverBox.contains(t)) || (hoverFor && hoverFor.contains(t)) || t.closest(PREVIEW)));
	// the box is position:fixed, so it follows the thumbnail through scrolling and layout shifts
	function followHover() {
		clearTimeout(hoverTimer);
		if (!hoverBox) return;
		const r = hoverThumb.isConnected ? hoverThumb.getBoundingClientRect() : null;
		if (!r || r.width < 120 || !r.height) return hideHover();
		const top = `${Math.round(r.top + 6)}px`, left = `${Math.round(r.left + 6)}px`;
		if (hoverBox.style.top !== top) hoverBox.style.top = top;
		if (hoverBox.style.left !== left) hoverBox.style.left = left;
		hoverTimer = setTimeout(followHover, 120);
	}
	// what the pointer is on: a thumbnail link, or the preview player that covers one
	function hoverTarget(t) {
		const pv = t.closest(PREVIEW);
		if (pv) {
			const link = pv.querySelector(VIDEO_LINK);
			return link ? { zone: pv, href: link.href, thumb: pv } : null;
		}
		const a = t.closest(VIDEO_LINK);
		if (!a || a.closest(LIST_ITEMS)) return null; // Mix / playlist rows have checkboxes instead
		const img = a.querySelector("img, yt-image, yt-thumbnail-view-model");
		if (!img) return null; // only thumbnails, not every text link
		// anchor to the thumbnail, not the link: some links span a whole row
		return { zone: a, href: a.href, thumb: a.querySelector("ytd-thumbnail, yt-thumbnail-view-model, yt-image, img") || img };
	}
	document.addEventListener("mouseover", (e) => {
		if (!cfg.hoverButtons || !e.target.closest) return;
		if (hoverBox && inZone(e.target)) return;
		// pointer left the thumbnail, its preview and our buttons (mouseleave can be missed after overlay round trips)
		if (hoverBox) hideHover();
		const target = hoverTarget(e.target);
		if (!target) return;
		const id = videoIdFrom(target.href);
		if (!id) return;
		const r = target.thumb.getBoundingClientRect();
		if (r.width < 120 || !r.height) return;
		const a = target.zone;
		hoverFor = a;
		hoverThumb = target.thumb;
		const tip = h("span", { class: "tip" });
		const mk = (iconName, mode, label) => {
			const b = h("button", { type: "button", "aria-label": label, onclick: (ev) => { ev.preventDefault(); ev.stopPropagation(); send(id, mode, b); } },
				spinner(), icon(iconName));
			const say = () => { tip.textContent = ready() ? `${label} on ${botName(cfg.botId)}` : "Set up TS3AudioBot first"; };
			b.addEventListener("mouseenter", say);
			b.addEventListener("focus", say);
			return b;
		};
		hoverBox = h("div", { class: "tsab-hover", style: { top: `${r.top + 6}px`, left: `${r.left + 6}px` } },
			mk("play", "play", "Play now"), mk("queue", "add", "Queue"), tip);
		hoverBox.addEventListener("mouseleave", (ev) => { if (!inZone(ev.relatedTarget)) hideHover(); });
		a.addEventListener("mouseleave", (ev) => { if (!inZone(ev.relatedTarget)) hideHover(); }, { once: true });
		document.body.append(hoverBox);
		hoverTimer = setTimeout(followHover, 120);
	}, true);

	// ---------- multi-select on Mixes and playlists ----------
	const LIST_ITEMS = "ytd-playlist-panel-video-renderer, ytd-playlist-video-renderer";
	const selected = new Map(); // videoId -> title
	let lastClicked = null, job = null, result = null, resultTimer, trayExpanded = false;

	const itemId = (el) => {
		const a = el.querySelector("a#wc-endpoint, a#video-title, a#thumbnail, a[href*='/watch?v=']");
		return a ? videoIdFrom(a.href) : null;
	};
	const itemTitle = (el) => (el.querySelector("#video-title")?.textContent || "").trim();
	const visibleItems = () => [...document.querySelectorAll(LIST_ITEMS)].filter((el) => el.isConnected && itemId(el));
	const panelSongs = (panel) => [...panel.querySelectorAll("ytd-playlist-panel-video-renderer")].filter((el) => itemId(el));

	function toggle(el, on) {
		const id = itemId(el);
		if (!id) return;
		if (on) selected.set(id, itemTitle(el)); else selected.delete(id);
	}
	// picking songs again means the last result has been seen
	function selectionChanged() {
		if (result) { result = null; clearTimeout(resultTimer); }
		decorateLists();
	}

	function decorateLists() {
		for (const el of visibleItems()) {
			let cb = el.querySelector(":scope .tsab-cb");
			if (!cb) {
				cb = h("input", { type: "checkbox", class: "tsab-cb", "aria-label": "Select for the TeamSpeak bot", title: "Select for the TeamSpeak bot. Shift+click selects a range." });
				// stop YouTube from treating the click as "open this video"
				// (stopping it in a separate capture listener would also skip our own click handler below)
				for (const ev of ["mousedown", "mouseup"]) cb.addEventListener(ev, (e) => e.stopPropagation());
				cb.addEventListener("click", (e) => {
					e.stopPropagation();
					const all = visibleItems();
					if (e.shiftKey && lastClicked && all.includes(lastClicked)) {
						const [x, y] = [all.indexOf(lastClicked), all.indexOf(el)].sort((p, q) => p - q);
						all.slice(x, y + 1).forEach((it) => toggle(it, cb.checked));
					} else {
						toggle(el, cb.checked);
					}
					lastClicked = el;
					selectionChanged();
				});
				const spot = el.querySelector("#index-container") || el.querySelector("#container, #content") || el.firstElementChild;
				(spot && spot.parentElement ? spot.parentElement : el).insertBefore(cb, spot && spot.parentElement ? spot : el.firstChild);
			}
			// YouTube recycles these elements for other videos, so always resync
			const want = selected.has(itemId(el));
			if (cb.checked !== want) cb.checked = want;
			if (cb.disabled !== !!job) cb.disabled = !!job;
		}
		decoratePanels();
		renderTray();
	}

	// one "Select all" per Mix / playlist side panel, in its header
	function decoratePanels() {
		for (const panel of document.querySelectorAll("ytd-playlist-panel-renderer")) {
			const spot = panel.querySelector("#playlist-actions") || panel.querySelector("#header-contents");
			if (!spot) continue;
			let btn = spot.querySelector(":scope > .tsab-panel-all");
			if (!btn) {
				btn = h("button", { type: "button", class: "tsab-btn small tsab-panel-all", onclick: (e) => {
					e.stopPropagation();
					const list = panelSongs(panel);
					const all = list.length && list.every((el) => selected.has(itemId(el)));
					list.forEach((el) => toggle(el, !all));
					selectionChanged();
				} });
				spot.append(btn);
			}
			const songs = panelSongs(panel);
			btn.hidden = !songs.length;
			if (!songs.length) continue;
			const all = songs.every((el) => selected.has(itemId(el)));
			const key = `${all}|${songs.length}|${!!job}`;
			if (btn.dataset.k === key) continue;
			btn.dataset.k = key;
			btn.disabled = !!job;
			btn.setAttribute("aria-pressed", String(all));
			btn.title = all ? "Unselect every song in this list" : `Select all ${songs.length} songs in this list for the TeamSpeak bot`;
			btn.replaceChildren(icon(all ? "boxOn" : "boxOff"), h("span", { class: "tsab-label", textContent: all ? "All selected" : `Select all ${songs.length}` }));
		}
	}

	function activePanel() {
		return [...document.querySelectorAll("ytd-playlist-panel-renderer")].find((p) => {
			const r = p.getBoundingClientRect();
			return r.width >= 300 && r.height >= 240 && p.querySelector("ytd-playlist-panel-video-renderer");
		}) || null;
	}

	// ---------- selection tray: selection, then progress, then result ----------
	let tray, trayKey = "";
	function renderTray() {
		const onPlaylistPage = location.pathname === "/playlist";
		if (!tray && !job && !result && !selected.size && !onPlaylistPage) return; // nothing to show: skip layout reads
		const panel = activePanel();
		const pageItems = onPlaylistPage ? [...document.querySelectorAll("ytd-playlist-video-renderer")].filter((el) => itemId(el)) : [];
		const mode = job ? "job" : result ? "result" : selected.size ? "select" : pageItems.length ? "idle" : "none";
		if (mode === "none") {
			if (tray) { tray.remove(); tray = null; trayKey = ""; }
			placeSnack();
			return;
		}
		const pageAll = pageItems.length > 0 && pageItems.every((el) => selected.has(itemId(el)));
		// bot name and status changes are handled by the chip itself (chip.sync), so a menu opened from it survives
		const key = JSON.stringify([mode, selected.size, cfg.botId, ready(), trayExpanded,
			pageItems.length, pageAll, job && [job.done, job.total, job.current, job.stop], result && [result.ok, result.total, result.failed.length, result.notSent]]);
		if (!tray || !tray.isConnected) {
			tray = h("div", { class: "tsab-tray", role: "region", "aria-label": "Songs for the TeamSpeak bot" });
			document.body.append(tray);
			trayKey = "";
		}
		if (key !== trayKey) {
			trayKey = key;
			const focused = tray.contains(document.activeElement) ? document.activeElement.dataset.k : null;
			tray.replaceChildren(...present(...buildTray(mode, pageItems, pageAll)));
			const again = focused && tray.querySelector(`[data-k="${focused}"]`);
			if (again) again.focus({ preventScroll: true });
		}
		placeTray(panel);
		placeSnack();
	}

	function buildTray(mode, pageItems, pageAll) {
		const name = botName(cfg.botId);
		const msg = (title, sub) => h("div", { class: "msg" }, h("b", { textContent: title }), sub && h("small", { textContent: sub, title: sub }));
		const keyed = (el, k) => { el.dataset.k = k; return el; };
		const pageToggle = () => pageItems.length > 0 && keyed(button(pageAll ? "Clear all" : `Select all ${pageItems.length}`, pageAll ? "boxOn" : "boxOff", "small quiet", () => {
			pageItems.forEach((el) => toggle(el, !pageAll));
			selectionChanged();
		}, pageAll ? "Unselect every song on this page" : `Select the ${pageItems.length} songs loaded on this page. Scroll down to load more.`), "page");

		if (mode === "idle") {
			return [h("div", { class: "tsab-tray-row" }, msg("Pick songs for the TeamSpeak bot", "Tick the boxes next to songs, then queue them."), pageToggle())];
		}
		if (mode === "select") {
			const n = selected.size;
			return [h("div", { class: "tsab-tray-row" },
				keyed(h("button", { type: "button", class: "tsab-btn icon-only quiet", "aria-label": "Clear selection", title: "Clear selection",
					onclick: () => { selected.clear(); selectionChanged(); } }, icon("close")), "clear"),
				msg(`${n} song${n === 1 ? "" : "s"} selected`, null),
				pageAll ? null : pageToggle(),
				h("div", { class: "send" },
					keyed(button(`Queue ${n}`, "queue", "primary", queueSelected, `Add the selected songs to the end of the queue on ${name}`), "go"),
					dest(keyed(botChip(), "chip"))))];
		}
		if (mode === "job") {
			const pct = Math.round((job.done / job.total) * 100);
			return [
				h("div", { class: "tsab-tray-row" },
					h("span", { class: "lead" }, spinner()),
					msg(job.stop ? "Stopping after this song…" : `Queueing ${Math.min(job.done + 1, job.total)} of ${job.total} on ${job.name}`, job.current),
					keyed(h("button", { type: "button", class: "tsab-btn", textContent: "Stop", disabled: job.stop, onclick: () => { job.stop = true; renderTray(); } }), "stop")),
				h("div", { class: "tsab-progress", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": String(job.total), "aria-valuenow": String(job.done) },
					h("i", { style: { transform: `scaleX(${pct / 100})` } }))];
		}
		// result
		const r = result, bad = r.failed.length > 0, left = selected.size;
		const parts = [];
		if (bad) parts.push(`${r.failed.length} failed`);
		if (r.notSent) parts.push(`${r.notSent} not sent`);
		const sub = parts.length ? `${parts.join(", ")}. ${left ? "They're still selected." : ""}`.trim() : null;
		const title = r.ok === r.total ? `Queued all ${r.total} on ${r.name}` : `Queued ${r.ok} of ${r.total} on ${r.name}`;
		const actions = present(
			bad && keyed(h("button", { type: "button", class: "tsab-btn small quiet", textContent: trayExpanded ? "Hide reasons" : "Why?", "aria-expanded": String(trayExpanded),
				onclick: () => { trayExpanded = !trayExpanded; renderTray(); } }), "why"),
			left > 0 && keyed(button(`Try ${left} again`, "queue", "small", queueSelected, `Queue the ${left} songs that are still selected on ${name}`), "retry"));
		const rows = [h("div", { class: "tsab-tray-row" },
			h("span", { class: "lead " + (bad || r.notSent ? "err" : "ok") }, icon(bad || r.notSent ? "error" : "check")),
			msg(title, sub),
			keyed(h("button", { type: "button", class: "tsab-btn icon-only quiet", "aria-label": "Dismiss", title: "Dismiss",
				onclick: () => { result = null; trayExpanded = false; renderTray(); } }, icon("close")), "dismiss"))];
		if (actions.length) rows.push(h("div", { class: "tsab-tray-row tsab-actions" }, actions));
		if (bad && trayExpanded) {
			rows.push(h("ul", { class: "tsab-fails" }, r.failed.map((f) => h("li", {}, h("span", { textContent: f.title }), h("span", { class: "why", textContent: f.msg })))));
		}
		return rows;
	}

	function placeTray(panel) {
		const r = panel && panel.getBoundingClientRect();
		let pos;
		// only while the whole tray fits below YouTube's 56px top bar
		if (r && Math.min(r.bottom, innerHeight) - tray.offsetHeight - 12 > 72 && r.top < innerHeight - 120) {
			// sit inside the bottom edge of the Mix panel, so the tray stays next to the songs
			const bottom = Math.max(12, innerHeight - Math.min(r.bottom, innerHeight) + 12);
			pos = { left: `${r.left + 8}px`, width: `${r.width - 16}px`, bottom: `${bottom}px`, transform: "", anchored: "1" };
		} else {
			pos = { left: "50%", width: "", bottom: innerWidth <= 600 ? "8px" : "24px", transform: "translateX(-50%)", anchored: "0" };
		}
		const sig = JSON.stringify(pos);
		if (tray.dataset.pos === sig) return;
		tray.dataset.pos = sig;
		tray.dataset.anchored = pos.anchored;
		Object.assign(tray.style, { left: pos.left, width: pos.width, bottom: pos.bottom, transform: pos.transform });
	}
	let placeQueued = false;
	const queuePlace = () => {
		if (placeQueued || !tray) return;
		placeQueued = true;
		setTimeout(() => { placeQueued = false; if (tray) { placeTray(activePanel()); placeSnack(); } }, 60);
	};
	addEventListener("resize", queuePlace, { passive: true });

	async function queueSelected() {
		if (job) return;
		if (!ready()) return openSettings();
		// playlist order first, then anything selected that has scrolled out of the DOM
		const inDom = visibleItems().map(itemId).filter((id) => selected.has(id));
		const order = [...new Set([...inDom, ...selected.keys()])];
		if (!order.length) return;
		clearTimeout(resultTimer);
		result = null;
		trayExpanded = false;
		job = { name: botName(cfg.botId), botId: cfg.botId, total: order.length, done: 0, failed: [], stop: false, current: "" };
		decorateLists();
		for (const id of order) {
			if (job.stop) break;
			const title = selected.get(id) || id;
			job.current = title;
			renderTray();
			try {
				await api(onBot(job.botId, "add", `https://youtu.be/${id}`));
				selected.delete(id);
			} catch (e) {
				job.failed.push({ title, msg: e.message });
				if (e.fixable) job.stop = true; // server unreachable or login rejected: the rest would fail the same way
			}
			job.done++;
		}
		const j = job;
		job = null;
		result = { name: j.name, total: j.total, ok: j.done - j.failed.length, failed: j.failed, notSent: j.total - j.done };
		trayExpanded = j.failed.length > 0 && j.failed.length <= 3;
		decorateLists();
		refreshNowPlaying();
		const shown = result;
		if (!j.failed.length && !result.notSent) resultTimer = setTimeout(() => { if (result === shown) { result = null; renderTray(); } }, 6000);
	}

	// ---------- hotkeys ----------
	document.addEventListener("keydown", (e) => {
		if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
		const k = e.key.toLowerCase();
		if (k !== "p" && k !== "q") return;
		const t = e.target;
		if (t && (t.isContentEditable || /^(input|textarea|select)$/i.test(t.tagName))) return;
		const id = currentVideoId();
		if (!id) return;
		e.preventDefault();
		const btn = bar && bar.querySelectorAll(".tsab-btn")[k === "p" ? 0 : 1];
		send(id, k === "p" ? "play" : "add", bar && bar.dataset.mode === "ready" ? btn : null);
	}, true);

	// ---------- SPA navigation ----------
	document.addEventListener("scroll", (e) => {
		followHover(); // keep the thumbnail buttons on their thumbnail; the next mouseover swaps them if the card changed
		if (pop && !pop.contains(e.target)) closePop();
		queuePlace();
	}, { capture: true, passive: true });
	window.addEventListener("yt-navigate-start", () => {
		hideHover();
		closePop();
		if (result && !job) { result = null; trayExpanded = false; } // selection carries over between pages, old results don't
	});
	window.addEventListener("yt-navigate-finish", () => setTimeout(() => { ensureBar(); decorateLists(); }, 300));
	let pending = false;
	new MutationObserver(() => {
		if (pending) return;
		pending = true;
		// setTimeout, not rAF: rAF is paused in hidden tabs, which would stall the observer
		setTimeout(() => { pending = false; ensureBar(); decorateLists(); }, 150);
	}).observe(document.body, { childList: true, subtree: true });
	setInterval(refreshNowPlaying, 30000);
	document.addEventListener("visibilitychange", () => { if (!document.hidden) refreshNowPlaying(); });
	ensureBar();
	decorateLists();
	if (ready()) loadBots().catch(() => {});

	if (!ready() && !cfg.introSeen) {
		setTimeout(() => {
			notify("TS3AudioBot Sender is installed. Connect it to your bot to start sending songs.", { action: { label: "Set up", fn: openSettings }, ms: 15000 });
			cfg.introSeen = true;
			save();
		}, 2500);
	}
})();
