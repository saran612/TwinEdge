/**
 * Flight-deck API client with explicit error handling per Honesty Rule H6:
 * "No mock or synthetic values in Live/Replay views. API failure => explicit error state, never fake data."
 */

export const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export class ApiError extends Error {
  constructor(message, status, detail) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
  }
}

async function fetchJson(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });

    if (!res.ok) {
      let detail = '';
      try {
        const body = await res.json();
        detail = body.detail || JSON.stringify(body);
      } catch {
        detail = res.statusText;
      }
      throw new ApiError(`Request failed with status ${res.status}: ${detail}`, res.status, detail);
    }

    return await res.json();
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(`Network / Connection Error: ${err.message}`, 0, err.message);
  }
}

export const api = {
  getHealth: () => fetchJson('/health'),
  getModelInfo: () => fetchJson('/model/info'),
  getEdgeStats: () => fetchJson('/edge/stats'),
  getAlerts: () => fetchJson('/alerts'),
  getAuditLog: () => fetchJson('/audit'),
  verifyAudit: () => fetchJson('/audit/verify'),
  getRecentTelemetry: (engineId, limit = 50) => {
    const qs = engineId !== undefined ? `?engine_id=${engineId}&limit=${limit}` : `?limit=${limit}`;
    return fetchJson(`/telemetry/recent${qs}`);
  },
  postPredict: (data) =>
    fetchJson('/predict', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  postSignoff: (alertId, signoffData) =>
    fetchJson(`/alerts/${alertId}/signoff`, {
      method: 'POST',
      body: JSON.stringify(signoffData),
    }),
};
