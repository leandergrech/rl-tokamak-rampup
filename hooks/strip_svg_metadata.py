"""MkDocs hook: drop <metadata> blocks from inlined SVG icons.

Some file-transfer tools stamp SVGs with large provenance manifests (C2PA). The theme inlines every
navigation icon into every page, so those blocks would add tens of kilobytes per page. This keeps the
icon files untouched and strips the blocks from the rendered HTML.
"""

import re

_METADATA = re.compile(r"<metadata>.*?</metadata>", re.S)
_C2PA_NS = re.compile(r'\s+xmlns:c2pa="[^"]*"')


def on_post_page(output: str, **kwargs) -> str:
    if "<metadata>" not in output:
        return output
    return _C2PA_NS.sub("", _METADATA.sub("", output))
