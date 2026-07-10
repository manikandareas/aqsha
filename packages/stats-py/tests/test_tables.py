import math

import pytest
from scipy import stats

from aqsha_stats.contract import AnalysisError
from aqsha_stats.tables import DW_TABLE_ALPHA_05, dw_bounds, r_tabel


def test_r_tabel_n100_known_value():
    # Widely published r-tabel value for n=100, alpha=0.05 two-tailed.
    assert r_tabel(100, 0.05) == pytest.approx(0.1966, abs=1e-4)
    assert r_tabel(100, 0.05) == pytest.approx(0.19655119559322565, rel=1e-9)


def test_r_tabel_matches_t_transform():
    # Independent recomputation of r = t / sqrt(df + t^2).
    for n, alpha in [(30, 0.05), (50, 0.01), (100, 0.05)]:
        df = n - 2
        t = stats.t.ppf(1 - alpha / 2, df)
        assert r_tabel(n, alpha) == pytest.approx(t / math.sqrt(df + t * t), rel=1e-12)


def test_dw_table_savin_white_spot_values():
    # Spot values verified against three independent published copies.
    assert DW_TABLE_ALPHA_05[1][15] == (1.077, 1.361)
    assert DW_TABLE_ALPHA_05[2][100] == (1.634, 1.715)
    assert DW_TABLE_ALPHA_05[3][50] == (1.421, 1.674)
    assert DW_TABLE_ALPHA_05[4][24] == (1.013, 1.775)
    assert DW_TABLE_ALPHA_05[5][70] == (1.464, 1.768)


def test_dw_table_coverage():
    expected_ns = set(range(15, 41)) | set(range(45, 101, 5))
    for k in range(1, 6):
        assert set(DW_TABLE_ALPHA_05[k]) == expected_ns


def test_dw_bounds_exact_and_interpolated():
    dl, du, notes = dw_bounds(100, 2)
    assert (dl, du) == (1.634, 1.715)
    assert notes == []

    dl, du, notes = dw_bounds(42, 1)  # between n=40 and n=45
    assert dl == pytest.approx(1.442 + 0.4 * (1.475 - 1.442), rel=1e-12)
    assert du == pytest.approx(1.544 + 0.4 * (1.566 - 1.544), rel=1e-12)
    assert any("interpolasi" in note for note in notes)


def test_dw_bounds_clamps_large_n_and_rejects_bad_k():
    dl, du, notes = dw_bounds(250, 2)
    assert (dl, du) == DW_TABLE_ALPHA_05[2][100]
    assert any("melebihi cakupan" in note for note in notes)

    with pytest.raises(AnalysisError) as excinfo:
        dw_bounds(50, 6)
    assert excinfo.value.code == "k_out_of_range"

    with pytest.raises(AnalysisError) as excinfo:
        dw_bounds(10, 2)
    assert excinfo.value.code == "n_out_of_range"
