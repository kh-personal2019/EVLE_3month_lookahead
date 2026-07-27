import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { calendarApi } from './api.js';
import { CATEGORY_COLORS, CATEGORIES, EMPTY_EVENT } from './constants.js';
import { addMonths, eventOccursOn, getMonthGrid, monthTitle, normalizeEvent, todayISO, toISODate } from './dateUtils.js';
import './styles.css';

function App() {
  const [anchorMonth, setAnchorMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [view, setView] = useState('month');
  const [events, setEvents] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState(null);
  const [draft, setDraft] = useState(() => ({ ...EMPTY_EVENT, date: todayISO(), endDate: todayISO() }));
  const [status, setStatus] = useState('Loading shared events...');
  const [editKey, setEditKey] = useState(() => localStorage.getItem('calendarEditKey') || sessionStorage.getItem('calendarEditKey') || '');
  const [rememberKey, setRememberKey] = useState(() => Boolean(localStorage.getItem('calendarEditKey')));
  const [isSaving, setIsSaving] = useState(false);

  async function loadEvents() {
    try {
      setStatus('Loading shared events...');
      const incoming = await calendarApi.listEvents();
      setEvents(incoming.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title)));
      setStatus(`Loaded ${incoming.length} shared event${incoming.length === 1 ? '' : 's'}.`);
    } catch (error) {
      setStatus(`Could not load API events: ${error.message}`);
    }
  }

  useEffect(() => {
    loadEvents();
  }, []);

  useEffect(() => {
    if (editKey) {
      if (rememberKey) {
        localStorage.setItem('calendarEditKey', editKey);
        sessionStorage.removeItem('calendarEditKey');
      } else {
        sessionStorage.setItem('calendarEditKey', editKey);
        localStorage.removeItem('calendarEditKey');
      }
    } else {
      localStorage.removeItem('calendarEditKey');
      sessionStorage.removeItem('calendarEditKey');
    }
  }, [editKey, rememberKey]);

  const visibleMonths = useMemo(() => {
    const count = view === 'quarter' ? 3 : 1;
    return Array.from({ length: count }, (_, index) => addMonths(anchorMonth, index));
  }, [anchorMonth, view]);

  const selectedEvent = selectedEventId ? events.find((event) => event.id === selectedEventId) : null;

  function startNewEvent(date = todayISO()) {
    setSelectedEventId(null);
    setDraft({ ...EMPTY_EVENT, date, endDate: date });
  }

  function startEditEvent(event) {
    setSelectedEventId(event.id);
    setDraft({ ...event, endDate: event.endDate || event.date });
  }

  async function saveEvent(formEvent) {
    formEvent.preventDefault();
    const normalized = normalizeEvent(draft);
    if (!normalized.title) {
      setStatus('Add a title before saving.');
      return;
    }
    if (!editKey) {
      setStatus('Enter the edit key before saving changes.');
      return;
    }
    setIsSaving(true);
    try {
      if (selectedEvent) {
        const updated = await calendarApi.updateEvent(selectedEvent.id, normalized);
        setEvents((current) => current.map((event) => (event.id === selectedEvent.id ? updated.event : event)));
        setStatus('Event updated and saved to the shared API.');
      } else {
        const created = await calendarApi.createEvent(normalized);
        setEvents((current) => [...current, created.event].sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title)));
        setSelectedEventId(created.event.id);
        setDraft({ ...created.event });
        setStatus('Event added and saved to the shared API.');
      }
    } catch (error) {
      setStatus(`Save failed: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteSelectedEvent() {
    if (!selectedEvent) return;
    if (!editKey) {
      setStatus('Enter the edit key before deleting events.');
      return;
    }
    setIsSaving(true);
    try {
      await calendarApi.deleteEvent(selectedEvent.id);
      setEvents((current) => current.filter((event) => event.id !== selectedEvent.id));
      startNewEvent(todayISO());
      setStatus('Event deleted from the shared API.');
    } catch (error) {
      setStatus(`Delete failed: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  }

  function exportEvents() {
    const blob = new Blob([JSON.stringify(events, null, 2)], { type: 'application/json' });
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = `calendar-events-${todayISO()}.json`;
    link.click();
    URL.revokeObjectURL(downloadUrl);
  }

  async function importEvents(file) {
    if (!file) return;
    if (!editKey) {
      setStatus('Enter the edit key before importing events.');
      return;
    }
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) throw new Error('Import file must contain a JSON array.');
      setIsSaving(true);
      for (const item of parsed) {
        await calendarApi.createEvent(normalizeEvent(item));
      }
      await loadEvents();
      setStatus('Imported events to the shared API.');
    } catch (error) {
      setStatus(`Import failed: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">Shared project calendar</p>
          <h1>EVLE Calendar</h1>
          <p className="hero-copy">GitHub Pages frontend with Cloudflare Worker and D1 shared persistence.</p>
        </div>
        <div className="hero-actions">
          <button onClick={() => setAnchorMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>Current Month</button>
          <button onClick={loadEvents}>Refresh</button>
        </div>
      </header>

      <section className="toolbar" aria-label="Calendar controls">
        <div className="segmented">
          <button className={view === 'month' ? 'active' : ''} onClick={() => setView('month')}>1 Month</button>
          <button className={view === 'quarter' ? 'active' : ''} onClick={() => setView('quarter')}>3 Months</button>
        </div>
        <div className="month-controls">
          <button onClick={() => setAnchorMonth(addMonths(anchorMonth, view === 'quarter' ? -3 : -1))}>Previous</button>
          <strong>{view === 'quarter' ? `${monthTitle(anchorMonth)} to ${monthTitle(addMonths(anchorMonth, 2))}` : monthTitle(anchorMonth)}</strong>
          <button onClick={() => setAnchorMonth(addMonths(anchorMonth, view === 'quarter' ? 3 : 1))}>Next</button>
        </div>
        <button className="primary" onClick={() => startNewEvent(todayISO())}>Add Event</button>
      </section>

      <section className="key-panel">
        <label>
          Edit key
          <input type="password" value={editKey} onChange={(event) => setEditKey(event.target.value)} placeholder="Enter shared edit key" />
        </label>
        <label className="check-row">
          <input type="checkbox" checked={rememberKey} onChange={(event) => setRememberKey(event.target.checked)} />
          Remember on this device
        </label>
        <span className="status">{status}</span>
      </section>

      <main className="layout">
        <section className={view === 'quarter' ? 'calendar-grid three-month' : 'calendar-grid'}>
          {visibleMonths.map((month) => (
            <Month key={month.toISOString()} month={month} events={events} onNew={startNewEvent} onEdit={startEditEvent} />
          ))}
        </section>

        <aside className="side-panel">
          <form onSubmit={saveEvent} className="editor-card">
            <div className="panel-heading">
              <h2>{selectedEvent ? 'Edit event' : 'Add event'}</h2>
              <button type="button" onClick={() => startNewEvent(todayISO())}>New</button>
            </div>
            <label>Title<input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} required /></label>
            <div className="two-col">
              <label>Start date<input type="date" value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value, endDate: draft.endDate || event.target.value })} required /></label>
              <label>End date<input type="date" value={draft.endDate || draft.date} onChange={(event) => setDraft({ ...draft, endDate: event.target.value })} /></label>
            </div>
            <label>Category<select value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })}>{CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></label>
            <label>Location<input value={draft.location || ''} onChange={(event) => setDraft({ ...draft, location: event.target.value })} /></label>
            <label>Notes<textarea value={draft.notes || ''} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} rows="5" /></label>
            <div className="editor-actions">
              <button className="primary" disabled={isSaving}>{isSaving ? 'Saving...' : 'Save Event'}</button>
              {selectedEvent && <button type="button" className="danger" onClick={deleteSelectedEvent} disabled={isSaving}>Delete</button>}
            </div>
          </form>

          <section className="legend-card">
            <h2>Legend</h2>
            <div className="legend-list">
              {CATEGORIES.map((category) => <span key={category}><i style={{ background: CATEGORY_COLORS[category] }} />{category}</span>)}
            </div>
          </section>

          <section className="backup-card">
            <h2>Backup</h2>
            <button onClick={exportEvents}>Export JSON</button>
            <label className="file-button">Import JSON<input type="file" accept="application/json" onChange={(event) => importEvents(event.target.files?.[0])} /></label>
          </section>
        </aside>
      </main>
    </div>
  );
}

function Month({ month, events, onNew, onEdit }) {
  const days = getMonthGrid(month);
  const monthNumber = month.getMonth();
  const weekdayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <section className="month-card">
      <h2>{monthTitle(month)}</h2>
      <div className="weekday-row">{weekdayNames.map((day) => <span key={day}>{day}</span>)}</div>
      <div className="days-grid">
        {days.map((day) => {
          const iso = toISODate(day);
          const dayEvents = events.filter((event) => eventOccursOn(event, iso));
          const isOutside = day.getMonth() !== monthNumber;
          const isToday = iso === todayISO();
          return (
            <button key={iso} className={`day-cell ${isOutside ? 'outside' : ''} ${isToday ? 'today' : ''}`} onDoubleClick={() => onNew(iso)} type="button">
              <span className="day-number">{day.getDate()}</span>
              <div className="event-stack">
                {dayEvents.map((event) => (
                  <span key={event.id} className="event-chip" style={{ borderLeftColor: CATEGORY_COLORS[event.category] || '#2563eb' }} onClick={(clickEvent) => { clickEvent.stopPropagation(); onEdit(event); }}>
                    {event.title}
                  </span>
                ))}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

createRoot(document.getElementById('root')).render(<App />);
