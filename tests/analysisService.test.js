const test = require('node:test');
const assert = require('node:assert/strict');
const { buildInsights, keywordInsights } = require('../src/services/analysisService');

test('detects increased category spending compared with previous month', () => {
  const current = {
    expense: 1280,
    rows: [
      { type: 'expense', title: 'ข้าว', category: 'อาหาร', amount: 800 },
      { type: 'expense', title: 'กาแฟ', category: 'อาหาร', amount: 480 }
    ]
  };
  const previous = {
    expense: 1000,
    rows: [
      { type: 'expense', title: 'อาหาร', category: 'อาหาร', amount: 1000 }
    ]
  };

  const insights = buildInsights(current, previous);

  assert.match(insights.insights.join('\n'), /รายจ่ายรวมเพิ่มขึ้น 28%/);
  assert.match(insights.insights.join('\n'), /หมวด อาหาร เพิ่มขึ้น 28%/);
});

test('creates saving recommendation from recurring coffee spending', () => {
  const rows = [
    { type: 'expense', title: 'กาแฟ', category: 'อาหาร', amount: 45 },
    { type: 'expense', title: 'อเมริกาโน', category: 'อาหาร', amount: 45 }
  ];

  const [coffee] = keywordInsights(rows);

  assert.equal(coffee.label, 'กาแฟ');
  assert.equal(coffee.monthlySaving, 1350);
});
