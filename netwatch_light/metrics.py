from __future__ import annotations

from copy import deepcopy
from pathlib import Path
from typing import Any

import yaml


CATALOG_PATH = Path(__file__).resolve().parent.parent / "config" / "metric_catalog.yaml"
DEFAULT_CATALOG_VERSION = 1


class MetricCatalogError(ValueError):
    pass


def load_metric_catalog(path: Path = CATALOG_PATH) -> dict[str, Any]:
    try:
        raw = yaml.safe_load(path.read_text(encoding="utf-8"))
    except OSError as exc:
        raise MetricCatalogError(f"Metric catalog not readable: {path}") from exc
    if not isinstance(raw, dict):
        raise MetricCatalogError("Metric catalog must be a mapping")

    version = _positive_int(raw.get("version"), "version")
    defaults = raw.get("defaults") if isinstance(raw.get("defaults"), dict) else {}
    metrics = raw.get("metrics")
    if not isinstance(metrics, list) or not metrics:
        raise MetricCatalogError("Metric catalog must contain at least one metric")

    normalized_metrics = [_normalize_metric(metric) for metric in metrics]
    names = [metric["name"] for metric in normalized_metrics]
    if len(names) != len(set(names)):
        raise MetricCatalogError("Metric catalog contains duplicate metric names")

    return {
        "version": version,
        "defaults": {
            "retention_seconds": _bounded_int(defaults.get("retention_seconds"), 300, 31_536_000, 3600),
            "max_samples_per_target": _bounded_int(defaults.get("max_samples_per_target"), 12, 100_000, 720),
        },
        "labels": deepcopy(raw.get("labels") or {}),
        "metrics": normalized_metrics,
    }


def metric_catalog_names(catalog: dict[str, Any]) -> list[str]:
    return [metric["name"] for metric in catalog.get("metrics", []) if isinstance(metric, dict)]


def metric_catalog_summary(catalog: dict[str, Any]) -> dict[str, Any]:
    return {
        "version": catalog.get("version", DEFAULT_CATALOG_VERSION),
        "metric_count": len(metric_catalog_names(catalog)),
        "retention_seconds": catalog.get("defaults", {}).get("retention_seconds", 3600),
        "max_samples_per_target": catalog.get("defaults", {}).get("max_samples_per_target", 720),
    }


def build_interface_metric_samples(
    catalog: dict[str, Any],
    device: dict[str, Any],
    interface: dict[str, Any],
    ts: float,
) -> list[dict[str, Any]]:
    labels = {
        "device_id": str(device.get("id") or ""),
        "interface_id": str(interface.get("id") or ""),
        "if_name": str(interface.get("name") or interface.get("if_descr") or ""),
    }
    values = {
        "interface.admin_status": interface.get("admin_status"),
        "interface.oper_status": interface.get("oper_status"),
        "interface.in_octets": interface.get("in_octets"),
        "interface.out_octets": interface.get("out_octets"),
        "interface.in_bps": interface.get("in_bps"),
        "interface.out_bps": interface.get("out_bps"),
        "interface.in_errors": interface.get("in_errors"),
        "interface.out_errors": interface.get("out_errors"),
        "interface.in_discards": interface.get("in_discards"),
        "interface.out_discards": interface.get("out_discards"),
        "interface.in_error_rate": interface.get("in_error_rate"),
        "interface.out_error_rate": interface.get("out_error_rate"),
        "interface.in_discard_rate": interface.get("in_discard_rate"),
        "interface.out_discard_rate": interface.get("out_discard_rate"),
    }

    samples: list[dict[str, Any]] = []
    for definition in catalog.get("metrics", []):
        if not isinstance(definition, dict) or definition.get("target_type") != "interface":
            continue
        name = str(definition.get("name") or "")
        if name not in values:
            continue
        sample = normalize_metric_sample(definition, values[name], labels, ts)
        if sample:
            samples.append(sample)
    return samples


def normalize_metric_sample(
    definition: dict[str, Any],
    value: Any,
    labels: dict[str, Any],
    ts: float,
) -> dict[str, Any] | None:
    name = str(definition.get("name") or "")
    value_type = str(definition.get("value_type") or "gauge")
    allowed_labels = {str(label) for label in definition.get("labels", []) if label}
    safe_labels = {key: str(value) for key, value in labels.items() if key in allowed_labels and value not in (None, "")}

    if value_type == "state":
        value_text = str(value or "unknown")
        value_float = None
        quality = "ok" if value_text != "unknown" else "unknown"
    else:
        value_float = _nullable_float(value)
        if value_float is None:
            return None
        value_text = None
        quality = "ok"

    if not name:
        return None

    return {
        "metric": name,
        "target_type": str(definition.get("target_type") or "unknown"),
        "target_id": safe_labels.get("interface_id") or safe_labels.get("device_id") or "",
        "ts": float(ts),
        "value_float": value_float,
        "value_text": value_text,
        "quality": quality,
        "unit": str(definition.get("unit") or ""),
        "labels": safe_labels,
    }


def _normalize_metric(metric: Any) -> dict[str, Any]:
    if not isinstance(metric, dict):
        raise MetricCatalogError("Each metric definition must be a mapping")
    name = str(metric.get("name") or "").strip()
    if not name or "." not in name:
        raise MetricCatalogError(f"Invalid metric name: {name!r}")
    target_type = str(metric.get("target_type") or "").strip()
    if target_type not in {"device", "interface", "link", "poller"}:
        raise MetricCatalogError(f"Invalid target type for {name}: {target_type!r}")
    value_type = str(metric.get("value_type") or "gauge").strip()
    if value_type not in {"gauge", "counter", "state"}:
        raise MetricCatalogError(f"Invalid value type for {name}: {value_type!r}")
    labels = metric.get("labels") or []
    if not isinstance(labels, list):
        raise MetricCatalogError(f"Metric labels must be a list for {name}")
    return {
        "name": name,
        "target_type": target_type,
        "value_type": value_type,
        "unit": str(metric.get("unit") or ""),
        "labels": [str(label) for label in labels if label],
    }


def _positive_int(value: Any, name: str) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError) as exc:
        raise MetricCatalogError(f"Metric catalog {name} must be an integer") from exc
    if parsed <= 0:
        raise MetricCatalogError(f"Metric catalog {name} must be positive")
    return parsed


def _bounded_int(value: Any, minimum: int, maximum: int, default: int) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return default
    return max(minimum, min(maximum, parsed))


def _nullable_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None
