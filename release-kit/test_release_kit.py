"""Tests of the release kit: stamping, the install scripts and publish.sh.

    python -m unittest discover -s release-kit -p "test_*.py" -v

The install scripts run against builds made here (a fake hub that writes its arguments to a file, a
fake setup that does the same), never against a download; publish.sh runs against a fake `gh` that
logs its calls. install.ps1 needs Windows (it asks for the Windows account); install.sh and
publish.sh need a POSIX shell (Git Bash on Windows).
"""

from __future__ import annotations

import hashlib
import io
import os
import shutil
import subprocess
import sys
import tarfile
import tempfile
import unittest
import zipfile
from pathlib import Path

KIT = Path(__file__).resolve().parent
sys.path.insert(0, str(KIT))

import stamp  # noqa: E402

PS1 = KIT / "scripts" / "install.ps1"
SH = KIT / "scripts" / "install.sh"
PUBLISH = KIT / "publish.sh"
WINDOWS = os.name == "nt"


def git_bash(name: str) -> str | None:
    """A POSIX shell; on Windows the one of Git (the `bash` on PATH may be the WSL launcher)."""
    if WINDOWS:
        for base in (os.environ.get("ProgramFiles"), os.environ.get("ProgramW6432"), r"C:\Program Files"):
            if base:
                candidate = Path(base) / "Git" / "bin" / f"{name}.exe"
                if candidate.is_file():
                    return str(candidate)
        return None
    return shutil.which(name)


SH_EXE = git_bash("sh")
BASH_EXE = git_bash("bash")
POWERSHELLS = [p for p in (shutil.which("pwsh"), shutil.which("powershell")) if p] if WINDOWS else []


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_sums(folder: Path, *files: Path) -> Path:
    sums = folder / "SHA256SUMS"
    sums.write_text("".join(f"{sha(f)}  {f.name}\n" for f in files), encoding="utf-8", newline="\n")
    return sums


def values(**over: str) -> dict[str, str]:
    base = {
        "repo": "Owner/app-repo",
        "channel": "latest",
        "app": "demo",
        "kind": "hub",
        "program": "demo-hub",
        "release_asset": "demo-hub-{version}-{triple}.zip",
        "rolling_asset": "demo-hub-windows-x86_64.exe",
    }
    base.update(over)
    return base


class StampTest(unittest.TestCase):
    def test_ps1_gets_every_value_and_nothing_else_changes(self) -> None:
        source = PS1.read_text(encoding="utf-8")
        out = stamp.stamp(source, ".ps1", values(channel="v1.2.3"))
        self.assertIn("$StampRepo = 'Owner/app-repo'", out)
        self.assertIn("$StampChannel = 'v1.2.3'", out)
        self.assertIn("$StampKind = 'hub'", out)
        self.assertIn("$StampReleaseAsset = 'demo-hub-{version}-{triple}.zip'", out)
        changed = [(a, b) for a, b in zip(source.splitlines(), out.splitlines()) if a != b]
        self.assertEqual(len(changed), 7, changed)
        self.assertEqual(len(source.splitlines()), len(out.splitlines()))

    def test_sh_gets_every_value(self) -> None:
        out = stamp.stamp(SH.read_text(encoding="utf-8"), ".sh", values(kind="appimage", program="demo"))
        self.assertIn('STAMP_REPO="Owner/app-repo"', out)
        self.assertIn('STAMP_CHANNEL="latest"', out)
        self.assertIn('STAMP_KIND="appimage"', out)

    def test_refuses_what_a_field_may_not_hold(self) -> None:
        text = PS1.read_text(encoding="utf-8")
        for bad in (
            values(repo="no-slash"),
            values(repo="a/b'; rm"),
            values(channel="main"),
            values(app="two words"),
            values(kind="msi"),
            values(program=""),
            values(rolling_asset=""),
            values(channel="v1.0.0", release_asset=""),
            values(rolling_asset="dir/file.exe"),
            values(release_asset="$(evil)"),
        ):
            with self.subTest(bad=bad), self.assertRaises(stamp.StampError):
                stamp.stamp(text, ".ps1", bad)

    def test_a_setup_needs_no_program(self) -> None:
        out = stamp.stamp(PS1.read_text(encoding="utf-8"), ".ps1", values(kind="nsis", program=""))
        self.assertIn("$StampKind = 'nsis'", out)

    def test_kinds_per_script(self) -> None:
        with self.assertRaises(stamp.StampError):
            stamp.stamp(SH.read_text(encoding="utf-8"), ".sh", values(kind="nsis"))
        with self.assertRaises(stamp.StampError):
            stamp.stamp(PS1.read_text(encoding="utf-8"), ".ps1", values(kind="appimage"))

    def test_a_stamped_script_is_not_stamped_again(self) -> None:
        once = stamp.stamp(PS1.read_text(encoding="utf-8"), ".ps1", values())
        with self.assertRaises(stamp.StampError):
            stamp.stamp(once, ".ps1", values())

    def test_no_block_no_stamp(self) -> None:
        with self.assertRaises(stamp.StampError):
            stamp.stamp("echo hi\n", ".sh", values())

    def test_cli_writes_the_file(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "install.sh"
            code = stamp.main([
                str(SH), str(out), "--repo", "O/N", "--channel", "latest", "--app", "a",
                "--kind", "hub", "--program", "p", "--rolling-asset", "p.tar.gz",
            ])
            self.assertEqual(code, 0)
            self.assertIn('STAMP_ROLLING_ASSET="p.tar.gz"', out.read_text(encoding="utf-8"))
            self.assertEqual(stamp.main([str(SH), str(out), "--repo", "bad", "--channel", "latest",
                                         "--app", "a", "--kind", "hub", "--program", "p"]), 1)


FAKE_HUB_SH = """#!/bin/sh
if [ "$1" = "--version" ]; then echo "fake-hub 1.0"; exit 0; fi
printf '%s\\n' "$*" > "$OUT"
"""


@unittest.skipUnless(SH_EXE, "no POSIX sh")
class InstallShTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = Path(tempfile.mkdtemp())
        self.out = self.tmp / "out.txt"
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)

    def run_sh(self, script: Path, *args: str, **env: str) -> subprocess.CompletedProcess[str]:
        full = dict(os.environ, OUT=self.out.as_posix(), **env)
        return subprocess.run([SH_EXE, script.as_posix(), *args], capture_output=True, text=True, env=full)

    def hub_archive(self, entries: dict[str, str] | None = None) -> Path:
        archive = self.tmp / "demo-hub.tar.gz"
        with tarfile.open(archive, "w:gz") as tar:
            for name, text in (entries or {"demo-hub": FAKE_HUB_SH}).items():
                data = text.encode()
                info = tarfile.TarInfo(name)
                info.size = len(data)
                info.mode = 0o755
                tar.addfile(info, io.BytesIO(data))
        return archive

    def test_hub_archive_runs_install_with_the_arguments(self) -> None:
        archive = self.hub_archive()
        write_sums(self.tmp, archive)
        res = self.run_sh(SH, "--file", archive.as_posix(), "--kind", "hub", "--program", "demo-hub",
                          "--allow-root", "--", "--autostart")
        self.assertEqual(res.returncode, 0, res.stderr)
        self.assertIn("checksum ok", res.stdout)
        self.assertEqual(self.out.read_text().strip(), "install --autostart")

    def test_a_wrong_checksum_installs_nothing(self) -> None:
        archive = self.hub_archive()
        res = self.run_sh(SH, "--file", archive.as_posix(), "--sha256", "0" * 64, "--kind", "hub",
                          "--program", "demo-hub", "--allow-root")
        self.assertNotEqual(res.returncode, 0)
        self.assertIn("does not match", res.stderr)
        self.assertFalse(self.out.exists())

    def test_a_file_not_in_the_sums_installs_nothing(self) -> None:
        archive = self.hub_archive()
        other = self.tmp / "other.txt"
        other.write_text("x")
        write_sums(self.tmp, other)
        res = self.run_sh(SH, "--file", archive.as_posix(), "--kind", "hub", "--program", "demo-hub",
                          "--allow-root")
        self.assertNotEqual(res.returncode, 0)
        self.assertIn("is not listed", res.stderr)
        self.assertFalse(self.out.exists())

    def test_a_path_out_of_the_archive_is_refused(self) -> None:
        archive = self.hub_archive({"demo-hub": FAKE_HUB_SH, "../evil": "x"})
        write_sums(self.tmp, archive)
        res = self.run_sh(SH, "--file", archive.as_posix(), "--kind", "hub", "--program", "demo-hub",
                          "--allow-root")
        self.assertNotEqual(res.returncode, 0)
        self.assertIn("leaves its folder", res.stderr)
        self.assertFalse(self.out.exists())
        self.assertFalse((self.tmp.parent / "evil").exists())

    def test_appimage_is_copied_and_made_executable(self) -> None:
        image = self.tmp / "demo.AppImage"
        image.write_bytes(b"\x7fELF fake image")
        write_sums(self.tmp, image)
        bin_dir = self.tmp / "bin"
        res = self.run_sh(SH, "--file", image.as_posix(), "--kind", "appimage", "--program", "demo",
                          "--allow-root", XDG_BIN_HOME=bin_dir.as_posix())
        self.assertEqual(res.returncode, 0, res.stderr)
        self.assertEqual((bin_dir / "demo").read_bytes(), image.read_bytes())
        self.assertFalse((bin_dir / ".demo.new").exists())

    def test_an_unstamped_copy_wants_its_kind(self) -> None:
        archive = self.hub_archive()
        write_sums(self.tmp, archive)
        res = self.run_sh(SH, "--file", archive.as_posix(), "--allow-root")
        self.assertNotEqual(res.returncode, 0)
        self.assertIn("not stamped", res.stderr)

    def test_a_stamped_copy_needs_no_options(self) -> None:
        stamped = self.tmp / "install.sh"
        stamped.write_text(stamp.stamp(SH.read_text(encoding="utf-8"), ".sh", values(
            program="demo-hub", rolling_asset="demo-hub.tar.gz")), encoding="utf-8", newline="\n")
        archive = self.hub_archive()
        write_sums(self.tmp, archive)
        res = self.run_sh(stamped, "--file", archive.as_posix(), "--allow-root")
        self.assertEqual(res.returncode, 0, res.stderr)
        self.assertEqual(self.out.read_text().strip(), "install")


FAKE_CMD = "@echo off\r\nif \"%~1\"==\"--version\" (echo fake-hub 1.0& exit /b 0)\r\necho %*> \"%OUT%\"\r\nexit /b %FAKE_EXIT%\r\n"


@unittest.skipUnless(POWERSHELLS, "install.ps1 runs on Windows")
class InstallPs1Test(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = Path(tempfile.mkdtemp())
        self.out = self.tmp / "out.txt"
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)

    def run_ps(self, shell: str, script: Path, args: str, fake_exit: str = "0") -> subprocess.CompletedProcess[str]:
        env = dict(os.environ, OUT=str(self.out), FAKE_EXIT=fake_exit)
        command = f"& '{script}' {args} -AllowElevated"
        return subprocess.run([shell, "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
                               "-Command", command], capture_output=True, text=True, env=env)

    def fake(self, name: str) -> Path:
        path = self.tmp / name
        path.write_bytes(FAKE_CMD.encode())
        return path

    def out_text(self) -> str:
        return self.out.read_text().strip() if self.out.exists() else ""

    def each_shell(self):
        for shell in POWERSHELLS:
            if self.out.exists():
                self.out.unlink()
            with self.subTest(shell=Path(shell).name):
                yield shell

    def test_hub_zip_runs_install_with_the_arguments(self) -> None:
        program = self.fake("demo-hub.cmd")
        archive = self.tmp / "demo-hub.zip"
        with zipfile.ZipFile(archive, "w") as zf:
            zf.write(program, "demo-hub.cmd")
        program.unlink()
        write_sums(self.tmp, archive)
        for shell in self.each_shell():
            res = self.run_ps(shell, PS1, f"-File '{archive}' -Kind hub -Program demo-hub.cmd -InstallArgs '--autostart'")
            self.assertEqual(res.returncode, 0, res.stdout + res.stderr)
            self.assertIn("checksum ok", res.stdout)
            self.assertEqual(self.out_text(), "install --autostart")

    def test_bare_hub_program(self) -> None:
        program = self.fake("demo-hub.cmd")
        write_sums(self.tmp, program)
        for shell in self.each_shell():
            res = self.run_ps(shell, PS1, f"-File '{program}' -Kind hub -Program demo-hub.cmd")
            self.assertEqual(res.returncode, 0, res.stdout + res.stderr)
            self.assertEqual(self.out_text(), "install")

    def test_nsis_and_inno_run_silently(self) -> None:
        setup = self.fake("demo-setup.cmd")
        write_sums(self.tmp, setup)
        for kind, flags in (("nsis", "/S"), ("inno", "/VERYSILENT /SUPPRESSMSGBOXES /CURRENTUSER /NORESTART")):
            for shell in self.each_shell():
                res = self.run_ps(shell, PS1, f"-File '{setup}' -Kind {kind}")
                self.assertEqual(res.returncode, 0, res.stdout + res.stderr)
                self.assertEqual(self.out_text(), flags)

    def test_a_failing_setup_fails(self) -> None:
        setup = self.fake("demo-setup.cmd")
        write_sums(self.tmp, setup)
        for shell in self.each_shell():
            res = self.run_ps(shell, PS1, f"-File '{setup}' -Kind nsis", fake_exit="3")
            self.assertNotEqual(res.returncode, 0)
            self.assertIn("exit code 3", res.stdout + res.stderr)

    def test_a_wrong_checksum_installs_nothing(self) -> None:
        setup = self.fake("demo-setup.cmd")
        for shell in self.each_shell():
            res = self.run_ps(shell, PS1, f"-File '{setup}' -Sha256 {'0' * 64} -Kind nsis")
            self.assertNotEqual(res.returncode, 0)
            self.assertIn("does not match", res.stdout + res.stderr)
            self.assertFalse(self.out.exists())

    def test_a_path_out_of_the_archive_is_refused(self) -> None:
        archive = self.tmp / "demo-hub.zip"
        with zipfile.ZipFile(archive, "w") as zf:
            zf.writestr("demo-hub.cmd", FAKE_CMD)
            zf.writestr("../evil.txt", "x")
        write_sums(self.tmp, archive)
        for shell in self.each_shell():
            res = self.run_ps(shell, PS1, f"-File '{archive}' -Kind hub -Program demo-hub.cmd")
            self.assertNotEqual(res.returncode, 0)
            self.assertIn("leaves its folder", res.stdout + res.stderr)
            self.assertFalse(self.out.exists())

    def test_an_unstamped_copy_wants_its_kind(self) -> None:
        setup = self.fake("demo-setup.cmd")
        write_sums(self.tmp, setup)
        for shell in self.each_shell():
            res = self.run_ps(shell, PS1, f"-File '{setup}'")
            self.assertNotEqual(res.returncode, 0)
            self.assertIn("not stamped", res.stdout + res.stderr)

    def test_a_stamped_copy_needs_no_options(self) -> None:
        stamped = self.tmp / "install.ps1"
        stamped.write_text(stamp.stamp(PS1.read_text(encoding="utf-8"), ".ps1", values(
            kind="inno", program="", rolling_asset="demo-setup.exe")), encoding="utf-8")
        setup = self.fake("demo-setup.cmd")
        write_sums(self.tmp, setup)
        for shell in self.each_shell():
            res = self.run_ps(shell, stamped, f"-File '{setup}'")
            self.assertEqual(res.returncode, 0, res.stdout + res.stderr)
            self.assertIn("/VERYSILENT", self.out_text())

    def test_invoke_expression_leaves_the_session_alone(self) -> None:
        # Through `irm ... | iex` the script runs in the caller's session: its strict mode and error
        # preference must stay inside, and a failure must not end the session.
        for shell in self.each_shell():
            command = (
                f"try {{ Get-Content -Raw '{PS1}' | Invoke-Expression }} catch {{ 'caught: ' + $_ }}; "
                "'after: ' + $ErrorActionPreference"
            )
            res = subprocess.run([shell, "-NoProfile", "-NonInteractive", "-Command", command],
                                 capture_output=True, text=True)
            self.assertIn("caught: install.ps1:", res.stdout, res.stderr)
            self.assertIn("after: Continue", res.stdout)


FAKE_GH = r"""#!/usr/bin/env bash
printf '%s\n' "gh $*" >> "$GH_LOG"
case "$1 $2" in
  "release view")
    if [ -n "${GH_NO_RELEASE:-}" ]; then exit 1; fi
    case " $* " in
      *" isDraft "*) printf '%s\n' "${GH_DRAFT:-true}" ;;
      *" assets "*) printf '%s\n' ${GH_ASSETS:-} ;;
    esac
    ;;
esac
exit 0
"""


@unittest.skipUnless(BASH_EXE and shutil.which("python3" if not WINDOWS else "python"), "no bash")
class PublishTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.tmp, ignore_errors=True)
        self.bin = self.tmp / "bin"
        self.bin.mkdir()
        gh = self.bin / "gh"
        gh.write_text(FAKE_GH, encoding="utf-8", newline="\n")
        gh.chmod(0o755)
        self.log = self.tmp / "gh.log"
        self.dist = self.tmp / "dist"
        self.dist.mkdir()
        (self.dist / "demo-hub-windows-x86_64.exe").write_bytes(b"windows")
        (self.dist / "demo-hub-linux-x86_64.tar.gz").write_bytes(b"linux")

    def publish(self, **env: str) -> subprocess.CompletedProcess[str]:
        full = dict(
            os.environ,
            PATH=f"{self.bin}{os.pathsep}{os.environ['PATH']}",
            GH_LOG=self.log.as_posix(),
            GITHUB_REPOSITORY="Owner/demo",
            KIT=KIT.as_posix(),
            FILES=self.dist.as_posix(),
            EXPECT="2",
            APP="demo",
            SHA="a" * 40,
            TAG="latest",
            WINDOWS_KIND="hub",
            WINDOWS_PROGRAM="demo-hub.exe",
            WINDOWS_RELEASE_ASSET="demo-hub-{version}-{triple}.zip",
            WINDOWS_ROLLING_ASSET="demo-hub-windows-x86_64.exe",
            UNIX_KIND="hub",
            UNIX_PROGRAM="demo-hub",
            UNIX_RELEASE_ASSET="demo-hub-{version}-{triple}.tar.gz",
            UNIX_ROLLING_ASSET="demo-hub-linux-x86_64.tar.gz",
            PYTHON=sys.executable.replace("\\", "/"),
        )
        full.update(env)
        if WINDOWS:
            # Git Bash finds the fake gh by its POSIX path.
            full["PATH"] = "/" + self.bin.as_posix().replace(":", "", 1) + ":" + "/usr/bin:/bin:" + os.environ["PATH"]
        return subprocess.run([BASH_EXE, PUBLISH.as_posix()], capture_output=True, text=True, env=full)

    def calls(self) -> list[str]:
        return self.log.read_text().splitlines() if self.log.exists() else []

    def test_rolling_order_sums_first_out_and_words_last(self) -> None:
        res = self.publish(GH_ASSETS="SHA256SUMS demo-hub-windows-x86_64.exe old-name.exe")
        self.assertEqual(res.returncode, 0, res.stdout + res.stderr)
        calls = self.calls()
        kinds = [c.split(" --repo")[0] for c in calls]
        first_delete = kinds.index("gh release delete-asset latest SHA256SUMS")
        upload = next(i for i, c in enumerate(kinds) if c.startswith("gh release upload latest demo-hub"))
        stale = kinds.index("gh release delete-asset latest old-name.exe")
        sums = kinds.index("gh release upload latest SHA256SUMS")
        tag = next(i for i, c in enumerate(calls) if "git/refs/tags/latest" in c)
        edit = next(i for i, c in enumerate(kinds) if c.startswith("gh release edit latest"))
        self.assertLess(first_delete, upload)
        self.assertLess(upload, stale)
        self.assertLess(stale, sums)
        self.assertLess(sums, tag)
        self.assertLess(tag, edit)
        self.assertIn("Rolling build (aaaaaaa)", calls[edit])
        self.assertIn("install.ps1", calls[upload])
        self.assertIn("install.sh", calls[upload])
        self.assertIn("SHA256SUMS", res.stdout + "".join(calls))
        self.assertIn("install.ps1", res.stdout)

    def test_a_missing_system_publishes_nothing(self) -> None:
        (self.dist / "demo-hub-linux-x86_64.tar.gz").unlink()
        res = self.publish()
        self.assertNotEqual(res.returncode, 0)
        self.assertIn("instead of 2", res.stderr)
        self.assertEqual(self.calls(), [])

    def test_release_makes_a_draft_and_attaches(self) -> None:
        res = self.publish(TAG="v1.2.3", SHA="", GH_NO_RELEASE="1")
        self.assertEqual(res.returncode, 0, res.stdout + res.stderr)
        calls = self.calls()
        self.assertTrue(any(c.startswith("gh release create v1.2.3") and "--draft" in c for c in calls), calls)
        upload = next(c for c in calls if c.startswith("gh release upload v1.2.3"))
        for name in ("install.ps1", "install.sh", "SHA256SUMS", "demo-hub-windows-x86_64.exe"):
            self.assertIn(name, upload)
        self.assertFalse(any("git/refs/tags" in c for c in calls), "a release tag is never moved")

    def test_a_published_release_is_not_touched(self) -> None:
        res = self.publish(TAG="v1.2.3", SHA="", GH_DRAFT="false")
        self.assertNotEqual(res.returncode, 0)
        self.assertIn("NREL-10", res.stderr)
        self.assertFalse(any("upload" in c for c in self.calls()))

    def test_an_extra_file_may_not_shadow_a_script(self) -> None:
        extra = self.tmp / "install.ps1"
        extra.write_text("x")
        res = self.publish(EXTRA=extra.as_posix())
        self.assertNotEqual(res.returncode, 0)
        self.assertIn("two files are called install.ps1", res.stderr)
        self.assertEqual(self.calls(), [])

    def test_the_stamped_scripts_carry_the_channel(self) -> None:
        # A fake gh that keeps a copy of what is uploaded.
        keep = self.tmp / "kept"
        keep.mkdir()
        gh = self.bin / "gh"
        copy = f'if [ "$1 $2" = "release upload" ]; then for f in "$@"; do [ -f "$f" ] && cp "$f" "{keep.as_posix()}/"; done; fi\n'
        self.assertTrue(FAKE_GH.endswith("exit 0\n"))
        gh.write_text(FAKE_GH[: -len("exit 0\n")] + copy + "exit 0\n", encoding="utf-8", newline="\n")
        res = self.publish(TAG="v2.0.0", SHA="", GH_NO_RELEASE="1")
        self.assertEqual(res.returncode, 0, res.stdout + res.stderr)
        self.assertIn("$StampChannel = 'v2.0.0'", (keep / "install.ps1").read_text(encoding="utf-8"))
        self.assertIn('STAMP_CHANNEL="v2.0.0"', (keep / "install.sh").read_text(encoding="utf-8"))
        sums = (keep / "SHA256SUMS").read_text()
        for name in ("install.ps1", "install.sh", "demo-hub-windows-x86_64.exe", "demo-hub-linux-x86_64.tar.gz"):
            self.assertIn(f"  {name}", sums)
        self.assertEqual(
            sums.split()[sums.split().index("install.ps1") - 1], sha(keep / "install.ps1"),
            "the checksum is of the stamped script",
        )


if __name__ == "__main__":
    unittest.main()
