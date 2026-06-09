const rules = [
  {
    category: 'เครื่องดื่ม',
    keywords: [
      'กาแฟ', 'คาเฟ่', 'coffee', 'espresso', 'latte', 'americano', 'cappuccino',
      'ชา', 'ชานม', 'ชาไทย', 'ชาเขียว', 'โกโก้', 'นมสด', 'น้ำหวาน',
      'น้ำอัดลม', 'โค้ก', 'coke', 'pepsi', 'น้ำปั่น', 'smoothie',
      'น้ำดื่ม', 'น้ำเปล่า', 'เครื่องดื่ม', 'เต่าบิน', 'taobin', 'tao bin'
    ]
  },
  {
    category: 'อาหาร',
    keywords: [
      'ข้าว', 'อาหาร', 'ร้านอาหาร', 'ก๋วยเตี๋ยว', 'หมูกระทะ', 'บุฟเฟต์',
      'ขนม', 'ของกินเล่น', 'มื้อเช้า', 'มื้อกลางวัน', 'มื้อเย็น', 'กับข้าว'
    ]
  },
  {
    category: 'เดินทาง',
    keywords: ['น้ำมัน', 'bts', 'mrt', 'รถ', 'แท็กซี่', 'taxi', 'grab', 'ทางด่วน', 'วิน']
  },
  {
    category: 'บิลประจำ',
    keywords: ['ค่าไฟ', 'ค่าน้ำ', 'ค่าเน็ต', 'internet', 'โทรศัพท์', 'ประกัน', 'ค่าเช่า', 'บุญเติม', 'boonterm']
  },
  {
    category: 'สิ่งใช้ประจำวัน',
    keywords: [
      'ของใช้ประจำวัน', 'ของใช้ทั่วไป', 'ทิชชู่', 'กระดาษทิชชู่', 'ยาสีฟัน',
      'แปรงสีฟัน', 'น้ำยาล้างจาน', 'น้ำยาซักผ้า', 'ผงซักฟอก',
      'น้ำยาปรับผ้านุ่ม', 'น้ำยาถูพื้น', 'ถุงขยะ', 'สำลี'
    ]
  },
  {
    category: 'ของใช้',
    keywords: ['ซื้อของ', 'สบู่', 'แชมพู', 'ของใช้', 'เสื้อ', 'รองเท้า', 'homepro', 'โฮมโปร']
  },
  {
    category: 'สุขภาพ',
    keywords: ['ยา', 'โรงพยาบาล', 'หมอ', 'คลินิก', 'วิตามิน']
  },
  {
    category: 'รายรับ',
    keywords: ['เงินเดือน', 'ขายของ', 'โบนัส', 'รายรับ', 'ได้เงิน']
  }
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
