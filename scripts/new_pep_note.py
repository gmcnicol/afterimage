#!/usr/bin/env python3
from __future__ import annotations

import argparse
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PEP_DIR = ROOT / "docs" / "peps"
TEMPLATE = ROOT / "docs" / "implementation" / "templates" / "pep-note-template.md"


def slugify(text: str) -> str:
    text = text.strip().lower()
    text = re.sub(r"[^a-z0-9]+", "-", text)
    text = re.sub(r"-+", "-", text).strip("-")
    return text or "untitled"


def next_number() -> int:
    max_n = 0
    pattern = re.compile(r"PEP-(\d{4})-")
    for path in PEP_DIR.glob("PEP-*.md"):
        match = pattern.match(path.name)
        if match:
            max_n = max(max_n, int(match.group(1)))
    return max_n + 1


def main() -> int:
    parser = argparse.ArgumentParser(description="Create a short project PEP note.")
    parser.add_argument("title", help="Short title for the note")
    args = parser.parse_args()

    number = next_number()
    slug = slugify(args.title)
    path = PEP_DIR / f"PEP-{number:04d}-{slug}.md"

    template = TEMPLATE.read_text(encoding="utf-8")
    content = template.replace("PEP-0NNN", f"PEP-{number:04d}")
    content = content.replace("Short Title", args.title.strip())

    path.write_text(content, encoding="utf-8")
    print(path.relative_to(ROOT))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
