"""MkDocs hook: keep provenance metadata out of the theme's SVG icons.

Some file-transfer tools stamp SVG files with large provenance manifests (C2PA) inside a <metadata>
element. The theme inlines its icons into page headings, cards and the navigation, so that text would
end up in every page and in the search index (search results showed the base64 manifest).

on_config cleans the icon files in overrides/.icons before anything reads them (idempotent; a clean file
is left untouched), and on_post_page is a safety net for anything that slipped through.
"""

from __future__ import annotations

import re
from pathlib import Path

_METADATA = re.compile(r"\s*<metadata>.*?</metadata>", re.S)
_C2PA_NS = re.compile(r'\s+xmlns:c2pa="[^"]*"')


def _clean(text: str) -> str:
    return _C2PA_NS.sub("", _METADATA.sub("", text))


def on_config(config, **kwargs):
    root = Path(config["config_file_path"]).parent / "overrides" / ".icons"
    for svg in root.rglob("*.svg"):
        text = svg.read_text(encoding="utf-8")
        if "<metadata" in text:
            svg.write_text(_clean(text), encoding="utf-8")
    return config


def on_post_page(output: str, **kwargs) -> str:
    return _clean(output) if "<metadata>" in output else output
