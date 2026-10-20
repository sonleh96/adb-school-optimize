# Screening API failure modes

Written before the tests.
Each test in `test_screening_api_*.py` carries the id of the failure mode it guards.
All of them run against a real PostGIS database (`DATABASE_URL`), with invented records loaded through the ingestion function of the screening database tests.
Without `DATABASE_URL` they skip, like the screening database tests.
Nothing in them is mocked: the application, its connection pool and the stored runs are the real ones.

| Id | Failure mode | How it would show |
| --- | --- | --- |
| API1 | A rank loses its scope, or carries the wrong one. | A row, a detail entry, a comparison or an export gives a rank without the scope label and count of its cohort, or the label and count differ from the stored run. |
| API2 | An interval school gets a point rank. | `rank_point`, a point score or a position among the point rows appears for a school with a missing environmental input, in the list, the detail, the comparison or an export. |
| API3 | Urgency appears under an urgency-omitted rule. | `U`, a `U` contribution or a maximum term that names `U` is shown for `additive_no_u`, `need_first_no_u` or `bottleneck_no_u`, or a rule's `uses_urgency` is wrong. |
| API4 | A filter changes ranks or anchors, or does not say so. | A province or district filter renumbers the remaining rows, changes a bound, or the response does not state that filters only hide rows. |
| API5 | The list is in the wrong order. | Complete schools are not in point-rank order; an interval school is not at its lower-score position by default, or `placement=upper` does not move it to its upper-score position; the placement of a row is not stated; the queue is not ordered by province, district and name; equal scores are not separated by school name in code point order; a need-first rule orders interval schools by score without N first. |
| API6 | A stale priority from the old model is used. | A screening response changes when `school_scores.rank_priority` or any other old-model value changes, or carries an old-model field. |
| API7 | An export cannot rebuild the list. | Re-sorting the exported rows by the declared keys and the name tie-break does not give the listed point ranks; the method record omits a key needed to read the file; the file cannot be parsed after the `#` block. |
| API8 | An export names the wrong rule. | The method record, the row `rule_id`, the filename or the sheet name disagree with the requested rule, or `_u` and `_no_u` rules are confused, or a proposed rule is labelled as circulated. |
| API9 | A new route is reachable without authentication. | Any route under `/api/v1/screening` answers 200 without a bearer token when authentication is required. |
| API10 | Cache headers are wrong. | A JSON GET has no `Cache-Control` or `ETag`; the `ETag` does not change when the input version or the rule changes; `If-None-Match` is ignored; an error response or an export is cacheable. |
| API11 | An unknown id is not a 404, or has another error shape. | An unknown rule, input version or school gives 200, 500 or a body that is not the API's `{"error": {code, message, details}}` envelope. |
| API12 | A value is altered on the way out. | A float is rounded or becomes `NaN` in JSON, a name is trimmed or case-folded, an integer rank becomes a float, an unknown value becomes zero, or what the list returns differs from the stored run. |
| API13 | A comparison is computed on the wrong cohort or the wrong way. | `/compare` ranks schools that are not complete under both rules, its metrics differ from the engine's `pairwise_metrics`, or exits and entrants are swapped. |
| API14 | The default input version is wrong. | The default is not the latest version, or `/input-versions` does not mark it, or the default rule is not the circulated rule. |
| API15 | Range schools are mishandled in an export. | A range row carries a point rank or point score, is not flagged, or appears with `include_ranges=false`; a range school that could reach the shortlist is left out. |
| API16 | The incomplete export is wrong. | It lacks a queued school, includes a school that is not queued under the chosen rule, or gives no missing details. |
| API17 | The method record is incomplete or wrong. | It omits a required item (rule provenance, role, score kind, formula, weights, input version and hash, anchors hash, package version, tie rule, scopes and counts, placement convention, filters, `k`, generation time, caveat), or states a hash that differs from the stored run. |
| API18 | The school detail is wrong. | It shows another school, omits a rule, shows the stored raw inputs altered, or answers for a school that is not in the input version. |
| API19 | A spreadsheet reads a name as a formula. | An XLSX cell holding a school name that starts with `=` is stored as a formula. |
| API20 | A top export drops range schools without saying so. | With `include_ranges` false or defaulted, interval schools that could reach `k` are missing and the method record does not say how many there are or that they are left out. |
| API22 | The current run is chosen by chance, or a run cannot be pinned. | With two runs of one rule, the response follows insertion time or text order of the package version instead of the highest version; a request cannot name a package version; a pinned request is not cached as immutable. |
| API21 | A school cannot be reached, or a link hides a school. | A school with no `schools` row has no detail route; the key differs between requests or equals another version's key; two schools linked to one `school_id` show only one of them. |
| API23 | Control characters cause a server error. | A control character in a query or path parameter reaches the database or an export and gives a 500, or text stored with such a character makes the XLSX writer raise. |
| API24 | A CSV name is read as a formula, or the exact name is lost. | A name that starts with `=`, `+`, `-`, `@`, a tab or a carriage return has no guarded `display_name` column, or `source_school_name` is changed to guard it, or the XLSX turns a carriage return into a line feed. |
| API29 | Excel mangles the CSV. | The file has no byte order mark so accents are misread, or a method-record line holds a comma and is split across columns. |
| API25 | A browser script cannot read the screening headers. | The CORS response does not expose `Content-Disposition`, `ETag`, `X-Screening-Input-Version`, `X-Screening-Input-Sha256` or the research-use header, so a web client cannot name a download or see the version. |

## Test map

| Test | Failure mode |
| --- | --- |
| `test_the_csv_rebuilds_the_list_from_its_declared_keys` | API7, API12 |
| `test_k_cuts_the_list_at_a_point_rank_and_a_name_tie_is_broken_by_code_point` | API7 |
| `test_names_are_exported_byte_for_byte` | API12 |
| `test_values_are_written_in_full_precision` | API12 |
| `test_unknown_values_are_empty_cells_never_zero` | API12 |
| `test_the_method_record_names_everything_needed_to_read_the_file` | API17 |
| `test_the_caveat_for_an_urgency_rule_says_urgency_is_unresolved_not_omitted` | API17 |
| `test_every_export_names_the_rule_it_was_asked_for` | API8, API3 |
| `test_range_schools_have_their_own_flagged_rows_with_bounds_and_no_point_rank` | API2, API15 |
| `test_range_rows_are_left_out_unless_asked_for_and_unless_they_could_reach_the_cut` | API15 |
| `test_range_schools_are_included_by_default_and_the_record_counts_those_reaching_k_after_filters` | API20 |
| `test_a_complete_school_is_never_listed_as_a_range_row_and_a_rule_without_environment_has_none` | API2 |
| `test_filters_in_an_export_hide_rows_without_renumbering_ranks` | API4 |
| `test_the_xlsx_holds_a_method_record_sheet_and_the_same_table_as_the_csv` | API7, API12, API17 |
| `test_a_school_name_that_looks_like_a_formula_stays_text_in_the_xlsx` | API19 |
| `test_the_incomplete_export_lists_exactly_the_queue_with_missing_details` | API16 |
| `test_the_queue_depends_on_the_rule_and_on_the_filters` | API16, API4 |
| `test_every_gate_failure_has_a_plain_description` | API16 |
| `test_control_characters_in_stored_text_do_not_break_the_xlsx` | API23 |
| `test_display_name_guards_formula_like_names_while_the_source_name_stays_exact` | API24 |
| `test_the_csv_opens_in_excel_with_accents_and_one_column_per_record_line` | API29 |
| `test_every_screening_route_rejects_an_unauthenticated_request` | API9 |
| `test_json_responses_carry_a_cache_policy_and_a_validator` | API10 |
| `test_a_matching_validator_gets_304_and_any_other_gets_the_body` | API10 |
| `test_the_validator_follows_the_rule_the_placement_the_filter_and_the_input_version` | API10 |
| `test_errors_and_exports_are_not_cacheable` | API10 |
| `test_control_characters_in_any_text_parameter_are_a_422_not_a_500` | API23 |
| `test_a_browser_script_may_read_the_screening_headers_and_the_filename` | API25 |
| `test_rules_list_the_registry_with_weights_as_fractions_and_floats` | API3, API8, API14 |
| `test_the_default_input_version_is_the_latest_and_is_marked` | API14 |
| `test_results_list_complete_schools_by_point_rank_then_interval_at_lower_bound_then_the_queue` | API1, API2, API5 |
| `test_upper_placement_moves_interval_schools_to_their_upper_bound_and_says_so` | API5 |
| `test_a_need_first_rule_places_interval_schools_by_need_first_then_by_score` | API5 |
| `test_the_queue_is_ordered_by_province_then_district_then_name_in_code_point_order` | API5 |
| `test_urgency_omitted_rules_hold_back_only_the_schools_that_fail_the_gate` | API3, API5 |
| `test_filters_hide_rows_and_never_renumber_ranks` | API4 |
| `test_every_rule_returns_exactly_what_the_engine_produced` | API1, API12 |
| `test_identity_carries_the_exact_source_name_the_place_and_the_coordinates_of_the_school` | API12 |
| `test_interval_and_queued_schools_never_carry_a_point_rank_or_point_score` | API2 |
| `test_urgency_never_appears_in_an_urgency_omitted_rule` | API3 |
| `test_old_model_priorities_do_not_reach_the_screening_responses` | API6 |
| `test_unknown_ids_are_404_in_the_apis_error_envelope` | API11 |
| `test_nothing_loaded_is_404_not_a_server_error` | API11 |
| `test_malformed_arguments_are_validation_errors_in_the_same_envelope` | API11 |
| `test_school_detail_shows_the_school_under_all_seven_rules_with_its_stored_inputs` | API1, API18 |
| `test_school_detail_for_an_interval_school_has_bounds_and_no_point_rank` | API2, API18 |
| `test_compare_ranks_the_schools_complete_under_both_rules_and_reports_the_metrics` | API1, API13 |
| `test_compare_gives_the_bounds_of_interval_schools_under_both_rules` | API2, API13 |
| `test_compare_of_a_rule_with_itself_agrees_completely` | API13 |
| `test_compare_lists_top_twenty_entrants_and_exits_with_both_ranks_and_scores` | API13 |
| `test_the_current_run_is_the_highest_package_version_and_any_run_can_be_pinned` | API22 |
| `test_every_school_has_a_key_and_a_detail_route_even_when_it_is_not_linked` | API21 |
| `test_the_school_key_is_stable_per_version_and_differs_between_versions` | API21 |
| `test_the_route_on_a_school_id_returns_every_school_that_shares_the_link` | API21 |
