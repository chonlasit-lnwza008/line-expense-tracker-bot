function parseAmount(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).replace(/,/g, '').match(/\d+(?:\.\d{1,2})?/);
  return normalized ? Number(normalized[0]) : null;
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString('th-TH', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });
}

module.exports = {
  parseAmount,
  formatMoney
};
