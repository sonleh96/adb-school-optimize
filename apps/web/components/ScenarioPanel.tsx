"use client";

import { useEffect, useMemo, useState } from "react";

import { fetchScenarios, runScenario } from "@/lib/api";
import type { ScenarioRecord, SchoolRecord } from "@/lib/types";

const DEFAULT_OVERRIDES = {
  need: { S: 0.55, A: 0.25, R_phys: 0.2 },
  priority: { Need: 0.7, I: 0.2, P: 0.1 },
};

export function ScenarioPanel() {
  const [scenarios, setScenarios] = useState<ScenarioRecord[]>([]);
  const [scenarioName, setScenarioName] = useState("Scenario Lab Run");
  const [description, setDescription] = useState("Interactive run from frontend scaffold.");
  const [weightOverridesText, setWeightOverridesText] = useState(
    JSON.stringify(DEFAULT_OVERRIDES, null, 2)
  );
  const [topRows, setTopRows] = useState<SchoolRecord[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    fetchScenarios()
      .then(setScenarios)
      .catch((err: Error) => setError(err.message));
  }, []);

  const scenarioCountLabel = useMemo(() => `${scenarios.length} saved scenarios`, [scenarios.length]);

  async function handleRunScenario() {
    setRunning(true);
    setError(null);
    setStatus(null);
    try {
      const weight_overrides = JSON.parse(weightOverridesText) as Record<string, unknown>;
      const result = await runScenario({
        scenario_name: scenarioName,
        description,
        weight_overrides,
        persist: true,
        is_default: false,
        created_by: "frontend",
      });
      setTopRows(result.top_rows);
      setWarnings(result.warnings);
      setStatus(
        result.scenario
          ? `Saved scenario "${result.scenario.scenario_name}" and refreshed top-ranked schools.`
          : "Ran scenario without persistence."
      );
      const latest = await fetchScenarios();
      setScenarios(latest);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run scenario.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2 className="panel-title">Scenario Lab</h2>
          <p className="panel-subtitle">
            Run persisted scoring scenarios against the seeded school dataset. This initial UI uses
            JSON overrides so the full scoring surface can be exercised immediately.
          </p>
        </div>
      </div>

      <div className="panel-body">
        <div className="two-up">
          <article className="panel">
            <div className="panel-head">
              <div>
                <h3 className="panel-title">Run A Scenario</h3>
                <p className="panel-subtitle">Submit weight overrides to the FastAPI scoring endpoint.</p>
              </div>
            </div>
            <div className="panel-body">
              <div className="controls">
                <div className="control" style={{ minWidth: "100%" }}>
                  <label htmlFor="scenarioName">Scenario name</label>
                  <input
                    id="scenarioName"
                    value={scenarioName}
                    onChange={(event) => setScenarioName(event.target.value)}
                  />
                </div>
                <div className="control" style={{ minWidth: "100%" }}>
                  <label htmlFor="scenarioDescription">Description</label>
                  <input
                    id="scenarioDescription"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                  />
                </div>
                <div className="control" style={{ minWidth: "100%" }}>
                  <label htmlFor="weightOverrides">Weight overrides JSON</label>
                  <textarea
                    id="weightOverrides"
                    value={weightOverridesText}
                    onChange={(event) => setWeightOverridesText(event.target.value)}
                  />
                </div>
                <div className="action-row">
                  <button className="button button-primary" type="button" onClick={handleRunScenario} disabled={running}>
                    {running ? "Running…" : "Run And Save Scenario"}
                  </button>
                </div>
              </div>
              {status ? <p className="small-copy">{status}</p> : null}
              {warnings.length ? (
                <div className="empty">
                  <strong>Warnings</strong>
                  <ul className="methodology-list">
                    {warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {error ? <div className="error">{error}</div> : null}
            </div>
          </article>

          <article className="panel">
            <div className="panel-head">
              <div>
                <h3 className="panel-title">Saved Scenarios</h3>
                <p className="panel-subtitle">{scenarioCountLabel}</p>
              </div>
            </div>
            <div className="panel-body">
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Default</th>
                      <th>Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scenarios.map((scenario) => (
                      <tr className="data-row" key={scenario.scenario_id}>
                        <td>{scenario.scenario_name}</td>
                        <td>{scenario.is_default ? "Yes" : "No"}</td>
                        <td>{scenario.updated_at ? new Date(scenario.updated_at).toLocaleString() : "n/a"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </article>
        </div>

        <article className="panel" style={{ marginTop: 16 }}>
          <div className="panel-head">
            <div>
              <h3 className="panel-title">Scenario Result Preview</h3>
              <p className="panel-subtitle">Top-ranked schools returned by the latest run.</p>
            </div>
          </div>
          <div className="panel-body">
            {topRows.length ? (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>School</th>
                      <th>District</th>
                      <th>Priority</th>
                      <th>Need</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topRows.map((row) => (
                      <tr className="data-row" key={`${row.school_name}-${row.district}`}>
                        <td>{row.school_name}</td>
                        <td>{row.district}</td>
                        <td>{row.priority != null ? (row.priority * 100).toFixed(1) : "n/a"}</td>
                        <td>{row.need != null ? (row.need * 100).toFixed(1) : "n/a"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty">Run a scenario to preview the recalculated shortlist.</div>
            )}
          </div>
        </article>
      </div>
    </section>
  );
}
