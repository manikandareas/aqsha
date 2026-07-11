"""CLI: python -m aqsha_stats run <analysis> --data <path> --args '<json>'.

Thin wrapper over run_analysis_safe: prints exactly one JSON object to stdout,
exits 1 iff the result is an error object.
"""

from __future__ import annotations

import argparse
import json
import sys

from . import run_analysis_safe


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="aqsha_stats")
    sub = parser.add_subparsers(dest="command", required=True)
    run = sub.add_parser("run", help="Jalankan satu analisis dan cetak hasil JSON ke stdout")
    run.add_argument("analysis")
    run.add_argument("--data", required=True)
    run.add_argument("--args", default="{}")
    ns = parser.parse_args(argv)

    try:
        args = json.loads(ns.args)
    except ValueError as exc:
        result = {
            "error": {
                "code": "invalid_args",
                "message": f"Argumen --args bukan JSON yang valid: {exc}",
            }
        }
    else:
        # `json.loads("null")` -> None: treat the JSON literal null as invalid args (not a
        # missing branch that would leave `result` unbound), matching run_analysis' dict check.
        if args is None:
            result = {
                "error": {
                    "code": "invalid_args",
                    "message": "Argumen --args tidak boleh null; kirim objek argumen (mis. {}).",
                }
            }
        else:
            result = run_analysis_safe(ns.analysis, ns.data, args)

    print(json.dumps(result, ensure_ascii=False))
    if "error" in result:
        sys.exit(1)


if __name__ == "__main__":
    main()
