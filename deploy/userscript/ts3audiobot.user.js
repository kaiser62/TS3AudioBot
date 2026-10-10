// ==UserScript==
// @name         TS3AudioBot Sender
// @namespace    https://github.com/kaiser62/TS3AudioBot
// @version      1.1.0
// @description  Send YouTube videos to a TS3AudioBot (play now or add to queue).
// @author       kaiser62
// @match        https://www.youtube.com/*
// @match        https://m.youtube.com/*
// @match        https://music.youtube.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @connect      basic.int.eu.org
// @connect      localhost
// @connect      *
// @run-at       document-idle
// @homepageURL  https://github.com/kaiser62/TS3AudioBot/tree/master/deploy/userscript
// @downloadURL  https://raw.githubusercontent.com/kaiser62/TS3AudioBot/master/deploy/userscript/ts3audiobot.user.js
// @updateURL    https://raw.githubusercontent.com/kaiser62/TS3AudioBot/master/deploy/userscript/ts3audiobot.user.js
// ==/UserScript==

(function () {
	"use strict";

	// ---------- settings ----------
	const DEFAULTS = { baseUrl: "https://music.basic.int.eu.org", uid: "", token: "", botId: 0, hoverButtons: true };
	const cfg = {};
	for (const k of Object.keys(DEFAULTS)) cfg[k] = GM_getValue(k, DEFAULTS[k]);
	const save = () => { for (const k of Object.keys(DEFAULTS)) GM_setValue(k, cfg[k]); };
	let bots = [];

	// ---------- tiny DOM helper (YouTube enforces Trusted Types: no innerHTML) ----------
	function h(tag, props, ...children) {
		const el = document.createElement(tag);
		for (const [k, v] of Object.entries(props || {})) {
			if (k === "style") Object.assign(el.style, v);
			else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
			else if (k === "class") el.className = v;
			else el[k] = v;
		}
		for (const c of children.flat()) if (c != null) el.append(c.nodeType ? c : String(c));
		return el;
	}

	const css = `
.tsab-bar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:8px 0;font:500 14px Roboto,Arial,sans-serif}
.tsab-btn{border:0;border-radius:18px;padding:0 14px;height:34px;cursor:pointer;font:500 14px Roboto,Arial,sans-serif;
  background:var(--yt-spec-badge-chip-background,#f2f2f2);color:var(--yt-spec-text-primary,#0f0f0f)}
.tsab-btn:hover{filter:brightness(.92)}
.tsab-btn.primary{background:#2580c3;color:#fff}
.tsab-btn:disabled{opacity:.5;cursor:default}
.tsab-sel{height:34px;border-radius:18px;padding:0 10px;border:1px solid var(--yt-spec-10-percent-layer,#ccc);
  background:transparent;color:var(--yt-spec-text-primary,#0f0f0f);font:inherit}
.tsab-sel option{color:#0f0f0f}
.tsab-np{color:var(--yt-spec-text-secondary,#606060);font-size:13px;max-width:420px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tsab-toast{position:fixed;left:50%;bottom:32px;transform:translateX(-50%);z-index:999999;padding:10px 16px;border-radius:8px;
  font:500 14px Roboto,Arial,sans-serif;color:#fff;background:#323232;box-shadow:0 4px 16px rgba(0,0,0,.3);max-width:80vw}
.tsab-toast.err{background:#b3261e}
.tsab-hover{position:absolute;z-index:999998;display:flex;gap:4px}
.tsab-hover button{border:0;border-radius:6px;width:30px;height:30px;cursor:pointer;background:rgba(0,0,0,.8);color:#fff;font-size:15px}
.tsab-hover button:hover{background:#2580c3}
.tsab-cb{width:18px;height:18px;margin:0 6px 0 2px;flex:none;align-self:center;cursor:pointer;accent-color:#2580c3}
.tsab-multi{position:fixed;left:16px;bottom:16px;z-index:999997;display:flex;gap:8px;align-items:center;padding:8px 10px;border-radius:12px;
  background:var(--yt-spec-base-background,#fff);box-shadow:0 4px 18px rgba(0,0,0,.35);font:500 14px Roboto,Arial,sans-serif;color:var(--yt-spec-text-primary,#0f0f0f)}
.tsab-modal-bg{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:1000000;display:flex;align-items:center;justify-content:center}
.tsab-modal{background:#fff;color:#0f0f0f;border-radius:12px;padding:20px;width:min(440px,92vw);font:14px Roboto,Arial,sans-serif}
.tsab-modal h2{margin:0 0 12px;font-size:18px}
.tsab-modal label{display:block;margin:10px 0 4px;font-weight:500}
.tsab-modal input[type=text],.tsab-modal input[type=password],.tsab-modal select{width:100%;box-sizing:border-box;height:34px;padding:0 8px;border:1px solid #ccc;border-radius:6px;font:inherit}
.tsab-modal .hint{color:#606060;font-size:12px;margin-top:4px}
.tsab-modal .row{display:flex;gap:8px;justify-content:flex-end;margin-top:16px}
`;
	document.head.append(h("style", { textContent: css }));

	// ---------- API ----------
	function api(path) {
		return new Promise((resolve, reject) => {
			if (!cfg.baseUrl) return reject(new Error("Set the server URL in TS3AudioBot settings first."));
			const headers = {};
			if (cfg.uid && cfg.token) headers.Authorization = "Basic " + btoa(unescape(encodeURIComponent(cfg.uid + ":" + cfg.token)));
			GM_xmlhttpRequest({
				method: "GET",
				url: cfg.baseUrl.replace(/\/+$/, "") + "/api" + path,
				headers,
				timeout: 40000,
				onload: (r) => {
					let body = null;
					try { body = r.responseText ? JSON.parse(r.responseText) : null; } catch (_) { body = r.responseText; }
					if (r.status >= 200 && r.status < 300) return resolve(body);
					const msg = (body && body.ErrorMessage) || `HTTP ${r.status}`;
					reject(new Error(r.status === 401 ? `${msg} (check your UID/token in settings)` : msg));
				},
				onerror: () => reject(new Error("Cannot reach the bot server.")),
				ontimeout: () => reject(new Error("Bot server did not answer in time.")),
			});
		});
	}
	// Same escaping as the official web interface: encodeURIComponent plus parentheses.
	const seg = (s) => "/" + encodeURIComponent(s).replace(/\(/g, "%28").replace(/\)/g, "%29");
	const onBot = (id, ...cmd) => `/bot/use/${id}/(${cmd.map(seg).join("")})`;

	async function loadBots() {
		bots = await api("/bot/list");
		return bots;
	}
	const botName = (id) => (bots.find((b) => b.Id === id) || {}).Name || `bot ${id}`;

	async function send(videoId, mode, botId = cfg.botId) {
		const link = `https://youtu.be/${videoId}`;
		toast(`${mode === "play" ? "Playing" : "Queueing"} on ${botName(botId)}...`);
		try {
			await api(onBot(botId, mode, link));
			toast(`${mode === "play" ? "Now playing" : "Added to queue"} on ${botName(botId)}`);
			refreshNowPlaying();
		} catch (e) {
			toast(e.message, true);
		}
	}

	// ---------- UI bits ----------
	let toastTimer;
	function toast(text, isErr) {
		document.querySelectorAll(".tsab-toast").forEach((t) => t.remove());
		const t = h("div", { class: "tsab-toast" + (isErr ? " err" : ""), textContent: "TS3AudioBot: " + text });
		document.body.append(t);
		clearTimeout(toastTimer);
		toastTimer = setTimeout(() => t.remove(), isErr ? 7000 : 3500);
	}

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

	function botSelect() {
		const sel = h("select", { class: "tsab-sel", title: "Which bot receives the song" });
		const fill = () => {
			sel.replaceChildren(...(bots.length ? bots : [{ Id: cfg.botId, Name: `bot ${cfg.botId}` }]).map((b) =>
				h("option", { value: b.Id, textContent: b.Name + (b.Status === 2 ? "" : " (offline)"), selected: b.Id === cfg.botId })));
		};
		fill();
		sel.addEventListener("change", () => { cfg.botId = Number(sel.value); save(); refreshNowPlaying(); });
		sel.addEventListener("focus", () => loadBots().then(fill).catch(() => {}), { once: true });
		sel.fill = fill;
		return sel;
	}

	// ---------- settings dialog ----------
	function openSettings() {
		const base = h("input", { type: "text", value: cfg.baseUrl, placeholder: "https://music.example.org" });
		const uid = h("input", { type: "text", value: cfg.uid, placeholder: "your TeamSpeak unique ID" });
		const token = h("input", { type: "password", value: cfg.token, placeholder: "token from !api token" });
		const hover = h("input", { type: "checkbox", checked: cfg.hoverButtons });
		const status = h("div", { class: "hint" });
		const sel = h("select");
		const fillSel = () => sel.replaceChildren(...bots.map((b) => h("option", { value: b.Id, textContent: `${b.Name} (${b.Server})`, selected: b.Id === cfg.botId })));
		fillSel();

		const apply = () => {
			cfg.baseUrl = base.value.trim(); cfg.uid = uid.value.trim(); cfg.token = token.value.trim();
			cfg.hoverButtons = hover.checked;
			if (sel.value !== "") cfg.botId = Number(sel.value);
		};
		const test = async () => {
			apply();
			status.textContent = "Connecting...";
			try {
				await loadBots();
				fillSel();
				status.textContent = `OK: ${bots.length} bots found.`;
			} catch (e) { status.textContent = "Failed: " + e.message; }
		};

		const bg = h("div", { class: "tsab-modal-bg", onclick: (e) => { if (e.target === bg) bg.remove(); } },
			h("div", { class: "tsab-modal" },
				h("h2", { textContent: "TS3AudioBot settings" }),
				h("label", { textContent: "Server URL" }), base,
				h("label", { textContent: "TeamSpeak unique ID" }), uid,
				h("div", { class: "hint", textContent: "TeamSpeak: Tools > Identities > Unique ID (ends with =)." }),
				h("label", { textContent: "API token" }), token,
				h("div", { class: "hint", textContent: "Send the bot a PRIVATE message: !api token   It replies with your token." }),
				h("label", { textContent: "Default bot" }), sel,
				h("label", {}, hover, " Show quick buttons on video thumbnails"),
				status,
				h("div", { class: "row" },
					h("button", { class: "tsab-btn", textContent: "Test connection", onclick: test }),
					h("button", { class: "tsab-btn primary", textContent: "Save", onclick: () => { apply(); save(); bg.remove(); toast("Settings saved"); rebuildBar(); } }))));
		document.body.append(bg);
		if (cfg.baseUrl) test();
	}
	GM_registerMenuCommand("Settings", openSettings);
	GM_registerMenuCommand("Play current video", () => { const id = currentVideoId(); id ? send(id, "play") : toast("No video on this page", true); });
	GM_registerMenuCommand("Queue current video", () => { const id = currentVideoId(); id ? send(id, "add") : toast("No video on this page", true); });

	// ---------- watch page bar ----------
	let bar, npText;
	async function refreshNowPlaying() {
		if (!npText || !cfg.baseUrl) return;
		try {
			const song = await api(onBot(cfg.botId, "song"));
			npText.textContent = song && song.Title ? `${song.Paused ? "Paused" : "Playing"}: ${song.Title}` : "Bot is idle";
		} catch (_) { npText.textContent = ""; }
	}

	function rebuildBar() {
		if (bar) bar.remove();
		bar = null;
		ensureBar();
	}

	function ensureBar() {
		const id = currentVideoId();
		if (!id) { if (bar) bar.remove(); bar = null; return; }
		const anchor = document.querySelector("ytd-watch-metadata #title, #above-the-fold #title, ytd-reel-video-renderer[is-active] #metapanel, ytmusic-player-bar .middle-controls");
		if (!anchor) return;
		if (bar && bar.isConnected && bar.previousElementSibling === anchor) return;
		if (bar) bar.remove();
		const sel = botSelect();
		npText = h("span", { class: "tsab-np" });
		bar = h("div", { class: "tsab-bar" },
			h("button", { class: "tsab-btn primary", textContent: "▶ Play on TS", title: "Play now (Alt+P)", onclick: () => send(currentVideoId(), "play") }),
			h("button", { class: "tsab-btn", textContent: "+ Queue", title: "Add to the end of the queue (Alt+Q)", onclick: () => send(currentVideoId(), "add") }),
			sel,
			h("button", { class: "tsab-btn", textContent: "⚙", title: "TS3AudioBot settings", onclick: openSettings }),
			npText);
		anchor.after(bar);
		if (cfg.baseUrl) loadBots().then(() => sel.fill()).catch(() => {});
		refreshNowPlaying();
	}

	// ---------- hover buttons on thumbnails / links ----------
	let hoverBox, hoverFor;
	function hideHover() { if (hoverBox) hoverBox.remove(); hoverBox = null; hoverFor = null; }
	document.addEventListener("mouseover", (e) => {
		if (!cfg.hoverButtons) return;
		if (hoverBox && hoverBox.contains(e.target)) return;
		const a = e.target.closest && e.target.closest("a[href*='/watch?v='], a[href^='/shorts/'], a[href*='youtu.be/']");
		if (!a) return;
		const img = a.querySelector("img, yt-image, yt-thumbnail-view-model");
		if (!img) return; // only thumbnails, not every text link
		if (hoverFor === a) return;
		const id = videoIdFrom(a.href);
		if (!id) return;
		hideHover();
		const r = a.getBoundingClientRect();
		hoverFor = a;
		hoverBox = h("div", { class: "tsab-hover", style: { top: `${r.top + window.scrollY + 6}px`, left: `${r.left + window.scrollX + 6}px` } },
			h("button", { textContent: "▶", title: "Play on TS bot", onclick: (ev) => { ev.preventDefault(); ev.stopPropagation(); send(id, "play"); } }),
			h("button", { textContent: "+", title: "Queue on TS bot", onclick: (ev) => { ev.preventDefault(); ev.stopPropagation(); send(id, "add"); } }));
		hoverBox.addEventListener("mouseleave", (ev) => { if (!a.contains(ev.relatedTarget)) hideHover(); });
		a.addEventListener("mouseleave", (ev) => { if (!hoverBox || !hoverBox.contains(ev.relatedTarget)) hideHover(); }, { once: true });
		document.body.append(hoverBox);
	}, true);
	window.addEventListener("scroll", hideHover, { passive: true });

	// ---------- multi-select on playlists / mixes ----------
	const LIST_ITEMS = "ytd-playlist-panel-video-renderer, ytd-playlist-video-renderer";
	const selected = new Map(); // videoId -> title
	let lastClicked = null, multiBar, multiCount, queueBtn, queueing = null;

	const itemId = (el) => {
		const a = el.querySelector("a#wc-endpoint, a#video-title, a#thumbnail, a[href*='/watch?v=']");
		return a ? videoIdFrom(a.href) : null;
	};
	const itemTitle = (el) => (el.querySelector("#video-title")?.textContent || "").trim();
	const visibleItems = () => [...document.querySelectorAll(LIST_ITEMS)].filter((el) => el.isConnected && itemId(el));

	function toggle(el, on) {
		const id = itemId(el);
		if (!id) return;
		if (on) selected.set(id, itemTitle(el)); else selected.delete(id);
	}

	function decorateLists() {
		const items = visibleItems();
		for (const el of items) {
			let cb = el.querySelector(":scope .tsab-cb");
			if (!cb) {
				cb = h("input", { type: "checkbox", class: "tsab-cb", title: "Select for TS queue (Shift+click for a range)" });
				// stop YouTube from treating the click as "open this video"
				for (const ev of ["click", "mousedown", "mouseup"]) cb.addEventListener(ev, (e) => e.stopPropagation(), true);
				cb.addEventListener("click", (e) => {
					const all = visibleItems();
					if (e.shiftKey && lastClicked && all.includes(lastClicked)) {
						const [a, b] = [all.indexOf(lastClicked), all.indexOf(el)].sort((x, y) => x - y);
						all.slice(a, b + 1).forEach((it) => toggle(it, cb.checked));
					} else {
						toggle(el, cb.checked);
					}
					lastClicked = el;
					decorateLists();
				});
				const spot = el.querySelector("#index-container") || el.querySelector("#container, #content") || el.firstElementChild;
				(spot && spot.parentElement ? spot.parentElement : el).insertBefore(cb, spot && spot.parentElement ? spot : el.firstChild);
			}
			// YouTube recycles these elements for other videos, so always resync
			cb.checked = selected.has(itemId(el));
		}
		updateMultiBar(items.length);
	}

	function updateMultiBar(itemCount) {
		if (!itemCount && !selected.size && !queueing) { if (multiBar) multiBar.remove(); multiBar = null; return; }
		if (!multiBar || !multiBar.isConnected) {
			multiCount = h("span");
			queueBtn = h("button", { class: "tsab-btn primary", onclick: queueSelected });
			multiBar = h("div", { class: "tsab-multi" },
				h("span", { textContent: "TS:" }),
				multiCount,
				h("button", { class: "tsab-btn", textContent: "Select all", onclick: () => { visibleItems().forEach((el) => toggle(el, true)); decorateLists(); } }),
				h("button", { class: "tsab-btn", textContent: "Clear", onclick: () => { selected.clear(); decorateLists(); } }),
				queueBtn);
			document.body.append(multiBar);
		}
		// only touch the DOM on real changes: every write re-triggers the MutationObserver
		const setText = (el, t) => { if (el.textContent !== t) el.textContent = t; };
		setText(multiCount, `${selected.size} selected`);
		if (queueing) {
			setText(queueBtn, `Stop (${queueing.done}/${queueing.total})`);
			queueBtn.disabled = false;
		} else {
			setText(queueBtn, `+ Queue ${selected.size} on ${botName(cfg.botId)}`);
			queueBtn.disabled = selected.size === 0;
		}
	}

	async function queueSelected() {
		if (queueing) { queueing.stop = true; return; } // button doubles as Stop
		// playlist order first, then anything selected that has scrolled out of the DOM
		const inDom = visibleItems().map(itemId).filter((id) => selected.has(id));
		const order = [...new Set([...inDom, ...selected.keys()])];
		const botId = cfg.botId;
		queueing = { total: order.length, done: 0, failed: [], stop: false };
		updateMultiBar(1);
		if (!bots.length) await loadBots().catch(() => {});
		for (const id of order) {
			if (queueing.stop) break;
			toast(`Queueing ${queueing.done + 1}/${queueing.total} on ${botName(botId)}: ${selected.get(id) || id}`);
			try {
				await api(onBot(botId, "add", `https://youtu.be/${id}`));
				selected.delete(id);
			} catch (e) {
				queueing.failed.push(`${selected.get(id) || id}: ${e.message}`);
			}
			queueing.done++;
			decorateLists();
		}
		const q = queueing;
		queueing = null;
		const ok = q.done - q.failed.length;
		toast(`Queued ${ok}/${q.total} on ${botName(botId)}${q.stop ? " (stopped)" : ""}` +
			(q.failed.length ? `. Failed (still selected): ${q.failed.join(" | ")}` : ""), q.failed.length > 0);
		decorateLists();
		refreshNowPlaying();
	}

	// ---------- hotkeys ----------
	document.addEventListener("keydown", (e) => {
		if (!e.altKey || e.ctrlKey || e.metaKey) return;
		const k = e.key.toLowerCase();
		if (k !== "p" && k !== "q") return;
		const id = currentVideoId();
		if (!id) return;
		e.preventDefault();
		send(id, k === "p" ? "play" : "add");
	}, true);

	// ---------- SPA navigation ----------
	window.addEventListener("yt-navigate-finish", () => setTimeout(ensureBar, 300));
	let pending = false;
	new MutationObserver(() => {
		if (pending) return;
		pending = true;
		requestAnimationFrame(() => { pending = false; ensureBar(); decorateLists(); });
	}).observe(document.body, { childList: true, subtree: true });
	setInterval(refreshNowPlaying, 30000);
	ensureBar();

	if (!cfg.uid || !cfg.token) setTimeout(() => toast("Open the Tampermonkey menu > TS3AudioBot Sender > Settings to connect.", false), 2000);
})();
