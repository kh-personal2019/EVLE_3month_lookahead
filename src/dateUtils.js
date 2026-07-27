export function todayISO() {
  return toISODate(new Date());
}

export function toISODate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseISODate(value) {
  if (!value) return null;
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function addMonths(date, amount) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

export function monthTitle(date) {
  return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

export function getMonthGrid(monthDate) {
  const first = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const start = new Date(first);
  start.setDate(start.getDate() - start.getDay());

  const days = [];
  for (let i = 0; i < 42; i += 1) {
    const day = new Date(start);
    day.setDate(start.getDate() + i);
    days.push(day);
  }
  return days;
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
