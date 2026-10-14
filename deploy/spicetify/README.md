# TS3AudioBot Sender (Spicetify extension)

Sends songs from the Spotify desktop app to one of the TeamSpeak music bots.

- Right-click a track, several selected tracks (Ctrl/Shift+click, or Ctrl+A in a playlist), an album, a playlist, Liked Songs or an artist (sends their top tracks):
  **Play on TS bot** or **Queue on TS bot**. Playlists, albums and Liked Songs send at most 500 songs; playlist folders aren't supported
- Button in the playbar: queue the song Spotify is playing now
- Right-click a track and choose **TS bot settings** to set the server, login and bot

The bot can't stream from Spotify. For each track the extension sends `artist - title`, and the bot plays the top YouTube search result. By default the extension adds `lyrics explicit` to every search. This favours plain audio uploads over music videos with intros or skits, and uncensored versions over radio edits. You can change these words, or clear them, in **TS bot settings**. Most songs match, but you can still get a cover or a live version. With **Play**, the first track starts now and the rest are queued after it. Click the menu item again while a long list is being sent to stop it.

## Install

1. Install [Spicetify](https://spicetify.app/).
2. Copy `ts3audiobot.js` into the Spicetify extensions folder:
   - Windows: `%appdata%\spicetify\Extensions\`
   - Linux / macOS: `~/.config/spicetify/Extensions/`
3. Enable it and re-apply:
   ```
   spicetify config extensions ts3audiobot.js
   spicetify apply
   ```
4. In TeamSpeak, send one of the bots a **private message**: `!api token`. It replies with a token.
5. In Spotify, right-click any track and choose **TS bot settings**. Enter your bot server's HTTPS address (ask whoever runs the bot), your TeamSpeak UID (*Tools → Identities → Unique ID*) and the token, **Test connection**, pick a bot, **Save**.

To update, copy the new `ts3audiobot.js` over the old one and run `spicetify apply`.

## Notes

- Needs a bot build with the `search first play|add` commands (this fork, 0.12.11+). Older builds answer *"command not found"*.
- Your token works like a password. Don't share it; `!api token` gives you a new one and the old one stops working.
- Track info comes from Spotify's own Web API through the logged-in client. If Spotify rate-limits it, wait a minute and retry.
