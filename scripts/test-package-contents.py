#!/usr/bin/env python3
"""Packaging regression test for build-skill-zips.py. Builds synthetic trees only."""
import hashlib
import subprocess
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

BUILD = Path(__file__).resolve().parent / "build-skill-zips.py"
SKILL = "analyzing-win-loss"
SKILL_FILES = [
    f"skills/{SKILL}/SKILL.md",
    f"skills/{SKILL}/agents/openai.yaml",
    f"skills/{SKILL}/references/data-layers.md",
    f"skills/{SKILL}/references/filters.md",
    f"skills/{SKILL}/references/report-format.md",
]
PLUGIN_FILES = [".claude-plugin/plugin.json", "LICENSE", "README.md", "SECURITY.md", *SKILL_FILES]


def write_tree(base: Path, files: list[str]) -> None:
    for rel in files:
        path = base / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(f"content of {rel}\n")


def build(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run([sys.executable, str(BUILD), *args], capture_output=True, text=True)


class PackageContentsTest(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.tmp = Path(tmp.name).resolve()
        self.root = self.tmp / "repo"
        self.plugin = self.root / "plugins" / "clozd"
        self.out = self.tmp / "out"

    def nested(self, extra: list[str] = ()) -> None:
        write_tree(self.plugin, [*PLUGIN_FILES, *extra])

    def names(self, zip_path: Path) -> list[str]:
        with zipfile.ZipFile(zip_path) as zf:
            return zf.namelist()

    def test_root_layout_builds_skill_zip_only(self):
        write_tree(self.root, SKILL_FILES)
        result = build("--root", str(self.root), "1.2.3", str(self.out))
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(sorted(p.name for p in self.out.iterdir()), ["SHA256SUMS", f"{SKILL}-1.2.3.zip"])
        entries = self.names(self.out / f"{SKILL}-1.2.3.zip")
        self.assertEqual(len(entries), 5)
        self.assertTrue(all(name.startswith(f"{SKILL}/") for name in entries))

    def test_plugins_dir_without_manifest_uses_root_layout(self):
        write_tree(self.root, SKILL_FILES)
        write_tree(self.plugin, ["README.md"])
        result = build("--root", str(self.root), "1.2.3", str(self.out))
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(sorted(p.name for p in self.out.iterdir()), ["SHA256SUMS", f"{SKILL}-1.2.3.zip"])

    def test_nested_layout_builds_plugin_zip(self):
        self.nested(["CHANGELOG.md"])
        result = build("1.2.3", "--root", str(self.root), str(self.out))
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(
            sorted(p.name for p in self.out.iterdir()),
            ["SHA256SUMS", f"{SKILL}-1.2.3.zip", "clozd-1.2.3.zip"],
        )
        self.assertEqual(self.names(self.out / "clozd-1.2.3.zip"), sorted([*PLUGIN_FILES, "CHANGELOG.md"]))
        skill_entries = self.names(self.out / f"{SKILL}-1.2.3.zip")
        self.assertTrue(all(name.startswith(f"{SKILL}/") for name in skill_entries))

    def test_changelog_is_optional(self):
        self.nested()
        result = build("--root", str(self.root), "1.2.3", str(self.out))
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.names(self.out / "clozd-1.2.3.zip"), sorted(PLUGIN_FILES))

    def test_zip_metadata_and_sums(self):
        self.nested()
        build("--root", str(self.root), "1.2.3", str(self.out))
        for name in (f"{SKILL}-1.2.3.zip", "clozd-1.2.3.zip"):
            with zipfile.ZipFile(self.out / name) as zf:
                for info in zf.infolist():
                    self.assertEqual(info.date_time, (1980, 1, 1, 0, 0, 0))
                    self.assertEqual(info.external_attr, 0o644 << 16)
                    self.assertEqual(info.compress_type, zipfile.ZIP_DEFLATED)
        sums = (self.out / "SHA256SUMS").read_text()
        self.assertTrue(sums.endswith("\n"))
        lines = sums.splitlines()
        self.assertEqual([line.split("  ")[1] for line in lines], [f"{SKILL}-1.2.3.zip", "clozd-1.2.3.zip"])
        for line in lines:
            digest, name = line.split("  ")
            self.assertEqual(digest, hashlib.sha256((self.out / name).read_bytes()).hexdigest())

    def test_builds_are_byte_identical(self):
        self.nested(["CHANGELOG.md"])
        out2 = self.tmp / "out2"
        build("--root", str(self.root), "1.2.3", str(self.out))
        build("--root", str(self.root), "1.2.3", str(out2))
        for name in (f"{SKILL}-1.2.3.zip", "clozd-1.2.3.zip", "SHA256SUMS"):
            self.assertEqual((self.out / name).read_bytes(), (out2 / name).read_bytes())

    def assert_rejected(self, expected_path: Path) -> None:
        result = build("--root", str(self.root), "1.2.3", str(self.out))
        self.assertEqual(result.returncode, 1, result.stdout)
        self.assertIn(str(expected_path), result.stderr)
        self.assertTrue(result.stderr.startswith("error: "))
        self.assertFalse(self.out.exists())

    def test_extra_file_fails(self):
        self.nested(["AGENTS.md"])
        self.assert_rejected(self.plugin / "AGENTS.md")

    def test_missing_skill_md_fails(self):
        self.nested()
        (self.plugin / SKILL_FILES[0]).unlink()
        self.assert_rejected(self.plugin / SKILL_FILES[0])

    def test_file_symlink_fails(self):
        self.nested()
        link = self.plugin / "linked.md"
        link.symlink_to(self.plugin / "README.md")
        self.assert_rejected(link)

    def test_directory_symlink_fails(self):
        self.nested()
        link = self.plugin / "linkdir"
        link.symlink_to(self.plugin / "skills", target_is_directory=True)
        self.assert_rejected(link)

    def test_root_is_not_a_directory_exits_2(self):
        not_dir = self.tmp / "file.txt"
        not_dir.write_text("x")
        result = build("--root", str(not_dir), "1.2.3", str(self.out))
        self.assertEqual(result.returncode, 2)
        self.assertIn(f"error: --root {not_dir} is not a directory", result.stderr)

    def test_usage_error_exits_2(self):
        self.assertEqual(build("1.2.3").returncode, 2)

    def test_no_skills_fails(self):
        self.root.mkdir()
        result = build("--root", str(self.root), "1.2.3", str(self.out))
        self.assertEqual(result.returncode, 1)
        self.assertIn("no skills with SKILL.md", result.stderr)


if __name__ == "__main__":
    outcome = unittest.main(exit=False)
    if not outcome.result.wasSuccessful():
        sys.exit(1)
    print("test-package-contents ok")
