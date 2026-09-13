#!/usr/bin/env python3
"""MDC conformance runner — language-agnostic.

Drives an MDC implementation's command-line interface against the conformance
corpus, using nothing but ``spec/corpus/manifest.json`` and the contract in
``spec/conformance.md``. It has no knowledge of any implementation's language:
it shells out to a CLI command you name.

This is the portability proof for the corpus. It ships pointing at the
reference JavaScript CLI; re-point it at any other implementation with
``--cli`` (the toml-test ``-decoder`` model) and the same corpus judges it.

    # default: the reference JS CLI
    python3 spec/conformance/run.py

    # a second implementation in any language
    python3 spec/conformance/run.py --cli "./target/release/mdc"
    python3 spec/conformance/run.py --cli "python3 -m mymdc" --level L1

Exit code: 0 if all selected cases pass, 1 otherwise. Standard library only.
"""
from __future__ import annotations

import argparse
import json
import os
import shlex
import shutil
import subprocess
import sys
import tempfile
import unicodedata
from pathlib import Path

HERE = Path(__file__).resolve().parent
CORPUS = (HERE / ".." / "corpus").resolve()
REPO_ROOT = (HERE / ".." / "..").resolve()
DEFAULT_CLI = f"node {REPO_ROOT / 'packages' / 'mdc' / 'src' / 'cli.js'}"


def strip_lines(value):
    """Deep-copy a JSON value with every ``line`` key removed at any depth."""
    if isinstance(value, list):
        return [strip_lines(v) for v in value]
    if isinstance(value, dict):
        return {k: strip_lines(v) for k, v in value.items() if k != "line"}
    return value


def norm_bytes(text: str) -> str:
    """NFC for comparison only (handles NFD checkouts); newlines untouched."""
    return unicodedata.normalize("NFC", text)


def run_case(cli: list[str], case: dict, corpus_root: Path) -> tuple[bool, str]:
    case_dir = corpus_root / case["id"]
    work = Path(tempfile.mkdtemp(prefix="mdc-conf-"))
    try:
        input_bytes = (case_dir / case["input"]).read_bytes()
        file_path = work / "work.mdc.md"
        file_path.write_bytes(input_bytes)
        out_path = work / "out.mdc.md"  # fresh; must not pre-exist (cut)

        argv = [
            str(file_path) if a == "$FILE" else str(out_path) if a == "$OUT" else a
            for a in case["argv"]
        ]
        proc = subprocess.run(cli + argv, capture_output=True, text=True)
        mode = case["compare"]

        def expected_json():
            return json.loads((case_dir / case["expect"]).read_text(encoding="utf-8"))

        if mode == "json-model":
            if proc.returncode != (case.get("exit", 0)):
                return False, f"exit {proc.returncode} (want {case.get('exit', 0)}): {proc.stderr.strip()}"
            if strip_lines(json.loads(proc.stdout)) != strip_lines(expected_json()):
                return False, "L1 model mismatch"
        elif mode == "json-findings":
            if strip_lines(json.loads(proc.stdout)) != strip_lines(expected_json()):
                return False, "lint findings mismatch"
        elif mode == "bytes":
            if proc.returncode != (case.get("exit", 0)):
                return False, f"exit {proc.returncode} (want {case.get('exit', 0)}): {proc.stderr.strip()}"
            result = out_path if case.get("out") == "$OUT" else file_path
            actual = norm_bytes(result.read_text(encoding="utf-8"))
            expected = norm_bytes((case_dir / case["expect"]).read_text(encoding="utf-8"))
            if actual != expected:
                return False, "byte mismatch"
        elif mode == "exit":
            if proc.returncode != case["exit"]:
                return False, f"exit {proc.returncode} (want {case['exit']})"
            if file_path.read_bytes() != input_bytes:
                return False, "refusal must leave the file byte-untouched"
        elif mode == "error":
            if proc.returncode != 1:
                return False, f"exit {proc.returncode} (want 1)"
            if json.loads(proc.stdout) != {"error": case["error"]}:
                return False, "error token mismatch"
        else:
            return False, f"unknown compare mode: {mode}"
        return True, ""
    except Exception as exc:  # noqa: BLE001 — report any failure per-case
        return False, f"runner error: {exc}"
    finally:
        shutil.rmtree(work, ignore_errors=True)


def main() -> int:
    ap = argparse.ArgumentParser(description="Run the MDC conformance corpus against a CLI.")
    ap.add_argument("--cli", default=DEFAULT_CLI, help="CLI command to drive (default: the reference JS CLI).")
    ap.add_argument("--level", choices=["L1", "L2"], help="Only run cases at this conformance level.")
    ap.add_argument("--corpus", default=str(CORPUS), help="Path to spec/corpus (default: alongside this script).")
    ap.add_argument("-v", "--verbose", action="store_true", help="Print every case, not just failures.")
    args = ap.parse_args()

    corpus_root = Path(args.corpus).resolve()
    manifest = json.loads((corpus_root / "manifest.json").read_text(encoding="utf-8"))
    cli = shlex.split(args.cli)

    cases = manifest["cases"]
    if args.level:
        cases = [c for c in cases if c["level"] == args.level]

    passed = failed = 0
    for case in cases:
        ok, detail = run_case(cli, case, corpus_root)
        if ok:
            passed += 1
            if args.verbose:
                print(f"  ok   [{case['level']}] {case['id']}")
        else:
            failed += 1
            print(f"  FAIL [{case['level']}] {case['id']}  — {detail}")

    total = passed + failed
    print(f"\nMDC conformance ({args.cli}): {passed}/{total} passed" + (f", {failed} failed" if failed else ""))
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
