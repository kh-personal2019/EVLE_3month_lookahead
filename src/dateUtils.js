export function todayISO() { return toISODate(new Date()); }
export function toISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
export function addMonths(date, amount) { return new Date(date.getFullYear(), date.getMonth() + amount, 1); }
export function monthTitle(date) { return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }); }
export function getMonthGrid(monthDate) {
  const first = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const start = new Date(first);
  start.setDate(start.getDate() - start.getDay());
  return Array.from({ length: 42 }, (_, i) => {
    const day = new Date(start);
    day.setDate(start.getDate() + i);
    return day;
  });
}
export function eventOccursOn(event, isoDate) {
  const start = event.date;
  const end = event.endDate || event.date;
  return start <= isoDate && isoDate <= end;
}
export function normalizeEvent(input) {
  const date = input.date || todayISO();
  const endDate = input.endDate || date;
  return {
    ...input,
    title: String(input.title || '').trim(),
    date,
    endDate: endDate < date ? date : endDate,
    category: input.category || 'IDT',
    location: String(input.location || '').trim(),
    notes: String(input.notes || '').trim()
  };
}
