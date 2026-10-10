# TS3AudioBot Sender (YouTube userscript)

Adds buttons to YouTube that send the video to one of the TeamSpeak music bots.

- **▶ Play on TS** / **+ Queue** under the video title, a bot picker, and what the bot is playing now
- ▶ / + quick buttons when hovering a thumbnail (can be turned off in settings)
- `Alt+P` play current video, `Alt+Q` queue it
- Works on youtube.com (incl. Shorts), m.youtube.com and music.youtube.com

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/) (or Violentmonkey).
2. Open https://raw.githubusercontent.com/kaiser62/TS3AudioBot/master/deploy/userscript/ts3audiobot.user.js and click **Install**.
3. In TeamSpeak, send one of the bots a **private message**: `!api token`. It replies with a token.
4. Get your TeamSpeak unique ID: *Tools → Identities →* your identity → *Unique ID* (ends with `=`).
5. On YouTube: Tampermonkey menu → *TS3AudioBot Sender* → **Settings**. Server URL `https://music.basic.int.eu.org`, paste UID and token, **Test connection**, pick your default bot, **Save**.

The first request asks Tampermonkey to allow the connection to the server — choose *Always allow domain*.

## Notes

- Your token works like a password for the bot. Don't share it; get a new one with `!api token` any time (the old one stops working).
- Requests run with your TeamSpeak identity's rights, the same as typing `!play` in chat.
- Only `/api/*` is published through the tunnel; the bot's web interface stays internal.
