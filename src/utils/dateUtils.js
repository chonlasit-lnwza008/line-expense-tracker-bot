function toDateOnly(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function currentMonth(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function formatDisplayDate(value) {
  if (!value) return '-';
  const text = value instanceof Date ? toDateOnly(value) : String(value).slice(0, 10);
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return text;
  return `${Number(match[3])}/${Number(match[2])}/${match[1]}`;
}

function formatDisplayMonth(value) {
  if (!value) return '-';
  const text = String(value).slice(0, 7);
  const match = text.match(/^(\d{4})-(\d{2})$/);
  if (!match) return text;
  return `${Number(match[2])}/${match[1]}`;
}

function monthRange(month = currentMonth()) {
  const start = `${month}-01`;
  const next = new Date(`${start}T00:00:00.000Z`);
  next.setUTCMonth(next.getUTCMonth() + 1);
  return {
    start,
    endExclusive: toDateOnly(next)
  };
}

function previousMonth(month = currentMonth()) {
  const date = new Date(`${month}-01T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() - 1);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function addMonths(date, months) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

module.exports = {
  toDateOnly,
  currentMonth,
  formatDisplayDate,
  formatDisplayMonth,
  monthRange,
  previousMonth,
  addMonths
};
