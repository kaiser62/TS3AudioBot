// TS3AudioBot Sender for Spicetify
// Right-click tracks (multi-select works), an album or a playlist -> "Play on TS bot" / "Queue on TS bot".
// The bot can't stream Spotify, so each track is sent as "artist - title" and the bot plays the top YouTube result.
// Needs the fork's `search first play|add` commands (TS3AudioBot >= 0.12.8 of kaiser62/TS3AudioBot).
// @ts-check
(async function ts3audiobot() {
	while (!Spicetify?.ContextMenu || !Spicetify?.Player || !Spicetify?.URI || !Spicetify?.PopupModal || !Spicetify?.CosmosAsync) {
		await new Promise((r) => setTimeout(r, 300));
	}

	// ---------- settings ----------
	const KEY = "ts3audiobot:settings";
	const DEFAULTS = { baseUrl: "https://music.basic.int.eu.org", uid: "", token: "", botId: 0 };
	let cfg = { ...DEFAULTS };
	try { cfg = { ...DEFAULTS, ...JSON.parse(Spicetify.LocalStorage.get(KEY) || "{}") }; } catch (_) {}
	const save = () => Spicetify.LocalStorage.set(KEY, JSON.stringify(cfg));
	let bots = [];

	const notify = (text, isError = false) => Spicetify.showNotification("TS3AudioBot: " + text, isError, isError ? 7000 : 3500);

	// ---------- API ----------
	async function api(path) {
		if (!cfg.baseUrl) throw new Error("Set the server URL in TS3AudioBot settings first.");
		const headers = {};
		if (cfg.uid && cfg.token) headers.Authorization = "Basic " + btoa(unescape(encodeURIComponent(cfg.uid + ":" + cfg.token)));
		const ctl = new AbortController();
		const timer = setTimeout(() => ctl.abort(), 60000);
		let r;
		try {
			r = await fetch(cfg.baseUrl.replace(/\/+$/, "") + "/api" + path, { headers, signal: ctl.signal });
		} catch (e) {
			throw new Error(e.name === "AbortError" ? "Bot server did not answer in time." : "Cannot reach the bot server.");
		} finally { clearTimeout(timer); }
		const text = await r.text();
		let body = null;
		try { body = text ? JSON.parse(text) : null; } catch (_) { body = text; }
		if (r.ok) return body;
		const msg = (body && body.ErrorMessage) || `HTTP ${r.status}`;
		throw new Error(r.status === 401 ? `${msg} (check your UID/token in settings)` : msg);
	}
	// Same escaping as the official web interface: encodeURIComponent plus parentheses.
	const seg = (s) => "/" + encodeURIComponent(s).replace(/\(/g, "%28").replace(/\)/g, "%29");
	const onBot = (id, ...cmd) => `/bot/use/${id}/(${cmd.map(seg).join("")})`;
	const botName = (id) => (bots.find((b) => b.Id === id) || {}).Name || `bot ${id}`;
	const loadBots = async () => (bots = await api("/bot/list"));

	// ---------- Spotify metadata ----------
	const idOf = (uri) => {
		if (!uri) return "";
		if (typeof uri === "string") return uri.split(":").pop().split("?")[0];
		return uri.id || uri.getBase62Id?.() || String(uri);
	};

	const playlistIdOf = (uri) => {
		if (!uri) return "";
		const s = String(uri);
		const m = s.match(/playlist[/:]([a-zA-Z0-9]+)/);
		if (m) return m[1];
		return s.split(":").pop().split("?")[0];
	};

	function query(t) {
		if (!t) return "";
		if (typeof t === "string") return t;
		const track = t.track || t.item || t.itemV2?.data || t;
		const name = track.name || track.title || track.metadata?.title || "";
		let artists = [];
		if (Array.isArray(track.artists)) {
			artists = track.artists.map((a) => (typeof a === "string" ? a : a.name || a.profile?.name || "")).filter(Boolean);
		} else if (Array.isArray(track.artists?.items)) {
			artists = track.artists.items.map((a) => a.profile?.name || a.name || "").filter(Boolean);
		} else if (track.metadata?.artist_name) {
			artists = [track.metadata.artist_name];
			let i = 1;
			while (track.metadata[`artist_name:${i}`]) {
				artists.push(track.metadata[`artist_name:${i}`]);
				i++;
			}
		}
		const artistStr = artists.slice(0, 2).join(", ");
		return artistStr && name ? `${artistStr} - ${name}` : (name || artistStr);
	}

	function getSpotifyToken() {
		return (
			Spicetify.Platform?.Session?.accessToken ||
			Spicetify.Platform?.AuthorizationAPI?.getState?.()?.token?.accessToken ||
			""
		);
	}

	async function webApi(url) {
		const fullUrl = url.startsWith("https://") ? url : "https://api.spotify.com/v1/" + url;
		let res = null;
		let lastError = null;

		// 1. Try Spicetify.CosmosAsync
		try {
			res = await Spicetify.CosmosAsync.get(fullUrl);
		} catch (e) {
			lastError = e;
		}

		// If CosmosAsync succeeded and returned valid data (not an error object)
		if (res && !res.error && !res.code && !res.message) {
			return res;
		}

		// 2. Fallback: direct fetch using user Bearer token
		const token = getSpotifyToken();
		if (token) {
			try {
				const r = await fetch(fullUrl, { headers: { Authorization: "Bearer " + token } });
				if (r.ok) return await r.json();
				const errJson = await r.json().catch(() => null);
				lastError = new Error((errJson?.error?.message) || `HTTP ${r.status}`);
			} catch (e) {
				lastError = e;
			}
		}

		if (res && res.error) throw new Error(res.error.message || `Spotify API error (${res.error.status || res.code})`);
		if (res && res.message) throw new Error(res.message);
		if (lastError) throw lastError;
		throw new Error("Cannot read data from Spotify API.");
	}

	function getUriType(u) {
		if (!u) return "";
		const s = String(u);
		if (s.includes(":playlist:") || s.startsWith("spotify:playlist:") || s.includes("/playlist/")) return "playlist";
		if (s.includes(":album:") || s.startsWith("spotify:album:") || s.includes("/album/")) return "album";
		if (s.includes(":track:") || s.startsWith("spotify:track:") || s.includes("/track/")) return "track";
		if (s.includes(":collection:") || s.startsWith("spotify:collection:") || s.includes("/collection/")) return "collection";
		if (s.includes(":artist:") || s.startsWith("spotify:artist:") || s.includes("/artist/")) return "artist";
		if (s.includes(":folder:") || s.startsWith("spotify:folder:")) return "folder";

		const parsed = Spicetify.URI?.from?.(u) || (typeof u === "string" ? Spicetify.URI?.fromString?.(u) : null);
		const t = String(parsed?.type || parsed?.Type || "").toLowerCase();
		if (t === "playlist_v2") return "playlist";
		return t;
	}

	function getEffectiveUris(uris, contextUri) {
		if (Array.isArray(uris) && uris.length > 0) return uris;
		if (typeof uris === "string" && uris) return [uris];
		if (contextUri) return [contextUri];

		// Fallback: check current page path if right-clicked on an empty area of the page
		const path = Spicetify.Platform?.History?.location?.pathname || "";
		if (path.startsWith("/playlist/")) {
			const id = path.split("/")[2];
			if (id) return [`spotify:playlist:${id}`];
		}
		if (path.startsWith("/album/")) {
			const id = path.split("/")[2];
			if (id) return [`spotify:album:${id}`];
		}
		if (path === "/collection/tracks") return ["spotify:collection:tracks"];
		return [];
	}

	// ---------- playlist resolver ----------
	async function resolvePlaylist(uri) {
		const id = playlistIdOf(uri);
		const rawUri = uri.startsWith("spotify:") ? uri : `spotify:playlist:${id}`;
		const tracks = [];

		// Method 1: GraphQL FetchPlaylistContents (returns names & artists directly in one shot)
		try {
			const queryDef = Spicetify.GraphQL?.Definitions?.FetchPlaylistContents ||
				Spicetify.GraphQL?.Definitions?.fetchPlaylistContents;
			if (queryDef && Spicetify.GraphQL?.Request) {
				const gRes = await Spicetify.GraphQL.Request(queryDef, {
					uri: rawUri,
					offset: 0,
					limit: 100,
				});
				const items = gRes?.data?.playlistV2?.content?.items ||
					gRes?.data?.playlist?.content?.items;
				if (Array.isArray(items) && items.length) {
					for (const it of items) {
						const q = query(it);
						if (q) tracks.push(q);
					}
					if (tracks.length) return tracks;
				}
			}
		} catch (e) {
			console.warn("GraphQL playlist fetch failed:", e);
		}

		// Method 2: Spotify Web API playlists/{id}/tracks (paged, returns names & artists)
		try {
			let url = `playlists/${id}/tracks?limit=100&fields=next,items(track(name,type,artists(name)))`;
			let pages = 0;
			while (url && pages < 5) {
				const res = await webApi(url);
				if (Array.isArray(res?.items) && res.items.length) {
					for (const it of res.items) {
						const q = query(it?.track);
						if (q) tracks.push(q);
					}
				}
				url = res?.next;
				pages++;
			}
			if (tracks.length) return tracks;
		} catch (e) {
			console.warn("Web API playlist fetch failed:", e);
		}

		// Method 3: Spicetify.Platform.PlaylistAPI.getContents
		try {
			if (Spicetify.Platform?.PlaylistAPI?.getContents) {
				const pRes = await Spicetify.Platform.PlaylistAPI.getContents(rawUri, { limit: 1000 });
				if (Array.isArray(pRes?.items) && pRes.items.length) {
					const missingUris = [];
					for (const it of pRes.items) {
						const t = it?.track || it;
						const q = query(t);
						if (q) tracks.push(q);
						else if (t?.uri) missingUris.push(t.uri);
					}
					if (tracks.length) return tracks;
					if (missingUris.length) {
						const sub = await resolveTrackUris(missingUris.slice(0, 50));
						if (sub.length) return sub;
					}
				}
			}
		} catch (e) {
			console.warn("Platform PlaylistAPI failed:", e);
		}

		// Method 4: CosmosAsync sp://core-playlist
		try {
			const cRes = await Spicetify.CosmosAsync.get(`sp://core-playlist/v1/playlist/${rawUri}/rows`);
			if (Array.isArray(cRes?.rows) && cRes.rows.length) {
				for (const r of cRes.rows) {
					const q = query(r);
					if (q) tracks.push(q);
				}
				if (tracks.length) return tracks;
			}
		} catch (_) {}

		return tracks;
	}

	// ---------- album resolver ----------
	async function resolveAlbum(uri) {
		const id = idOf(uri);
		const rawUri = uri.startsWith("spotify:") ? uri : `spotify:album:${id}`;
		const tracks = [];

		// Method 1: GraphQL queryAlbumTracks
		try {
			const queryDef = Spicetify.GraphQL?.Definitions?.queryAlbumTracks ||
				Spicetify.GraphQL?.Definitions?.getAlbum;
			if (queryDef && Spicetify.GraphQL?.Request) {
				const gRes = await Spicetify.GraphQL.Request(queryDef, {
					uri: rawUri,
					offset: 0,
					limit: 100,
				});
				const items = (gRes?.data?.albumUnion?.tracksV2 ?? gRes?.data?.albumUnion?.tracks ?? []).items;
				if (Array.isArray(items) && items.length) {
					for (const it of items) {
						const q = query(it);
						if (q) tracks.push(q);
					}
					if (tracks.length) return tracks;
				}
			}
		} catch (_) {}

		// Method 2: Web API albums/{id}/tracks
		try {
			for (let url = `albums/${id}/tracks?limit=50`; url; ) {
				const res = await webApi(url);
				if (Array.isArray(res?.items)) {
					for (const t of res.items) {
						const q = query(t);
						if (q) tracks.push(q);
					}
				}
				url = res?.next;
			}
		} catch (_) {}

		return tracks;
	}

	// ---------- liked songs resolver ----------
	async function resolveLikedTracks() {
		const tracks = [];
		try {
			const res = await webApi("me/tracks?limit=50");
			if (Array.isArray(res?.items)) {
				for (const it of res.items) {
					const q = query(it?.track);
					if (q) tracks.push(q);
				}
				if (tracks.length) return tracks;
			}
		} catch (_) {}

		try {
			if (Spicetify.Platform?.LibraryAPI?.getTracks) {
				const res = await Spicetify.Platform.LibraryAPI.getTracks({ limit: 50 });
				if (Array.isArray(res?.items)) {
					for (const it of res.items) {
						const q = query(it?.track || it);
						if (q) tracks.push(q);
					}
					if (tracks.length) return tracks;
				}
			}
		} catch (_) {}

		return tracks;
	}

	// ---------- track batch resolver ----------
	async function resolveTrackUris(uris) {
		const out = [];
		const ids = uris.map(idOf).filter(Boolean);
		if (!ids.length) return out;

		if (ids.length === 1) {
			const id = ids[0];
			const cur = Spicetify.Player.data?.item;
			if (cur && (idOf(cur.uri) === id || cur.id === id)) {
				const q = query(cur);
				if (q) return [q];
			}
			try {
				const t = await webApi("tracks/" + id);
				if (t) {
					const q = query(t);
					if (q) return [q];
				}
			} catch (_) {}
			try {
				const res = await webApi("tracks?ids=" + id);
				for (const t of res.tracks || []) {
					const q = query(t);
					if (q) return [q];
				}
			} catch (_) {}
			return out;
		}

		for (let i = 0; i < ids.length; i += 50) {
			const batch = ids.slice(i, i + 50);
			let gotBatch = false;
			try {
				const res = await webApi("tracks?ids=" + batch.join(","));
				if (Array.isArray(res?.tracks)) {
					for (const t of res.tracks) {
						const q = query(t);
						if (q) out.push(q);
					}
					gotBatch = true;
				}
			} catch (_) {}

			if (!gotBatch) {
				for (const id of batch) {
					try {
						const t = await webApi("tracks/" + id);
						if (t) {
							const q = query(t);
							if (q) out.push(q);
						}
					} catch (_) {}
				}
			}
		}
		return out;
	}

	// Resolves track / album / playlist / collection URIs to "artist - title" search strings, in order.
	async function resolveQueries(uris, contextUri = null) {
		const effective = getEffectiveUris(uris, contextUri);
		if (!effective.length) return [];

		const out = [];
		const trackUris = [];

		const flushTracks = async () => {
			if (!trackUris.length) return;
			const res = await resolveTrackUris(trackUris);
			out.push(...res);
			trackUris.length = 0;
		};

		for (const uri of effective) {
			const type = getUriType(uri);
			if (type === "track") {
				trackUris.push(uri);
				continue;
			}
			await flushTracks();

			if (type === "playlist") {
				const pl = await resolvePlaylist(uri);
				out.push(...pl);
			} else if (type === "album") {
				const alb = await resolveAlbum(uri);
				out.push(...alb);
			} else if (type === "collection") {
				const liked = await resolveLikedTracks();
				out.push(...liked);
			}
		}

		await flushTracks();
		return out;
	}

	// ---------- sending ----------
	let running = null;

	async function sendQueries(queries, mode) {
		if (running) { running.stop = true; notify("Stopping..."); return; }
		if (!cfg.uid || !cfg.token) { openSettings(); return; }
		if (!queries.length) { notify("No tracks found.", true); return; }
		const botId = cfg.botId;
		running = { stop: false };
		try {
			if (!bots.length) await loadBots().catch(() => {});
			const failed = [];
			let done = 0;
			for (const [i, q] of queries.entries()) {
				if (running.stop) break;
				const cmd = mode === "play" && i === 0 ? "play" : "add";
				notify(`${queries.length > 1 ? `${i + 1}/${queries.length} ` : ""}${cmd === "play" ? "Playing" : "Queueing"} on ${botName(botId)}: ${q}`);
				try {
					await api(onBot(botId, "search", "first", cmd, "youtube", q));
				} catch (e) {
					failed.push(`${q}: ${e.message}`);
				}
				done++;
			}
			const ok = done - failed.length;
			notify(`${mode === "play" ? "Sent" : "Queued"} ${ok}/${queries.length} on ${botName(botId)}${running.stop ? " (stopped)" : ""}` +
				(failed.length ? `. Failed: ${failed.join(" | ")}` : ""), failed.length > 0);
		} catch (e) {
			notify(e.message, true);
		} finally {
			running = null;
		}
	}

	async function sendAll(uris, mode, contextUri = null) {
		if (running) { running.stop = true; notify("Stopping..."); return; }
		if (!cfg.uid || !cfg.token) { openSettings(); return; }
		try {
			notify("Fetching tracks from Spotify...");
			let queries;
			try {
				queries = await resolveQueries(uris, contextUri);
			} catch (e) {
				throw new Error("Could not read track info from Spotify: " + (e.message || e));
			}
			if (!queries.length) throw new Error("No tracks found in selection or playlist.");
			await sendQueries(queries, mode);
		} catch (e) {
			notify(e.message, true);
		}
	}

	// ---------- settings dialog ----------
	function el(tag, props = {}, ...kids) {
		const e = document.createElement(tag);
		for (const [k, v] of Object.entries(props)) {
			if (k === "style") Object.assign(e.style, v);
			else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
			else e[k] = v;
		}
		e.append(...kids);
		return e;
	}

	function openSettings() {
		const field = { display: "block", width: "100%", boxSizing: "border-box", height: "34px", padding: "0 8px", margin: "4px 0 10px", borderRadius: "4px", border: "1px solid #555", background: "#222", color: "#fff" };
		const url = el("input", { type: "text", value: cfg.baseUrl, style: field });
		const uid = el("input", { type: "text", value: cfg.uid, placeholder: "TeamSpeak unique ID, ends with =", style: field });
		const token = el("input", { type: "password", value: cfg.token, placeholder: "from a private message: !api token", style: field });
		const bot = el("select", { style: field });
		const status = el("div", { style: { minHeight: "18px", fontSize: "13px", opacity: ".8" } });
		const fillBots = (list) => {
			bot.replaceChildren(...list.map((b) => el("option", { value: String(b.Id), textContent: `${b.Name} (#${b.Id})`, selected: b.Id === cfg.botId })));
			if (!list.length) bot.append(el("option", { value: String(cfg.botId), textContent: `bot ${cfg.botId}` }));
		};
		fillBots(bots);
		const apply = () => { cfg.baseUrl = url.value.trim(); cfg.uid = uid.value.trim(); cfg.token = token.value.trim(); };
		const test = async () => {
			apply();
			status.textContent = "Testing...";
			try { fillBots(await loadBots()); status.textContent = `Connected, ${bots.length} bot(s).`; }
			catch (e) { status.textContent = "Failed: " + e.message; }
		};
		const btn = { padding: "8px 16px", borderRadius: "500px", border: "0", cursor: "pointer", fontWeight: "700" };
		Spicetify.PopupModal.display({
			title: "TS3AudioBot Sender",
			content: el("div", {},
				el("label", { textContent: "Server URL" }), url,
				el("label", { textContent: "TeamSpeak UID" }), uid,
				el("label", { textContent: "API token" }), token,
				el("label", { textContent: "Bot" }), bot,
				status,
				el("div", { style: { display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "12px" } },
					el("button", { textContent: "Test connection", style: { ...btn, background: "#333", color: "#fff" }, onclick: test }),
					el("button", { textContent: "Save", style: { ...btn, background: "#1ed760", color: "#000" }, onclick: () => {
						apply();
						cfg.botId = Number(bot.value) || 0;
						save();
						Spicetify.PopupModal.hide();
						notify(`Saved. Sending to ${botName(cfg.botId)}.`);
					} }))),
		});
		if (cfg.uid && cfg.token && !bots.length) test();
	}

	// ---------- menus ----------
	const isSupportedUri = (u) => {
		const type = getUriType(u);
		if (["track", "album", "playlist", "collection", "artist", "folder"].includes(type)) return true;
		try {
			if (Spicetify.URI.isTrack(u) || Spicetify.URI.isAlbum(u) || Spicetify.URI.isPlaylistV1OrV2(u)) return true;
		} catch (_) {}
		return false;
	};

	const sendable = (uris, _, contextUri) => {
		const effective = getEffectiveUris(uris, contextUri);
		return effective.length > 0 && effective.every(isSupportedUri);
	};

	new Spicetify.ContextMenu.Item(
		"Play on TS bot",
		(uris, _, contextUri) => sendAll(uris, "play", contextUri),
		sendable,
		"play"
	).register();
	new Spicetify.ContextMenu.Item(
		"Queue on TS bot",
		(uris, _, contextUri) => sendAll(uris, "add", contextUri),
		sendable,
		"plus2px"
	).register();
	new Spicetify.ContextMenu.Item(
		"TS bot settings",
		openSettings,
		sendable,
		"edit"
	).register();

	// playbar button: queue what's playing now on Spotify
	function registerPlaybarButton() {
		if (!Spicetify.Playbar?.Button) {
			setTimeout(registerPlaybarButton, 300);
			return;
		}
		new Spicetify.Playbar.Button("Queue current song on TS bot", "plus2px", () => {
			const item = Spicetify.Player.data?.item;
			if (item) {
				const q = query(item);
				if (q) {
					sendQueries([q], "add");
					return;
				}
			}
			const uri = (item || Spicetify.Player.data?.track)?.uri;
			if (uri) sendAll([uri], "add");
			else notify("Nothing playing.", true);
		}, false, false, true);
	}
	registerPlaybarButton();

	if (!cfg.uid || !cfg.token) notify("Right-click a track > TS bot settings to connect.");
	else loadBots().catch(() => {});
})();
