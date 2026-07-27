import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { calendarApi } from './api.js';
import { DEFAULT_CATEGORIES, EMPTY_EVENT } from './defaultCategories.js';
import { addMonths, eventOccursOn, getMonthGrid, monthTitle, normalizeEvent, todayISO, toISODate } from './dateUtils.js';
import './styles.css';

function App() {
  const [anchorMonth, setAnchorMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [view, setView] = useState('month');
  const [events, setEvents] = useState([]);
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [selectedEventId, setSelectedEventId] = useState(null);
  const [draft, setDraft] = useState(() => ({ ...EMPTY_EVENT, date: todayISO(), endDate: todayISO() }));
  const [categoryDraft, setCategoryDraft] = useState({ name: '', color: '#2563eb' });
  const [status, setStatus] = useState('Loading shared calendar...');
  const [editKey, setEditKey] = useState(() => localStorage.getItem('calendarEditKey') || sessionStorage.getItem('calendarEditKey') || '');
  const [rememberKey, setRememberKey] = useState(() => Boolean(localStorage.getItem('calendarEditKey')));
  const [isSaving, setIsSaving] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordPurpose, setPasswordPurpose] = useState('event');
  const [showEventModal, setShowEventModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [pendingDate, setPendingDate] = useState(todayISO());

  const categoryColorMap = useMemo(() => Object.fromEntries(categories.map((c) => [c.name, c.color])), [categories]);
  const categoryNames = useMemo(() => categories.map((c) => c.name), [categories]);
  const selectedEvent = selectedEventId ? events.find((event) => event.id === selectedEventId) : null;
  const visibleMonths = useMemo(() => Array.from({ length: view === 'quarter' ? 3 : 1 }, (_, index) => addMonths(anchorMonth, index)), [anchorMonth, view]);

  async function loadEverything() {
    try {
      setStatus('Loading shared calendar...');
      const [incomingEvents, incomingCategories] = await Promise.all([calendarApi.listEvents(), calendarApi.listCategories()]);
      const nextCategories = incomingCategories.length ? incomingCategories : DEFAULT_CATEGORIES;
      setCategories(nextCategories);
      setEvents(incomingEvents.sort(sortEvents));
      setStatus(`Loaded ${incomingEvents.length} event${incomingEvents.length === 1 ? '' : 's'} and ${nextCategories.length} categor${nextCategories.length === 1 ? 'y' : 'ies'}.`);
    } catch (error) {
      setStatus(`Could not load shared calendar: ${error.message}`);
    }
  }

  useEffect(() => { loadEverything(); }, []);

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

  function sortEvents(a, b) { return a.date.localeCompare(b.date) || a.category.localeCompare(b.category) || a.title.localeCompare(b.title); }

  function requirePasswordThen(purpose, callback) {
    if (!editKey) {
      setPasswordPurpose(purpose);
      setShowPasswordModal(true);
      return false;
    }
    callback?.();
    return true;
  }

  function continueFromPassword() {
    if (!editKey.trim()) {
      setStatus('Enter the edit password to continue.');
      return;
    }
    setShowPasswordModal(false);
    if (passwordPurpose === 'category') setShowCategoryModal(true);
    else {
      startNewEvent(pendingDate);
      setShowEventModal(true);
    }
  }

  function openAddFlow(date = todayISO()) {
    setPendingDate(date);
    requirePasswordThen('event', () => {
      startNewEvent(date);
      setShowEventModal(true);
    });
  }

  function openCategoryManager() {
    requirePasswordThen('category', () => setShowCategoryModal(true));
  }

  function startNewEvent(date = todayISO()) {
    const fallbackCategory = categoryNames.includes('IDT') ? 'IDT' : categoryNames[0] || 'IDT';
    setSelectedEventId(null);
    setDraft({ ...EMPTY_EVENT, category: fallbackCategory, date, endDate: date, tentative: false });
  }

  function startEditEvent(event) {
    setSelectedEventId(event.id);
    setDraft({ ...event, endDate: event.endDate || event.date, tentative: Boolean(event.tentative) });
    setShowEventModal(true);
  }

  function closeEventModal() {
    setShowEventModal(false);
    setSelectedEventId(null);
    setDraft({ ...EMPTY_EVENT, date: todayISO(), endDate: todayISO(), tentative: false });
  }

  async function saveEvent(formEvent) {
    formEvent.preventDefault();
    const normalized = normalizeEvent(draft);
    if (!normalized.title) { setStatus('Add a title before saving.'); return; }
    if (!editKey) { setStatus('Enter the edit password before saving changes.'); return; }
    setIsSaving(true);
    try {
      if (selectedEvent) {
        const updated = await calendarApi.updateEvent(selectedEvent.id, normalized);
        setEvents((current) => current.map((event) => (event.id === selectedEvent.id ? updated.event : event)).sort(sortEvents));
        setStatus('Event updated and saved to the shared API.');
      } else {
        const created = await calendarApi.createEvent(normalized);
        setEvents((current) => [...current, created.event].sort(sortEvents));
        setStatus('Event added and saved to the shared API.');
      }
      closeEventModal();
    } catch (error) {
      setStatus(`Save failed: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteSelectedEvent() {
    if (!selectedEvent) return;
    setIsSaving(true);
    try {
      await calendarApi.deleteEvent(selectedEvent.id);
      setEvents((current) => current.filter((event) => event.id !== selectedEvent.id));
      closeEventModal();
      setStatus('Event deleted from the shared API.');
    } catch (error) {
      setStatus(`Delete failed: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  }

  async function addCategory(formEvent) {
    formEvent.preventDefault();
    const name = categoryDraft.name.trim();
    if (!name) { setStatus('Category name is required.'); return; }
    setIsSaving(true);
    try {
      const created = await calendarApi.createCategory({ name, color: categoryDraft.color });
      setCategories((current) => [...current.filter((item) => item.name !== created.category.name), created.category].sort((a, b) => a.name.localeCompare(b.name)));
      setCategoryDraft({ name: '', color: '#2563eb' });
      setStatus('Category added.');
    } catch (error) {
      setStatus(`Category add failed: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  }

  async function updateCategory(originalName, updates) {
    setIsSaving(true);
    try {
      const updated = await calendarApi.updateCategory(originalName, updates);
      setCategories((current) => current.map((item) => (item.name === originalName ? updated.category : item)).sort((a, b) => a.name.localeCompare(b.name)));
      if (updates.name && updates.name !== originalName) {
        setEvents((current) => current.map((event) => event.category === originalName ? { ...event, category: updates.name } : event));
      }
      setStatus('Category updated.');
    } catch (error) {
      setStatus(`Category update failed: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteCategory(name) {
    setIsSaving(true);
    try {
      await calendarApi.deleteCategory(name);
      setCategories((current) => current.filter((item) => item.name !== name));
      setStatus('Category deleted. Events in that category were moved to Uncategorized by the API.');
      await loadEverything();
    } catch (error) {
      setStatus(`Category delete failed: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">EVLE Phase II & III</p>
          <h1>Lookahead Calendar</h1>
        </div>
        <div className="hero-actions">
          <button onClick={() => setAnchorMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>Current Month</button>
          <button onClick={loadEverything}>Refresh</button>
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
        <div className="toolbar-actions">
          <button onClick={openCategoryManager}>Manage Categories</button>
          <button className="primary" onClick={() => openAddFlow(todayISO())}>Add Event</button>
        </div>
      </section>

      <section className="status-strip"><span>{status}</span></section>

      <main className="layout full-width">
        <section className={view === 'quarter' ? 'calendar-grid three-month' : 'calendar-grid'}>
          {visibleMonths.map((month) => (
            <Month key={month.toISOString()} month={month} events={events} categories={categories} categoryColorMap={categoryColorMap} onNew={openAddFlow} onEdit={startEditEvent} />
          ))}
        </section>
      </main>

      <section className="legend-card legend-bottom">
        <h2>Legend</h2>
        <div className="legend-list">{categories.map((category) => <span key={category.name}><i style={{ background: category.color }} />{category.name}</span>)}</div>
      </section>

      {showPasswordModal && (
        <Modal title="Enter edit password" onClose={() => setShowPasswordModal(false)}>
          <p className="modal-help">Password is requested only when you add/edit/delete events or manage categories.</p>
          <label>Password<input type="password" autoFocus value={editKey} onChange={(event) => setEditKey(event.target.value)} placeholder="Shared edit password" /></label>
          <label className="check-row modal-check"><input type="checkbox" checked={rememberKey} onChange={(event) => setRememberKey(event.target.checked)} />Remember on this device</label>
          <div className="modal-actions"><button className="primary" onClick={continueFromPassword}>Continue</button><button onClick={() => setShowPasswordModal(false)}>Cancel</button></div>
        </Modal>
      )}

      {showEventModal && (
        <Modal title={selectedEvent ? 'Edit event' : 'Add event'} onClose={closeEventModal} large>
          <form onSubmit={saveEvent} className="event-form">
            <label>Title<input autoFocus value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} required /></label>
            <div className="two-col">
              <label>Start date<input type="date" value={draft.date} onChange={(event) => {const newStart = event.target.value;setDraft({...draft,date: newStart,endDate:draft.endDate < newStart? newStart: draft.endDate});}}required/></label>
              <label>End date<input type="date" value={draft.endDate || draft.date} onChange={(event) => setDraft({ ...draft, endDate: event.target.value })} /></label>
            </div>
            <label>Category<select value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })}>{categoryNames.map((category) => <option key={category}>{category}</option>)}</select></label>
            <label className="check-row"><input type="checkbox" checked={Boolean(draft.tentative)} onChange={(event) => setDraft({ ...draft, tentative: event.target.checked })} />Tentative</label>
            <label>Location<input value={draft.location || ''} onChange={(event) => setDraft({ ...draft, location: event.target.value })} /></label>
            <label>Notes<textarea value={draft.notes || ''} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} rows="5" /></label>
            <div className="editor-actions"><button className="primary" disabled={isSaving}>{isSaving ? 'Saving...' : 'Save Event'}</button>{selectedEvent && <button type="button" className="danger" onClick={deleteSelectedEvent} disabled={isSaving}>Delete</button>}<button type="button" onClick={closeEventModal}>Cancel</button></div>
          </form>
        </Modal>
      )}

      {showCategoryModal && (
        <Modal title="Manage categories" onClose={() => setShowCategoryModal(false)} large>
          <form onSubmit={addCategory} className="category-add-form">
            <label>New category<input value={categoryDraft.name} onChange={(event) => setCategoryDraft({ ...categoryDraft, name: event.target.value })} placeholder="Category name" /></label>
            <label>Color<input type="color" value={categoryDraft.color} onChange={(event) => setCategoryDraft({ ...categoryDraft, color: event.target.value })} /></label>
            <button className="primary" disabled={isSaving}>Add Category</button>
          </form>
          <div className="category-manager-list">
            {categories.map((category) => <CategoryEditor key={category.name} category={category} onUpdate={updateCategory} onDelete={deleteCategory} disabled={isSaving} />)}
          </div>
        </Modal>
      )}
    </div>
  );
}

function CategoryEditor({ category, onUpdate, onDelete, disabled }) {
  const [name, setName] = useState(category.name);
  const [color, setColor] = useState(category.color);
  useEffect(() => { setName(category.name); setColor(category.color); }, [category.name, category.color]);
  return <div className="category-row"><input value={name} onChange={(event) => setName(event.target.value)} /><input type="color" value={color} onChange={(event) => setColor(event.target.value)} /><button onClick={() => onUpdate(category.name, { name, color })} disabled={disabled}>Save</button><button className="danger" onClick={() => onDelete(category.name)} disabled={disabled}>Delete</button></div>;
}

function Modal({ title, children, onClose, large = false }) {
  return <div className="modal-backdrop" role="dialog" aria-modal="true"><div className={large ? 'modal-card modal-large' : 'modal-card'}><div className="modal-header"><h2>{title}</h2><button aria-label="Close" onClick={onClose}>Close</button></div>{children}</div></div>;
}

function Month({ month, events, categories, categoryColorMap, onNew, onEdit }) {
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
          const grouped = categories.map((category) => ({ category, events: dayEvents.filter((event) => event.category === category.name) })).filter((group) => group.events.length > 0);
          const uncategorized = dayEvents.filter((event) => !categories.some((category) => category.name === event.category));
          if (uncategorized.length) grouped.push({ category: { name: 'Uncategorized', color: '#475569' }, events: uncategorized });
          const isOutside = day.getMonth() !== monthNumber;
          const isToday = iso === todayISO();
          return <button key={iso} className={`day-cell ${isOutside ? 'outside' : ''} ${isToday ? 'today' : ''}`} onDoubleClick={() => onNew(iso)} type="button"><span className="day-number">{day.getDate()}</span><div className="event-stack">{grouped.map((group) => <div className="category-event-group" key={group.category.name}><span className="category-inline-label" style={{ color: group.category.color }}>{group.category.name}</span>{group.events.map((event) => <span key={event.id} title={event.title} className={`event-chip ${event.tentative ? 'tentative' : ''}`} style={{ borderLeftColor: categoryColorMap[event.category] || group.category.color || '#2563eb' }} onClick={(clickEvent) => { clickEvent.stopPropagation(); onEdit(event); }}>{event.title}</span>)}</div>)}</div></button>;
        })}
      </div>
    </section>
  );
}

createRoot(document.getElementById('root')).render(<App />);
