"use client";

import { useEffect, useMemo, useState } from "react";

import { fetchSchools, fetchScenarios, getApiBaseUrl, runScenario } from "@/lib/api";
import { SELECTED_SCENARIO_STORAGE_KEY } from "@/lib/scenarioSelection";
import { buildWeightGroups, displayWeightLabel } from "@/lib/scenarioWeights";
import type { ScenarioRecord, SchoolRecord } from "@/lib/types";

type WeightOverrides = Record<string, Record<string, number>>;

const DEFAULT_OVERRIDES: WeightOverrides = {
  need: { S: 0.55, A: 0.25, R_phys: 0.2 },
  priority: { Need: 0.7, I: 0.2, P: 0.1 },
};

export function ScenarioPanel() {
  const [scenarios, setScenarios] = useState<ScenarioRecord[]>([]);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(null);
  const [scenarioName, setScenarioName] = useState("Scenario Lab Run");
  const [description, setDescription] = useState("Interactive run from frontend scaffold.");
  const [weightOverrides, setWeightOverrides] = useState<WeightOverrides>(DEFAULT_OVERRIDES);
  const [previewRows, setPreviewRows] = useState<SchoolRecord[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const scenarioCountLabel = useMemo(() => `${scenarios.length} saved scenarios`, [scenarios.length]);
  const selectedScenario = useMemo(
    () => scenarios.find((scenario) => scenario.scenario_id === selectedScenarioId) ?? null,
    [scenarios, selectedScenarioId]
  );
  const weightGroups = useMemo(() => buildWeightGroups(selectedScenario?.weights), [selectedScenario?.weights]);
  const weightOverridesText = useMemo(() => JSON.stringify(weightOverrides, null, 2), [weightOverrides]);
  const editableWeightGroups = useMemo(() => buildEditableWeightGroups(weightOverrides), [weightOverrides]);

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
    setWeightOverrides(normalizeWeightOverrides(scenario.weights));
    window.localStorage.setItem(SELECTED_SCENARIO_STORAGE_KEY, scenario.scenario_id);
    await loadPreviewRows(scenario.scenario_id);
    setStatus(`Loaded scenario "${scenario.scenario_name}".`);
  }

  async function handleRunScenario() {
    setRunning(true);
    setError(null);
    setStatus(null);
    try {
      const result = await runScenario({
        scenario_name: scenarioName,
        description,
        weight_overrides: weightOverrides,
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

  function updateWeight(groupKey: string, entryKey: string, nextPercent: number) {
    setWeightOverrides((current) => {
      const group = current[groupKey];
      if (!group) return current;
      const keys = Object.keys(group);
      if (!keys.includes(entryKey)) return current;

      const clamped = clamp(nextPercent / 100, 0, 1);
      if (keys.length === 1) {
        return {
          ...current,
          [groupKey]: { [entryKey]: 1 },
        };
      }

      const remaining = clamp(1 - clamped, 0, 1);
      const otherKeys = keys.filter((key) => key !== entryKey);
      const othersTotal = otherKeys.reduce((sum, key) => sum + finite(group[key]), 0);

      const nextGroup: Record<string, number> = { ...group, [entryKey]: clamped };
      if (othersTotal <= 0) {
        const evenShare = remaining / otherKeys.length;
        for (const key of otherKeys) nextGroup[key] = evenShare;
      } else {
        for (const key of otherKeys) nextGroup[key] = (finite(group[key]) / othersTotal) * remaining;
      }

      return {
        ...current,
        [groupKey]: nextGroup,
      };
    });
  }

  function resetGroup(groupKey: string) {
    const defaults = normalizeWeightOverrides(DEFAULT_OVERRIDES);
    setWeightOverrides((current) => {
      if (defaults[groupKey]) {
        return { ...current, [groupKey]: defaults[groupKey] };
      }
      const existing = current[groupKey];
      if (!existing) return current;
      const keys = Object.keys(existing);
      if (!keys.length) return current;
      const evenShare = 1 / keys.length;
      const normalized = Object.fromEntries(keys.map((key) => [key, evenShare]));
      return { ...current, [groupKey]: normalized };
    });
  }

  function resetAll() {
    setWeightOverrides(normalizeWeightOverrides(DEFAULT_OVERRIDES));
  }

  return (
    <section className="panel scenario-lab">
      <div className="panel-head">
        <div>
          <h2 className="panel-title">Scenario Lab</h2>
          <p className="panel-subtitle">
            Run persisted scoring scenarios against the seeded school dataset using interactive
            weight controls.
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
          <article className="panel scenario-run-panel">
            <div className="panel-head">
              <div>
                <h3 className="panel-title">Run A Scenario</h3>
                <p className="panel-subtitle">Submit weight overrides to the FastAPI scoring endpoint.</p>
              </div>
            </div>
            <div className="panel-body scenario-run-panel-body">
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
                  <label>Weight Builder</label>
                  <div className="scenario-weight-builder-header">
                    <p className="small-copy">Use sliders or percentage inputs. Each group automatically sums to 100%.</p>
                    <button className="button button-secondary" type="button" onClick={resetAll}>
                      Reset all
                    </button>
                  </div>
                  <div className="scenario-weight-builder">
                    {editableWeightGroups.map((group) => (
                      <article className="detail-card scenario-weight-editor-card" key={group.key}>
                        <div className="scenario-weight-editor-card-head">
                          <h4>{group.label}</h4>
                          <button className="button button-secondary" type="button" onClick={() => resetGroup(group.key)}>
                            Reset group
                          </button>
                        </div>
                        <div className="scenario-weight-editor-list">
                          {group.entries.map((entry) => (
                            <div className="scenario-weight-editor-row" key={`${group.key}-${entry.key}`}>
                              <label className="scenario-weight-editor-label">{entry.label}</label>
                              <input
                                className="scenario-weight-slider"
                                type="range"
                                min={0}
                                max={100}
                                step={0.1}
                                value={entry.percent}
                                onChange={(event) => updateWeight(group.key, entry.key, Number(event.target.value))}
                              />
                              <input
                                className="scenario-weight-number"
                                type="number"
                                min={0}
                                max={100}
                                step={0.1}
                                value={entry.percent.toFixed(1)}
                                onChange={(event) => updateWeight(group.key, entry.key, Number(event.target.value))}
                              />
                              <span className="scenario-weight-percent">%</span>
                            </div>
                          ))}
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
                <div className="control" style={{ minWidth: "100%" }}>
                  <label htmlFor="weightOverridesPreview">Weight overrides JSON (preview)</label>
                  <textarea
                    className="scenario-json-preview"
                    id="weightOverridesPreview"
                    value={weightOverridesText}
                    readOnly
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

              <div className="scenario-inline-preview">
                <div className="scenario-inline-preview-header">
                  <h4 className="panel-title">Scenario Result Preview</h4>
                  <p className="panel-subtitle">All schools for the selected scenario result set.</p>
                </div>
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
            </div>
          </article>

          <div className="sidebar-stack">
            <article className="panel">
              <div className="panel-head">
                <div>
                  <h3 className="panel-title">Saved Scenarios</h3>
                  <p className="panel-subtitle">{scenarioCountLabel}</p>
                </div>
              </div>
              <div className="panel-body">
                <div className="table-wrap table-wrap-scroll scenario-saved-table-wrap">
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

            <article className="panel">
              <div className="panel-head">
                <div>
                  <h3 className="panel-title">Selected Scenario Weights</h3>
                  <p className="panel-subtitle">
                    {selectedScenario
                      ? `Currently showing "${selectedScenario.scenario_name}".`
                      : "Select a saved scenario to inspect its component weights."}
                  </p>
                </div>
              </div>
              <div className="panel-body">
                {weightGroups.length ? (
                  <div className="scenario-weight-grid">
                    {weightGroups.map((group) => (
                      <div className="detail-card" key={group.label}>
                        <h4>{group.label}</h4>
                        <div className="methodology-weight-list">
                          {group.entries.map((entry) => (
                            <div className="methodology-weight-item" key={`${group.label}-${entry.key}`}>
                              <span>{entry.label}</span>
                              <strong>{entry.value}</strong>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="empty">Select a saved scenario to inspect its component weights.</div>
                )}
              </div>
            </article>
          </div>
        </div>
      </div>
    </section>
  );
}

type EditableWeightGroup = {
  key: string;
  label: string;
  entries: Array<{ key: string; label: string; percent: number }>;
};

function buildEditableWeightGroups(weights: WeightOverrides): EditableWeightGroup[] {
  return Object.entries(weights).map(([groupKey, group]) => ({
    key: groupKey,
    label: toStartCase(groupKey),
    entries: Object.entries(group).map(([entryKey, entryValue]) => ({
      key: entryKey,
      label: displayWeightLabel(entryKey),
      percent: roundToOneDecimal(finite(entryValue) * 100),
    })),
  }));
}

function normalizeWeightOverrides(weights: unknown): WeightOverrides {
  if (!weights || typeof weights !== "object" || Array.isArray(weights)) {
    return normalizeWeightOverrides(DEFAULT_OVERRIDES);
  }

  const next: WeightOverrides = {};
  for (const [groupKey, groupValue] of Object.entries(weights as Record<string, unknown>)) {
    if (!groupValue || typeof groupValue !== "object" || Array.isArray(groupValue)) continue;

    const numericEntries = Object.entries(groupValue as Record<string, unknown>)
      .map(([entryKey, entryValue]) => [entryKey, parseFinite(entryValue)] as const)
      .filter((entry): entry is readonly [string, number] => entry[1] != null);

    if (!numericEntries.length) continue;
    const sum = numericEntries.reduce((total, [, value]) => total + value, 0);
    const normalizedGroup: Record<string, number> = {};

    if (sum <= 0) {
      const evenShare = 1 / numericEntries.length;
      for (const [entryKey] of numericEntries) normalizedGroup[entryKey] = evenShare;
    } else {
      for (const [entryKey, value] of numericEntries) normalizedGroup[entryKey] = value / sum;
    }

    next[groupKey] = normalizedGroup;
  }

  if (Object.keys(next).length) return next;
  return normalizeWeightOverrides(DEFAULT_OVERRIDES);
}

function parseFinite(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function finite(value: unknown): number {
  const parsed = parseFinite(value);
  return parsed == null ? 0 : parsed;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

function toStartCase(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
