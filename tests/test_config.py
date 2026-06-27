"""Structural invariants of the pinned reference data. Importing config.py is what covers it;
these assertions document the contract the rest of the pipeline relies on."""

from __future__ import annotations

from pipeline import config


def test_measures_have_documented_keys():
    expected = {"key", "value_col", "weight_col", "decile_col", "include_zero", "label", "short", "universe"}
    assert set(config.MEASURES) == {"individual", "ipcf"}
    for key, spec in config.MEASURES.items():
        assert set(spec) == expected
        assert spec["key"] == key
        assert isinstance(spec["include_zero"], bool)
    # The hero/poverty base never uses the uncorrected PONDERA weight.
    assert config.MEASURES["ipcf"]["weight_col"] == "PONDIH"
    assert config.MEASURES["individual"]["weight_col"] == "PONDII"
    assert config.HERO_MEASURE in config.MEASURES


def test_region_and_aglomerado_maps_are_int_to_str():
    for m in (config.REGION_NAMES, config.AGLOMERADO_NAMES):
        assert m
        assert all(isinstance(k, int) and isinstance(v, str) and v for k, v in m.items())


def test_poverty_lines_positive():
    assert config.POVERTY_LINES["cba_adulto_equiv"] > 0
    assert config.POVERTY_LINES["cbt_adulto_equiv"] > config.POVERTY_LINES["cba_adulto_equiv"]


def test_indec_reference_covers_deciles_1_to_10():
    deciles = config.INDEC_IPCF_Q4_2025["deciles"]
    assert [d["decile"] for d in deciles] == list(range(1, 11))
    # Only the open-ended top decile has no upper limit.
    assert deciles[-1]["hasta"] is None
    assert all(d["hasta"] is not None for d in deciles[:-1])
    assert config.INDEC_IPCF_Q4_2025["gini"] > 0


def test_splits_reference_codes_are_ints():
    for spec in config.SPLITS.values():
        assert spec["col"]
        assert all(isinstance(code, int) and isinstance(label, str) for code, label in spec["groups"].items())
    assert config.SPLIT_MIN_N > 0
    assert config.ZIP_NAME in config.ZIP_URL
    assert len(config.ARTIFACT_PATHS) == 2
