export function MethodologyPanel() {
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2 className="panel-title">Methodology</h2>
          <p className="panel-subtitle">
            Short implementation-facing summary of the current prioritization logic and source data.
          </p>
        </div>
      </div>
      <div className="panel-body">
        <div className="two-up">
          <article className="detail-card">
            <h3>Core Logic</h3>
            <ul className="methodology-list">
              <li>School-level proxy score `S` combines remoteness, access, teacher scarcity, classrooms, and service readiness.</li>
              <li>Administrative context `A` combines access, connectivity, progression, socioeconomic proxies, and conflict exposure.</li>
              <li>`Need` combines `S`, `A`, `R_phys`, and the girls bonus `G`.</li>
              <li>`Priority` combines `Need`, impact `I`, and practicality `P`.</li>
            </ul>
          </article>
          <article className="detail-card">
            <h3>Current Sources</h3>
            <ul className="methodology-list">
              <li>School-level CSV loaded into `schools`.</li>
              <li>District GeoJSON loaded into `districts`.</li>
              <li>Scenarios and ranks persisted in `scoring_scenarios` and `school_scores`.</li>
              <li>Raster layers are registered, but clipping/rendering still needs implementation.</li>
            </ul>
          </article>
          <article className="detail-card">
            <h3>Defaults</h3>
            <ul className="methodology-list">
              <li>School explorer defaults to National Capital District.</li>
              <li>District explorer defaults to Average AQI.</li>
              <li>Exports return the full ranked list for the active scenario.</li>
              <li>Selection is single-select in v1.</li>
            </ul>
          </article>
          <article className="detail-card">
            <h3>What Still Needs Buildout</h3>
            <ul className="methodology-list">
              <li>Real raster overlays from Cloud Run/GCS.</li>
              <li>Richer scoring controls than JSON overrides.</li>
              <li>Map screenshots and styled reporting outputs.</li>
              <li>Government-facing UX and access control for later phases.</li>
            </ul>
          </article>
        </div>
      </div>
    </section>
  );
}
