const rules = [
  { category: 'อาหาร', keywords: ['ข้าว', 'กาแฟ', 'ชานม', 'อาหาร', 'ร้านอาหาร', 'ก๋วยเตี๋ยว', 'หมูกระทะ', 'บุฟเฟต์'] },
  { category: 'เดินทาง', keywords: ['น้ำมัน', 'bts', 'mrt', 'รถ', 'แท็กซี่', 'taxi', 'grab', 'ทางด่วน', 'วิน'] },
  { category: 'บิลประจำ', keywords: ['ค่าไฟ', 'ค่าน้ำ', 'ค่าเน็ต', 'internet', 'โทรศัพท์', 'ประกัน', 'ค่าเช่า'] },
  { category: 'ของใช้', keywords: ['ซื้อของ', 'สบู่', 'แชมพู', 'ของใช้', 'เสื้อ', 'รองเท้า'] },
  { category: 'สุขภาพ', keywords: ['ยา', 'โรงพยาบาล', 'หมอ', 'คลินิก', 'วิตามิน'] },
  { category: 'รายรับ', keywords: ['เงินเดือน', 'ขายของ', 'โบนัส', 'รายรับ', 'ได้เงิน'] }
];

function detectCategory(text = '', type = 'expense') {
  const normalized = text.toLowerCase();
  const found = rules.find((rule) => rule.keywords.some((keyword) => normalized.includes(keyword.toLowerCase())));
  if (found) return found.category;
  if (type === 'income') return 'รายรับ';
  return 'อื่นๆ';
}

module.exports = {
  rules,
  detectCategory
};
