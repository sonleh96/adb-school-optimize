DEFAULT_SCENARIO_SQL = """
select scenario_id
from scoring_scenarios
where is_default = true
order by updated_at desc
limit 1
"""

LAYERS_SQL = """
select layer_id, layer_key, layer_name, layer_group, layer_type, source_kind, source_path,
       join_strategy, geometry_type, default_visible, runtime_clip, style_config
from layer_catalog
order by layer_group, layer_name
"""

PROVINCES_SQL = """
select distinct province
from districts
order by province
"""

DISTRICTS_SQL = """
select district_id, province, district
from districts
where (%(province)s is null or province = %(province)s)
order by province, district
"""

DISTRICTS_CHOROPLETH_SQL = """
select district_id, province, district,
       st_asgeojson(geom)::json as geometry,
       average_aqi, maximum_aqi,
       fixed_broadband_download_speed_mbps,
       fixed_broadband_upload_speed_mbps,
       mobile_internet_download_speed_mbps,
       mobile_internet_upload_speed_mbps,
       access_walking_pct, access_driving_pct, access_cycling_pct,
       total_nighttime_luminosity,
       co2e_20yr_total_emissions_tonnes,
       co2e_100yr_total_emissions_tonnes,
       grade_7_students, grade_8_students, grade_9_students, grade_10_students,
       grade_11_students, grade_12_students,
       total_population, female_students_grade_7_12, total_enrollment_grade_7_12,
       secondary_students_per_1000_people,
       rate_grade_7_progressed_to_grade_12_pct,
       total_enrollment_grade_7_10,
       grade_7_10_students_per_1000_population,
       rate_grade_7_progressed_to_grade_10_pct,
       school_aged_population, conflict_events, conflict_fatalities, conflict_population_exposure
from districts
where (%(province)s is null or province = %(province)s)
  and (%(district)s is null or district = %(district)s)
order by province, district
"""

SCHOOLS_SQL = """
select s.school_id, s.school_name, s.locality, s.province, s.district,
       s.latitude, s.longitude, st_asgeojson(s.geom)::json as geometry,
       s.number_of_available_teachers,
       s.total_number_of_classrooms,
       s.power_source,
       s.water_source,
       sc.scenario_id,
       sc.s, sc.a, sc.r_phys, sc.g, sc.i, sc.p,
       sc.need_score as need,
       sc.priority_score as priority,
       sc.data_confidence,
       sc.stage1_selected,
       sc.rank_priority,
       sc.rank_need
from schools s
left join school_scores sc
  on sc.school_id = s.school_id
 and sc.scenario_id = coalesce(%(scenario_id)s::uuid, ({default_scenario_sql}))
where (%(province)s is null or s.province = %(province)s)
  and (%(district)s is null or s.district = %(district)s)
order by coalesce(sc.rank_priority, 999999), s.school_name
limit %(limit)s
""".format(default_scenario_sql=DEFAULT_SCENARIO_SQL.strip())

SCHOOL_DETAIL_SQL = """
select s.*,
       st_asgeojson(s.geom)::json as geometry,
       sc.scenario_id,
       sc.s, sc.a, sc.r_phys, sc.g, sc.i, sc.p,
       sc.need_score as need,
       sc.priority_score as priority,
       sc.data_confidence,
       sc.stage1_selected,
       sc.rank_priority,
       sc.rank_need,
       sc.component_breakdown
from schools s
left join school_scores sc
  on sc.school_id = s.school_id
 and sc.scenario_id = coalesce(%(scenario_id)s::uuid, ({default_scenario_sql}))
where s.school_id = %(school_id)s::uuid
limit 1
""".format(default_scenario_sql=DEFAULT_SCENARIO_SQL.strip())

SCENARIOS_SQL = """
select scenario_id, scenario_name, description, weights, config, created_by, is_default, created_at, updated_at
from scoring_scenarios
order by updated_at desc, scenario_name
"""

SCENARIO_SQL = """
select scenario_id, scenario_name, description, weights, config, created_by, is_default, created_at, updated_at
from scoring_scenarios
where scenario_id = %(scenario_id)s::uuid
limit 1
"""

RANKED_EXPORT_SQL = """
select s.school_name as "School Name",
       s.province as "Province",
       s.district as "District",
       sc.s as "S",
       sc.a as "A",
       sc.r_phys as "R_phys",
       sc.g as "G",
       sc.need_score as "Need",
       sc.i as "I",
       sc.p as "P",
       sc.priority_score as "Priority",
       sc.data_confidence as "data_confidence",
       sc.stage1_selected as "stage1_selected",
       sc.rank_priority as "rank_priority",
       sc.rank_need as "rank_need"
from school_scores sc
join schools s on s.school_id = sc.school_id
where sc.scenario_id = coalesce(%(scenario_id)s::uuid, ({default_scenario_sql}))
order by sc.rank_priority, sc.rank_need, s.school_name
""".format(default_scenario_sql=DEFAULT_SCENARIO_SQL.strip())

