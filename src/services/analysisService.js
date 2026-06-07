const summaryService = require('./summaryService');
const { currentMonth, previousMonth } = require('../utils/dateUtils');

const WATCH_KEYWORDS = [
  { label: 'กาแฟ', pattern: /(กาแฟ|ลาเต้|คาปู|อเมริกาโน|espresso|coffee)/i, savingHint: 'ถ้าลดกาแฟวันละ 1 แก้ว จะประหยัดได้ประมาณ' },
  { label: 'ชานม', pattern: /(ชานม|ชาไข่มุก|bubble tea)/i, savingHint: 'ถ้าลดชานมวันละ 1 แก้ว จะประหยัดได้ประมาณ' },
  { label: 'ของกินเล่น', pattern: /(ขนม|ของกินเล่น|เบเกอรี่|เค้ก|ไอศกรีม|snack)/i, savingHint: 'ถ้าลดของกินเล่นลงครึ่งหนึ่ง จะประหยัดได้ประมาณ' },
  { label: 'เดลิเวอรี', pattern: /(grab|foodpanda|lineman|delivery|เดลิเวอรี|ส่งอาหาร)/i, savingHint: 'ถ้าลดเดลิเวอรีลง 2 ครั้งต่อสัปดาห์ จะประหยัดได้ประมาณ' }
];

function sumExpensesByCategory(rows) {
  const totals = new Map();
  for (const row of rows.filter((item) => item.type === 'expense')) {
    totals.set(row.category, (totals.get(row.category) || 0) + Number(row.amount || 0));
  }
  return totals;
}

function categoryChanges(currentRows, previousRows) {
  const current = sumExpensesByCategory(currentRows);
  const previous = sumExpensesByCategory(previousRows);
  return [...current.entries()]
    .map(([category, amount]) => {
      const before = previous.get(category) || 0;
      const diff = amount - before;
      const percent = before > 0 ? (diff / before) * 100 : null;
      return { category, amount, before, diff, percent };
    })
    .filter((item) => item.diff > 0 && item.amount >= 100)
    .sort((a, b) => b.diff - a.diff);
}

function keywordInsights(rows) {
  return WATCH_KEYWORDS
    .map((rule) => {
      const matched = rows.filter((row) => row.type === 'expense' && rule.pattern.test(row.title || ''));
      const amount = matched.reduce((sum, row) => sum + Number(row.amount || 0), 0);
      return {
        label: rule.label,
        amount,
        count: matched.length,
        average: matched.length ? amount / matched.length : 0,
        monthlySaving: Math.round((matched.length ? amount / matched.length : 45) * 30),
        savingHint: rule.savingHint
      };
    })
    .filter((item) => item.count > 0)
    .sort((a, b) => b.amount - a.amount);
}

function buildInsights(current, previous) {
  const changes = categoryChanges(current.rows, previous.rows);
  const watched = keywordInsights(current.rows);
  const insights = [];
  const warnings = [];
  const recommendations = [];

  if (previous.expense > 0) {
    const diff = current.expense - previous.expense;
    const percent = Math.round((diff / previous.expense) * 100);
    if (diff > 0) {
      insights.push(`รายจ่ายรวมเพิ่มขึ้น ${percent}% จากเดือนก่อน`);
    } else if (diff < 0) {
      insights.push(`รายจ่ายรวมลดลง ${Math.abs(percent)}% จากเดือนก่อน`);
    } else {
      insights.push('รายจ่ายรวมใกล้เคียงกับเดือนก่อน');
    }
  } else if (current.expense > 0) {
    insights.push('เดือนนี้เป็นเดือนแรกที่มีข้อมูลรายจ่ายให้วิเคราะห์');
  }

  const topChange = changes[0];
  if (topChange) {
    const percentText = topChange.percent === null ? 'จากที่แทบไม่มีในเดือนก่อน' : `${Math.round(topChange.percent)}% จากเดือนก่อน`;
    insights.push(`หมวด ${topChange.category} เพิ่มขึ้น ${percentText}`);
  }

  const risky = watched.slice(0, 2).map((item) => item.label);
  if (risky.length) {
    warnings.push(`รายจ่ายที่ควรระวังคือ${risky.join('และ')}`);
  } else if (topChange) {
    warnings.push(`รายจ่ายที่ควรระวังคือหมวด ${topChange.category}`);
  }

  for (const item of watched.slice(0, 2)) {
    recommendations.push(`${item.savingHint} ${item.monthlySaving.toLocaleString('th-TH')} บาท/เดือน`);
  }

  if (!recommendations.length && topChange) {
    recommendations.push(`ลองตั้งงบหมวด ${topChange.category} ต่ำกว่ายอดเดือนนี้ 10% เพื่อคุมรายจ่ายเดือนหน้า`);
  }

  if (!insights.length) insights.push('ยังมีข้อมูลไม่พอสำหรับเทียบพฤติกรรมรายเดือน');
  if (!warnings.length) warnings.push('ยังไม่พบรายการที่น่ากังวลชัดเจน');
  if (!recommendations.length) recommendations.push('บันทึกต่ออีกสัก 1-2 สัปดาห์ ระบบจะให้คำแนะนำได้แม่นขึ้น');

  return {
    insights: insights.slice(0, 3),
    warnings: warnings.slice(0, 2),
    recommendations: recommendations.slice(0, 3),
    topKeywords: watched.slice(0, 4),
    categoryChanges: changes.slice(0, 5)
  };
}

async function monthlyAnalysis(userId, month = currentMonth()) {
  const current = await summaryService.monthlySummary(userId, month);
  const previous = await summaryService.monthlySummary(userId, previousMonth(month));
  return {
    month,
    current,
    previous,
    ...buildInsights(current, previous)
  };
}

module.exports = {
  monthlyAnalysis,
  buildInsights,
  categoryChanges,
  keywordInsights
};
