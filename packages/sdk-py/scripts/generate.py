import shutil
import subprocess
import sys
from pathlib import Path


def run(cmd: list[str], cwd: Path) -> None:
    proc = subprocess.run(cmd, cwd=str(cwd), check=False)
    if proc.returncode != 0:
        raise SystemExit(proc.returncode)


def main() -> int:
    repo_root = Path(__file__).resolve().parents[3]
    spec_path = repo_root / "packages" / "contracts" / "openapi" / "api.v1.yaml"
    out_dir = repo_root / "packages" / "sdk-py" / "finwise_sdk"
    tmp_dir = repo_root / ".tmp" / "sdk-py"
    tmp_dir.mkdir(parents=True, exist_ok=True)
    bundled = tmp_dir / "openapi.bundled.yaml"

    npx_cmd = "npx.cmd" if sys.platform.startswith("win") else "npx"

    run(
        [
            npx_cmd,
            "--yes",
            "@redocly/cli@2.19.1",
            "bundle",
            str(spec_path),
            "-o",
            str(bundled),
        ],
        cwd=repo_root,
    )

    run(
        [
            "openapi-python-client",
            "generate",
            "--path",
            str(bundled),
            "--output-path",
            str(out_dir),
            "--meta",
            "none",
            "--overwrite",
        ],
        cwd=repo_root,
    )

    cache_dir = out_dir / ".ruff_cache"
    if cache_dir.exists():
        shutil.rmtree(cache_dir, ignore_errors=True)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
