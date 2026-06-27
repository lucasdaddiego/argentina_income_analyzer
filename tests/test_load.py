"""ensure_extracted (early-return / missing-zip / extract), load_individual (CSV parsing +
decile coercion), and universe (both measures, the sentinels, the blank-code fillna path)."""

from __future__ import annotations

import pytest
from conftest import write_eph_txt

from pipeline import config, load


def test_ensure_extracted_early_return_when_present(tmp_path, monkeypatch, synthetic_rows):
    raw = tmp_path / "raw"
    raw.mkdir()
    # Individual file already present, no zip needed.
    write_eph_txt(raw / config.INDIVIDUAL_FILE, synthetic_rows)
    monkeypatch.setattr(config, "RAW_DIR", raw)
    load.ensure_extracted()  # returns early, no error
    assert (raw / config.INDIVIDUAL_FILE).exists()


def test_ensure_extracted_missing_zip_raises(tmp_path, monkeypatch):
    raw = tmp_path / "raw"
    raw.mkdir()
    monkeypatch.setattr(config, "RAW_DIR", raw)
    with pytest.raises(FileNotFoundError, match="make fetch"):
        load.ensure_extracted()


def test_ensure_extracted_extracts_zip(eph_raw):
    # eph_raw drops the zip but not the extracted txt; ensure_extracted must unzip it.
    assert not (eph_raw / config.INDIVIDUAL_FILE).exists()
    load.ensure_extracted()
    assert (eph_raw / config.INDIVIDUAL_FILE).exists()


def test_load_individual_parses_and_coerces(eph_raw):
    df = load.load_individual()
    assert list(df.columns) == load.USECOLS
    # Decile columns are nullable Int64; the blank code became <NA>.
    for c in load.DECILE_COLS:
        assert str(df[c].dtype) == "Int64"
    assert df["DECCFR"].isna().any()
    # Comma-decimal income parsed to float; "00" decile code -> 0.
    assert df["IPCF"].dtype == float
    assert (df["DECCFR"] == 0).any()
    assert (df["DECINDR"] == 12).any() and (df["DECINDR"] == 13).any()


def test_universe_ipcf_includes_zero_income(loaded_df):
    out = load.universe(loaded_df, config.MEASURES["ipcf"])
    assert list(out.columns) == ["value", "weight"]
    assert (out["weight"] > 0).all()
    assert (out["value"] >= 0).all()
    # The zero-income population is kept for IPCF...
    assert (out["value"] == 0).any()
    # ...and the 12/13 sentinels, the zero-weight row, and any blank-decile row are gone
    # (see test_universe_blank_decile_excluded_for_both_measures).
    expected = (
        ~loaded_df["DECCFR"].isin([12, 13])
        & loaded_df["DECCFR"].notna()
        & (loaded_df["PONDIH"] > 0)
        & (loaded_df["IPCF"] >= 0)
    ).sum()
    assert len(out) == expected


def test_universe_individual_excludes_zero_income(loaded_df):
    out = load.universe(loaded_df, config.MEASURES["individual"])
    assert (out["value"] > 0).all()
    assert (out["weight"] > 0).all()
    # No zero-income rows (decile 0 excluded) for the perceptores universe.
    assert not (out["value"] == 0).any()


def test_universe_blank_decile_excluded_for_both_measures(loaded_df):
    # The single blank-decile row carries P47T=IPCF=450000, a value no other row holds.
    blank = loaded_df[loaded_df["DECCFR"].isna()]
    assert len(blank) == 1
    blank_val = float(blank["IPCF"].iloc[0])

    # A blank/unknown decile code is excluded from BOTH universes (the decile label defines the
    # universe): individual via `& code.ne(0)` -> fillna(False), ipcf via the explicit `code.notna()`.
    individual = load.universe(loaded_df, config.MEASURES["individual"])
    assert (individual["value"] == blank_val).sum() == 0
    ipcf = load.universe(loaded_df, config.MEASURES["ipcf"])
    assert (ipcf["value"] == blank_val).sum() == 0
