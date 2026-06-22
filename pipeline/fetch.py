"""Download the pinned INDEC EPH zip into data/raw/ (idempotent)."""

from __future__ import annotations

import sys
import urllib.request

from . import config


def fetch() -> None:
    config.RAW_DIR.mkdir(parents=True, exist_ok=True)
    dest = config.RAW_DIR / config.ZIP_NAME
    if dest.exists() and dest.stat().st_size > 0:
        print(f"[fetch] already present: {dest} ({dest.stat().st_size:,} bytes)")
        return
    print(f"[fetch] downloading {config.ZIP_URL}")
    req = urllib.request.Request(config.ZIP_URL, headers={"User-Agent": "Mozilla/5.0 (data pipeline)"})
    with urllib.request.urlopen(req, timeout=120) as resp, open(dest, "wb") as out:
        out.write(resp.read())
    print(f"[fetch] saved {dest} ({dest.stat().st_size:,} bytes)")


if __name__ == "__main__":
    try:
        fetch()
    except Exception as exc:  # noqa: BLE001
        print(f"[fetch] ERROR: {exc}", file=sys.stderr)
        sys.exit(1)
