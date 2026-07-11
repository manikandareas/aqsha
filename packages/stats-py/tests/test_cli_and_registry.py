import json

import pytest

import aqsha_stats
from aqsha_stats import AnalysisError, run_analysis, run_analysis_safe
from aqsha_stats.registry import ANALYSES, ANALYSIS_IDS, list_analyses

from conftest import ITEMS_X1, cli_json, run_cli

REGISTRY_ARGS = {
    "profile": {},
    "descriptive": {"variables": ["X1", "X2", "Y"]},
    "uji_validitas": {"items": ITEMS_X1},
    "uji_reliabilitas": {"items": ITEMS_X1},
    "uji_normalitas": {"mode": "residual", "dependent": "Y", "independents": ["X1", "X2"]},
    "uji_multikolinearitas": {"dependent": "Y", "independents": ["X1", "X2"]},
    "uji_heteroskedastisitas": {"dependent": "Y", "independents": ["X1", "X2"]},
    "uji_autokorelasi": {"dependent": "Y", "independents": ["X1", "X2"]},
    "uji_linearitas": {"dependent": "Y", "independent": "X1"},
    "regresi_linear": {"dependent": "Y", "independents": ["X1", "X2"]},
    "korelasi": {"variables": ["X1", "X2", "Y"]},
    "uji_beda_t": {"mode": "independent", "dependent": "Y", "group": "JK"},
    "uji_anova": {"dependent": "Y", "group": "Usia"},
    "uji_mann_whitney": {"dependent": "Y", "group": "JK"},
    "uji_wilcoxon": {"pre": "X1", "post": "Y"},
    "uji_kruskal_wallis": {"dependent": "Y", "group": "Usia"},
    "uji_chi_square": {"row": "JK", "col": "Usia"},
    "transformasi_msi": {"items": ITEMS_X1},
    "regresi_logistik": {"dependent": "Lulus", "independents": ["X1", "X2"]},
    "uji_moderasi": {"dependent": "Y", "independent": "X1", "moderator": "X2"},
    "uji_mediasi": {"dependent": "Y", "independent": "X1", "mediator": "X2"},
    "uji_anova_dua_arah": {"dependent": "Y", "factor1": "JK", "factor2": "Usia"},
    "uji_ancova": {"dependent": "Y", "factor": "JK", "covariates": ["X1"]},
    "uji_manova": {"dependents": ["X1", "Y"], "group": "Usia"},
    "analisis_faktor": {"items": ITEMS_X1},
    "cb_sem": {
        "latents": {"X1": ITEMS_X1, "Y": ["Y.1", "Y.2", "Y.3", "Y.4"]},
        "paths": ["X1 -> Y"],
    },
    # bootstrap floor (100) supaya kontrak-test tetap cepat; default produksi 1000.
    "sem_pls": {
        "latents": {"X1": ITEMS_X1, "Y": ["Y.1", "Y.2", "Y.3", "Y.4"]},
        "paths": ["X1 -> Y"],
        "bootstrap": 100,
    },
}

EXPECTED_IDS = (
    "profile",
    "descriptive",
    "uji_validitas",
    "uji_reliabilitas",
    "uji_normalitas",
    "uji_multikolinearitas",
    "uji_heteroskedastisitas",
    "uji_autokorelasi",
    "uji_linearitas",
    "regresi_linear",
    "korelasi",
    "uji_beda_t",
    "uji_anova",
    "uji_mann_whitney",
    "uji_wilcoxon",
    "uji_kruskal_wallis",
    "uji_chi_square",
    "transformasi_msi",
    "regresi_logistik",
    "uji_moderasi",
    "uji_mediasi",
    "uji_anova_dua_arah",
    "uji_ancova",
    "uji_manova",
    "analisis_faktor",
    "cb_sem",
    "sem_pls",
)


def test_registry_ids():
    assert ANALYSIS_IDS == EXPECTED_IDS
    assert tuple(ANALYSES) == ANALYSIS_IDS
    assert list_analyses() == list(ANALYSIS_IDS)
    assert set(REGISTRY_ARGS) == set(ANALYSIS_IDS)


@pytest.mark.parametrize("analysis_id", ANALYSIS_IDS)
def test_every_analysis_fulfills_contract(analysis_id, fixture_path):
    if analysis_id == "sem_pls":
        # openpls hanya ada di dependency-group opsional "sandbox" — skip (bukan
        # merah) di env polos, selaras pytest.importorskip di test_tier3.py.
        pytest.importorskip("openpls")
    result = run_analysis(analysis_id, fixture_path, REGISTRY_ARGS[analysis_id])

    assert result["analysis"] == analysis_id
    assert result["version"] == aqsha_stats.__version__
    assert isinstance(result["tables"], list) and result["tables"]
    for tbl in result["tables"]:
        assert set(tbl) == {"id", "title", "columns", "rows", "notes"}
        for row in tbl["rows"]:
            assert len(row) == len(tbl["columns"])
    assert isinstance(result["decisions"], list)
    for d in result["decisions"]:
        assert set(d) == {"id", "label", "rule", "value", "cutoff", "verdict", "interpretation"}
        assert d["verdict"] in ("lolos", "tidak_lolos", "perhatian")
        assert d["interpretation"]
    meta = result["meta"]
    assert meta["n"] == 100
    assert meta["seed"] == 42
    assert "statsmodels" in meta["packages"]
    assert isinstance(meta["warnings"], list)

    json.dumps(result)  # must be JSON-serializable (no NaN/numpy scalars)


def test_run_analysis_raises_analysis_error(fixture_path):
    with pytest.raises(AnalysisError) as excinfo:
        run_analysis("uji_validitas", fixture_path, {"items": ["X9"]})
    assert excinfo.value.code == "column_not_found"
    assert "Kolom 'X9' tidak ditemukan" in excinfo.value.message
    assert "Kolom tersedia" in excinfo.value.message


def test_run_analysis_safe_never_raises(fixture_path):
    err = run_analysis_safe("does_not_exist", fixture_path, {})
    assert err["error"]["code"] == "unknown_analysis"

    err = run_analysis_safe("profile", "nope.csv", {})
    assert err["error"]["code"] == "file_not_found"

    # Unexpected exception (non-iterable items) -> code "internal".
    err = run_analysis_safe("uji_validitas", fixture_path, {"items": 123})
    assert err["error"]["code"] == "internal"


def test_cli_end_to_end_regresi(fixture_path):
    args = json.dumps({"dependent": "Y", "independents": ["X1", "X2"]})
    proc = run_cli("run", "regresi_linear", "--data", fixture_path, "--args", args)
    assert proc.returncode == 0
    result = json.loads(proc.stdout)  # stdout is exactly one JSON object
    assert result["analysis"] == "regresi_linear"
    assert {t["id"] for t in result["tables"]} == {"model_summary", "anova", "coefficients"}
    assert {d["id"] for d in result["decisions"]} >= {"uji_f", "uji_t_X1", "uji_t_X2"}


def test_cli_unknown_analysis(fixture_path):
    result, code = cli_json("run", "uji_ghoib", "--data", fixture_path, "--args", "{}")
    assert code == 1
    assert result["error"]["code"] == "unknown_analysis"


def test_cli_missing_column(fixture_path):
    result, code = cli_json(
        "run", "regresi_linear", "--data", fixture_path,
        "--args", json.dumps({"dependent": "Y", "independents": ["X9"]}),
    )
    assert code == 1
    assert result["error"]["code"] == "column_not_found"
    assert "X9" in result["error"]["message"]


def test_cli_invalid_args_json(fixture_path):
    result, code = cli_json("run", "profile", "--data", fixture_path, "--args", "{bukan json")
    assert code == 1
    assert result["error"]["code"] == "invalid_args"


def test_csv_semicolon_sniff(tmp_path):
    p = tmp_path / "semi.csv"
    p.write_text("A;B\n1;2\n3;4\n5;6\n", encoding="utf-8")
    from aqsha_stats.io import load_dataset

    df = load_dataset(p)
    assert list(df.columns) == ["A", "B"]
    assert df["B"].tolist() == [2, 4, 6]
