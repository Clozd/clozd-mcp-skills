#!/usr/bin/env python3
"""Build one .zip per skill under skills/, plus SHA256SUMS.

Usage: build-skill-zips.py <tag-without-v> <outdir>
"""
import hashlib
import sys
import zipfile
from pathlib import Path

SKILLS_DIR = Path(__file__).resolve().parent.parent / "skills"
# Fixed timestamp so the same tree always produces the same zip.
ZIP_DATE = (1980, 1, 1, 0, 0, 0)


def build_zip(skill_dir: Path, target: Path) -> None:
    with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as zf:
        for path in sorted(skill_dir.rglob("*")):
            if path.is_symlink():
                raise SystemExit(f"error: symlink not allowed in a release zip: {path}")
            if not path.is_file():
                continue
            arcname = f"{skill_dir.name}/{path.relative_to(skill_dir).as_posix()}"
            info = zipfile.ZipInfo(arcname, ZIP_DATE)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            zf.writestr(info, path.read_bytes())


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        print("usage: build-skill-zips.py <tag-without-v> <outdir>", file=sys.stderr)
        return 2
    version, outdir = argv[1], Path(argv[2])
    outdir.mkdir(parents=True, exist_ok=True)

    skills = sorted(d for d in SKILLS_DIR.iterdir() if (d / "SKILL.md").is_file())
    for skill in skills:
        if skill.is_symlink():
            print(f"error: skill dir is a symlink: {skill}", file=sys.stderr)
            return 1
    if not skills:
        print(f"error: no skills with SKILL.md under {SKILLS_DIR}", file=sys.stderr)
        return 1

    sums = []
    for skill in skills:
        name = f"{skill.name}-{version}.zip"
        target = outdir / name
        build_zip(skill, target)
        sums.append(f"{hashlib.sha256(target.read_bytes()).hexdigest()}  {name}")
        print(f"wrote {target}")

    (outdir / "SHA256SUMS").write_text("\n".join(sums) + "\n")
    print(f"wrote {outdir / 'SHA256SUMS'}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
