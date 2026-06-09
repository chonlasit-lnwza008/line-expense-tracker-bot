# LINE Expense Tracker Bot

LINE Bot สำหรับบันทึกรายรับรายจ่ายส่วนตัว รองรับข้อความภาษาไทย รูปบิล สลิป และแคปหน้าจอ โดยใช้บริการฟรีหรือฟรีเทียร์ให้มากที่สุด: Node.js, Express, SQLite, local storage และ Tesseract OCR แบบ Open Source

## คุณสมบัติหลัก

- บันทึกรายรับรายจ่ายจากข้อความ เช่น `กาแฟ 45`, `รับ เงินเดือน 18000`
- แยกหมวดหมู่แบบ rule-based รองรับภาษาไทย
- รับรูปจาก LINE แล้ว OCR ด้วย Tesseract.js
- ข้อมูลจาก OCR ถูกเก็บเป็น `pending` และต้องให้ผู้ใช้ยืนยันก่อนเสมอ
- รองรับหลายผู้ใช้ โดยแยกข้อมูลตาม LINE `userId`
- ลบล่าสุด แก้ล่าสุด สรุปวันนี้ สรุปเดือนนี้ ตั้งงบ ตั้งเป้า และ export CSV
- ออกแบบ storage service ให้เปลี่ยนจาก local folder เป็น Supabase Storage, Google Drive หรือ Cloudinary Free Tier ได้ภายหลัง

## ติดตั้ง

```bash
npm install
cp .env.example .env
npm run migrate
npm start
```

ค่า `.env` ที่ต้องใส่:

```env
LINE_CHANNEL_ACCESS_TOKEN=ใส่ Channel access token
LINE_CHANNEL_SECRET=ใส่ Channel secret
DB_CLIENT=postgres
DATABASE_URL=ใส่ Supabase Postgres connection string
DATABASE_SSL=true
DATABASE_PATH=./data/app.db
IMAGE_STORAGE_PATH=./uploads
PORT=3000
DASHBOARD_TOKEN=your-dashboard-password
DASHBOARD_URL=https://your-render-url.onrender.com/dashboard?token=your-dashboard-password
LIFF_ID=your-liff-id
LIFF_URL=https://liff.line.me/your-liff-id
RICH_MENU_NAME=LINE Expense Tracker Menu
OCR_PROVIDER=google
GOOGLE_VISION_API_KEY=ใส่ Google Vision API key
SLIP_VERIFY_PROVIDER=ghostx
GHOSTX_VERIFY_URL=https://externalauth.ghostxapi.xyz/qr/scan
```

## Slip QR Verification

สำหรับสลิปโอนเงินที่มี QR ตรวจสอบสลิป ระบบจะลองอ่าน QR จากรูปก่อน OCR:

1. Decode QR จากรูปด้วย `sharp` + `jsqr`
2. ส่ง `qrData` ไป `GHOSTX_VERIFY_URL`
3. ถ้า verify สำเร็จ จะใช้ข้อมูลยอดเงิน วันที่ เลขอ้างอิง และบัญชีปลายทางจาก API
4. ถ้าไม่เจอ QR หรือ API ใช้ไม่ได้ จะ fallback ไป Google Vision OCR แล้วค่อย Tesseract.js

ค่า ENV:

```env
SLIP_VERIFY_PROVIDER=ghostx
GHOSTX_VERIFY_URL=https://externalauth.ghostxapi.xyz/qr/scan
```

ถ้าต้องการปิดการส่ง QR ไปบริการภายนอก:

```env
SLIP_VERIFY_PROVIDER=off
```

หมายเหตุ: GhostX เป็นบริการ third-party ไม่ใช่บริการ official ของธนาคาร ข้อมูล QR จากสลิปจะถูกส่งออกไปตรวจสอบกับ endpoint ดังกล่าว ควรใช้เฉพาะเมื่อยอมรับเงื่อนไข privacy แล้ว

## Google Vision OCR สำหรับใช้งานส่วนตัว

ค่าเริ่มต้นของโปรเจกต์ตั้งใจให้ใช้ `OCR_PROVIDER=google` เมื่อมี `GOOGLE_VISION_API_KEY` เพื่ออ่านสลิปให้แม่นกว่า Tesseract.js โดยยังคง Tesseract เป็น fallback ถ้าไม่ได้ตั้งค่า key หรือ Google Vision ตอบพลาด

ขั้นตอนโดยย่อ:

1. เปิด Google Cloud Console
2. สร้าง Project หรือเลือก Project เดิม
3. Enable API: Cloud Vision API
4. สร้าง API key
5. ใส่ค่าใน `.env` หรือ Render Environment Variables:

```env
OCR_PROVIDER=google
GOOGLE_VISION_API_KEY=ใส่-key-ตรงนี้
```

เพื่อคุมค่าใช้จ่าย ให้ตั้ง Budget alert ใน Google Cloud ไว้ที่ประมาณ 100 บาท/เดือน และใช้บัญชีส่วนตัวไม่เกิน 1,000 รูป/เดือนตามที่วางแผนไว้

ถ้าต้องการกลับไปใช้ฟรีล้วน ให้ตั้ง:

```env
OCR_PROVIDER=tesseract
```

## Supabase Postgres

สำหรับใช้งานจริงระยะยาว แนะนำใช้ Supabase Postgres แทน SQLite local เพื่อไม่ให้ข้อมูลหายเมื่อ server redeploy หรือย้าย instance

ตั้งค่า ENV:

```env
DB_CLIENT=postgres
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/postgres
DATABASE_SSL=true
```

ถ้าไม่ใส่ `DATABASE_URL` ระบบจะ fallback ไป SQLite ตาม `DATABASE_PATH` เหมือนเดิม เหมาะสำหรับ local dev เท่านั้น

เมื่อเริ่มแอป ระบบจะ migrate ตารางให้อัตโนมัติจาก `src/database/schema.postgres.sql`

## Dashboard

Set `DASHBOARD_TOKEN` in Render Environment Variables, then open:

```text
https://your-render-url.onrender.com/dashboard?token=your-dashboard-password
```

The dashboard shows monthly income, expense, net balance, category chart, daily chart, and recent confirmed transactions from Supabase.

## LIFF App in LINE

The chat bot still works the same way. The LIFF app adds a mobile dashboard inside LINE:

```text
https://liff.line.me/your-liff-id
```

Setup in LINE Developers:

1. Open the same Provider as the bot
2. Create or open a LINE Login channel
3. Open the LIFF tab and click Add
4. Set Endpoint URL to `https://your-render-url.onrender.com/liff`
5. Select the `profile` scope
6. Copy the LIFF ID to Render Environment Variables:

```env
LIFF_ID=your-liff-id
LIFF_URL=https://liff.line.me/your-liff-id
```

Important: the Endpoint URL and the user-facing LIFF URL are different.

- Endpoint URL in LINE Developers: `https://your-render-url.onrender.com/liff`
- Rich Menu / user-facing URL: `https://liff.line.me/your-liff-id`

If a phone opens `https://your-render-url.onrender.com/liff` directly inside LINE, some devices may show an unknown LIFF error. Use the `liff.line.me` URL for the Rich Menu button.

The LIFF page shows monthly totals, spending by category, recent 7-day transactions, and quick buttons that send normal bot commands back into the chat.

## Daily Reminder

Run this command to push a short daily summary to every LINE user in the database:

```bash
npm run reminder:daily
```

Optional date override:

```bash
npm run reminder:daily -- 2026-06-09
```

For production, schedule it with Render Cron, GitHub Actions, Windows Task Scheduler, or Google Cloud Scheduler. Reminder messages use LINE push messages, so they count against your LINE Messaging API quota.

## LINE Rich Menu

ตั้งค่า `LINE_CHANNEL_ACCESS_TOKEN`, `LIFF_ID`, และ `LIFF_URL=https://liff.line.me/your-liff-id` ก่อน จากนั้นรัน:

```bash
npm run richmenu:setup
```

ถ้าไม่ได้ตั้ง `LIFF_URL` แต่ตั้ง `LIFF_ID` ไว้แล้ว สคริปต์จะใช้ `https://liff.line.me/<LIFF_ID>` ให้อัตโนมัติสำหรับปุ่ม Dashboard. ถ้าเผลอตั้ง `LIFF_URL` เป็น `https://your-render-url.onrender.com/liff` สคริปต์จะแปลงกลับเป็น `liff.line.me` ให้เมื่อมี `LIFF_ID`.

สคริปต์จะสร้าง Rich Menu 6 ปุ่มและตั้งเป็น default ให้ผู้ใช้ทุกคน:

- วันนี้
- เดือนนี้
- รายการ
- แก้/ลบ
- AI แนะนำ
- วิธีใช้

## Deploy ไป Google Cloud Run

Cloud Run เหมาะกับ LINE webhook เพราะไม่ต้องดูแล server เอง และใช้ส่วนตัวมีโอกาสอยู่ใน free tier

ตัวอย่าง deploy:

```bash
gcloud run deploy line-expense-tracker-bot \
  --source . \
  --region asia-southeast1 \
  --allow-unauthenticated \
  --set-env-vars DB_CLIENT=postgres,DATABASE_SSL=true,OCR_PROVIDER=google,SLIP_VERIFY_PROVIDER=ghostx,GHOSTX_VERIFY_URL=https://externalauth.ghostxapi.xyz/qr/scan
```

จากนั้นใส่ secret ที่ไม่ควรอยู่ใน command history ผ่าน Console หรือ Secret Manager:

```env
LINE_CHANNEL_ACCESS_TOKEN=
LINE_CHANNEL_SECRET=
DATABASE_URL=
GOOGLE_VISION_API_KEY=
```

หลัง deploy ให้เอา URL ของ Cloud Run ไปตั้งใน LINE webhook เป็น:

```text
https://YOUR-CLOUD-RUN-URL/webhook
```

## ตั้งค่า LINE Bot

1. เข้า [LINE Developers Console](https://developers.line.biz/console/)
2. สร้าง Provider และ Messaging API Channel
3. คัดลอก `Channel secret` ไปใส่ `LINE_CHANNEL_SECRET`
4. สร้าง long-lived `Channel access token` แล้วใส่ `LINE_CHANNEL_ACCESS_TOKEN`
5. เปิดใช้ Webhook
6. ปิด Auto-reply ใน LINE Official Account Manager ถ้าไม่ต้องการข้อความอัตโนมัติจาก OA

## ทดสอบ Webhook ด้วย ngrok

รันแอป:

```bash
npm start
```

เปิด tunnel:

```bash
ngrok http 3000
```

นำ URL จาก ngrok ไปตั้งใน LINE Developers:

```text
https://xxxx.ngrok-free.app/webhook
```

กด Verify ใน LINE Developers Console แล้วลองส่งข้อความหา Bot

## ทางเลือกฟรีสำหรับ Tunnel

- Localhost + ngrok free สำหรับทดสอบเร็ว
- Cloudflare Tunnel สำหรับทดลองเปิด endpoint ฟรี โดยไม่ต้องเช่า server
- Deploy ฟรีเทียร์ เช่น Render, Fly.io หรือ Railway อาจมี quota เปลี่ยนตามนโยบายแต่ละเจ้า ต้องตรวจสอบก่อนใช้จริง

ถ้าไม่อยากแก้ Webhook URL บ่อย ให้ใช้ ngrok free static/dev domain หรือ Cloudflare Named Tunnel พร้อมโดเมนของตัวเอง ดูรายละเอียดใน `STABLE_WEBHOOK.md`

ถ้าต้องการ URL ถาวรและไม่ต้องเปิดเครื่องเอง ดูแนวทางแนะนำใน `DEPLOY_BEST_OPTION.md`

## ตัวอย่างคำสั่ง

```text
จ่าย ข้าว 60
กาแฟ 45
ซื้อของ 1200 หมวด ของใช้
น้ำมัน 500
รับ เงินเดือน 18000
ได้เงิน 1000
รายรับ ขายของ 2500
ลบล่าสุด
ยืนยัน
แก้/ลบล่าสุด
เลือกจากรายการ 7 วันล่าสุด
กดปุ่มแก้ยอด แล้วพิมพ์ 120
กดปุ่มแก้หมวด แล้วพิมพ์ อาหาร
กดปุ่มแก้ชื่อ แล้วพิมพ์ ข้าวเที่ยง
แก้ล่าสุด 120
แก้หมวดล่าสุด อาหาร
แก้ชื่อรายการล่าสุด ข้าวเที่ยง
แก้ยอด 12 120
แก้หมวด 12 อาหาร
แก้ชื่อ 12 ข้าวเที่ยง
สรุปวันนี้
สรุปเดือนนี้
วิเคราะห์เดือนนี้
AI เดือนนี้
ตั้งงบ 8000
งบอาหาร 3000
ตั้งเป้า iPad 18000 ใน 6 เดือน
export เดือนนี้
export ทั้งหมด
รายการล่าสุด
ย้อนหลัง 7 วัน
help
```

## ตัวอย่าง OCR Flow

1. ผู้ใช้ส่งรูปบิลหรือสลิป
2. Bot ดาวน์โหลดรูปจาก LINE แล้วบันทึกใน `uploads/`
3. Bot อ่านข้อความด้วย Tesseract.js ภาษาไทยและอังกฤษ
4. Bot วิเคราะห์ยอดเงิน วันที่ ร้านค้า/ผู้รับเงิน หมวดหมู่ และเลขอ้างอิง
5. ถ้าพบหลายยอด Bot จะถามให้เลือกยอด ไม่เดาเอง
6. Bot สร้างรายการสถานะ `pending`
7. ผู้ใช้ตอบ `ยืนยัน` เพื่อบันทึกเป็น `confirmed`, `แก้ล่าสุด 120` เพื่อแก้ยอดก่อนยืนยัน หรือ `ยกเลิก`

## ทดสอบ Parser

```bash
npm test
```

## ทดสอบ Bot Flow แบบไม่ต้องผ่าน LINE

ระหว่างยังไม่ได้ตั้งค่า LINE webhook สามารถจำลองข้อความจากผู้ใช้ local ได้:

```bash
npm run simulate -- "กาแฟ 45"
npm run simulate -- "รับ เงินเดือน 18000"
npm run simulate -- "สรุปวันนี้"
```

คำสั่งนี้ใช้ LINE user จำลองชื่อ `local-dev-user` และบันทึกลง SQLite จริงตาม `DATABASE_PATH`

## ข้อจำกัดของระบบฟรี

- OCR อาจอ่านภาษาไทย สลิป หรือรูปเบลอผิด ควรให้ผู้ใช้ตรวจสอบก่อนยืนยันเสมอ
- Tesseract.js ใช้ CPU เครื่องที่รัน Bot อาจช้าเมื่อรูปใหญ่
- LINE Messaging API มี quota ตามแพ็กเกจของ LINE Official Account
- local SQLite และ local image storage เหมาะกับทดสอบหรือใช้งานส่วนตัว ไม่เหมาะกับ production หลายเครื่อง
- ถ้า deploy บน free tier บางเจ้า filesystem อาจหายเมื่อ redeploy ควรย้ายรูปไป Supabase Storage, Google Drive หรือ Cloudinary Free Tier
- ไม่มี OpenAI API หรือโมเดลเสียเงิน ระบบวิเคราะห์จึงใช้ rule-based parser ที่อาจตีความประโยคซับซ้อนได้จำกัด

## โครงสร้าง

```text
src/
  app.js
  config/
  routes/
  services/
  parser/
  database/
  utils/
tests/
```
