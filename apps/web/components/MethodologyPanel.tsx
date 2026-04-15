"use client";

import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";

import "katex/dist/katex.min.css";

function MathBlock({ expression }: { expression: string }) {
  return (
    <div className="methodology-code methodology-math">
      <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
        {`$$${expression}$$`}
      </ReactMarkdown>
    </div>
  );
}

export function MethodologyPanel() {
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2 className="panel-title">Methodology</h2>
          <p className="panel-subtitle">
            Full methodological note for the school prioritization scoring module.
          </p>
        </div>
      </div>
      <div className="panel-body">
        <article className="methodology-doc">
          <h1>Methodology for the School Prioritization Scoring Module</h1>

          <section>
            <h2>1. Purpose</h2>
            <p>
              This platform is designed to support transparent, configurable, and evidence-based
              prioritization of schools for further review, investment, or intervention. It
              implements a two-stage scoring framework:
            </p>
            <ol className="methodology-list methodology-ordered">
              <li>
                <strong>Need score</strong>: a composite indicator intended to capture the relative
                intensity of need at each school.
              </li>
              <li>
                <strong>Priority score</strong>: a decision-oriented score that combines need with
                additional operational or strategic considerations used by the programme.
              </li>
            </ol>
            <p>
              This structure follows established practice in composite-indicator design: define a
              clear theoretical framework, select indicators that correspond to that framework,
              normalize variables measured on different scales, document the weighting and
              aggregation rules, and test the robustness of rankings to alternative assumptions.
              OECD and the European Commission’s Joint Research Centre recommend exactly this
              sequence for policy-facing composite indicators. The same sources also stress that
              results can change depending on normalization, weighting, and aggregation choices, so
              these choices must be explicit and reviewable.
            </p>
          </section>

          <section>
            <h2>2. Conceptual Framework</h2>
            <p>
              The module treats school prioritization as a <strong>multi-criteria decision problem</strong>{" "}
              rather than a single-variable ranking. In practice, education infrastructure
              decisions are rarely driven by one measure alone. They usually depend on a combination
              of:
            </p>
            <ul className="methodology-list">
              <li>the scale of the service gap,</li>
              <li>the condition and adequacy of the facility,</li>
              <li>the number of learners potentially affected,</li>
              <li>accessibility constraints,</li>
              <li>environmental or hazard exposure, and</li>
              <li>implementation realities such as geographic coverage, policy relevance, or readiness.</li>
            </ul>
            <p>
              This is consistent with education planning guidance that recommends analyzing the{" "}
              <strong>network of schools</strong>, the characteristics of the population served,
              accessibility conditions, and the wider area of influence of an education project
              rather than evaluating a school in isolation. It is also consistent with more recent
              UNESCO guidance that uses geospatial multi-criteria methods to assess natural-hazard
              risks in educational-facility planning.
            </p>
            <p>Accordingly, the platform separates two questions:</p>
            <ul className="methodology-list">
              <li>
                <strong>How much need is present?</strong> → answered by the <strong>Need score</strong>.
              </li>
              <li>
                <strong>Given that need, which schools should rise first in the queue for action?</strong>{" "}
                → answered by the <strong>Priority score</strong>.
              </li>
            </ul>
            <p>
              This separation is important because the school with the greatest deprivation is not
              always the first one that a programme can or should fund. A transparent system should
              distinguish <strong>need</strong> from <strong>decision priority</strong>.
            </p>
          </section>

          <section>
            <h2>3. Unit of Analysis</h2>
            <p>
              The primary unit of analysis is the <strong>individual school</strong>. Each school is
              represented by a record containing school-level indicators and, where relevant,
              contextual indicators joined from higher-level geographies such as districts or
              catchments.
            </p>
            <p>
              Where school-level administrative data are incomplete, the module can incorporate
              contextual variables derived from geospatial or district-level sources. This is
              consistent with UNESCO’s school-age-population methodology and related geospatial
              education-planning work, which show that spatialized population and contextual data
              can be used to strengthen planning where conventional information systems are weak or
              outdated.
            </p>
          </section>

          <section>
            <h2>4. Data Domains Used by the Scoring Framework</h2>
            <p>
              The exact variables may differ by country or programme, but the methodology assumes
              that indicators are grouped into domains. The most common domains in this project are:
            </p>

            <h3>4.1 Demand and Service Pressure</h3>
            <p>
              These indicators capture the potential size of the affected student population or
              pressure on the school system. Depending on data availability, they may include
              enrollment, estimated school-age population in the surrounding area, overcrowding
              proxies, or other indicators of unmet demand. Education-project appraisal guidance
              recommends considering both current and projected demand, including population by age
              group and the location of the affected population.
            </p>

            <h3>4.2 Infrastructure Adequacy and Service Deficits</h3>
            <p>
              These indicators capture whether the school lacks the facilities, space, or services
              required to provide adequate education. Typical examples include classroom shortages,
              poor building conditions, lack of permanent structures, weak WASH coverage, or
              missing support spaces. Global guidance from WHO and UNICEF emphasizes that safe
              water, toilets, and handwashing facilities are fundamental to healthy and inclusive
              learning environments, while the World Bank’s RIGHT+ framework places resilience,
              inclusiveness, health, and teaching-and-learning functionality at the center of
              education-facility investment decisions.
            </p>

            <h3>4.3 Accessibility and Geographic Disadvantage</h3>
            <p>
              These indicators capture whether the school is hard to reach or serves populations
              facing significant travel or access constraints. The World Bank’s educational
              infrastructure methodology explicitly recommends accounting for accessibility
              conditions, road quality, the wider area of influence, and the location of the target
              population when assessing education projects.
            </p>

            <h3>4.4 Hazard and Environmental Exposure</h3>
            <p>
              These indicators capture the degree to which the school or its surrounding service
              area is exposed to hazards such as flooding or other environmental constraints.
              UNESCO and the World Bank both emphasize that school planning and rehabilitation
              should account for natural hazards and climate resilience, not just present-day
              service coverage.
            </p>

            <h3>4.5 Strategic or Implementation Factors</h3>
            <p>
              These indicators are not measures of deprivation themselves. Instead, they affect
              sequencing. Examples may include programme readiness, geographic balancing rules,
              policy focus areas, or other operational criteria defined by the implementing agency.
              These variables belong in the <strong>Priority score</strong>, not the{" "}
              <strong>Need score</strong>.
            </p>
          </section>

          <section>
            <h2>5. Data Preparation</h2>

            <h3>5.1 Record Linkage and Harmonization</h3>
            <p>
              The module first reconciles school identifiers and geographies so that school-level
              records can be joined with contextual layers. This may include matching school names,
              coordinates, administrative units, or other identifiers.
            </p>

            <h3>5.2 Indicator Directionality</h3>
            <p>Each indicator is assigned a direction:</p>
            <ul className="methodology-list">
              <li>
                <strong>Higher means more need</strong>, or
              </li>
              <li>
                <strong>Higher means less need</strong>.
              </li>
            </ul>
            <p>
              Indicators where higher values imply better conditions are reversed before
              aggregation so that all normalized indicators point in the same conceptual direction.
            </p>

            <h3>5.3 Missing Values</h3>
            <p>
              Missing values are handled conservatively. The module should{" "}
              <strong>not automatically impute structural school-stock variables</strong> such as
              classroom counts, teacher counts, or numbers of facilities unless there is a strong
              empirical basis for doing so. In school datasets, a missing value can mean
              “unknown,” not zero, and mechanical imputation can create false precision.
            </p>
            <p>
              The OECD/JRC handbook treats missing-data imputation as a distinct methodological step
              that materially affects rankings and therefore must be documented and tested. For this
              reason, the recommended default for this module is:
            </p>
            <ul className="methodology-list">
              <li>avoid unconditional imputation for school infrastructure stock variables,</li>
              <li>calculate sub-scores only from the indicators that are genuinely observed,</li>
              <li>keep explicit completeness flags, and</li>
              <li>expose data-coverage diagnostics alongside the scores.</li>
            </ul>
            <p>
              Where the programme later chooses to impute a variable, the method should be declared
              in configuration and reflected in sensitivity testing.
            </p>
          </section>

          <section>
            <h2>6. Normalization</h2>
            <p>
              Because the indicators come in different units and scales, they must be normalized
              before aggregation. OECD/JRC guidance recommends normalization as a core step in
              composite-indicator construction and notes that different normalization methods can
              yield different results.
            </p>
            <p>
              For this module, the default approach is <strong>min-max normalization</strong> onto
              a 0-1 scale:
            </p>
            <p>For indicators where higher values mean greater need:</p>
            <MathBlock expression={`s_{ij} = \\frac{x_{ij} - \\min_j}{\\max_j - \\min_j}`} />
            <p>For indicators where higher values mean lower need:</p>
            <MathBlock expression={`s_{ij} = \\frac{\\max_j - x_{ij}}{\\max_j - \\min_j}`} />
            <p>Where:</p>
            <ul className="methodology-list">
              <li>`x_ij` is the raw value of indicator `j` for school `i`,</li>
              <li>`s_ij` is the normalized value,</li>
              <li>`min_j` and `max_j` are the lower and upper bounds used for that indicator.</li>
            </ul>

            <h3>6.1 Choice of Bounds</h3>
            <p>
              By default, bounds are estimated from the analysis dataset after outlier review. In
              production deployments, the preferred approach is to store the chosen bounds in
              configuration so that scores remain stable across reruns unless the programme
              intentionally recalibrates the model.
            </p>

            <h3>6.2 Outlier Handling</h3>
            <p>
              If indicators contain strong outliers, the implementation may winsorize or cap
              extreme values before normalization. This should be documented because OECD/JRC
              guidance notes that normalization choices and outlier treatment can alter rankings.
            </p>
          </section>

          <section>
            <h2>7. Need Score Construction</h2>
            <p>
              The <strong>Need score</strong> is the project’s composite measure of deprivation,
              vulnerability, or service shortfall at the school level.
            </p>

            <h3>7.1 Domain Sub-scores</h3>
            <p>
              Indicators are first grouped into domains. Within each domain, the normalized
              indicators are combined using configurable weights.
            </p>
            <p>For school `i` and domain `d`:</p>
            <MathBlock expression={`\\mathrm{DomainScore}_{id} = \\sum_j \\left(w_{jd} \\cdot s_{ij}\\right)`} />
            <p>subject to:</p>
            <MathBlock expression={`\\sum_j w_{jd} = 1`} />
            <p>where `w_jd` is the weight of indicator `j` within domain `d`.</p>

            <h3>7.2 Aggregation Across Domains</h3>
            <p>
              The Need score is then calculated as a weighted combination of the domain sub-scores:
            </p>
            <MathBlock expression={`\\mathrm{Need}_i = \\sum_d \\left(W_d \\cdot \\mathrm{DomainScore}_{id}\\right)`} />
            <p>subject to:</p>
            <MathBlock expression={`\\sum_d W_d = 1`} />
            <p>where `W_d` is the weight assigned to domain `d`.</p>

            <h3>7.3 Interpretation</h3>
            <p>
              A higher Need score means that, relative to other schools in the analysis set, the
              school exhibits a larger concentration of disadvantage, service deficits,
              vulnerability, or unmet demand.
            </p>

            <h3>7.4 Weighting Principle</h3>
            <p>
              The app’s <strong>default weights are programme parameters</strong>, not universal
              truths. They are therefore stored outside the code path as configuration so they can
              be reviewed and adjusted. This follows composite-indicator good practice: weighting
              should be explicit, theoretically grounded, and open to sensitivity testing rather
              than hidden inside implementation logic.
            </p>
          </section>

          <section>
            <h2>8. Priority Score Construction</h2>
            <p>
              The <strong>Priority score</strong> is the module’s final sequencing metric. It
              combines the Need score with additional decision factors that the programme considers
              relevant for action.
            </p>
            <p>The generic structure is:</p>
            <MathBlock expression={`\\mathrm{Priority}_i = \\alpha \\cdot \\mathrm{Need}_i + \\sum_k \\left(\\beta_k \\cdot p_{ik}\\right)`} />
            <p>subject to:</p>
            <MathBlock expression={`\\alpha + \\sum_k \\beta_k = 1`} />
            <p>where:</p>
            <ul className="methodology-list">
              <li>`Need_i` is the Need score,</li>
              <li>`p_ik` are normalized strategic or operational factors for school `i`, and</li>
              <li>`α` and `β_k` are configurable weights.</li>
            </ul>
            <p>
              Examples of `p_ik` may include geographic balancing, implementation readiness, policy
              alignment, or contextual constraints defined by the programme.
            </p>

            <h3>8.1 Why Separate Priority from Need</h3>
            <p>Separating these two scores improves interpretability:</p>
            <ul className="methodology-list">
              <li>
                a school can have <strong>high need but lower immediate priority</strong> if
                implementation constraints are severe;
              </li>
              <li>
                a school can have <strong>moderately high need but high priority</strong> if it is
                strategically important, ready for intervention, or critical for equitable
                geographic coverage.
              </li>
            </ul>
            <p>
              This prevents a common problem in prioritization tools: mixing deprivation variables
              and implementation filters into one opaque number.
            </p>
          </section>

          <section>
            <h2>9. Ranking and Selection</h2>
            <p>After both scores are computed, schools can be ranked in several ways:</p>
            <ul className="methodology-list">
              <li>by <strong>Need score</strong> only,</li>
              <li>by <strong>Priority score</strong> only,</li>
              <li>by <strong>domain sub-scores</strong> to identify the specific reason a school scores highly,</li>
              <li>or by threshold-based filters before ranking.</li>
            </ul>
            <p>The recommended operational practice is:</p>
            <ol className="methodology-list methodology-ordered">
              <li>use <strong>Need score</strong> to understand the problem landscape,</li>
              <li>use <strong>Priority score</strong> to create the implementation shortlist,</li>
              <li>review the shortlist with domain experts before final funding decisions.</li>
            </ol>
            <p>
              The module therefore supports decision-making, but does not replace policy review or
              engineering validation.
            </p>
          </section>

          <section>
            <h2>10. Robustness, Sensitivity, and Transparency</h2>
            <p>
              OECD/JRC guidance strongly recommends robustness and sensitivity analysis for
              composite indicators because rankings may shift when assumptions change. This applies
              directly to school prioritization.
            </p>
            <p>Accordingly, the platform should support the following checks:</p>

            <h3>10.1 Weight Sensitivity</h3>
            <p>
              Recompute the ranking under alternative weight sets to assess whether the same schools
              remain near the top.
            </p>

            <h3>10.2 Normalization Sensitivity</h3>
            <p>Compare results under alternative normalization choices where appropriate.</p>

            <h3>10.3 Missing-data Sensitivity</h3>
            <p>
              Check whether the ranking changes materially when schools with low data completeness
              are excluded or when optional imputation rules are applied.
            </p>

            <h3>10.4 Correlation Diagnostics</h3>
            <p>
              Report the correlation between Need and Priority and between each domain score and the
              final rankings. This helps users understand whether the final prioritization is still
              primarily driven by need or is being materially reshaped by strategic filters.
            </p>

            <h3>10.5 Explainability Outputs</h3>
            <p>For every school, the platform should retain:</p>
            <ul className="methodology-list">
              <li>raw indicator values,</li>
              <li>normalized indicator values,</li>
              <li>domain sub-scores,</li>
              <li>final Need score,</li>
              <li>final Priority score,</li>
              <li>data completeness flags, and</li>
              <li>the active weight configuration used to produce the result.</li>
            </ul>
            <p>These outputs make the ranking auditable.</p>
          </section>

          <section>
            <h2>11. Treatment of Geographic Context</h2>
            <p>
              Where direct school-level data are incomplete, the module may attach contextual
              measures from district or raster-based layers, such as flood exposure, land cover,
              local service environment, or estimated school-age population. This is
              methodologically justified when the objective is to approximate the environment in
              which the school operates, especially in low-data contexts. UNESCO’s geospatial
              planning work explicitly supports combining school locations with school-age
              population estimates and spatial contextual layers for educational planning.
            </p>
            <p>
              However, contextual indicators should be interpreted as <strong>context around the
              school</strong>, not as direct measurements of the school facility itself. The
              methodology therefore keeps them conceptually separate from observed school-stock
              variables.
            </p>
          </section>

          <section>
            <h2>12. Governance and Configuration</h2>
            <p>
              To keep the methodology transparent and maintainable, the implementation should
              externalize the following parameters:
            </p>
            <ul className="methodology-list">
              <li>indicator definitions,</li>
              <li>domain assignments,</li>
              <li>indicator directionality,</li>
              <li>normalization method,</li>
              <li>lower and upper bounds,</li>
              <li>indicator weights,</li>
              <li>domain weights,</li>
              <li>priority-factor weights,</li>
              <li>missing-data rules, and</li>
              <li>any inclusion or exclusion filters.</li>
            </ul>
            <p>
              This ensures that programme teams can revise assumptions without rewriting the
              scoring logic.
            </p>
          </section>

          <section>
            <h2>13. Limitations</h2>
            <p>
              This methodology is designed for <strong>structured prioritization</strong>, not for
              fully automated decision-making. Its main limitations are:
            </p>
            <ul className="methodology-list">
              <li>rankings depend on the quality and coverage of the underlying data;</li>
              <li>results are sensitive to weighting and normalization choices;</li>
              <li>some contextual proxies cannot fully replace school-level observations;</li>
              <li>
                the score identifies relative priority within the analysis set, not absolute need in
                a universal sense;
              </li>
              <li>final investment decisions still require engineering, fiduciary, and policy review.</li>
            </ul>
            <p>
              These limitations are normal for composite prioritization tools and are one reason
              transparency, sensitivity testing, and human review are central to the design.
            </p>
          </section>

          <section>
            <h2>References</h2>
            <ul className="methodology-list">
              <li>
                Fernández, R., D’Ayala, D., Turró, M., and colleagues. (2023). <em>A decision-making
                framework for school infrastructure improvement programs</em>. International Journal
                of Disaster Resilience in the Built Environment.
              </li>
              <li>
                Gagnon, A. A., and Vargas Mesa, G. (2021). <em>Estimating school-age populations by
                applying Sprague multipliers to raster data</em>. IIEP-UNESCO.
              </li>
              <li>
                Gagnon, A., Vargas Mesa, G., and Sheldon, A. (2024). <em>Multi-criteria decision
                analysis for site classification: Assessing natural hazard risks for planning the
                location of educational facilities</em>. IIEP-UNESCO.
              </li>
              <li>
                OECD and Joint Research Centre of the European Commission. (2008). <em>Handbook on
                Constructing Composite Indicators: Methodology and User Guide</em>. OECD Publishing.
              </li>
              <li>
                WHO and UNICEF. (2022). <em>Schools ill-equipped to provide healthy and inclusive
                learning environments for all children</em>. Joint news release.
              </li>
              <li>
                World Bank. (2016). <em>Simplified Methodology for Educational Infrastructure
                Projects</em>.
              </li>
              <li>
                World Bank. (2024). <em>Building Safer and More Resilient Schools in a Changing
                Climate</em>.
              </li>
              <li>
                World Bank. (2025). <em>RIGHT+ Framework for Physical Learning Environments:
                Maximizing Investment Impact in Education Spaces and Facilities</em>.
              </li>
            </ul>
          </section>
        </article>
      </div>
    </section>
  );
}
