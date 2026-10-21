# API Service

`FastAPI` backend hosted on Cloud Run.
It serves the stored screening runs, their comparisons and their CSV and XLSX exports, and checks every request's token.
It reads the database and recomputes nothing: the runs are made by `packages/school_scoring` when inputs are loaded.

## Current Scaffold

- app entrypoint: [main.py](app/main.py)
- school loader: [load_core_data.py](app/ingestion/load_core_data.py)
- screening input loader: [load_screening_inputs.py](app/ingestion/load_screening_inputs.py)

## Expected Local Flow

1. Create the Supabase project and run [001_core_schema.sql](../../infra/sql/001_core_schema.sql).
2. Configure backend env in either:
   - [services/api/.env.example](.env.example) copied to `services/api/.env`
   - or a repo-root `.env`

   The API now loads `.env` and `.env.local` automatically from both the repo root and `services/api`, with `services/api/.env.local` taking precedence over the other files.
3. Install the local scoring package so the API can import it: `pip install -e ../../packages/school_scoring`.
4. Install the API package dependencies: `pip install -e .`
5. Run `python -m app.ingestion.load_core_data` to fill `schools`, whose ids and coordinates the screening API reads.
6. Load a screening input version, as below.
7. Start the API with `uvicorn app.main:app --reload`.

## Screening inputs and results

`infra/sql/005_screening.sql` adds four tables:
`screening_input_versions`, `screening_inputs`, `screening_runs` and `screening_results`.
They hold one frozen input version, the seven rules of the screening engine run on it, and every school's result under every rule.
The tables have row level security on and no privileges for `anon` or `authenticated`, as in `002_security_lockdown.sql`.

Load a version after the migration has been applied:

```bash
python -m app.ingestion.load_screening_inputs \
  --input-version paper-2026-10-12 \
  --reference-root <methodology dir> \
  --datasets-root <datasets dir> \
  --description "Inputs of the circulated paper"
```

The command reads the three source tables of the study, parses them through the engine's input contract, stores the records, runs all rules and stores the runs, in one transaction.
It needs only `DATABASE_URL`.

- A rerun with identical inputs changes nothing and says so.
- A version that exists with a different input hash is refused. Pick a new version id.
- A stored run that no longer equals the engine's output is refused. Bump the engine package version when the method changed.
- Schools are stored under the name exactly as the source has it. A name is linked to `schools.school_id` through `normalize_join_key` when the key is unique; otherwise `school_id` stays null and the name is listed in the output as unmatched or ambiguous. Load `schools` first, or rerun the command afterwards: the links converge.

To store the top-20 persistence numbers with the version, name each rule and the table of its experiment, as a path under the reference root:

```bash
  --persistence additive_no_u=experiments/decision_rules/<EXP id of the revised paper>/results/persistent_investigation_candidates.csv \
  --persistence additive_u=experiments/decision_rules/<EXP id of the circulated paper>/results/persistent_investigation_candidates.csv \
  --persistence-sha256 additive_u=<hash the circulated file must have>
```

`infra/sql/006_screening_persistence.sql` holds them in three more tables, with the file's path and SHA-256, the experiment id, the draws, the three concentration settings and the 0.80 threshold.
`infra/sql/007_screening_persistence_per_rule.sql` lets a version hold one set for each of two rules: `additive_u`, from the circulated paper's experiment (EXP-21, urgency included), and `additive_no_u`, from the revised paper's (EXP-22, urgency omitted).
No other rule can have a set, and the migration refuses one.
A set describes the one rule it is stored for. The two experiments answer different questions, so a rule never reads the other's numbers.

- Each file is checked against its own experiment. The experiment's `run_receipt.json` must sit beside it and say whether urgency had a weight in `recommended_weights`, which has to agree with the rule: the circulated experiment is refused for `additive_no_u` and the revised one for `additive_u`.
- If the experiment records the file's hash in `artifact_hashes.json` (the revised one does), the file must hash to it, and the record must list the file. The circulated experiment records none, so its file is pinned with `--persistence-sha256 additive_u=<hash>` and cross-checked with the receipt. A pin is checked as well as a recorded hash.
- The file names schools by name. Each name is joined to the version's schools through `normalize_join_key`. A name that matches no school or several, or two names for one school, refuses the whole load.
- A name equal to a stored name byte for byte is that school. Otherwise it must match exactly one school through `normalize_join_key`.
- The receipt must list the persistent schools. The schools the file flags must be the schools the receipt names, under the same normalisation. A difference refuses the load and is reported by count.
- The file's flag column must equal "at or above the threshold in every setting" for every row, and the flagged count must equal the receipt's. Otherwise the load is refused.
- If the experiment counts the schools near the threshold in `threshold_adjacency.json`, the count must equal the one derived from the table with the rule's own band: one standard error for `additive_u` and two for `additive_no_u`.
- Numbers are attached when a version is created and never later, because a response that names a version is cached as immutable. To add a set to a version that is already loaded, load a new input version. This holds for each rule's set.
- The flag itself is never stored. It is derived on read from the stored frequencies, so it cannot disagree with them.
- A rerun with the same files changes nothing. A rerun whose file differs from the stored numbers of its rule is refused. Giving one rule twice is refused.
- Engine versions: a version loaded before the revised paper holds runs whose manifests name the retired provenance `proposed_follow_up_pending_author_review`. The API cannot read those manifests. Load a new input version.

`app/screening_store.py` reads versions, runs, ordered results and persistence back as typed objects.

## Screening API

`app/routers/screening.py` serves the stored runs under `/api/v1/screening`, behind authentication.
It reads `screening_*` tables and recomputes nothing.
Unknown rule, input version or school gives 404 in the API's `{"error": {code, message, details}}` envelope.

| Route | Returns |
| --- | --- |
| `GET /rules` | The seven rules: id, label, provenance, policy role, score kind, formula, weights as fractions and floats, whether urgency enters, the input versions that have a run, and the experiment behind the persistence numbers of each input version. The input versions carry the persistence provenance of each rule that has a set. |
| `GET /input-versions` | Stored versions, newest first, with the default marked. |
| `GET /results?rule=&input_version=&package_version=&placement=lower\|upper&province=&district=` | Every school in the paper's order with the run manifest. `rule` defaults to the circulated `additive_u`. |
| `GET /inputs?input_version=` | The stored inputs of every school of a version, in the order supplied: `school_key`, `source_school_name` and `inputs` in the shape of the school detail's `inputs`. For a client that shows a list and needs raw readings without one request per school. |
| `GET /schools/by-key/{school_key}?input_version=` | One school under all seven rules, with its stored raw inputs. Every school has a `school_key`, linked to `schools` or not. |
| `GET /schools/{school_id}?input_version=` | Every school of the version linked to that `schools` row (normally one), each as above. |
| `GET /compare?a=&b=&input_version=` | Common-cohort ranks under both rules (each with its scope and scope code), the pairwise metrics, top-20 entrants and exits, the schools left out with the reason, and the bounds of interval schools. |
| `GET /exports/top.csv`, `top.xlsx` | The shortlist: `rule`, `k`, `include_ranges`, `province`, `district`, `input_version`. |
| `GET /exports/incomplete.csv` | The verification queue of a rule, with gate failures and missing inputs per school. |

Reading the list:

- `school_key` is derived from the input version and the exact source name. It is the same on every request for a version and differs between versions.
- Complete schools come by point rank. Interval schools (a missing environmental input) sit at their lower-score position, or at their upper-score position with `placement=upper`, and each row says which. Queued schools come last, by province, district and name.
- A rank is always paired with the scope label and count of its cohort. A point rank counts complete schools; a rank bound counts eligible schools. They are different scopes.
- Every rank, the manifest and every scope in a comparison also carry a code beside the label: `complete_under_rule` for a point rank, `eligible` for rank bounds, `common_complete_cohort` for a compared rank. Branch on the code; the label is for reading, and its count comes from the same response.
- `persistent_candidate` is true when a school's lower top-20 frequency was at or above the threshold in every setting of the random share changes, false when it was not, and null when the school was not in the experiment or the version has no such numbers. It appears only in the lists of `additive_u` and `additive_no_u` and in those rules' entries of a school's detail, each from its own experiment, and never for another rule. Beside it, `lowest_top20_frequency` is the school's lowest frequency over the settings and `threshold_adjacent` is true for a persistent school whose lowest frequency is less than the rule's band above the threshold: one standard error for `additive_u`, two for `additive_no_u`, where the standard error is `sqrt(threshold * (1 - threshold) / draws)`. The `persistence` block of a list says where its flags came from (the experiment id, the file hash, the draws, the settings, the band), and its `limitation` is that rule's own: the `additive_u` count belongs to the circulated paper's urgency-included experiment and must not be relabelled as an urgency-omitted result, and the `additive_no_u` run is a revised sensitivity result, not an isolated estimate of urgency's effect. `/rules` and `/input-versions` list the blocks of every rule that has one (`persistence`, ordered by rule id), and each rule in `/rules` names the experiment behind it per input version (`persistence_by_input_version`). The method record of an export carries `persistence_experiment`, `persistence_source_hash`, `persistence_test` and `persistence_limitation` for such a rule.
- Filters only hide rows. Ranks, bounds and normalization anchors are those of the full run, and the response says so.
- `display_order` is the row's place in the full unfiltered display, counting interval and queued schools. It is not a rank: it differs from the point rank wherever an interval school sits above a complete one, and it must not be quoted as a rank.
- The default input version is the newest one. For each rule the current run is the one with the highest engine package version, not the latest stored. Every read accepts `package_version` to pin a run.
- Cache policy: no `input_version` gives `private, max-age=60`; an `input_version` alone gives `max-age=300`; an `input_version` with a `package_version` names one stored run and is sent as `immutable`. `/inputs` holds nothing that depends on `schools`, so naming the `input_version` alone makes it `immutable`. Every JSON response has a weak `ETag` and answers `If-None-Match` with 304.
- The links to the `schools` table (`school_id`, coordinates) are the one part of a stored run that a later `load_screening_inputs` run may change. Do not keep an immutable response across such a run.

Exports:

- The CSV is UTF-8 with a byte order mark. It opens with the method record, one quoted cell per line, `"# key: value"`, so Excel keeps each line in one column. Then come the header row and the data rows. Parse it as CSV, decode with `utf-8-sig`, and skip the leading one-cell rows that start with `# `. The XLSX has the same record on its first sheet, "Method record".
- `k` cuts the rule's full list: point rows have a point rank of at most `k`. Range rows (`include_ranges`, true by default) are interval schools whose best possible rank is at most `k`. They carry bounds only, in rows flagged `row_kind=range`, after the point rows. The method record always says how many range schools reach `k` after the filters and whether they are included.
- To rebuild the list, keep `row_kind=point`, sort by the record's `sort_columns` descending, then `source_school_name` ascending in code point order. The result is the order of `rank_point`.
- Text parameters (`rule`, `input_version`, `package_version`, `province`, `district`, ids) are rejected with 422 when they contain a control character. Characters that XML cannot hold in stored text are written to the XLSX as Excel's escape, for example `_x0007_`; the CSV keeps them.
- A rule that does not read urgency has no `U` key in the JSON and no `U` column in an export. Floats are written in full precision and unknown values are empty cells. Exports are sent with `Cache-Control: private, no-store` and `X-RISE-PNG-Decision-Use: research-prototype-only`.
- `source_school_name` is always the exact name, for joins and for rebuilding the list. `display_name` follows it and is the same name with an apostrophe in front when it starts with `=`, `+`, `-`, `@`, a tab or a carriage return, so that a spreadsheet application does not read it as a formula. Show `display_name` to people.

Stored manifests and results are read with models that ignore fields they do not know, so an engine that stores more does not break reading. Response models are strict.

The failure modes behind the tests are in `tests/SCREENING_API_FAILURE_MODES.md`.
They run against a real PostGIS server, like the screening database tests below.

### Database tests

The screening database tests use a real PostGIS server and skip when `DATABASE_URL` is unset.
Each test creates its own database from a migrated template and drops it afterwards, so `DATABASE_URL` must name `localhost`, `127.0.0.1` or `::1` explicitly, and `PGHOST`, `PGHOSTADDR` and `PGSERVICE` must be unset.
Set `REQUIRE_DATABASE_TESTS=1` to make a missing or refused database fail the run instead of skipping the tests; CI does.

```bash
docker run -d --name rise-screening-pg --platform linux/amd64 -e POSTGRES_PASSWORD=local -p 55432:5432 postgis/postgis:15-3.3
DATABASE_URL=postgresql://postgres:local@localhost:55432/postgres python -m pytest tests -q
docker rm -f rise-screening-pg
```

The failure modes behind each test are in `tests/SCREENING_DB_FAILURE_MODES.md`.

## Local Frontend CORS

The API now allows these frontend origins by default:
- `http://localhost:3000`
- `http://127.0.0.1:3000`

Override them with:

```env
CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
```
