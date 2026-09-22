"""Numerical-parity checks between the compiled fast Planner path and the
plain Python/torch reference path it is meant to replicate exactly.

``abcurves/fast_planner.py`` and ``abcurves/fast_summary.py`` both claim
bit-for-bit-modulo-rounding parity with ``abcurves/planner.py`` and
``abcurves/features.py`` (the Numba forward docstring cites "~3e-7 max on
y_all vs the torch forward"), but until now that claim was only exercised
incidentally through end-to-end ``Pipeline`` runs against the one shipped
checkpoint. These tests compare the two implementations directly, across a
spread of real example prefixes and every one of the 16 heads.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pytest

from abcurves import Pipeline
from abcurves.features import summary_features

ROOT = Path(__file__).resolve().parents[1]

# A spread of rows from the public example fixture (880 total), not just row
# 0, so the comparison exercises varied prefix lengths, shapes, and targets.
_SAMPLE_ROWS = (0, 37, 129, 256, 400, 511, 700, 879)

# Both implementations are float32 and claim near-bit-exact agreement; these
# bounds sit comfortably above documented rounding noise while still catching
# any real divergence (an indexing/weight-layout bug produces O(1) error).
_ATOL = 1e-5
_RTOL = 1e-5


def _load_rows() -> list[dict[str, object]]:
    with np.load(ROOT / "examples" / "aim_test.npz", allow_pickle=False) as data:
        rows = []
        for row in _SAMPLE_ROWS:
            prefix = np.asarray(data["prefix_raw_dxdy"][row], dtype=np.float32)
            prefix = prefix[np.asarray(data["prefix_mask"][row]) > 0.5]
            rows.append(
                {
                    "prefix": prefix,
                    "target": (
                        float(data["target_rel_x_at_B"][row]),
                        float(data["target_rel_y_at_B"][row]),
                    ),
                    "radius": float(data["target_radius"][row]),
                    "progress": float(data["progress"][row]),
                }
            )
        return rows


_ROWS = _load_rows()
_IDS = [str(i) for i in _SAMPLE_ROWS]


@pytest.mark.parametrize("row", _ROWS, ids=_IDS)
def test_fast_summary_matches_reference_features(pipeline7: Pipeline, row: dict[str, object]) -> None:
    """CompiledSummaryVector must reproduce Planner._summary_vector(summary_features(...))."""

    fast_planner = pipeline7.planner  # FastPlanner
    planner = fast_planner.planner  # reference Planner
    represented, _ = planner.represented_prefix_views(row["prefix"])

    reference_feats = summary_features(
        represented, row["target"], row["radius"], row["progress"], horizon=planner.horizon
    )
    reference = planner._summary_vector(reference_feats)

    fast = fast_planner.summary.vector(
        represented, row["target"], row["radius"], row["progress"], assume_finite_counts=True
    )

    np.testing.assert_allclose(fast, reference, atol=_ATOL, rtol=_RTOL)


@pytest.mark.parametrize("row", _ROWS, ids=_IDS)
def test_fast_all_heads_forward_matches_torch_reference(pipeline7: Pipeline, row: dict[str, object]) -> None:
    """NumbaPlannerForward must reproduce the torch MultiHeadModel forward, every head."""

    fast_planner = pipeline7.planner  # FastPlanner
    planner = fast_planner.planner  # reference Planner
    represented, _ = planner.represented_prefix_views(row["prefix"])

    feats = summary_features(
        represented, row["target"], row["radius"], row["progress"], horizon=planner.horizon
    )
    y_all_reference = planner._forward_represented_prefix(represented, feats)

    fast_summary = fast_planner.summary.vector(
        represented, row["target"], row["radius"], row["progress"], assume_finite_counts=True
    )
    prefix_tensor, _ = planner._prefix_tensor(represented)
    y_all_fast = fast_planner.all_heads.forward(prefix_tensor, fast_summary)

    assert y_all_fast.shape == y_all_reference.shape
    np.testing.assert_allclose(y_all_fast, y_all_reference, atol=_ATOL, rtol=_RTOL)


@pytest.mark.parametrize("row", _ROWS, ids=_IDS)
def test_selected_head_forward_matches_all_heads_slice(pipeline7: Pipeline, row: dict[str, object]) -> None:
    """_SelectedHeadForward's per-head weight slice must agree with the full forward.

    This is a separate failure mode from numerical drift against torch: a
    transpose/reshape bug in the selected-head weight repack (pipeline.py's
    ``_SelectedHeadForward.__init__``) would still match torch on whichever
    head happens to be slice 0, while silently returning the wrong head's
    weights everywhere else.
    """

    fast_planner = pipeline7.planner  # FastPlanner
    planner = fast_planner.planner  # reference Planner
    represented, _ = planner.represented_prefix_views(row["prefix"])

    fast_summary = fast_planner.summary.vector(
        represented, row["target"], row["radius"], row["progress"], assume_finite_counts=True
    )
    prefix_tensor, _ = planner._prefix_tensor(represented)
    y_all_fast = fast_planner.all_heads.forward(prefix_tensor, fast_summary)

    for head in range(planner.heads):
        selected = fast_planner.selected_head.forward(prefix_tensor, fast_summary, head)
        # Not exact bit-equality: the narrower per-head gemm and the full-width
        # gemm may accumulate in a different order at the BLAS level. A real
        # slicing/layout bug would return an unrelated head's values (O(1)
        # error), far outside this margin.
        np.testing.assert_allclose(selected[0, 0], y_all_fast[0, head], atol=1e-6, rtol=1e-6)
