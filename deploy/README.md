# Deployment files

Server-side workarounds used with this fork. See the "Changes from upstream" section in the root README for the reasoning.

| File | Install to | Purpose |
|---|---|---|
| `youtube-dl` | bot dir, `[factories.youtube-dl] path = "./youtube-dl"` | yt-dlp in Docker, cookies, cache, `--socket-timeout 5`, `skip=hls` |
| `ffmpeg-wrap.sh` + `ytchunk.py` | bot dir, `[tools.ffmpeg] path = "./ffmpeg-wrap.sh"` | 512 KiB range-chunked googlevideo download (avoids 403) |
| `update-ytdlp.sh` | bot dir | pulls latest yt-dlp image |
| `systemd/ts3audiobot.service` | `~/.config/systemd/user/` | bot service (user unit) |
| `systemd/ts3audiobot-ytdlp.{service,timer}` | `/etc/systemd/system/` (root:root 0644) | 30-min yt-dlp update |
| `autodeploy.sh` | bot dir | installs new CI builds from the `master-latest` release: waits for the current songs to end, swaps the binary and `WebInterface`, restarts, rolls back if fewer bots reconnect |
| `systemd/ts3audiobot-autodeploy.{service,timer}` | `~/.config/systemd/user/` | runs `autodeploy.sh` every 10 min; enable with `systemctl --user enable --now ts3audiobot-autodeploy.timer` |

Paths default to `/opt/ts3audiobot`; adjust to your install. Optional env: `YTDL_DEBUG_LOG`, `FFMPEG_DEBUG_LOG`, `YTDL_CACHE_DIR`; for `autodeploy.sh` see the comment at its top. The autodeploy unit expects the bot in `~/audiobot/ts3audio-new`; edit `ExecStart` for your path.

Requirements: Docker, python3, ffmpeg at `/usr/bin/ffmpeg`. Put `cookies.txt` (Netscape format) next to `youtube-dl` if needed — never commit it.
