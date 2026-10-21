# Screening database failure modes

Written before the tests.
Each test in `test_screening_db_*.py` carries the id of the failure mode it guards.
All of them run against a real PostGIS database (`DATABASE_URL`) and use invented records only.
Without `DATABASE_URL` they skip with the message "set DATABASE_URL to a PostGIS server to run the screening database tests".
They also skip when `DATABASE_URL` does not name `localhost`, `127.0.0.1` or `::1` explicitly, or when it sets `hostaddr` or `service`, or when `PGHOST`, `PGHOSTADDR` or `PGSERVICE` is set, because each test creates and drops its own database.
With `REQUIRE_DATABASE_TESTS=1`, as in CI, each of these cases fails instead of skipping.

| Id | Failure mode | How it would show |
| --- | --- | --- |
| DB1 | The migration is not re-runnable. | A second apply of the migrations errors, changes the schema, or touches rows. |
| DB2 | The security lockdown is missing on a new table. | Row level security is off, or `anon` or `authenticated` hold a privilege. The test grants them default privileges first, as Supabase can, so that removing the `revoke` lines makes it fail. |
| DB3 | A partial load survives a failure. | A version or some runs stay after the load raised. |
| DB4 | A rerun duplicates runs or rows. | Run or result counts grow, or timestamps change, on an identical rerun. |
| DB5 | A version is silently overwritten. | Different inputs under an existing version id replace or mix with the old ones. |
| DB6 | Names are mangled. | Whitespace, case or Unicode form of `School Name` changes on the way in or out. |
| DB7 | Unmatched schools are dropped or mislinked. | A name without a school row disappears, or an ambiguous key links to one school. |
| DB8 | A stored value differs from the engine's value. | A float, null, rank or JSON field read back differs from the engine, or the stored inputs no longer hash to the recorded input hash. |
| DB9 | Scope labels are lost. | A rank is stored without its scope text and count, or the labels differ from the manifest. |
| DB10 | Cohort counts drift. | Stored cohort counts or rank counts differ from the manifest of the same run. |
| DB11 | Contradictory rows are representable. | The database accepts a complete school without a point score, a queued school without a gate failure, an unknown cohort or gate failure, or a run whose input hash differs from its version. |
| DB12 | The input contract and the table drift apart. | A field of `INPUT_CONTRACT` has no column, or a column has the wrong type. |
| DB13 | Stored results go stale or diverge under the same package version. | A rerun keeps results that no longer equal the engine's output instead of refusing. |
| DB14 | Concurrent loads of one version fail or duplicate. | Simultaneous loads raise or leave more than one set of runs. |
| DB15 | A read returns rows in the wrong order. | `read_results` is not ordered by point rank, then best rank, then name in code point order, with unranked schools last. |
| DB16 | School links go stale. | Schools loaded after the inputs never link, or links differ between `screening_inputs` and `screening_results`. |
| DB17 | The command misreports or half-fails. | Unmatched names are missing from the output, a contract violation in a source file leaves rows behind, or a rerun is not reported as unchanged. |
| DB18 | A partial apply of the migration leaves tables without their lockdown. | `psql -f` stops at an error with the tables created and row level security or the revokes not yet run. |
| DB19 | A stored input row is edited by hand and a rerun calls it identical. | The rerun checks the version hash and the results but not the stored input rows. |
| DB20 | The test guard reaches a remote server. | `hostaddr`, a host-less URL, a service entry or `PGHOST` points the tests at a server that is not local. |
| DB21 | CI loses the database and the job still passes. | `DATABASE_URL` is missing or the service is down, the database tests skip, and nothing fails. |
| DB22 | The load only works on tuple rows. | A connection with `dict_row`, as the API pool uses, breaks indexing by position. |
| DB23 | The command crashes on a bad source set. | A source table without the key column, an unreadable file or an empty set ends in a traceback instead of a plain message. |

## Test map

| Test | Failure mode |
| --- | --- |
| `test_migrations_are_rerunnable_and_leave_the_schema_unchanged` | DB1 |
| `test_migrations_keep_rows_when_rerun` | DB1 |
| `test_new_tables_are_closed_to_the_data_api_roles` | DB2 |
| `test_a_failed_apply_leaves_no_screening_table_behind` | DB18 |
| `test_load_stores_one_run_per_rule_and_one_result_per_school` | DB4, DB10 |
| `test_load_works_on_a_connection_that_returns_dict_rows` | DB22 |
| `test_identical_rerun_changes_nothing` | DB4 |
| `test_duplicate_run_for_one_version_rule_and_package_is_rejected` | DB4 |
| `test_failure_midway_leaves_nothing_behind` | DB3 |
| `test_changed_inputs_under_an_existing_version_are_refused` | DB5 |
| `test_record_order_is_part_of_the_version` | DB5 |
| `test_rerun_refuses_stored_input_rows_that_were_edited` (5 edits) | DB19 |
| `test_command_refuses_changed_inputs_under_the_same_version` | DB5, DB17 |
| `test_names_round_trip_byte_for_byte` | DB6 |
| `test_unmatched_names_are_kept_and_ambiguous_keys_are_not_linked` | DB7 |
| `test_stored_inputs_rehash_to_the_recorded_input_hash` | DB8 |
| `test_stored_results_equal_the_engine_field_by_field` | DB8 |
| `test_missing_values_stay_missing_in_results` | DB8 |
| `test_every_result_row_carries_the_scope_labels_of_its_manifest` | DB9 |
| `test_stored_cohort_and_rank_counts_equal_the_manifest` | DB10 |
| `test_contradictory_result_rows_are_rejected` (13 cases) | DB11 |
| `test_run_must_state_the_input_hash_of_its_version` | DB11 |
| `test_every_engine_gate_failure_is_accepted_by_the_database` (8 cases) | DB11, DB12 |
| `test_inputs_table_has_one_column_per_contract_field` | DB12 |
| `test_rerun_refuses_results_that_differ_from_the_engine` (results, manifest) | DB13 |
| `test_concurrent_loads_of_one_version_converge` | DB14 |
| `test_results_are_read_in_rank_order` | DB15 |
| `test_schools_loaded_later_are_linked_by_a_rerun` | DB16 |
| `test_explicit_local_hosts_are_accepted` (5 urls) | DB20 |
| `test_anything_that_could_reach_another_server_is_refused` (9 urls) | DB20 |
| `test_a_redirecting_environment_variable_is_refused_even_with_a_local_url` (3 variables) | DB20 |
| `test_a_missing_url_is_reported_with_the_documented_message` | DB20 |
| `test_require_flag_reads_the_environment` | DB21 |
| `test_database_tests_skip_without_a_database_unless_required` | DB21 |
| `test_a_refused_server_also_fails_when_the_database_tests_are_required` | DB20, DB21 |
| `test_command_end_to_end` | DB17, DB8 |
| `test_command_rejects_a_source_table_that_breaks_the_contract` | DB17 |
| `test_command_names_a_missing_source_table` | DB17 |
| `test_command_names_a_table_without_the_key_column` | DB23 |
| `test_command_names_a_source_table_it_cannot_read` | DB23 |
| `test_command_says_so_when_the_source_tables_list_no_schools` | DB23 |

## Persistence of top-20 membership

Written before `test_screening_persistence_load.py`, whose tests carry these ids.
The files and schools are invented.

| Id | Failure mode | How it would show |
| --- | --- | --- |
| PE1 | The numbers are stored without their source. | A stored set lacks the path, the file hash, the experiment id, the draws, the settings, the threshold or the rule. |
| PE2 | The flag disagrees with the frequencies. | A school at the threshold in every setting is not persistent, or a school below it in one setting is. |
| PE3 | A rerun changes something. | The same file loaded twice, or a load without the file after one with it, alters any stored row. |
| PE4 | A rerun with a different file overwrites. | A changed frequency, a missing school or another file is accepted over stored numbers. |
| PE5 | A name matches no school and is skipped. | The load succeeds with fewer schools, or stores the numbers on another school. |
| PE6 | A name matches two schools and one is chosen, or an exact name is refused. | The load succeeds and one of two schools that differ only by spacing or case gets the numbers; or a name equal to a stored name is refused because a twin normalises alike. |
| PE7 | Two rows land on one school. | The second row replaces the first or the load fails with a database error instead of a message. |
| PE8 | A file with a different hash is trusted. | A wrong expected hash loads, or an uppercase hash is refused. |
| PE9 | The file's flag column is trusted over its frequencies. | A row whose flag disagrees with its frequencies loads. |
| PE10 | The receipt's count is ignored. | A file that flags another number of schools than its receipt states loads. |
| PE11 | A frequency is not a probability. | Empty, text, NaN, negative or above 1 loads, in the reader or the database. |
| PE12 | One version lends its numbers to another. | A version loaded without the file reads the numbers of a sibling version. |
| PE13 | The experiment is unnamed. | A path with no `EXP-` folder loads, so the provenance cannot say which experiment. |
| PE14 | The numbers are stored for another rule. | The database accepts a set whose rule is not the circulated one. |
| PE15 | The numbers outlive their school or version. | Deleting a school or a version leaves frequencies behind. |
| PE16 | The Data API roles can reach the tables. | `anon` or `authenticated` holds a privilege, or row security is off. |
| PE17 | The migration is not atomic or not re-runnable. | A failure before its commit leaves a table behind, or a second apply changes the schema or the rows. |
| PE18 | The command crashes or half loads. | A wrong hash or a lone `--persistence-sha256` gives a traceback, or leaves inputs and runs stored. |
| PE19 | Numbers are attached to a version that clients already hold. | A version loaded without persistence accepts a file later, so a response cached as immutable changes while its header says it cannot. |
| PE20 | The receipt is not the check it stands in for. | A file whose flagged schools differ from the receipt's list loads, the difference is reported by name, a receipt without the list is accepted, or a receipt spelling that normalises alike is refused. |

| Test | Failure mode |
| --- | --- |
| `test_the_numbers_are_stored_with_their_provenance_and_the_flag_follows_the_threshold` | PE1, PE2 |
| `test_a_rerun_with_the_same_file_changes_nothing` | PE3 |
| `test_a_rerun_whose_file_differs_is_refused_and_leaves_the_stored_numbers` | PE4 |
| `test_a_load_without_the_file_leaves_a_stored_set_alone` | PE3 |
| `test_a_version_loaded_without_the_file_has_no_numbers_and_no_other_version_lends_its_own` | PE12 |
| `test_a_name_that_matches_no_school_refuses_the_whole_load` | PE5 |
| `test_a_blank_name_matches_no_school` | PE5 |
| `test_a_name_that_matches_two_schools_only_through_normalisation_refuses_the_whole_load` | PE6 |
| `test_a_name_equal_to_a_stored_name_is_that_school_even_when_a_twin_normalises_alike` | PE6 |
| `test_two_exact_twins_can_both_be_named` | PE6 |
| `test_two_names_for_one_school_refuse_the_whole_load` | PE7 |
| `test_a_file_that_does_not_hash_to_the_expected_value_is_refused` | PE8 |
| `test_a_flag_column_that_disagrees_with_the_frequencies_is_refused` | PE9 |
| `test_a_receipt_count_that_disagrees_with_the_flagged_rows_is_refused` | PE10 |
| `test_a_receipt_that_names_other_schools_than_the_file_flags_is_refused_by_count` | PE20 |
| `test_a_receipt_may_spell_a_name_differently_when_it_normalises_alike` | PE20 |
| `test_a_receipt_that_lists_a_school_the_version_does_not_have_is_refused` | PE20 |
| `test_a_receipt_without_the_list_of_names_is_refused` | PE20 |
| `test_numbers_cannot_be_attached_to_a_version_that_was_loaded_without_them` | PE19 |
| `test_a_frequency_that_is_not_a_number_from_zero_to_one_is_refused` | PE11 |
| `test_a_frequency_outside_zero_to_one_is_rejected_by_the_database` | PE11 |
| `test_a_path_without_an_experiment_folder_is_refused` | PE13 |
| `test_the_numbers_cannot_be_stored_for_any_rule_but_the_circulated_one` | PE14 |
| `test_the_numbers_go_with_their_school_and_their_version` | PE15 |
| `test_the_persistence_tables_are_closed_to_the_data_api_roles` | PE16 |
| `test_the_migration_applies_a_second_time_and_keeps_the_numbers` | PE17 |
| `test_a_failed_apply_leaves_no_persistence_table_behind` | PE17 |
| `test_the_command_stores_the_numbers_and_a_rerun_changes_nothing` | PE18 |
| `test_the_command_refuses_a_wrong_hash_without_a_traceback_and_stores_nothing` | PE8, PE18 |
| `test_the_hash_alone_is_a_usage_error` | PE18 |
