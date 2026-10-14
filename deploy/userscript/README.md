# TS3AudioBot Sender (YouTube userscript)

Adds TeamSpeak controls to YouTube so you can send songs to a TS3AudioBot music bot without typing chat commands. The controls use YouTube's own colours, so they match light and dark mode.

- **Pick songs from Mixes and playlists.** Each song in a Mix panel or on a playlist page gets a checkbox. Shift+click selects a range, and **Select all N** sits in the Mix panel header. A tray then shows **Queue N on ‹bot›**.
- **Progress and results.** While songs are sent one by one, the tray shows progress and a **Stop** button. When it finishes it says how many were queued. Songs that failed stay selected and **Why?** lists the reason for each, with **Try N again** to resend them.
- **Next to Like and Share:** **Play** (play now), **Queue** (add to the end) and a ▾ menu to pick the bot. They look like YouTube's own buttons and turn icon-only when the row gets narrow. Point at ▾ to see the bot and what it's playing.
- **On thumbnails:** Play and Queue icon buttons appear when you point at a video. You can turn them off in settings.
- **Keyboard:** `Alt+P` plays the current video now and `Alt+Q` queues it.
- **Choosing the bot:** click ▾ next to Play/Queue (or the bot name in the selection tray) to switch bots. The choice is remembered.
- Works on youtube.com (including Shorts), m.youtube.com and music.youtube.com.

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/) or Violentmonkey.
2. Open https://raw.githubusercontent.com/kaiser62/TS3AudioBot/master/deploy/userscript/ts3audiobot.user.js and click **Install**.
3. Open any YouTube video and click **Connect TS3AudioBot** under the title. The dialog asks for:
   - **Server address:** the bot's web address, for example `https://music.example.org`. Ask whoever runs the bot.
   - **Your TeamSpeak unique ID:** in TeamSpeak go to *Tools → Identities →* your identity → *Unique ID*. It ends with `=`.
   - **API token:** send one of the bots a **private message** saying `!api token`. It replies with your token.
4. Click **Check connection**, pick your default bot, then click **Save**.

The first request asks Tampermonkey to allow the connection to your server. Choose *Always allow domain*.

You can reopen the settings from the ▾ menu (**Connection settings**) or from the Tampermonkey menu.

## Notes

- Your token works like a password for the bot, so don't share it. You can get a new one with `!api token` at any time, and the old one then stops working.
- Requests run with your TeamSpeak identity's rights, the same as typing `!play` in chat.
- The server needs the bot's web API reachable over HTTPS. See the main README for how to set that up.
