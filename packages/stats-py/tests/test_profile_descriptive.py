import pytest

from aqsha_stats.registry import ANALYSES

from conftest import ITEMS_X1


def test_profile_golden(df):
    result = ANALYSES["profile"](df, {})
    rows = {row[0]: row for row in result["tables"][0]["rows"]}

    assert result["meta"]["n"] == 100
    assert rows["X1.1"][1] == "numeric"
    assert rows["X1.1"][9] == "1-5"  # Likert detected
    assert rows["X1"][9] == "-"  # sum score 4..20 is not Likert
    assert rows["Usia"][9] == "-"  # 19..25 outside 1..7
    assert rows["JK"][1] == "categorical"
    assert "Laki-laki" in rows["JK"][10]

    preview = result["tables"][1]
    assert preview["id"] == "preview"
    assert len(preview["rows"]) == 5
    assert preview["columns"][0] == "X1.1"


def test_descriptive_groups_golden(df):
    result = ANALYSES["descriptive"](df, {"groups": {"GX1": ITEMS_X1}})
    row = result["tables"][0]["rows"][0]

    total = df[ITEMS_X1].sum(axis=1)
    assert row[0] == "GX1"
    assert row[1] == 100
    assert row[2] == float(total.min())
    assert row[3] == float(total.max())
    assert row[4] == pytest.approx(float(total.mean()), abs=5e-4)
    assert row[5] == pytest.approx(float(total.std(ddof=1)), abs=5e-4)
    assert row[5] == pytest.approx(3.243268086172939, abs=5e-4)  # pinned golden


def test_descriptive_frequency_table(df):
    result = ANALYSES["descriptive"](df, {"variables": ["X1.1"]})
    freq = next(t for t in result["tables"] if t["id"] == "freq_X1.1")

    counts = df["X1.1"].value_counts().sort_index()
    got = {row[0]: row[1] for row in freq["rows"]}
    assert got == {int(k): int(v) for k, v in counts.items()}
    assert sum(row[1] for row in freq["rows"]) == 100
    assert freq["rows"][-1][4] == pytest.approx(100.0, abs=1e-9)  # cumulative percent

    # X1 (sum score) has 16 distinct values -> no frequency table.
    result = ANALYSES["descriptive"](df, {"variables": ["X1"]})
    assert [t["id"] for t in result["tables"]] == ["descriptive_statistics"]
