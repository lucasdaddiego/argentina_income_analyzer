"""Survey-weighted statistics on numpy. Covers scalar/array quantiles, the empty-input and
zero-income ValueError paths, and the decile_table zero-guards (empty deciles, zero income)."""

from __future__ import annotations

import numpy as np
import pytest

from pipeline import weighted


def test_weighted_quantile_scalar_and_array():
    v = [1.0, 2.0, 3.0, 4.0]
    w = [1.0, 1.0, 1.0, 1.0]
    # Scalar q -> float (out.size == 1 branch).
    median = weighted_q = weighted.weighted_quantile(v, w, 0.5)
    assert isinstance(median, float)
    # Array q -> ndarray (out.size != 1 branch).
    arr = weighted.weighted_quantile(v, w, [0.25, 0.5, 0.75])
    assert isinstance(arr, np.ndarray)
    assert arr.shape == (3,)
    assert weighted_q == median


def test_weighted_quantile_respects_weights():
    # Almost all the weight sits on the big value -> the median is the big value.
    v = [1.0, 100.0]
    w = [1.0, 1000.0]
    assert weighted.weighted_quantile(v, w, 0.5) == 100.0


def test_weighted_quantile_empty_raises():
    with pytest.raises(ValueError, match="non-empty"):
        weighted.weighted_quantile([], [], 0.5)


def test_weighted_mean():
    assert weighted.weighted_mean([1.0, 3.0], [3.0, 1.0]) == pytest.approx((1 * 3 + 3 * 1) / 4)


def test_lorenz_and_gini_perfect_equality():
    # Equal incomes -> Gini ~ 0 and a near-diagonal Lorenz curve.
    points, gini = weighted.lorenz_and_gini([10.0] * 50, [1.0] * 50, n_points=11)
    assert gini == pytest.approx(0.0, abs=1e-9)
    assert points[0] == [0.0, 0.0]
    assert points[-1] == [1.0, 1.0]
    assert len(points) == 11


def test_lorenz_and_gini_clamps_negative_income():
    # A rare negative income is clamped to 0 for a monotone Lorenz; total income stays positive.
    points, gini = weighted.lorenz_and_gini([-5.0, 10.0, 20.0], [1.0, 1.0, 1.0])
    assert 0.0 <= gini <= 1.0
    assert all(0.0 <= i <= 1.0 for _, i in points)


def test_lorenz_and_gini_zero_income_raises():
    with pytest.raises(ValueError, match="positive total income"):
        weighted.lorenz_and_gini([0.0, 0.0], [1.0, 1.0])


def test_lorenz_and_gini_empty_raises():
    with pytest.raises(ValueError, match="non-empty"):
        weighted.lorenz_and_gini([], [])


def test_decile_table_normal():
    rng = np.random.default_rng(0)
    v = np.sort(rng.uniform(1, 1000, size=200))
    w = np.ones(200)
    rows = weighted.decile_table(v, w)
    assert [r["decile"] for r in rows] == list(range(1, 11))
    assert rows[-1]["hasta"] is None
    assert rows[0]["hasta"] is not None
    # Means are non-decreasing across deciles for a sorted distribution.
    means = [r["mean"] for r in rows]
    assert means == sorted(means)
    assert sum(r["share"] for r in rows) == pytest.approx(100.0, abs=0.1)


def test_decile_table_zero_income_and_empty_deciles():
    # All-zero income: total_vw == 0 -> share guard; and only decile 1 is populated, so
    # deciles 2..10 have wd == 0 -> the mean guard. Both ternary-false legs exercised.
    rows = weighted.decile_table([0.0, 0.0], [1.0, 1.0])
    assert all(r["share"] == 0.0 for r in rows)
    assert all(r["mean"] == 0.0 for r in rows)


def test_decile_table_tiny_leaves_higher_deciles_empty():
    # A 2-point input maps everything into deciles 1 and 6, leaving the rest empty (wd == 0).
    rows = weighted.decile_table([1.0, 2.0], [1.0, 1.0])
    populated = {r["decile"] for r in rows if r["population"] > 0}
    assert populated and populated != set(range(1, 11))


def test_weighted_histogram():
    v = np.arange(0.0, 100.0)
    w = np.ones(100)
    hist = weighted.weighted_histogram(v, w, n_bins=10, cap_q=0.9)
    assert len(hist["edges"]) == 11
    assert len(hist["counts"]) == 10
    assert hist["cap_quantile"] == 0.9
    assert sum(hist["counts"]) == pytest.approx(100, abs=1)
    assert "percentil 90" in hist["note"]


def test_percentiles_default_is_1_to_99():
    v = np.arange(0.0, 1000.0)
    w = np.ones(1000)
    pct = weighted.percentiles(v, w)
    assert list(pct.keys()) == [str(p) for p in range(1, 100)]
    assert pct["50"] <= pct["99"]


def test_percentiles_explicit_iterable():
    v = np.arange(0.0, 1000.0)
    w = np.ones(1000)
    pct = weighted.percentiles(v, w, [10, 50, 90])
    assert set(pct.keys()) == {"10", "50", "90"}
