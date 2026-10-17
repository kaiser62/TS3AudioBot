#!/bin/bash
# Install new builds of this fork automatically.
#
# Polls the rolling "master-latest" prerelease that CI (.github/workflows/build.yml) updates on
# every push to master. When it holds a commit we have not installed yet, this script:
#   1. downloads the tarball and checks it against SHA256SUMS.txt and its BUILD_INFO,
#   2. waits until the songs playing right now have ended (so nobody hears a song cut off),
#   3. swaps in the new TS3AudioBot binary and WebInterface (old ones kept as *.prev),
#   4. restarts the bot and checks that it comes back with as many connected bots as before,
#      rolling back to *.prev if it does not.
# Config files, cookies and the deploy/ scripts in the bot directory are never touched.
#
# Run it from deploy/systemd/ts3audiobot-autodeploy.{service,timer}. Settings (env):
#   TS3AB_DIR   bot directory                     (default: directory of this script)
#   TS3AB_REPO  GitHub repo                       (default: kaiser62/TS3AudioBot)
#   TS3AB_TAG   release to follow                 (default: master-latest)
#   TS3AB_API   local web API                     (default: http://127.0.0.1:58913/api)
#   TS3AB_UNIT  systemd --user unit of the bot    (default: ts3audiobot)
#   TS3AB_WAIT  max seconds to wait for songs     (default: 1800; then try again next run)
set -euo pipefail

DIR=${TS3AB_DIR:-$(cd "$(dirname "$0")" && pwd)}
REPO=${TS3AB_REPO:-kaiser62/TS3AudioBot}
TAG=${TS3AB_TAG:-master-latest}
API=${TS3AB_API:-http://127.0.0.1:58913/api}
UNIT=${TS3AB_UNIT:-ts3audiobot}
WAIT=${TS3AB_WAIT:-1800}
PKG=TS3AudioBot-linux-x64.tar.gz
BASE="https://github.com/$REPO/releases/download/$TAG"
INSTALLED="$DIR/.autodeploy-commit"
FAILED="$DIR/.autodeploy-failed"

log() { echo "autodeploy: $*"; }

exec 9>"$DIR/.autodeploy.lock"
flock -n 9 || { log "another run is active"; exit 0; }

commit=$(curl -fsSL --retry 2 "$BASE/build-info.txt" | sed -n 's/^commit=//p')
[ -n "$commit" ] || { log "no build-info.txt on $TAG"; exit 1; }
[ "$(cat "$INSTALLED" 2>/dev/null)" = "$commit" ] && exit 0
[ "$(cat "$FAILED" 2>/dev/null)" = "$commit" ] && { log "skipping ${commit::8}, it failed before"; exit 0; }

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
curl -fsSL --retry 2 -o "$tmp/$PKG" "$BASE/$PKG"
curl -fsSL --retry 2 -o "$tmp/SHA256SUMS.txt" "$BASE/SHA256SUMS.txt"
(cd "$tmp" && grep " \*\?$PKG\$" SHA256SUMS.txt | sha256sum -c --quiet -) \
	|| { log "checksum mismatch (upload still in progress?), retrying next run"; exit 0; }
tar -xzf "$tmp/$PKG" -C "$tmp"
new="$tmp/TS3AudioBot"
[ "$(sed -n 's/^commit=//p' "$new/BUILD_INFO")" = "$commit" ] \
	|| { log "tarball is not ${commit::8} yet, retrying next run"; exit 0; }
version=$("$new/TS3AudioBot" --version | sed -n 's/^Version: //p')
[ -n "$version" ] || { log "new binary does not run"; echo "$commit" > "$FAILED"; exit 1; }
log "new build ${commit::8} ($version)"

# Links of the songs playing right now, one "bot link" per line.
playing() {
	local ids id
	ids=$(curl -fs "$API/bot/list" | python3 -c 'import sys,json; print(" ".join(str(b["Id"]) for b in json.load(sys.stdin)))') || return 0
	for id in $ids; do
		curl -s "$API/bot/use/$id/(/song)" | python3 -c 'import sys,json
try: print(sys.argv[1], json.load(sys.stdin)["Link"])
except Exception: pass' "$id"
	done
}
connected() {
	curl -fs "$API/bot/list" | python3 -c 'import sys,json; print(sum(b.get("Status") == 2 for b in json.load(sys.stdin)))' 2>/dev/null || echo 0
}

start=$(playing)
if [ -n "$start" ]; then
	log "waiting for the current songs to end: $(echo $start)"
	waited=0
	while [ -n "$(comm -12 <(echo "$start" | sort) <(playing | sort))" ]; do
		[ "$waited" -ge "$WAIT" ] && { log "songs still playing after ${WAIT}s, retrying next run"; exit 0; }
		sleep 2; waited=$((waited + 2))
	done
fi
before=$(connected)

install_build() { # $1 = source dir
	install -m 755 "$1/TS3AudioBot" "$DIR/TS3AudioBot.new" && mv -f "$DIR/TS3AudioBot.new" "$DIR/TS3AudioBot"
	rm -rf "$DIR/WebInterface.new" && cp -r "$1/WebInterface" "$DIR/WebInterface.new"
	rm -rf "$DIR/WebInterface" && mv "$DIR/WebInterface.new" "$DIR/WebInterface"
}

rm -rf "$tmp/prev" && mkdir "$tmp/prev"
cp -p "$DIR/TS3AudioBot" "$tmp/prev/TS3AudioBot"
cp -r "$DIR/WebInterface" "$tmp/prev/WebInterface"
install_build "$new"
systemctl --user restart "$UNIT"

ok=0
for _ in $(seq 60); do # bots reconnect after up to ~30 s
	sleep 3
	systemctl --user is-active -q "$UNIT" || continue
	[ "$(connected)" -ge "$before" ] && { ok=1; break; }
done

if [ "$ok" = 1 ]; then
	rm -rf "$DIR/TS3AudioBot.prev" "$DIR/WebInterface.prev"
	cp -p "$tmp/prev/TS3AudioBot" "$DIR/TS3AudioBot.prev"
	cp -r "$tmp/prev/WebInterface" "$DIR/WebInterface.prev"
	echo "$commit" > "$INSTALLED"
	log "installed ${commit::8} ($version), $(connected)/$before bots connected"
else
	log "bot did not come back ($(connected)/$before connected), rolling back"
	install_build "$tmp/prev"
	systemctl --user restart "$UNIT"
	echo "$commit" > "$FAILED"
	exit 1
fi
