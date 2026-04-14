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

VECTOR_LAYER_FEATURES_SQL = """
select vector_feature_id, layer_key, source_feature_id, feature_name, province, district,
       properties, st_asgeojson(geom)::json as geometry
from vector_layer_features
where layer_key = %(layer_key)s
  and (%(province)s::text is null or province = %(province)s::text)
  and (%(district)s::text is null or district = %(district)s::text)
  and (
      %(min_lon)s::double precision is null
      or st_intersects(
          geom,
          st_makeenvelope(
              %(min_lon)s::double precision,
              %(min_lat)s::double precision,
              %(max_lon)s::double precision,
              %(max_lat)s::double precision,
              4326
          )
      )
  )
order by province nulls first, district nulls first, feature_name nulls first, source_feature_id nulls first
limit %(limit)s
"""

PROVINCES_SQL = """
select distinct province
from districts
order by province
"""

DISTRICTS_SQL = """
select district_id, province, district
from districts
where (%(province)s::text is null or province = %(province)s::text)
order by province, district
"""

DISTRICT_GEOMETRY_SQL = """
select district_id, province, district, st_asgeojson(geom)::json as geometry
from districts
where district = %(district)s::text
  and (%(province)s::text is null or province = %(province)s::text)
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
where (%(province)s::text is null or province = %(province)s::text)
  and (%(district)s::text is null or district = %(district)s::text)
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
where (%(province)s::text is null or s.province = %(province)s::text)
  and (%(district)s::text is null or s.district = %(district)s::text)
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

FULL_EXPORT_SQL = """
select
       s.school_name as "School Name",
       s.locality as "Locality",
       s.number_of_available_teachers as "Number of Available Teachers",
       s.total_number_of_classrooms as "Total Number of Classrooms",
       s.number_of_permanent_classrooms as "Number of Permanent Classrooms",
       s.number_of_semi_permanent_classrooms as "Number of Semi-Permanent Classrooms",
       s.number_of_bush_material_classrooms as "Number of Bush Material Classrooms",
       s.number_of_houses_for_teachers as "Number of Houses for Teachers",
       s.number_of_libraries as "Number of Libraries",
       s.number_of_workshops as "Number of Workshops",
       s.number_of_practical_skills_buildings as "Number of Practical Skills Buildings",
       s.number_of_home_economics_buildings as "Number of Home Economics Buildings",
       s.number_of_computer_labs as "Number of Computer Labs",
       s.power_source as "Power Source",
       s.water_source as "Water Source",
       s.toilets as "Toilets",
       s.latitude as "Latitude",
       s.longitude as "Longitude",
       s.province as "Province",
       s.district as "District",
       s.cachment_area_walking_wkt as "cachment_area_walking",
       s.cachment_area_cycling_wkt as "cachment_area_cycling",
       s.cachment_area_driving_wkt as "cachment_area_driving",
       s.pop_with_access_walking as "pop_with_access_walking",
       s.pop_with_access_driving as "pop_with_access_driving",
       s.pop_with_access_cycling as "pop_with_access_cycling",
       s.number_of_specialized_classrooms as "Number of Specialized Classrooms",
       s.lc_landterr_score as "lc_landterr_score",
       s.r as "R",
       s.average_aqi as "Average AQI",
       s.maximum_aqi as "Maximum AQI",
       s.fixed_broadband_download_speed_mbps as "Fixed Broadband Download Speed (MB/s)",
       s.fixed_broadband_upload_speed_mbps as "Fixed Broadband Upload Speed (MB/s)",
       s.mobile_internet_download_speed_mbps as "Mobile Internet Download Speed (MB/s)",
       s.mobile_internet_upload_speed_mbps as "Mobile Internet Upload Speed (MB/s)",
       s.access_walking_pct as "Access Walking (%)",
       s.access_driving_pct as "Access Driving (%)",
       s.access_cycling_pct as "Access Cycling (%)",
       s.total_nighttime_luminosity as "Total Nighttime Luminosity",
       s.co2e_20yr_total_emissions_tonnes as "CO2e-20yr Total Emissions (tonnes)",
       s.co2e_100yr_total_emissions_tonnes as "CO2e-100yr Total Emissions (tonnes)",
       s.grade_7_students as "Grade 7 Students",
       s.grade_8_students as "Grade 8 Students",
       s.grade_9_students as "Grade 9 Students",
       s.grade_10_students as "Grade 10 Students",
       s.grade_11_students as "Grade 11 Students",
       s.grade_12_students as "Grade 12 Students",
       s.total_population as "Total Population",
       s.female_students_grade_7_12 as "Female students grade 7-12",
       s.total_enrollment_grade_7_12 as "Total enrollment Grade 7-12",
       s.secondary_students_per_1000_people as "Secondary students per 1000 people",
       s.rate_grade_7_progressed_to_grade_12_pct as "Rate of Grade 7 who progressed to Grade 12 (%)",
       s.total_enrollment_grade_7_10 as "Total enrollment Grade 7-10",
       s.grade_7_10_students_per_1000_population as "Grade 7-10 Students per 1000 Population",
       s.rate_grade_7_progressed_to_grade_10_pct as "Rate of Grade 7 who progressed to Grade 10 (%)",
       s.school_aged_population as "School-Aged Population",
       s.conflict_events as "Conflict Events",
       s.conflict_fatalities as "Conflict Fatalities",
       s.conflict_population_exposure as "Conflict Population Exposure",
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
from schools s
left join school_scores sc
  on sc.school_id = s.school_id
 and sc.scenario_id = coalesce(%(scenario_id)s::uuid, ({default_scenario_sql}))
order by coalesce(sc.rank_priority, 999999), s.school_name
""".format(default_scenario_sql=DEFAULT_SCENARIO_SQL.strip())
