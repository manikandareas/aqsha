"""Generate tests/fixtures/likert100.csv ONCE (committed; do not regenerate casually).

Synthetic questionnaire, n=100: latent normals with realistic correlation
structure, discretized to 1-5 Likert items X1.1..X1.4, X2.1..X2.4, Y.1..Y.4,
plus JK (categorical) and Usia (integer).

Run: uv run python tests/fixtures/generate.py
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

SEED = 42
N = 100


def discretize(latent: np.ndarray) -> np.ndarray:
    """Map standardized latent scores onto 1..5 Likert via fixed cutpoints."""
    z = (latent - latent.mean()) / latent.std(ddof=0)
    cuts = [-1.5, -0.5, 0.5, 1.5]
    return (np.digitize(z, cuts) + 1).astype(int)


def main() -> None:
    rng = np.random.default_rng(SEED)

    f1 = rng.normal(size=N)
    f2 = 0.55 * f1 + np.sqrt(1 - 0.55**2) * rng.normal(size=N)
    fy = 0.50 * f1 + 0.40 * f2 + 0.60 * rng.normal(size=N)

    data: dict[str, np.ndarray] = {}
    for prefix, factor in (("X1", f1), ("X2", f2), ("Y", fy)):
        for i in range(1, 5):
            item_latent = factor + 0.65 * rng.normal(size=N)
            data[f"{prefix}.{i}"] = discretize(item_latent)

    # Sum scores (common skripsi convention: total per construct).
    for prefix in ("X1", "X2", "Y"):
        data[prefix] = sum(data[f"{prefix}.{i}"] for i in range(1, 5))

    data["JK"] = rng.choice(["Laki-laki", "Perempuan"], size=N)
    data["Usia"] = rng.integers(19, 26, size=N)
    # Terikat biner deterministik (untuk uji regresi logistik) — TIDAK memakai rng, jadi
    # kolom lain di atas tetap identik saat regenerate (seed 42): Y di atas median = 1.
    data["Lulus"] = (data["Y"] >= np.median(data["Y"])).astype(int)

    df = pd.DataFrame(data)
    out = Path(__file__).parent / "likert100.csv"
    df.to_csv(out, index=False)
    print(f"wrote {out} ({len(df)} rows)")


if __name__ == "__main__":
    main()
