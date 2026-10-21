"""Screening API: rules, input versions, ranked results, school detail, rule comparison and exports.

Everything is read from the stored runs (see ``screening_store``); no score is recomputed here.
"""

from __future__ import annotations

import datetime as dt
import unicodedata
import uuid
from dataclasses import asdict, fields
from typing import Annotated

from fastapi import APIRouter, Query, Request, Response
from pydantic import AfterValidator, BaseModel
from pydantic_core import PydanticCustomError
from school_scoring.screening import RULES, Cohort, Rule, TopChange, UnknownRuleError, get_rule

from .. import screening_store as store
from ..db import get_db
from ..errors import ApiError
from ..http_cache import (
    NO_STORE_CACHE_CONTROL,
    SCREENING_DEFAULT_CACHE_CONTROL,
    SCREENING_IMMUTABLE_CACHE_CONTROL,
    SCREENING_PINNED_CACHE_CONTROL,
    conditional_json,
)
from ..models.screening import (
    PERSISTENCE_LIMITATIONS,
    AreaPartsOut,
    CommonRankOut,
    CompareResponse,
    ComponentsOut,
    ComponentsWithUrgencyOut,
    ContributionOut,
    ExcludedSchoolOut,
    FiltersOut,
    InputSchoolOut,
    InputsResponse,
    InputVersionOut,
    InputVersionsResponse,
    IntervalBoundsOut,
    IntervalSchoolOut,
    LinkedSchoolsResponse,
    ListedRowOut,
    ListedRowWithPersistenceOut,
    ManifestOut,
    MaximumTermOut,
    NeedPartsOut,
    PairwiseMetricsOut,
    PersistenceOut,
    PersistenceResultsResponse,
    PersistenceSettingOut,
    Placement,
    PointRankOut,
    RankBoundsOut,
    ResultsResponse,
    RuleOut,
    RulesResponse,
    RuleSummaryOut,
    RunOut,
    SchoolDetailOut,
    SchoolDetailResponse,
    SchoolIdentityOut,
    SchoolResultOut,
    SchoolRuleResultOut,
    SchoolRuleResultWithPersistenceOut,
    ScopeCode,
    ScoresOut,
    TopChangeOut,
    TopKOut,
    WeightOut,
    persistence_adjacent_rule,
)
from ..screening_export import (
    incomplete_table,
    method_record,
    render_csv,
    render_xlsx,
    top_table,
)
from ..screening_lists import FILTERS_NOTE, Filters, compare_stored, ordered_list, queue_rows, select_top
from ..screening_queries import (
    SchoolIdentity,
    SchoolRow,
    VersionEntry,
    current_runs,
    list_versions,
    read_identities,
    read_school_rows,
    school_key,
)

# Characters that have no place in an id or a filter, because they break a spreadsheet or hide what a value says:
#   Cc  control characters: newlines, NUL, escapes, tab
#   Cf  format characters: the bidirectional overrides, embeddings and isolates, zero-width marks, the byte order mark
#   Zl, Zp  the line separator U+2028 and the paragraph separator U+2029, which are line breaks that Cc does not cover
REFUSED_CATEGORIES = frozenset({"Cc", "Cf", "Zl", "Zp"})


def _no_control_characters(value: str) -> str:
    """Refuse control, format and line-separating characters; accents, spaces and other letters pass."""
    if any(unicodedata.category(ch) in REFUSED_CATEGORIES for ch in value):
        raise PydanticCustomError(
            "control_characters",
            "must not contain control, line-separator or invisible formatting characters",
        )
    return value


# A text query or path parameter. Rejecting control characters here turns them into a 422 at the boundary.
Text = Annotated[str, AfterValidator(_no_control_characters)]

router = APIRouter(prefix="/api/v1/screening", tags=["screening"])

# The circulated paper's additive rule S stays the default list.
DEFAULT_RULE_ID = "additive_u"
K_MAX = 10_000
CSV_TYPE = "text/csv; charset=utf-8"
XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
# Every download says the list is for research, not for a decision.
RESEARCH_EXPORT_HEADERS = {"X-RISE-PNG-Decision-Use": "research-prototype-only"}


# ---------------------------------------------------------------------------------------------
# Resolving the rule, the input version and the run. Unknown ids are 404 in the API's error envelope.
# ---------------------------------------------------------------------------------------------


def _rule(rule_id: str) -> Rule:
    try:
        return get_rule(rule_id)
    except UnknownRuleError:
        raise ApiError(
            f"Unknown rule {rule_id!r}.",
            status_code=404,
            code="unknown_rule",
            details={"rule": rule_id, "known": sorted(RULES)},
        ) from None


def _version(connection, requested: str | None) -> VersionEntry:
    """The requested input version, or the latest one."""
    entries = list_versions(connection)
    if not entries:
        raise ApiError("No screening input version is loaded.", status_code=404, code="no_input_versions")
    if requested is None:
        return entries[0]
    for entry in entries:
        if entry.version.input_version == requested:
            return entry
    raise ApiError(
        f"Unknown input version {requested!r}.",
        status_code=404,
        code="unknown_input_version",
        details={"input_version": requested, "known": [e.version.input_version for e in entries]},
    )


def _require_current(run: store.StoredRun) -> store.StoredRun:
    """A stored run must carry the provenance and policy role that the engine registry gives its rule today.

    A run stored before the registry changed names a provenance this API cannot read, or a role that contradicts
    ``/rules``. It is refused by name, and loading the input version again stores a current run beside it.
    """
    rule = RULES.get(run.rule_id)
    if rule is not None and (run.provenance, run.policy_role) == (
        rule.provenance.value,
        rule.policy_role.value,
    ):
        return run
    raise ApiError(
        f"The stored run of rule {run.rule_id!r} for input version {run.input_version!r} was made by engine "
        f"version {run.package_version} with rule metadata this API no longer serves. "
        "Load the input version again with the current engine to store a current run.",
        status_code=409,
        code="stale_run",
        details={
            "rule": run.rule_id,
            "input_version": run.input_version,
            "package_version": run.package_version,
            "stored_provenance": run.provenance,
            "stored_policy_role": run.policy_role,
            "run_id": str(run.run_id),
        },
    )


def _run(connection, version: str, rule_id: str, package_version: str | None = None) -> store.StoredRun:
    run = current_runs(connection, version, package_version).get(rule_id)
    if run is None:
        raise ApiError(
            f"No stored run of rule {rule_id!r} for input version {version!r}"
            + ("" if package_version is None else f" and package version {package_version!r}")
            + ".",
            status_code=404,
            code="run_not_found",
            details={"rule": rule_id, "input_version": version, "package_version": package_version},
        )
    return _require_current(run)


def _filters(province: str | None, district: str | None) -> Filters:
    return Filters(province or None, district or None)


# ---------------------------------------------------------------------------------------------
# Domain to response models.
# ---------------------------------------------------------------------------------------------


def _identity_out(identity: SchoolIdentity) -> SchoolIdentityOut:
    return SchoolIdentityOut(**asdict(identity))


def _run_out(run: store.StoredRun) -> RunOut:
    return RunOut(
        run_id=run.run_id,
        input_version=run.input_version,
        rule_id=run.rule_id,
        input_sha256=run.input_sha256,
        anchors_sha256=run.anchors_sha256,
        package_version=run.package_version,
        created_at=run.created_at,
    )


def _result_out(r: store.ResultRow, uses_urgency: bool) -> SchoolResultOut:
    return SchoolResultOut(
        cohort=r.cohort,
        gate_failures=list(r.gate_failures),
        components=ComponentsWithUrgencyOut(**r.components)
        if uses_urgency
        else ComponentsOut(**{k: v for k, v in r.components.items() if k != "U"}),
        need_parts=NeedPartsOut(**r.need_parts),
        area_parts=AreaPartsOut(**r.area_parts),
        contributions=[ContributionOut(**c) for c in r.contributions],
        need_part_contributions=None
        if r.need_part_contributions is None
        else NeedPartsOut(**r.need_part_contributions),
        maximum_term=None if r.maximum_term is None else MaximumTermOut(**r.maximum_term),
        scores=ScoresOut(
            lower=r.score_lower, upper=r.score_upper, point=r.score_point, sort_key_primary=r.sort_key_primary
        ),
        point_rank=PointRankOut(
            rank=r.rank_point,
            scope=r.rank_point_scope,
            scope_code=ScopeCode.COMPLETE_UNDER_RULE,
            count=r.rank_point_count,
        ),
        rank_bounds=RankBoundsOut(
            best=r.rank_best,
            worst=r.rank_worst,
            scope=r.rank_bounds_scope,
            scope_code=ScopeCode.ELIGIBLE,
            count=r.rank_bounds_count,
        ),
    )


def _persistence_out(found: store.PersistenceSet | None) -> PersistenceOut | None:
    if found is None:
        return None
    return PersistenceOut(
        rule_id=found.rule_id,
        experiment_id=found.experiment_id,
        source_path=found.source_path,
        source_sha256=found.source_sha256,
        draws=found.draws,
        threshold=found.threshold,
        settings=[PersistenceSettingOut(**asdict(s)) for s in found.settings],
        standard_error=found.standard_error,
        adjacency_standard_errors=found.adjacency_standard_errors,
        threshold_adjacent_rule=persistence_adjacent_rule(found.adjacency_standard_errors),
        limitation=PERSISTENCE_LIMITATIONS[found.rule_id],
    )


def _version_out(
    entry: VersionEntry, is_default: bool, persistence: dict[str, dict[str, store.PersistenceSet]]
) -> InputVersionOut:
    v = entry.version
    return InputVersionOut(
        input_version=v.input_version,
        description=v.description,
        input_sha256=v.input_sha256,
        record_count=v.record_count,
        created_at=v.created_at,
        is_default=is_default,
        rules_available=list(entry.rules_available),
        persistence=[
            _persistence_out(found) for _, found in sorted(persistence.get(v.input_version, {}).items())
        ],
    )


def _rule_out(
    rule: Rule, versions: list[VersionEntry], persistence: dict[str, dict[str, store.PersistenceSet]]
) -> RuleOut:
    return RuleOut(
        rule_id=rule.rule_id,
        label=rule.label,
        provenance=rule.provenance,
        policy_role=rule.policy_role,
        score_kind=rule.score_kind.value,
        formula=rule.formula,
        weights=[
            WeightOut(component=c, fraction=str(w), value=float(w))
            for c, w in rule.weights
            if c in rule.score_components
        ],
        primary_sort_key=rule.primary_sort_key,
        maximum_components=list(rule.max_components),
        maximum_share=str(rule.max_share),
        uses_urgency=rule.uses_urgency,
        is_default=rule.rule_id == DEFAULT_RULE_ID,
        available_input_versions=[
            e.version.input_version for e in versions if rule.rule_id in e.rules_available
        ],
        persistence_by_input_version={
            version: sets[rule.rule_id].experiment_id
            for version, sets in persistence.items()
            if rule.rule_id in sets
        },
    )


def _json(
    request: Request,
    model: BaseModel,
    *,
    input_version: Text | None = None,
    package_version: Text | None = None,
    version: store.InputVersion | None = None,
    immutable_when_pinned: bool = False,
    depends_on_links: bool = False,
) -> Response:
    """A JSON response with the headers every screening route sends.

    Naming the input version and the package version asks for one stored run, which never changes, so the response is
    cached as immutable. A route whose body is built from the links to ``schools`` is the exception
    (``depends_on_links``): a later load that links more schools, or a reload of ``schools``, changes it, so it is never
    immutable, and a named input version gets the pinned lifetime like any other read of that version.
    """
    headers = (
        {}
        if version is None
        else {
            "X-Screening-Input-Version": version.input_version,
            "X-Screening-Input-Sha256": version.input_sha256,
        }
    )
    if (
        input_version is not None
        and not depends_on_links
        and (package_version is not None or immutable_when_pinned)
    ):
        cache_control = SCREENING_IMMUTABLE_CACHE_CONTROL
    elif input_version is not None:
        cache_control = SCREENING_PINNED_CACHE_CONTROL
    else:
        cache_control = SCREENING_DEFAULT_CACHE_CONTROL
    return conditional_json(request, model.model_dump_json().encode("utf-8"), cache_control, headers)


# ---------------------------------------------------------------------------------------------
# Rules and input versions.
# ---------------------------------------------------------------------------------------------


@router.get("/rules", response_model=RulesResponse)
def get_rules(request: Request):
    with get_db() as connection:
        versions = list(list_versions(connection))
        persistence = store.read_persistence_sets(connection)
    body = RulesResponse(
        default_rule_id=DEFAULT_RULE_ID,
        rules=[_rule_out(rule, versions, persistence) for rule in RULES.values()],
        input_versions=[_version_out(e, i == 0, persistence) for i, e in enumerate(versions)],
    )
    return _json(request, body)


@router.get("/input-versions", response_model=InputVersionsResponse)
def get_input_versions(request: Request):
    with get_db() as connection:
        versions = list_versions(connection)
        persistence = store.read_persistence_sets(connection)
    body = InputVersionsResponse(
        default_input_version=versions[0].version.input_version if versions else None,
        input_versions=[_version_out(e, i == 0, persistence) for i, e in enumerate(versions)],
    )
    return _json(request, body)


# ---------------------------------------------------------------------------------------------
# Results.
# ---------------------------------------------------------------------------------------------


@router.get("/results", response_model=ResultsResponse)
def get_results(
    request: Request,
    rule: Text = DEFAULT_RULE_ID,
    input_version: Text | None = None,
    package_version: Text | None = None,
    placement: Placement = Placement.LOWER,
    province: Text | None = None,
    district: Text | None = None,
):
    rule_ = _rule(rule)
    filters = _filters(province, district)
    with get_db() as connection:
        version = _version(connection, input_version)
        run = _run(connection, version.version.input_version, rule, package_version)
        rows = read_school_rows(connection, run)
        has_persistence = rule in store.PERSISTENCE_RULE_IDS
        persistence = (
            store.read_persistence(connection, run.input_version, rule).get(rule) if has_persistence else None
        )
    listed = ordered_list(rule_, rows, placement)
    shown = [item for item in listed if filters.admits(item.row)]

    def listed_row(item) -> ListedRowOut:
        fields_ = dict(
            display_order=item.display_order,
            placement=item.placement,
            school=_identity_out(item.row.identity),
            **dict(_result_out(item.row.result, rule_.uses_urgency)),
        )
        if not has_persistence:
            return ListedRowOut(**fields_)
        return ListedRowWithPersistenceOut(**fields_, **_persistence_flags(persistence, item.row.name))

    parts = dict(
        run=_run_out(run),
        manifest=ManifestOut.from_stored(run.manifest),
        placement=placement,
        filters=FiltersOut(province=filters.province, district=filters.district),
        filters_note=FILTERS_NOTE,
        total_schools=len(listed),
        returned_schools=len(shown),
        rows=[listed_row(item) for item in shown],
    )
    body = (
        PersistenceResultsResponse(
            **parts, persistence=_persistence_out(None if persistence is None else persistence.set)
        )
        if has_persistence
        else ResultsResponse(**parts)
    )
    return _json(
        request,
        body,
        input_version=input_version,
        package_version=package_version,
        version=version.version,
        depends_on_links=True,
    )


# ---------------------------------------------------------------------------------------------
# The stored inputs of every school, for a client that shows them beside a list.
# ---------------------------------------------------------------------------------------------


@router.get("/inputs", response_model=InputsResponse)
def get_inputs(request: Request, input_version: Text | None = None):
    """What ``/schools/by-key`` gives as ``inputs``, for every school at once.

    The body holds nothing that depends on the ``schools`` table, and a stored version is never changed,
    so a request that names the version is cached as immutable.
    """
    with get_db() as connection:
        version = _version(connection, input_version)
        name = version.version.input_version
        records = store.read_inputs(connection, name)
    body = InputsResponse(
        input_version=name,
        input_sha256=version.version.input_sha256,
        schools=[
            InputSchoolOut(
                school_key=school_key(name, r.school_name),
                source_school_name=r.school_name,
                inputs={f.name: getattr(r, f.name) for f in fields(r)},
            )
            for r in records
        ],
    )
    return _json(
        request, body, input_version=input_version, version=version.version, immutable_when_pinned=True
    )


# ---------------------------------------------------------------------------------------------
# One school under every rule.
# ---------------------------------------------------------------------------------------------


def _persistence_flags(persistence: store.Persistence | None, name: str) -> dict:
    """What a rule's experiment says about one school: all null when there are no numbers or the school was not in it."""
    if persistence is None:
        return {"persistent_candidate": None, "lowest_top20_frequency": None, "threshold_adjacent": None}
    return {
        "persistent_candidate": persistence.is_persistent(name),
        "lowest_top20_frequency": persistence.lowest_frequency(name),
        "threshold_adjacent": persistence.is_threshold_adjacent(name),
    }


def _rule_result_out(
    persistence: dict[str, store.Persistence], name: str, **fields
) -> SchoolRuleResultOut | SchoolRuleResultWithPersistenceOut:
    """One rule's entry for one school. Only the entry of a rule that can have persistence numbers carries the flag,
    and it carries that rule's own."""
    rule_id = fields["rule"].rule_id
    if rule_id not in store.PERSISTENCE_RULE_IDS:
        return SchoolRuleResultOut(**fields)
    return SchoolRuleResultWithPersistenceOut(**fields, **_persistence_flags(persistence.get(rule_id), name))


def _school_details(
    connection, input_version: str, identities: list[SchoolIdentity], package_version: str | None
) -> list[SchoolDetailOut]:
    """Each school under every rule that has a run, with its stored raw inputs."""
    wanted = {i.source_school_name for i in identities}
    records = {
        r.school_name: r for r in store.read_inputs(connection, input_version) if r.school_name in wanted
    }
    runs = {
        rule_id: _require_current(run)
        for rule_id, run in current_runs(connection, input_version, package_version).items()
    }
    persistence = store.read_persistence(connection, input_version)
    results = {
        rule_id: {
            r.source_school_name: r
            for r in store.read_results(connection, run.run_id)
            if r.source_school_name in wanted
        }
        for rule_id, run in runs.items()
    }
    details = []
    for identity in identities:
        name = identity.source_school_name
        per_rule = [
            _rule_result_out(
                persistence,
                name,
                rule=RuleSummaryOut(
                    rule_id=rule.rule_id,
                    label=rule.label,
                    provenance=rule.provenance,
                    policy_role=rule.policy_role,
                    score_kind=rule.score_kind.value,
                    uses_urgency=rule.uses_urgency,
                ),
                run=_run_out(runs[rule.rule_id]),
                point_rank_scope=results[rule.rule_id][name].rank_point_scope,
                point_rank_scope_code=ScopeCode.COMPLETE_UNDER_RULE,
                rank_bounds_scope=results[rule.rule_id][name].rank_bounds_scope,
                rank_bounds_scope_code=ScopeCode.ELIGIBLE,
                result=_result_out(results[rule.rule_id][name], rule.uses_urgency),
            )
            for rule in RULES.values()
            if rule.rule_id in runs
        ]
        details.append(
            SchoolDetailOut(
                school=_identity_out(identity),
                inputs={f.name: getattr(records[name], f.name) for f in fields(records[name])},
                rules=per_rule,
            )
        )
    return details


def _school_not_found(input_version: str, **details: str) -> ApiError:
    return ApiError(
        "This school is not in the input version.",
        status_code=404,
        code="school_not_found",
        details={**details, "input_version": input_version},
    )


@router.get("/schools/by-key/{school_key}", response_model=SchoolDetailResponse)
def get_school_by_key(
    request: Request,
    school_key: Text,
    input_version: Text | None = None,
    package_version: Text | None = None,
):
    """A school by the key that every row carries. It works for schools that are not linked to ``schools``."""
    with get_db() as connection:
        version = _version(connection, input_version)
        name = version.version.input_version
        found = [i for i in read_identities(connection, name).values() if i.school_key == school_key]
        if not found:
            raise _school_not_found(name, school_key=school_key)
        (detail,) = _school_details(connection, name, found, package_version)
    body = SchoolDetailResponse(input_version=name, input_sha256=version.version.input_sha256, **dict(detail))
    return _json(
        request,
        body,
        input_version=input_version,
        package_version=package_version,
        version=version.version,
        depends_on_links=True,
    )


@router.get("/schools/{school_id}", response_model=LinkedSchoolsResponse)
def get_schools_by_link(
    request: Request,
    school_id: uuid.UUID,
    input_version: Text | None = None,
    package_version: Text | None = None,
):
    """Every school of the input version linked to this ``schools`` row, because a link is not guaranteed unique."""
    with get_db() as connection:
        version = _version(connection, input_version)
        name = version.version.input_version
        found = [i for i in read_identities(connection, name).values() if i.school_id == school_id]
        if not found:
            raise _school_not_found(name, school_id=str(school_id))
        details = _school_details(connection, name, found, package_version)
    body = LinkedSchoolsResponse(
        school_id=school_id, input_version=name, input_sha256=version.version.input_sha256, schools=details
    )
    # Which schools this id links to is not part of a stored run: it follows ``schools``, which a reload changes.
    return _json(
        request,
        body,
        input_version=input_version,
        package_version=package_version,
        version=version.version,
        depends_on_links=True,
    )


# ---------------------------------------------------------------------------------------------
# Two rules on their common cohort.
# ---------------------------------------------------------------------------------------------


def _bounds_out(row: SchoolRow) -> IntervalBoundsOut:
    r = row.result
    return IntervalBoundsOut(
        cohort=r.cohort,
        score_lower=r.score_lower,
        score_upper=r.score_upper,
        rank_best=r.rank_best,
        rank_worst=r.rank_worst,
        rank_bounds_scope=r.rank_bounds_scope,
        rank_bounds_scope_code=ScopeCode.ELIGIBLE,
    )


COHORT_WORDS = {
    Cohort.COMPLETE: "complete",
    Cohort.INTERVAL: "interval (an environmental input is missing)",
    Cohort.VERIFICATION_QUEUE: "held for verification",
}


def _excluded_out(row_a: SchoolRow, row_b: SchoolRow, a: str, b: str) -> ExcludedSchoolOut:
    cohort_a, cohort_b = row_a.result.cohort, row_b.result.cohort
    return ExcludedSchoolOut(
        school=_identity_out(row_a.identity),
        cohort_a=cohort_a,
        cohort_b=cohort_b,
        reason=(
            f"{COHORT_WORDS[cohort_a].capitalize()} under {a} and {COHORT_WORDS[cohort_b]} under {b}. "
            "Ranks compare only the schools that are complete under both rules."
        ),
    )


@router.get("/compare", response_model=CompareResponse)
def get_compare(
    request: Request,
    a: Text,
    b: Text,
    input_version: Text | None = None,
    package_version: Text | None = None,
):
    rule_a, rule_b = _rule(a), _rule(b)
    with get_db() as connection:
        version = _version(connection, input_version)
        name = version.version.input_version
        run_a = _run(connection, name, a, package_version)
        run_b = _run(connection, name, b, package_version)
        rows_a, rows_b = read_school_rows(connection, run_a), read_school_rows(connection, run_b)
    comparison = compare_stored(rule_a, rows_a, rule_b, rows_b, version.version.input_sha256)
    by_a = {r.name: r for r in rows_a}
    by_b = {r.name: r for r in rows_b}
    m = comparison.metrics

    def change(c, status: TopChange) -> TopChangeOut:
        return TopChangeOut(
            status=status.value,
            school=_identity_out(by_a[c.school_name].identity),
            rank_a=c.rank_a,
            rank_b=c.rank_b,
            rank_scope=comparison.cohort_scope,
            rank_scope_code=ScopeCode.COMMON_COMPLETE_COHORT,
            score_a=by_a[c.school_name].result.score_point,
            score_b=by_b[c.school_name].result.score_point,
        )

    body = CompareResponse(
        input_version=name,
        input_sha256=version.version.input_sha256,
        run_a=_run_out(run_a),
        run_b=_run_out(run_b),
        common_cohort_scope=comparison.cohort_scope,
        common_cohort_scope_code=ScopeCode.COMMON_COMPLETE_COHORT,
        common_cohort_count=comparison.cohort_count,
        metrics=PairwiseMetricsOut(
            n=m.n,
            spearman_rank=m.spearman_rank,
            kendall_tau=m.kendall_tau,
            pairwise_discordance=m.pairwise_discordance,
            median_absolute_rank_shift=m.median_absolute_rank_shift,
            maximum_absolute_rank_shift=m.maximum_absolute_rank_shift,
            top_k=[
                TopKOut(k=t.k, overlap=t.overlap, jaccard=t.jaccard, size_a=t.size_a, size_b=t.size_b)
                for t in m.top_k
            ],
        ),
        ranks=[
            CommonRankOut(
                school=_identity_out(by_a[n].identity),
                rank_a=ra,
                rank_b=rb,
                rank_scope=comparison.cohort_scope,
                rank_scope_code=ScopeCode.COMMON_COMPLETE_COHORT,
            )
            for n, ra, rb in comparison.ranks
        ],
        entrants=[change(c, TopChange.ENTRANT) for c in m.top20_changes if c.status is TopChange.ENTRANT],
        exits=[change(c, TopChange.EXIT) for c in m.top20_changes if c.status is TopChange.EXIT],
        excluded_schools=[_excluded_out(by_a[n], by_b[n], a, b) for n in comparison.excluded],
        interval_schools=[
            IntervalSchoolOut(
                school=_identity_out(by_a[n].identity),
                under_a=_bounds_out(by_a[n]),
                under_b=_bounds_out(by_b[n]),
            )
            for n in comparison.interval_schools
        ],
    )
    return _json(
        request,
        body,
        input_version=input_version,
        package_version=package_version,
        version=version.version,
        depends_on_links=True,
    )


# ---------------------------------------------------------------------------------------------
# Exports. Each file carries its method record, and none of them is cached.
# ---------------------------------------------------------------------------------------------


def _download(content: bytes, media_type: str, filename: str) -> Response:
    return Response(
        content=content,
        media_type=media_type,
        headers={
            **RESEARCH_EXPORT_HEADERS,
            "Cache-Control": NO_STORE_CACHE_CONTROL,
            "Content-Disposition": f'attachment; filename="{filename}"',
        },
    )


def _top_export(
    rule: str,
    k: int,
    include_ranges: bool,
    input_version: str | None,
    package_version: str | None,
    province: str | None,
    district: str | None,
):
    _rule(rule)
    filters = _filters(province, district)
    with get_db() as connection:
        version = _version(connection, input_version)
        run = _run(connection, version.version.input_version, rule, package_version)
        rows = read_school_rows(connection, run)
        persistence = store.read_persistence(connection, run.input_version, rule).get(rule)
    manifest = ManifestOut.from_stored(run.manifest)
    selection = select_top(rows, k, include_ranges, filters)
    record = method_record(
        export="top schools",
        manifest=manifest,
        run=run,
        version=version.version,
        filters=filters,
        generated_at=dt.datetime.now(dt.timezone.utc),
        top=selection,
        persistence=None if persistence is None else persistence.set,
    )
    return record, top_table(selection, manifest, version.version.input_version)


@router.get("/exports/top.csv")
def export_top_csv(
    rule: Text = DEFAULT_RULE_ID,
    k: int = Query(20, ge=1, le=K_MAX),
    include_ranges: bool = True,
    input_version: Text | None = None,
    package_version: Text | None = None,
    province: Text | None = None,
    district: Text | None = None,
):
    record, table = _top_export(rule, k, include_ranges, input_version, package_version, province, district)
    return _download(render_csv(record, table), CSV_TYPE, f"rise_png_screening_top{k}_{rule}.csv")


@router.get("/exports/top.xlsx")
def export_top_xlsx(
    rule: Text = DEFAULT_RULE_ID,
    k: int = Query(20, ge=1, le=K_MAX),
    include_ranges: bool = True,
    input_version: Text | None = None,
    package_version: Text | None = None,
    province: Text | None = None,
    district: Text | None = None,
):
    record, table = _top_export(rule, k, include_ranges, input_version, package_version, province, district)
    return _download(
        render_xlsx(record, "Top schools", table), XLSX_TYPE, f"rise_png_screening_top{k}_{rule}.xlsx"
    )


@router.get("/exports/incomplete.csv")
def export_incomplete_csv(
    rule: Text = DEFAULT_RULE_ID,
    input_version: Text | None = None,
    package_version: Text | None = None,
    province: Text | None = None,
    district: Text | None = None,
):
    _rule(rule)
    filters = _filters(province, district)
    with get_db() as connection:
        version = _version(connection, input_version)
        name = version.version.input_version
        run = _run(connection, name, rule, package_version)
        rows = read_school_rows(connection, run)
        records = {r.school_name: r for r in store.read_inputs(connection, name)}
    manifest = ManifestOut.from_stored(run.manifest)
    queued = queue_rows(rows, filters)
    record = method_record(
        export="schools held for verification",
        manifest=manifest,
        run=run,
        version=version.version,
        filters=filters,
        generated_at=dt.datetime.now(dt.timezone.utc),
        queue_count=len(queued),
    )
    table = incomplete_table(queued, records, manifest, name)
    return _download(render_csv(record, table), CSV_TYPE, f"rise_png_screening_incomplete_{rule}.csv")
