# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
TeamSpeak 3 server owners and their members who run their own copy of this TS3AudioBot fork. Each user points the companion clients at their own bot server. Setup has to make sense from the clients alone, with no help from the fork's author. The fork's author and their friends (server `music.basic.int.eu.org`) are one such group.

Main job for the YouTube userscript: build a set for the bot from YouTube Mixes and playlists by picking many songs at once and sending them to the bot's queue. Sending the single video being watched (play now or queue) comes second.

## Product Purpose
A TS3AudioBot fork (music bot for TeamSpeak 3) plus two browser-side senders, so people can feed the bot from where they find music instead of typing chat commands:
- **YouTube userscript** (`deploy/userscript/ts3audiobot.user.js`, Tampermonkey/Violentmonkey): send videos, or ticked songs from Mixes/playlists, to a chosen bot.
- **Spicetify extension** (`deploy/spicetify/ts3audiobot.js`): right-click tracks, albums, playlists, Liked Songs or artists in the Spotify desktop app. Each track is sent as "artist - title" and the bot plays the top YouTube result.

Success: from a Mix or playlist, a user can pick songs and have them queued on the right bot in a few clicks, always knowing which bot gets them and what happened.

## Positioning
Upstream TS3AudioBot only takes chat commands and an internal web UI. This fork works from inside YouTube and Spotify through a safe public web API:
- per-user `!api token` auth
- `CF-Connecting-IP`-aware anonymous blocking
- session-free `search first play|add` for Spotify lookups

## Operating Context
- The bot runs on a Linux server (single-file .NET Core 3.1 build). The web API can be exposed publicly, e.g. through a Cloudflare tunnel that routes only `/api/*`.
- Auth: TeamSpeak unique ID plus a token the user gets by privately messaging a bot `!api token`. Requests run with that TS identity's rights.
- A server usually runs several bots (e.g. 4), each sitting in a TeamSpeak channel. Users pick which bot receives songs.
- The userscript runs on www.youtube.com, m.youtube.com and music.youtube.com. YouTube enforces Trusted Types (no innerHTML), is a SPA that recycles list elements, and has light and dark themes.
- Songs are queued one request at a time; failures can happen per song (age-restricted, region-blocked, bot check, etc.).

## Capabilities and Constraints
- Bot API commands used: `/bot/list`, `/bot/use/<id>/(/play|add/<url>)`, `/bot/use/<id>/(/song)`, `/bot/use/<id>/(/search/first/play|add/youtube/<query>)`.
- Bot names and IDs come from the server. Nothing is hard-coded except a default server URL that release users must change.
- Must not break YouTube's own UI or navigation. Clicks on our controls must not open videos.
- License: GPL-3.0, inherited from upstream Splamy/TS3AudioBot; upstream credit stays.
- Release plan: keep the fork `kaiser62/TS3AudioBot`, rewrite its README for this version, and publish a tagged GitHub Release with the Linux binary, userscript and Spicetify extension attached.

## Evidence on Hand
- Working live deployment with 4 bots and verified public API behaviour (anonymous 401, spoofed X-Real-IP 401).
- No user testimonials, usage numbers or screenshots of the redesigned UI exist yet; do not invent any.

## Product Principles
1. Always show which bot will receive the songs before sending, and say clearly what happened afterwards (how many queued, which ones failed and why).
2. Picking many songs is the main workflow; make select, review and send fast and forgiving.
3. Stay a guest on YouTube/Spotify: fit in, never block their controls, never navigate by accident.
4. Self-hosters set it up alone: first run must lead to a working connection without docs.
