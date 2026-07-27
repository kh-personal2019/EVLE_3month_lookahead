const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

function buildUrl(path) {
  if (!API_BASE_URL) return path;
  return `${API_BASE_URL.replace(/\/$/, '')}${path}`;
}

async function request(path, options = {}) {
  const editKey = localStorage.getItem('calendarEditKey') || sessionStorage.getItem('calendarEditKey') || '';
  const headers = { 'content-type': 'application/json', ...(options.headers || {}) };
  if (editKey) headers['x-calendar-edit-key'] = editKey;
  const response = await fetch(buildUrl(path), { ...options, headers });
  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await response.json() : await response.text();
  if (!response.ok) {
    const message = typeof payload === 'object' && payload?.error ? payload.error : `Request failed with status ${response.status}`;
    throw new Error(message);
  }
  return payload;
}

export const calendarApi = {
  async listEvents() {
    const data = await request('/api/events');
    return Array.isArray(data.events) ? data.events : [];
  },
  async createEvent(event) { return request('/api/events', { method: 'POST', body: JSON.stringify(event) }); },
  async updateEvent(id, event) { return request(`/api/events/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(event) }); },
  async deleteEvent(id) { return request(`/api/events/${encodeURIComponent(id)}`, { method: 'DELETE' }); }
};
