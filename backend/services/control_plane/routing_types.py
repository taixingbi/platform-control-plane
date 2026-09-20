"""RouteSet only -- extracted from bedrock-runtime-gateway's
routing/router.py rather than importing that module whole. The full
router.py also pulls in inference/bedrock_client.py (boto3, real
Bedrock calls) and circuit_breaker.py, neither of which the control
plane needs -- it only ever displays route-set config
(GET /v1/admin/route-sets), never invokes a model itself.

Kept in sync by hand with the runtime gateway's own copy of this
dataclass -- same deliberate-duplication tradeoff as this platform's
policy/models.py (see that module's own note).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Set


@dataclass(frozen=True)
class ModelCertification:
    """Copied whole from bedrock-runtime-gateway's routing/certification.py
    -- same deliberate-duplication tradeoff noted at this module's top.
    The control plane only ever displays certification status
    (GET /v1/admin/route-sets), never runs or enforces it."""

    model_id: str
    eval_pass_rate: float
    safety_score: float
    p95_latency_ms: float
    eval_avg_cost_per_request_usd: float
    certified_at: str


def load_certified_models_from_yaml(path: str) -> Dict[str, ModelCertification]:
    import yaml

    with open(path, "r", encoding="utf-8") as f:
        raw = yaml.safe_load(f) or {}

    certified: Dict[str, ModelCertification] = {}
    for model_id, cfg in (raw.get("certified_models") or {}).items():
        cfg = cfg or {}
        certified[model_id] = ModelCertification(
            model_id=model_id,
            eval_pass_rate=float(cfg["eval_pass_rate"]),
            safety_score=float(cfg["safety_score"]),
            p95_latency_ms=float(cfg["p95_latency_ms"]),
            eval_avg_cost_per_request_usd=float(cfg["eval_avg_cost_per_request_usd"]),
            certified_at=str(cfg.get("certified_at", "")),
        )
    return certified


def certified_model_ids(certified: Dict[str, ModelCertification]) -> Set[str]:
    return set(certified.keys())


@dataclass(frozen=True)
class RouteSet:
    name: str
    primary: str
    fallbacks: List[str] = field(default_factory=list)


def load_route_sets_from_yaml(path: str) -> Dict[str, RouteSet]:
    import yaml

    with open(path, "r", encoding="utf-8") as f:
        raw = yaml.safe_load(f) or {}

    route_sets: Dict[str, RouteSet] = {}
    for name, cfg in (raw.get("route_sets") or {}).items():
        cfg = cfg or {}
        route_sets[name] = RouteSet(
            name=name, primary=cfg["primary"], fallbacks=list(cfg.get("fallbacks", []))
        )
    return route_sets
