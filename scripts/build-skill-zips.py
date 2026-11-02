#!/usr/bin/env python3
"""Build one .zip per skill, plus the full plugin .zip when plugins/clozd exists, plus SHA256SUMS.

Usage: build-skill-zips.py [--root DIR] <tag-without-v> <outdir>

The plugin root is <root>/plugins/clozd when it holds .claude-plugin/plugin.json,
otherwise <root> itself (and no plugin .zip is built).
"""
import argparse
import hashlib
import os
import sys
import zipfile
from pathlib import Path

NESTED_ROOT = Path("plugins") / "clozd"
# Fixed timestamp so the same tree always produces the same zip.
ZIP_DATE = (1980, 1, 1, 0, 0, 0)
# The plugin zip allowlist is fixed to the analyzing-win-loss skill on purpose.
PLUGIN_REQUIRED = frozenset(
    {
        ".claude-plugin/plugin.json",
        "LICENSE",
        "README.md",
        "SECURITY.md",
        "skills/analyzing-win-loss/SKILL.md",
        "skills/analyzing-win-loss/agents/openai.yaml",
        "skills/analyzing-win-loss/references/data-layers.md",
        "skills/analyzing-win-loss/references/filters.md",
        "skills/analyzing-win-loss/references/report-format.md",
    }
)
PLUGIN_OPTIONAL = frozenset({"CHANGELOG.md"})


def write_entry(zf: zipfile.ZipFile, arcname: str, path: Path) -> None:
    info = zipfile.ZipInfo(arcname, ZIP_DATE)
    info.compress_type = zipfile.ZIP_DEFLATED
    info.external_attr = 0o644 << 16
    zf.writestr(info, path.read_bytes())


def build_zip(skill_dir: Path, target: Path) -> None:
    with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as zf:
        for path in sorted(skill_dir.rglob("*")):
            if path.is_symlink():
                raise SystemExit(f"error: symlink not allowed in a release zip: {path}")
            if not path.is_file():
                continue
            write_entry(zf, f"{skill_dir.name}/{path.relative_to(skill_dir).as_posix()}", path)


def validate_plugin_tree(plugin_dir: Path) -> str | None:
    """Return an error reason for the first problem found, or None when the tree is valid."""
    found = set()
    symlinks = []
    for dirpath, dirnames, filenames in os.walk(plugin_dir, followlinks=False):
        base = Path(dirpath)
        for name in dirnames + filenames:
            if (base / name).is_symlink():
                symlinks.append(base / name)
        for name in filenames:
            if not (base / name).is_symlink():
                found.add((base / name).relative_to(plugin_dir).as_posix())
    if symlinks:
        return f"symlink not allowed in the plugin zip: {sorted(symlinks)[0]}"
    extra = sorted(found - PLUGIN_REQUIRED - PLUGIN_OPTIONAL)
    if extra:
        return f"file not allowed in the plugin zip: {plugin_dir / extra[0]}"
    missing = sorted(PLUGIN_REQUIRED - found)
    if missing:
        return f"missing required plugin file: {plugin_dir / missing[0]}"
    return None


def build_plugin_zip(plugin_dir: Path, target: Path) -> None:
    # validate_plugin_tree already guaranteed the tree is exactly required + optional present files
    entries = sorted(PLUGIN_REQUIRED | {p for p in PLUGIN_OPTIONAL if (plugin_dir / p).is_file()})
    with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as zf:
        for arcname in entries:
            write_entry(zf, arcname, plugin_dir / arcname)


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(prog="build-skill-zips.py")
    parser.add_argument("--root", default=str(Path(__file__).resolve().parent.parent))
    parser.add_argument("version", metavar="tag-without-v")
    parser.add_argument("outdir")
    args = parser.parse_intermixed_args(argv)
    root = Path(args.root).resolve()
    if not root.is_dir():
        print(f"error: --root {root} is not a directory", file=sys.stderr)
        return 2
    version, outdir = args.version, Path(args.outdir)

    nested = root / NESTED_ROOT
    has_plugin = (nested / ".claude-plugin" / "plugin.json").is_file()
    plugin_dir = nested if has_plugin else root
    if has_plugin:
        reason = validate_plugin_tree(plugin_dir)
        if reason:
            print(f"error: {reason}", file=sys.stderr)
            return 1

    skills_dir = plugin_dir / "skills"
    skills = sorted(d for d in skills_dir.iterdir() if (d / "SKILL.md").is_file()) if skills_dir.is_dir() else []
    for skill in skills:
        if skill.is_symlink():
            print(f"error: skill dir is a symlink: {skill}", file=sys.stderr)
            return 1
    if not skills:
        print(f"error: no skills with SKILL.md under {skills_dir}", file=sys.stderr)
        return 1

    outdir.mkdir(parents=True, exist_ok=True)
    sums = []
    for skill in skills:
        name = f"{skill.name}-{version}.zip"
        target = outdir / name
        build_zip(skill, target)
        sums.append(f"{hashlib.sha256(target.read_bytes()).hexdigest()}  {name}")
        print(f"wrote {target}")
    if has_plugin:
        name = f"clozd-{version}.zip"
        target = outdir / name
        build_plugin_zip(plugin_dir, target)
        sums.append(f"{hashlib.sha256(target.read_bytes()).hexdigest()}  {name}")
        print(f"wrote {target}")

    (outdir / "SHA256SUMS").write_text("\n".join(sums) + "\n")
    print(f"wrote {outdir / 'SHA256SUMS'}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
