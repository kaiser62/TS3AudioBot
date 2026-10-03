#!/usr/bin/env python3
"""Stream a googlevideo URL to stdout using bounded Range requests.

YouTube rejects open-ended or large (>=1MiB) Range requests with 403, which
breaks ffmpeg's normal single-GET streaming. We fetch sequential 512KiB
chunks instead and emit one continuous byte stream.
"""
import sys
import time
import urllib.request
import urllib.error

CHUNK = 512 * 1024
MAX_RETRY = 8
TIMEOUT = 5  # host drops ~40% of new connects to Google; fail fast and retry
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36")


def fetch(url, start, end):
    req = urllib.request.Request(url, headers={
        "User-Agent": UA,
        "Accept": "*/*",
        "Range": "bytes=%d-%d" % (start, end),
    })
    with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
        return resp.read(), resp.headers.get("Content-Range")


def total_from(content_range):
    # "bytes 0-524287/3691402"
    if not content_range or "/" not in content_range:
        return None
    tail = content_range.rsplit("/", 1)[1].strip()
    return int(tail) if tail.isdigit() else None


def main():
    url = sys.argv[1]
    out = sys.stdout.buffer
    pos = 0
    total = None
    crange = None

    while total is None or pos < total:
        end = pos + CHUNK - 1
        if total is not None:
            end = min(end, total - 1)

        data = None
        for attempt in range(MAX_RETRY):
            try:
                data, crange = fetch(url, pos, end)
                break
            except urllib.error.HTTPError as e:
                if e.code == 416:
                    return 0
                if attempt == MAX_RETRY - 1:
                    sys.stderr.write("ytchunk: HTTP %s at %d\n" % (e.code, pos))
                    return 1
                time.sleep(0.5 * (attempt + 1))
            except Exception as e:
                if attempt == MAX_RETRY - 1:
                    sys.stderr.write("ytchunk: %s at %d\n" % (e, pos))
                    return 1
                time.sleep(0.5 * (attempt + 1))

        if total is None:
            total = total_from(crange)
        if not data:
            break

        try:
            out.write(data)
            out.flush()
        except (BrokenPipeError, OSError):
            return 0
        pos += len(data)

    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        sys.exit(0)
