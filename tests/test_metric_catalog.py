from __future__ import annotations

from netwatch_light.metrics import build_interface_metric_samples, load_metric_catalog


def test_metric_catalog_loads_and_filters_missing_numeric_values():
    catalog = load_metric_catalog()
    names = [metric["name"] for metric in catalog["metrics"]]
    assert "interface.in_bps" in names
    samples = build_interface_metric_samples(
        catalog,
        {"id": "device-1"},
        {
            "id": "if-1",
            "name": "eth-0-1",
            "admin_status": "up",
            "oper_status": "up",
            "in_bps": None,
            "out_bps": 1200,
            "in_errors": 0,
        },
        123.0,
    )
    sample_names = {sample["metric"] for sample in samples}
    assert "interface.admin_status" in sample_names
    assert "interface.out_bps" in sample_names
    assert "interface.in_bps" not in sample_names
