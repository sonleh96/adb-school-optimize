"use client";

import { useEffect, useMemo, useState } from "react";

import { fetchSchools, fetchScenarios, getApiBaseUrl, runScenario } from "@/lib/api";
import { SELECTED_SCENARIO_STORAGE_KEY } from "@/lib/scenarioSelection";
import type { ScenarioRecord, SchoolRecord } from "@/lib/types";

const DEFAULT_OVERRIDES = {
  need: { S: 0.55, A: 0.25, R_phys: 0.2 },
  priority: { Need: 0.7, I: 0.2, P: 0.1 },
};

export function ScenarioPanel() {
  const [scenarios, setScenarios] = useState<ScenarioRecord[]>([]);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(null);
  const [scenarioName, setScenarioName] = useState("Scenario Lab Run");
  const [description, setDescription] = useState("Interactive run from frontend scaffold.");
  const [weightOverridesText, setWeightOverridesText] = useState(JSON.stringify(DEFAULT_OVERRIDES, null, 2));
  const [previewRows, setPreviewRows] = useState<SchoolRecord[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const scenarioCountLabel = useMemo(() => `${scenarios.length} saved scenarios`, [scenarios.length]);

  useEffect(() => {
    async function initialize() {
      try {
        const savedScenarios = await fetchScenarios();
        setScenarios(savedScenarios);
        const persistedId = window.localStorage.getItem(SELECTED_SCENARIO_STORAGE_KEY);
        if (persistedId) {
          const persistedScenario = savedScenarios.find((scenario) => scenario.scenario_id === persistedId);
          if (persistedScenario) {
            await loadScenario(persistedScenario);
            return;
          }
        }
        await loadPreviewRows();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to initialize Scenario Lab.");
      }
    }

    void initialize();
  }, []);

  async function loadPreviewRows(scenarioId?: string) {
    setLoadingPreview(true);
    try {
      const rows = await fetchSchools({ scenarioId, limit: 10000 });
      setPreviewRows(rows);
    } finally {
      setLoadingPreview(false);
    }
  }

  async function loadScenario(scenario: ScenarioRecord) {
    setSelectedScenarioId(scenario.scenario_id);
    setScenarioName(scenario.scenario_name);
    setDescription(scenario.description ?? "");
    setWeightOverridesText(JSON.stringify(scenario.weights ?? DEFAULT_OVERRIDES, null, 2));
    window.localStorage.setItem(SELECTED_SCENARIO_STORAGE_KEY, scenario.scenario_id);
    await loadPreviewRows(scenario.scenario_id);
    setStatus(`Loaded scenario "${scenario.scenario_name}".`);
  }

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

      setWarnings(result.warnings);
      setStatus(
        result.scenario
          ? `Saved scenario "${result.scenario.scenario_name}" and refreshed all school results.`
          : "Ran scenario without persistence."
      );

      const latest = await fetchScenarios();
      setScenarios(latest);

      if (result.scenario) {
        const saved = latest.find((scenario) => scenario.scenario_id === result.scenario?.scenario_id);
        if (saved) {
          await loadScenario(saved);
        } else {
          await loadPreviewRows(result.scenario.scenario_id);
        }
      } else {
        await loadPreviewRows();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run scenario.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className="panel scenario-lab">
      <div className="panel-head">
        <div>
          <h2 className="panel-title">Scenario Lab</h2>
          <p className="panel-subtitle">
            Run persisted scoring scenarios against the seeded school dataset. This initial UI uses
            JSON overrides so the full scoring surface can be exercised immediately.
          </p>
        </div>
        <div className="scenario-data-actions">
          <p className="scenario-data-label">Data</p>
          <div className="scenario-data-buttons">
            <a className="button button-secondary" href={`${getApiBaseUrl()}/api/v1/exports/scores.xlsx`}>
              Scores
            </a>
            <a className="button button-secondary" href={`${getApiBaseUrl()}/api/v1/exports/full.xlsx`}>
              Full
            </a>
          </div>
        </div>
      </div>

      <div className="panel-body scenario-lab-body">
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
              <div className="table-wrap table-wrap-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Default</th>
                      <th>Updated</th>
                      <th aria-label="Download column" />
                    </tr>
                  </thead>
                  <tbody>
                    {scenarios.map((scenario) => (
                      <tr
                        className="data-row"
                        key={scenario.scenario_id}
                        data-selected={scenario.scenario_id === selectedScenarioId}
                        onClick={() => void loadScenario(scenario)}
                      >
                        <td>{scenario.scenario_name}</td>
                        <td>{scenario.is_default ? "Yes" : "No"}</td>
                        <td>{scenario.updated_at ? new Date(scenario.updated_at).toLocaleString() : "n/a"}</td>
                        <td className="download-cell">
                          <a
                            className="icon-download-link"
                            href={`${getApiBaseUrl()}/api/v1/exports/scores.xlsx?scenario_id=${scenario.scenario_id}`}
                            title={`Download ${scenario.scenario_name}`}
                            onClick={(event) => event.stopPropagation()}
                          >
                            ⬇
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </article>
        </div>

        <article className="panel scenario-preview-panel" style={{ marginTop: 16 }}>
          <div className="panel-head">
            <div>
              <h3 className="panel-title">Scenario Result Preview</h3>
              <p className="panel-subtitle">All schools for the selected scenario result set.</p>
            </div>
          </div>
          <div className="panel-body">
            {loadingPreview ? (
              <div className="loading">Loading scenario results…</div>
            ) : previewRows.length ? (
              <div className="table-wrap scenario-preview-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Rank</th>
                      <th>School</th>
                      <th>District</th>
                      <th>Priority</th>
                      <th>Need</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row) => (
                      <tr className="data-row" key={`${row.school_id ?? row.school_name}-${row.district}`}>
                        <td>{row.rank_priority ?? "n/a"}</td>
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
              <div className="empty">Run or select a scenario to preview all recalculated school results.</div>
            )}
          </div>
        </article>
      </div>
    </section>
  );
}
