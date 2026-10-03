# TS3AudioBot (kaiser62 fork)

> Fork of [Splamy/TS3AudioBot](https://github.com/Splamy/TS3AudioBot) at upstream `a69a38d8` (v0.12.x, netcoreapp3.1).
> Everything below the "Upstream README" line is the original upstream README.

## Changes from upstream

### 1. Per-bot channel step log (`channel_log`) — code change
Branch `feature/channel-step-log`, version `0.12.4-channel-step-log.*`.

New per-bot setting in `bots/<name>/bot.toml` (root level, default `false`):

```toml
channel_log = true
```

When enabled, the bot posts every step of a request into its current channel chat (prefixed with `»`), and mirrors each line to the normal log as `[channel_log] ...`:

| Stage | Example messages |
|---|---|
| Request | `Request from <nick>: !ytp foo` · `Command failed: ...` · `Command crashed: ...` |
| Search | `Searching youtube for 'foo'` · `Found 10 results, first: '...'` |
| Resolve | `Trying resolver youtube` · `Resolved ... with youtube in 1234ms` · `Resolver X failed after Nms: ...` |
| YouTube | internal resolver attempt / fallback to yt-dlp · picked format (id, ext, acodec, abr) |
| yt-dlp | `yt-dlp: running ...` · `done in Nms (KB)` · `failed after Nms (exit N): <stderr>` · `no answer after 20000ms, killing it` |
| ffmpeg | `ffmpeg: started (pid N)` · `finished at 3:12 of 3:12` · exit code + last stderr lines (URLs redacted to `<url>`) · reconnect attempts |
| Playback | `Starting audio stream for '...'` · `Now playing: ...` · `Skipping '...': reason` · `Song ended` · `Queue ended` |

Implementation:
- `TS3AudioBot/Helper/StepLog.cs` (new): `AsyncLocal` sink that flows through command → resolver → yt-dlp → player without changing method signatures.
- `Bot.cs`: opens a StepLog scope per chat command and per song-end callback; `ChannelLog()` truncates to 900 chars and sends via `Scheduler.InvokeAsync` (failures only logged at debug).
- Instrumented: `Audio/PlayManager.cs`, `Audio/FfmpegProducer.cs` (stderr ring buffer, exit reporting), `ResourceFactories/ResourceResolver.cs`, `ResourceFactories/Youtube/YoutubeResolver.cs`, `ResourceFactories/YoutubeDlHelper.cs` (timing, joined stderr lines).
- `Config/ConfigStructs.cs`: `ConfBot.ChannelLog`.

### 1b. Readable yt-dlp errors and better format selection — code change
Branch `feature/ytdlp-errors-formats`, version `0.12.6-ytdlp-errors-formats.*`.

- `YoutubeDlHelper.TransformYtdlError`: raw yt-dlp stderr is mapped to a short message for the user (bot check / refresh cookies, age-restricted, private, members-only, region-locked, removed, premiere not started, HTTP 429 / 403, no formats, Docker not reachable, timeout, network). Unknown errors show the cleaned `ERROR:` line. Upstream always said "failed to load". The raw stderr still goes to `channel_log`.
- `YoutubeDlHelper.FilterBest` ranking: direct download over HLS → audio-only over muxed video → opus / AAC-LC over HE-AAC → audio bitrate → smallest video. Upstream picked the highest `abr` and could choose muxed format 18. `JsonYtdlFormat` gained `protocol`, `width`, `height`.
- `YoutubeResolver`: if yt-dlp returns a reduced list with only muxed formats, it retries once to get the audio-only streams.
- Tests: `TS3ABotUnitTests/YoutubeDlHelperTests.cs`.

### 2. yt-dlp via Docker wrapper — deployment (`deploy/youtube-dl`)
Upstream calls a local `youtube-dl` binary. This fork points `[factories.youtube-dl] path = "./youtube-dl"` at a bash wrapper that runs yt-dlp in the `jeeaaasustest/youtube-dl` image:
- optional `cookies.txt` next to the wrapper is mounted and passed with `--cookies` (never commit it);
- persistent yt-dlp cache volume (`$HOME/.cache/yt-dlp-docker` → `XDG_CACHE_HOME`) so player/JS-challenge results are reused instead of re-solved each call;
- `--socket-timeout 5` so blackholed connections fail over fast instead of hitting the bot's hard 20s yt-dlp limit;
- `--extractor-args youtube:skip=hls` to skip HLS manifest fetches (≈halves lookup time). **Trade-off:** YouTube live streams don't play.
- optional stderr debug log (`YTDL_DEBUG_LOG=...`). Note the bot treats *any* stderr output from yt-dlp as failure.

### 3. ffmpeg chunking shim — deployment (`deploy/ffmpeg-wrap.sh`, `deploy/ytchunk.py`)
`[tools.ffmpeg] path = "./ffmpeg-wrap.sh"`. YouTube returns 403 on open-ended / ≥1 MiB `Range` requests, which is what ffmpeg sends for a googlevideo URL. The shim detects `-i *googlevideo.com*`, replaces the input with `pipe:0`, and streams the file via `ytchunk.py` using bounded 512 KiB range requests (5s timeout, 8 retries with backoff). All other inputs go straight to `/usr/bin/ffmpeg`. Exit status of ffmpeg is preserved; optional debug log via `FFMPEG_DEBUG_LOG`.

### 4. yt-dlp auto-update — deployment (`deploy/update-ytdlp.sh`, `deploy/systemd/`)
`ts3audiobot-ytdlp.timer` runs `update-ytdlp.sh` every 30 min: pulls the image, prunes old images, prints the yt-dlp version.
System units must be `root:root 0644` (a user-writable unit with `User=` is a privilege-escalation path).

### 5. Service / config
- `deploy/systemd/ts3audiobot.service`: systemd **user** unit, `Restart=on-failure`, `PATH` includes `~/.deno/bin` (yt-dlp needs a JS runtime for YouTube challenges).
- `ts3audiobot.toml` diffs from defaults: `prefer_resolver = "YoutubeDl"`, `youtube-dl path = "./youtube-dl"`, `ffmpeg path = "./ffmpeg-wrap.sh"`, web paths `"WebInterface"`.
- Per-bot alias used on all bots: `ytp = "!x (!search from youtube (!param 0)) (!search play 0)"`.
- **Never commit** `ts3audiobot.toml` (identity key), `cookies.txt`, `.env`, `bots/*/bot.toml` with server passwords.

### 6. Building
Upstream build tooling no longer works out of the box. Working recipe (in `mcr.microsoft.com/dotnet/sdk:3.1`):

```bash
dotnet tool install -g dotnet-script --version 1.1.0      # newer needs net8+
dotnet tool install -g GitVersion.Tool --version 5.12.0   # newer needs net8+
git config --global --add safe.directory /src
dotnet publish TS3AudioBot -c Release --framework netcoreapp3.1 --self-contained --runtime linux-x64 \
  -p:PublishSingleFile=true,IncludeSymbolsInSingleFile=true,PublishTrimmed=true
```

GitVersion needs local `master` and `develop` branches in the clone (`git fetch origin master:master develop:develop`), otherwise it fails with *"could not determine which branch to treat as development"*.

### Known issues
- On the production host ~40% of IPv4 TCP SYNs to Google IPs are silently dropped (other hosts on the LAN and non-Google destinations are fine); connects hang ~20s then fall back to IPv6 which is unreachable. The `--socket-timeout 5`, `skip=hls`, and ytchunk timeouts are mitigations, not a fix. Root cause (host firewall / VPN / router) still open.
- YouTube live streams are disabled by `skip=hls`.

---

# Upstream README

## TS3AudioBot (upstream)

This is a open-source TeamSpeak3 bot, playing music and much more.  

- **Got questions?** Check out our [Wiki](https://github.com/Splamy/TS3AudioBot/wiki), [FAQ](https://github.com/Splamy/TS3AudioBot/wiki/FAQ), or ask on our [![Join Gitter Chat](https://badges.gitter.im/Join%20Chat.svg)](https://gitter.im/TS3AudioBot/Lobby?utm_source=share-link&utm_medium=link&utm_campaign=share-link)
- **Something's broken or it's complicated?** [Open an issue](https://github.com/Splamy/TS3AudioBot/issues/new/choose)
  - Please use and fill out one of the templates we provide unless they are not applicable or you have a good reason not to.  
    This helps us getting through the technical stuff faster
  - Please keep issues in english, this makes it easier for everyone to participate and keeps issues relevant to link to.
- **Want to support this Project?**
  - You can discuss and suggest features. However the [backlog](https://github.com/Splamy/TS3AudioBot/projects/2) is large and feature requests will probably take time
  - You can contribute code. This is always appreciated, please open an issue or contact a maintainer to discuss *before* you start.
  - You can support me on [![Patreon][patreon-badge]][patreon-link] or [![Paypal][paypal-badge]][paypal-link]

[patreon-badge]: https://img.shields.io/badge/Patreon-Donate!-F96854.svg?logo=patreon&style=flat-square
[patreon-link]: https://patreon.com/Splamy

[paypal-badge]: https://img.shields.io/badge/Paypal-Donate!-00457C.svg?logo=paypal&style=flat-square
[paypal-link]: https://paypal.me/Splamy

## Features
* Play Youtube and Soundcloud songs as well as stream Twitch (extensible with plugins)
* Song history
* Various voice subscription modes; including to clients, channels and whisper groups
* Playlist management for all users
* Powerful permission configuration
* Plugin support
* Web API
* Multi-instance
* Localization
* Low CPU and memory with our self-written headless ts3 client

To see what's planned and in progress take a look into our [Roadmap](https://github.com/Splamy/TS3AudioBot/projects/2).

## Bot Commands
The bot is fully operable via chat.  
To get started write `!help` to the bot.  
For all commands check out our live [OpenApiV3 generator](http://tab.splamy.de/openapi/index.html).  
For an in-depth command tutorial see [here in the wiki](https://github.com/Splamy/TS3AudioBot/wiki/CommandSystem).

## Install

### Download
Pick and download the build for your platform and liking:

|  | Stable | Experimental |
| -- | -- | -- |
| | Versions are mostly considered stable but won't get bigger features as fast. | Will always have the latest and greatest but might not be fully stable or have broken features. |
| Windows_x64 | [![Download](https://img.shields.io/badge/Download-master-green.svg)](https://splamy.de/api/nightly/ts3ab/master_win_x64/download) | [![Download](https://img.shields.io/badge/Download-develop-green.svg)](https://splamy.de/api/nightly/ts3ab/develop_win_x64/download) |
| Linux_x64 | [![Download](https://img.shields.io/badge/Download-master-green.svg)](https://splamy.de/api/nightly/ts3ab/master_linux_x64/download) | [![Download](https://img.shields.io/badge/Download-develop-green.svg)](https://splamy.de/api/nightly/ts3ab/develop_linux_x64/download) |
| Docker | [![Docker](https://img.shields.io/badge/Docker-0.11.0-0db7ed.svg)](https://github.com/getdrunkonmovies-com/TS3AudioBot_docker) (NOTE: This build is community-maintained. It comes with all dependencies as well as youtube-dl preconfigured) | - |

(We have more builds like linux arm/arm64 and .NET framework dependent builds available on our [nightly server](https://splamy.de/Nightly#ts3ab))

#### Linux
Install the required dependencies:
* on **Ubuntu**/**Debian**:  
Run `sudo apt-get install libopus-dev ffmpeg`
* on **Arch Linux**:  
Run `sudo pacman -S opus ffmpeg`
* on **CentOS 7**:  
Run
    ```
    sudo yum -y install epel-release
    sudo rpm -Uvh http://li.nux.ro/download/nux/dextop/el7/x86_64/nux-dextop-release-0-5.el7.nux.noarch.rpm
    sudo yum -y install ffmpeg opus-devel
	```
* **manually**:
    1. Make sure you have a C compiler installed
    1. Make the Opus script runnable with `chmod u+x InstallOpus.sh` and run it with `./InstallOpus.sh`
    1. Get the ffmpeg [32bit](https://johnvansickle.com/ffmpeg/builds/ffmpeg-git-i686-static.tar.xz) or [64bit](https://johnvansickle.com/ffmpeg/builds/ffmpeg-git-amd64-static.tar.xz) binary.
    1. Extract the ffmpeg archive with `tar -vxf ffmpeg-git-*XXbit*-static.tar.xz`
    1. Get the ffmpeg binary from `ffmpeg-git-*DATE*-amd64-static/ffmpeg` and copy it into your TS3AudioBot folder.

#### Windows
1. Get the ffmpeg [32bit](https://ffmpeg.zeranoe.com/builds/win32/static/ffmpeg-latest-win32-static.zip) or [64bit](https://ffmpeg.zeranoe.com/builds/win64/static/ffmpeg-latest-win64-static.zip) binary.
1. Open the archive and copy the ffmpeg binary from `ffmpeg-latest-winXX-static/bin/ffmpeg.exe` into your TS3AudioBot folder.

### Optional Dependencies
If the bot can't play some youtube videos it might be due to some embedding restrictions which are blocking this.  
You can install the [youtube-dl](https://github.com/rg3/youtube-dl/) binary or source folder (and specify the path in the config) to try to bypass this.

### First time setup
1. Run the bot with `./TS3AudioBot` (Linux) or `TS3AudioBot.exe` (Windows) and follow the setup instructions.
1. (Optional) Close the bot and configure your `rights.toml` to your desires.
You can use the template rules as suggested in the automatically generated file,
or dive into the rights syntax [here](https://github.com/Splamy/TS3AudioBot/wiki/Rights).
Then start the bot again.
1. (Optional, but highly recommended for everything to work properly).
   - Create a privilege key for the ServerAdmin group (or a group which has equivalent rights).
   - Send the bot in a private message `!bot setup <privilege key>`.
1. Congratz, you're done! Enjoy listening to your favourite music, experimenting with the crazy command system or do whatever you whish to do ;).  
For further reading check out the [CommandSystem](https://github.com/Splamy/TS3AudioBot/wiki/CommandSystem).

## Building manually

|master|develop|
|:--:|:--:|
|[![Build status](https://ci.appveyor.com/api/projects/status/i7nrhqkbntdhwpxp/branch/master?svg=true)](https://ci.appveyor.com/project/Splamy/ts3audiobot/branch/master)|[![Build status](https://ci.appveyor.com/api/projects/status/i7nrhqkbntdhwpxp/branch/develop?svg=true)](https://ci.appveyor.com/project/Splamy/ts3audiobot/branch/develop)|

### Download
Download the git repository with `git clone --recurse-submodules https://github.com/Splamy/TS3AudioBot.git`.

#### Linux
1. Get the latest `dotnet core 3.1` version by following [this tutorial](https://docs.microsoft.com/dotnet/core/install/linux-package-managers) and choose your platform
1. Go into the directory of the repository with `cd TS3AudioBot`
1. Execute `dotnet build --framework netcoreapp3.1 --configuration Release TS3AudioBot` to build the AudioBot
1. The binary will be in `./TS3AudioBot/bin/Release/netcoreapp3.1` and can be run with `dotnet TS3AudioBot.dll`

#### Windows
1. Make sure you have `Visual Studio` with the `dotnet core 3.1` development toolchain installed
1. Build the AudioBot with Visual Studio.

### Building the WebInterface
1. Go with the console of your choice into the `./WebInterface` folder
1. Run `npm install` to restore or update all dependencies for this project
1. Run `npm run build` to build the project.  
  The built project will be in `./WebInterface/dist`.  
  Make sure to the set the webinterface path in the ts3audiobot.toml to this folder.
1. You can alternatively use `npm run start` for development.  
  This will use the webpack dev server with live reload instead of the ts3ab server.

## Community

### Localization
:speech_balloon: *Want to help translate or improve translation?*  
Join us on [Transifex](https://www.transifex.com/respeak/ts3audiobot/) to help translate  
or in our [Gitter](https://gitter.im/TS3AudioBot/Lobby?utm_source=share-link&utm_medium=link&utm_campaign=share-link) to discuss or ask anything!  
All help is appreciated :heart:

Translations need to be manually approved and will then be automatically built and deployed to [our nightly server here](https://splamy.de/TS3AudioBot).

## License
This project is licensed under [OSL-3.0](https://opensource.org/licenses/OSL-3.0).

Why OSL-3.0:
- OSL allows you to link to our libraries without needing to disclose your own project, which might be useful if you want to use the TSLib as a library.
- If you create plugins you do not have to make them public like in GPL. (Although we would be happy if you shared them :)
- With OSL we want to allow you providing the TS3AB as a service (even commercially). We do not want the software to be sold but the service. We want this software to be free for everyone.
- TL; DR? https://tldrlegal.com/license/open-software-licence-3.0

---
[![forthebadge](http://forthebadge.com/images/badges/60-percent-of-the-time-works-every-time.svg)](http://forthebadge.com) [![forthebadge](http://forthebadge.com/images/badges/built-by-developers.svg)](http://forthebadge.com) [![forthebadge](http://forthebadge.com/images/badges/built-with-love.svg)](http://forthebadge.com) [![forthebadge](http://forthebadge.com/images/badges/contains-cat-gifs.svg)](http://forthebadge.com) [![forthebadge](http://forthebadge.com/images/badges/made-with-c-sharp.svg)](http://forthebadge.com)
