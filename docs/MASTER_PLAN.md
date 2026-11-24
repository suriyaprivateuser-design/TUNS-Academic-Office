# MASTER PLAN — TUNS Academic Office V1.0

> ระบบสำนักงานวิชาการดิจิทัล · โรงเรียนเตรียมอุดมศึกษาน้อมเกล้า สมุทรปราการ · กลุ่มบริหารวิชาการ
> **ทุกงานวิชาการ เชื่อมถึงกันในที่เดียว** — One Workspace. Connected Academic Operations.

เอกสารนี้คือแผนแม่บทของโครงการ แปลง Master Prompt ให้เป็นการตัดสินใจเชิงสถาปัตยกรรม ลำดับงาน และเกณฑ์ตรวจรับ
เอกสารอื่นในโฟลเดอร์ `docs/` ลงรายละเอียดของแต่ละเรื่อง สถานะการพัฒนาปัจจุบันอยู่ที่ [PROGRESS.md](./PROGRESS.md)

---

## 1. เป้าหมายและหลักการ

ระบบนี้เป็นศูนย์กลางการทำงานของครู เจ้าหน้าที่ หัวหน้ากลุ่มสาระ หัวหน้างาน และผู้บริหาร
ความสำเร็จวัดจากการ **ลดภาระงานจริง** ไม่ใช่จำนวนหน้าจอ

| หลักการ | ความหมายในเชิงระบบ |
|---|---|
| Enter Once, Use Everywhere | ข้อมูลหลัก (บุคลากร นักเรียน ตารางเรียน ปีการศึกษา) มีที่เก็บเดียวและทุก Module อ้างอิงด้วย ID |
| One Document, One Source | เอกสารหนึ่งรายการมี `document_id` เดียว ไฟล์จริงอยู่ที่ Google Drive ที่เดียว Module อื่นอ้างอิง ไม่คัดลอก |
| Everything in Its Place | ไฟล์ทุกไฟล์ผ่าน File Routing Engine เดียวกัน โฟลเดอร์และชื่อไฟล์ถูกกำหนดโดยระบบ |
| Less Work, Better Workflow | ทุกฟีเจอร์ต้องลดขั้นตอนของครู ถ้าเพิ่มขั้นตอนต้องมีเหตุผลด้านความถูกต้องหรือความปลอดภัย |

## 2. ขอบเขต

9 หมวด 34 ระบบย่อย (รายการเต็มและเส้นทางของแต่ละระบบอยู่ใน [SITEMAP.md](./SITEMAP.md))

| Module | ชื่อ | ระบบย่อย | Phase หลัก |
|---|---|---:|---|
| 01 | ภาพรวมสำนักงาน | 3 | 1 |
| 02 | งานสารบรรณและเอกสาร | 7 | 2 |
| 03 | ระบบขอเวลาเรียนนักเรียน | 5 | 3 |
| 04 | งานมอบหมายและติดตามงาน | 4 | 4 |
| 05 | งานปฏิทินและการประชุม | 4 | 5 |
| 06 | งานบุคลากรและประสานงาน | 3 | 6 |
| 07 | คลังเอกสารและประชาสัมพันธ์ | 3 | 2 และ 6 |
| 08 | งานสารสนเทศและรายงาน | 2 | 1 และ 7 |
| 09 | ศูนย์รวมระบบและบริการวิชาการ | 3 | 1 |

**นอกขอบเขต (ห้ามเพิ่ม):** บริหารโครงการ แผนปฏิบัติการ งบประมาณ การเงิน พัสดุ เบิกวัสดุ จองห้องประชุม แจ้งซ่อม ขอถ่ายเอกสาร ยืม–คืนอุปกรณ์
ระบบวัดผล ทะเบียนนักเรียน หลักสูตร และผลงาน/รางวัล ไม่พัฒนาใหม่ ให้เชื่อมผ่าน Academic Service Hub

## 3. สภาพตั้งต้นที่ตรวจพบ (24 พ.ย. 2569)

| รายการ | สิ่งที่พบ | ผลต่อแผน |
|---|---|---|
| Repository | ว่าง ยังไม่มี commit | สร้างสถาปัตยกรรมใหม่ทั้งหมด |
| ภาพอ้างอิง Medico Dashboard | ไม่ได้แนบมากับคำสั่ง | ออกแบบตามคำบรรยายในข้อ 06 ของ Master Prompt ต้องให้โรงเรียนเทียบกับภาพจริงอีกครั้ง |
| ตราโรงเรียน | ไม่มีไฟล์ Asset | เว้นช่องไว้ให้อัปโหลดผ่าน Setup Wizard **ไม่วาดตราขึ้นเอง** ใช้เครื่องหมายของระบบ (ไอคอน Lucide) แทนชั่วคราว |
| Google Workspace Credentials | ไม่มี | พัฒนา Integration Adapter ของจริงไว้ครบ และใช้ Local Adapter ที่ติดป้าย Demo Data ใน Development ไม่ปลอมสถานะการเชื่อมต่อ |
| แม่แบบเอกสารจริง | ไม่มี | ใช้ตัวสร้าง PDF ในตัวระบบเป็น “ฉบับตัวอย่าง” พร้อมลายน้ำ จนกว่าจะได้ Google Docs Template จริง |
| เครือข่ายของเครื่องพัฒนา | เข้า `undraw.co`, `ui.shadcn.com`, เว็บเอกสารทางการไม่ได้ | เขียนภาพประกอบ SVG เอง อ้างอิงซอร์ส shadcn/ui และเอกสารจาก GitHub กับแพ็กเกจที่ติดตั้งจริง |

## 4. การตัดสินใจหลัก

เวอร์ชันทั้งหมดตรวจจาก npm registry และ `peerDependencies` จริงก่อนติดตั้ง และ pin แบบ exact พร้อม lockfile

| เรื่อง | ตัดสินใจ | เหตุผล / ทางเลือกที่ไม่เลือก |
|---|---|---|
| Framework | Next.js 16.4.6 (App Router, Turbopack), React 19.3.1 | รุ่น stable ล่าสุด ใช้ `proxy.ts` แทน `middleware.ts` ตาม Next 16 |
| TypeScript | 6.0.3 | รุ่น 7 (native) ยังไม่อยู่ในช่วงที่ `typescript-eslint` รองรับ (`<6.1.0`) |
| ESLint | 9.39.5 (flat config) | ปลั๊กอิน react / import / jsx-a11y ที่ `eslint-config-next` ใช้ยังไม่ประกาศรองรับ ESLint 10 |
| Styling | Tailwind CSS 4.3.5 + CSS Variables | Design Token ควบคุมจากไฟล์เดียว (`src/styles/tokens.css`) |
| UI Primitives | shadcn/ui (คัดลอกซอร์สเข้า repo) บน `radix-ui` 1.8.1 | CLI ของ shadcn เข้า registry ไม่ได้จากเครื่องพัฒนา จึงนำซอร์สทางการจาก GitHub มาปรับ มี `components.json` ให้ใช้ CLI ต่อได้ |
| Icons | `lucide-react` 1.79.0 ชุดเดียว | ตรวจชื่อ export ทุกตัวกับเวอร์ชันที่ติดตั้งแล้ว รวม mapping ไว้ที่ `src/config/icons.ts` |
| ฟอนต์ UI | Noto Sans Thai (Variable) แบบ self-host ผ่าน `@fontsource-variable` | มีหัว อ่านง่ายสำหรับงานเอกสาร ไม่พึ่งเครือข่ายตอน build · LINE Seed Sans TH ไม่มีแพ็กเกจทางการบน npm |
| ฟอนต์เอกสาร | Sarabun (OFL) ฝังใน PDF | ตระกูลเดียวกับ TH Sarabun ที่หนังสือราชการใช้ เมื่อได้แม่แบบจริงจะยึดตามแม่แบบ |
| Authentication | Auth.js (`next-auth` 5.0.0-beta.32) + Google OIDC | รุ่นเดียวที่ออกแบบสำหรับ App Router และประกาศรองรับ Next 16 · **ความเสี่ยง:** ยังเป็น beta จึงห่อไว้หลัง `src/lib/auth` เพื่อเปลี่ยนได้ในจุดเดียว |
| ฐานข้อมูล | Google Sheets 9 ไฟล์ ผ่าน `StorageAdapter` | ตามข้อกำหนด · ไม่ใช้ Supabase/Firebase/MongoDB/PostgreSQL |
| การเขียนข้อมูล | **Write Gateway** บน Google Apps Script + `LockService` ทุกการเขียนผ่านจุดเดียว | Sheets ไม่มี transaction · lock ในหน่วยความจำของ Next.js ใช้ข้าม serverless instance ไม่ได้ |
| การอ่านข้อมูล | Sheets REST API (`values:batchGet`) + server-side cache + read-your-writes | ลดจำนวนคำขอให้อยู่ในโควตา 60 ครั้ง/นาที/บัญชี |
| Google API Client | เรียก REST ตรงด้วย `fetch` + `google-auth-library` 11.3.4 | แพ็กเกจ `googleapis` ใหญ่เกินจำเป็นสำหรับ serverless และควบคุม retry/backoff เองได้ชัดเจนกว่า |
| ที่เก็บไฟล์ | Google Drive (แนะนำ Shared Drive) ผ่าน `DriveAdapter` | Service Account ไม่มีโควตาพื้นที่ของตนเองใน My Drive จึงต้องให้ Shared Drive เป็นเจ้าของไฟล์ |
| อัปโหลดไฟล์ใหญ่ | Upload Session: backend ขอ resumable session แล้ว browser ส่งไฟล์ตรงไป Google | Vercel จำกัด request body ราว 4.5 MB · ไม่ส่ง credentials ไป browser |
| สร้าง PDF | `google-docs` driver (แม่แบบจริง) และ `builtin-pdf` driver (`pdfkit` 0.21.0) | builtin ใช้เป็นฉบับตัวอย่างใน Development และทดสอบการแสดงผลภาษาไทยได้จริงโดยไม่ต้องมี credentials |
| การทดสอบ | Vitest 5.1.1 (unit/integration), Playwright 1.63.0 (E2E) | Playwright ตรงกับเบราว์เซอร์ที่ติดตั้งในเครื่องพัฒนา |

## 5. สถาปัตยกรรมโดยย่อ

```
Browser (React Client Components)
   │  Server Actions / Route Handlers  ← ตรวจ session + สิทธิ์ + validate ทุกครั้ง
   ▼
Services (business logic)             ← Approval, ClassLeave, FileRouting, FolderManagement, Notification, AuditLog …
   ▼
Repositories (typed, schema-validated)
   ▼
StorageAdapter ──────────────┬──────────────── DriveAdapter
   │ read: Sheets API + cache │                 │ Google Drive API
   │ write: Write Gateway     │                 │ (local: โฟลเดอร์ .data สำหรับ Development)
   ▼                          ▼
Google Apps Script (LockService) → Google Sheets 9 ไฟล์
```

- Schema ของทุก Worksheet นิยามในโค้ดที่เดียว (`src/schemas/database`) ใช้ทั้งตรวจข้อมูล สร้างหัวคอลัมน์ใน Setup Wizard และ generate `DATA_DICTIONARY.md`
- ตรรกะของ Write Gateway เขียนครั้งเดียวเป็น TypeScript ที่ไม่ผูกกับ runtime (`src/lib/storage/gateway-core`) แล้ว bundle ไปเป็น Apps Script
  Local Adapter ใช้ตรรกะชุดเดียวกัน จึงทดสอบ idempotency, version check และการออกเลขได้โดยไม่ต้องต่อ Google
- รายละเอียด: [ARCHITECTURE.md](./ARCHITECTURE.md), [DATABASE.md](./DATABASE.md), [FILE_ROUTING.md](./FILE_ROUTING.md), [SECURITY.md](./SECURITY.md)

## 6. Roadmap และเกณฑ์ผ่านของแต่ละ Phase

ทุก Phase ต้องผ่าน lint, type check, automated tests และ production build และบันทึกผลจริงใน [TEST_REPORT.md](./TEST_REPORT.md)
ห้ามระบุ Production Ready ก่อนผ่าน UAT กับข้อมูลและ Google Workspace จริงของโรงเรียน

| Phase | ขอบเขต | เกณฑ์ผ่าน (Acceptance Scenario ในข้อ 39) |
|---|---|---|
| 0 Architecture & Foundation | แผน, สถาปัตยกรรม, data model, โครงสร้าง Drive, permission matrix, design system, shared components, integration layer, auth, setup wizard, repository layer | #2, #12, #13, #19, #21 ผ่านใน automated tests ระดับ adapter |
| 1 Home & Academic Gateway | Login, My Workspace, Executive Dashboard เบื้องต้น, Service Hub, Global Search, Notification Center, Admin Console พื้นฐาน | #1, #3, #4, #20, #24, #25 |
| 2 Document Foundation | Folder Manager, File Routing, Registries, Document Explorer, Templates, Version Control, Approval Engine, สารบรรณ 7 ระบบ | #8, #11, #14, #22 |
| 3 Student Class Leave | Student Picker, Timetable, คำร้อง, PDF, อนุมัติ, แจ้งครู, เช็กการเข้าร่วม, สถิติ | #5, #6, #7, #9, #10 |
| 4 Task Management | มอบหมายงาน, Kanban, Submission Center, ตรวจงาน, งานค้าง | #15, #16, #17 |
| 5 Calendar & Meeting | ปฏิทิน, การประชุม, ลงชื่อ QR, รายงาน/มติ, มติ→Task | #18 |
| 6 Personnel & Knowledge | ผังองค์กร, ภาระงาน, ประสานกลุ่มสาระ, ข่าวสาร, แบบสำรวจ | — (เกณฑ์เฉพาะ Module) |
| 7 Reporting & Intelligence | Report Center, Analytics, Admin Console ฉบับเต็ม, Storage, Health, Backup | #23 |
| 8 Production Readiness | Security audit, performance, concurrent users, permission/responsive/a11y, backup recovery, UAT | ทุกข้อ กับระบบจริงของโรงเรียน |

## 7. รอบการทำงานนี้ (Iteration 1)

เป้าหมาย: **Phase 0 ครบ + หน้ามาตรฐาน 6 หน้าที่ทำงานได้จริง** เพื่อใช้เป็นมาตรฐาน UI และพิสูจน์สถาปัตยกรรมตั้งแต่ปลายทางถึงที่เก็บข้อมูล
ไม่พัฒนา 34 ระบบแบบผิวเผินพร้อมกัน เมนูของระบบที่ยังไม่เปิดใช้จะ **ไม่แสดง** (ไม่มีปุ่มที่กดแล้วไม่ทำงาน) และดูสถานะรวมได้ที่หน้า “สถานะการพัฒนาระบบ”

| # | หน้ามาตรฐาน | ระบบย่อยที่เกี่ยวข้อง | สิ่งที่ต้องทำงานได้จริง |
|---|---|---|---|
| 1 | Login | — | Google Sign-in, allowlist, ปฏิเสธบัญชีภายนอก, demo login เฉพาะเมื่อใช้ Demo Data |
| 2 | My Workspace | 01.2 | ข้อมูลทุกส่วนมาจาก storage: บริการใช้บ่อย งานที่ต้องทำ เอกสารของฉัน ปฏิทิน กิจกรรมนักเรียนวันนี้ แจ้งเตือน |
| 3 | Academic Service Hub | 09.1–09.3 | เปิดลิงก์ผ่าน endpoint ที่ตรวจสิทธิ์และบันทึกสถิติ, รายการโปรด, จัดการลิงก์โดยไม่แก้โค้ด, ตรวจลิงก์แบบป้องกัน SSRF |
| 4 | Student Class Leave Form | 03.1 | ฟอร์ม 5 ขั้นตอน, เลือกนักเรียนข้ามห้อง, คำนวณคาบ/ครูที่กระทบจากตารางเรียน, ตรวจซ้ำซ้อน, แนบไฟล์, PDF ภาษาไทย, บันทึกร่าง/ส่งอนุมัติ |
| 5 | Document Management & Approval | 02.3, 03.2 | Workflow กำหนดได้, inbox, timeline, อนุมัติ/ไม่อนุมัติ/ส่งกลับ/ยกเลิก/ส่งใหม่, บันทึกผู้ดำเนินการและเวอร์ชัน, แจ้งเตือน |
| 6 | Document Explorer | 07.1 | Folder tree, grid/list, ค้นหา/กรอง, อัปโหลดผ่าน File Routing, preview, download ที่ตรวจสิทธิ์, version history, รายการโปรด, archive |

ส่วนประกอบพื้นฐานที่ทำพร้อมกัน: Setup Wizard, System Health, Notification Center, Global Search, App Launcher, Admin Console พื้นฐาน (ผู้ใช้และบทบาท)

### โครงสร้างไฟล์

```
src/
├── app/                 เส้นทาง (auth) และ (workspace), Route Handlers ใน api/
├── components/ui        shadcn primitives
├── components/layout    AppShell, Sidebar, Topbar, Breadcrumb, PageHeader …
├── components/shared    DataTable, StatusBadge, FileUploader, ApprovalTimeline, EmptyState …
├── features/<module>    Server Actions, queries และ UI เฉพาะ Module
├── config/              registry: modules, navigation, icons, roles, permissions, school
├── schemas/database     นิยาม 9 Spreadsheet (แหล่งความจริงเดียวของ schema)
├── lib/auth             Auth.js, session, demo login
├── lib/security         authorization, rate limit, URL/SSRF guard, file sniffing, CSV escape
├── lib/storage          StorageAdapter, gateway-core, local adapter, Google Sheets adapter
├── lib/drive            DriveAdapter (local, Google)
├── lib/google           REST client + retry, Sheets/Drive/Docs/Calendar services
├── repositories/        repository ต่อ entity
├── services/            business logic
└── styles/              tokens.css, globals.css
apps-script/             Write Gateway (bundle จาก gateway-core) + คู่มือ deploy
scripts/                 generate-docs, build-apps-script
tests/                   unit, integration, e2e
docs/                    เอกสารส่งมอบ
```

## 8. ข้อกำหนดร่วมที่ทุกงานต้องยึด

- ภาษาหลักของ UI เป็นภาษาไทย ใช้ชื่อโรงเรียนเต็ม “โรงเรียนเตรียมอุดมศึกษาน้อมเกล้า สมุทรปราการ” ทุกที่
- สีใช้จาก Design Token เท่านั้น พื้นขาว/ครีม 75–85% · Primary `#642517` · Accent `#942849` · Active menu พื้น `#FFE7E7` ตัวอักษร `#942849`
- ไอคอน Lucide แบบ outline, stroke 1.5–1.75 ห้าม emoji เป็นไอคอนเมนู ห้าม gradient หนัก/glassmorphism/ไอคอน 3D
- Transition 150–250 ms และเคารพ `prefers-reduced-motion`
- ตรวจสิทธิ์ที่ backend และ repository ทุกครั้ง การซ่อนเมนูไม่ใช่การควบคุมสิทธิ์
- ทุก record มี `id` ถาวร (UUID) ห้ามใช้เลขแถวเป็น primary key · timezone `Asia/Bangkok` · แสดงปี พ.ศ.
- รหัสนักเรียนและเลขเอกสารเก็บเป็นข้อความเสมอ (รักษาศูนย์นำหน้า) และกัน formula/CSV injection
- ห้ามสร้าง URL ระบบโรงเรียน รายชื่อบุคลากร/นักเรียนจริง ตรา หรือ ลายเซ็นขึ้นเอง
- ห้ามแสดงสถานะ Connected/Healthy/Upload Successful โดยไม่ได้ตรวจจริง
- ข้อมูลสมมติใช้ได้เฉพาะ Development/Staging และต้องติดป้าย **Demo Data** · Production แสดง Empty State หรือ Setup Required

## 9. จุดเสี่ยงที่ต้องมี test กำกับ (Review Focus)

| # | สถานการณ์ | พฤติกรรมที่ต้องได้ | Test |
|---|---|---|---|
| 1 | ผู้ใช้สองคนกดอนุมัติเอกสารเดียวกันพร้อมกัน | มีเพียงหนึ่งรายการที่สำเร็จ อีกรายการได้ข้อความว่าข้อมูลเปลี่ยนไปแล้ว | `gateway-core` version conflict, `approval-service` |
| 2 | ส่งคำขอเดิมซ้ำ (กดซ้ำ/เครือข่าย retry) | ไม่เกิดรายการซ้ำ ไม่ออกเลขซ้ำ ได้ผลลัพธ์เดิม | `gateway-core` idempotency |
| 3 | ออกเลขอ้างอิงพร้อมกันหลายคำขอ | เลขไม่ซ้ำและเรียงต่อเนื่อง | `gateway-core` sequences |
| 4 | สร้างโฟลเดอร์เดียวกันจากสองคำขอพร้อมกัน หรือผู้สร้างล่มกลางทาง | มีโฟลเดอร์เดียว ผู้มาทีหลังรับช่วงต่อได้ | `folder-management` |
| 5 | เปลี่ยน `id` ใน URL เพื่อเปิดไฟล์/คำร้องของผู้อื่น | 403/404 เสมอ ไม่มีข้อมูลรั่ว | `file-access`, `permissions`, E2E |
| 6 | รหัสนักเรียน `00123` หรือข้อความที่ขึ้นต้นด้วย `=` | เก็บและอ่านกลับได้ตรงตัว ไม่ถูกตีความเป็นสูตร | `serialization`, `csv` |
| 7 | อัปโหลดสำเร็จแต่บันทึก metadata ไม่สำเร็จ | สถานะ Pending Reconciliation และกู้คืนได้โดยไม่สร้างไฟล์ซ้ำ | `file-routing` |
| 8 | ไฟล์ปลอมนามสกุล (เช่น `.pdf` ที่เป็น HTML) หรือ SVG ที่มี script | ปฏิเสธ หรือทำให้ปลอดภัยก่อนเก็บ | `file-validation` |
| 9 | ลิงก์บริการชี้ไป private network / `javascript:` | ปฏิเสธตั้งแต่บันทึก และ link check ไม่ยิงออกไป | `safe-url` |
| 10 | Google API ตอบ 429/5xx | retry แบบ exponential backoff แล้วสำเร็จ หรือรายงานข้อผิดพลาดที่ชัดเจน | `google-client` |

## 10. ความเสี่ยงและข้อสมมติ

| ความเสี่ยง | ผลกระทบ | การรับมือ |
|---|---|---|
| ยังไม่ได้ทดสอบกับ Google Workspace จริง | Adapter อาจต้องปรับเมื่อต่อจริง | แยก adapter ชัดเจน มี unit test ระดับ request และ Setup Wizard ทดสอบอ่าน–เขียนจริงก่อนเปิดใช้ ระบุสถานะ “ยังไม่ทดสอบกับระบบจริง” ทุกที่ |
| โควตา Sheets API และความหน่วงของ Apps Script | ช้าเมื่อใช้พร้อมกันมาก | batch read, cache, เขียนครั้งเดียวต่อการกระทำ และทดสอบโหลดจริงใน Phase 8 ถ้าไม่พอจะรายงานตามผลทดสอบ ไม่เปลี่ยนฐานข้อมูลเอง |
| ไม่มี transaction ข้าม Spreadsheet และ Drive | ข้อมูลค้างครึ่งทาง | Operation Journal, ขั้นตอน idempotent, เครื่องมือ Reconciliation |
| Auth.js v5 ยังเป็น beta | API อาจเปลี่ยน | pin เวอร์ชัน และห่อไว้หลัง `src/lib/auth` |
| ข้อมูลส่วนบุคคลของนักเรียน (PDPA) | ความเสียหายหากรั่ว | สิทธิ์ระดับ record/ไฟล์, ไม่ส่งรายชื่อผ่านอีเมล, audit log, ไฟล์ไม่เป็นสาธารณะ |
| แม่แบบและขั้นตอนอนุมัติจริงยังไม่ได้รับ | เอกสารที่สร้างยังไม่ใช่รูปแบบทางการ | Workflow และแม่แบบตั้งค่าได้ ค่าเริ่มต้นเป็นตัวอย่างที่ระบุชัดว่าต้องยืนยัน |

## 11. สิ่งที่ต้องขอจากโรงเรียน

1. ไฟล์ตราโรงเรียนต้นฉบับที่ได้รับอนุญาต (SVG หรือ PNG พื้นใส) และภาพอ้างอิง Medico Dashboard
2. Google Workspace: โดเมน, Shared Drive สำหรับระบบ, GCP Project, OAuth Client, Service Account (ขั้นตอนใน [GOOGLE_WORKSPACE_SETUP.md](./GOOGLE_WORKSPACE_SETUP.md))
3. แม่แบบเอกสารจริง: บันทึกข้อความ หนังสือขอเวลาเรียน คำสั่ง หนังสือเชิญประชุม รายงานการประชุม เกียรติบัตร
4. ขั้นตอนอนุมัติจริงของเอกสารแต่ละประเภท และผู้มีอำนาจในแต่ละขั้น
5. แหล่งข้อมูลครู นักเรียน ห้องเรียน รายวิชา ตารางเรียน (รูปแบบ export หรือ API ของ TUNS-SIS)
6. URL ของระบบและบริการที่จะรวมใน Academic Service Hub
7. แนวปฏิบัติการนับเวลาเรียน เกณฑ์แจ้งเตือนคาบสะสม นโยบายเก็บรักษาข้อมูลและการสำรอง
8. จำนวนบุคลากรและรูปแบบการใช้งานพร้อมกัน เพื่อกำหนดการทดสอบโหลด

## 12. นิยามสถานะ

| สถานะ | เงื่อนไข |
|---|---|
| Not Started | ยังไม่มีโค้ด |
| In Progress | มีโค้ดบางส่วน ยังไม่ครบ flow |
| Implemented | ครบ flow ตามข้อกำหนดของระบบย่อย ผ่าน lint/type check/build |
| Tested | มี automated tests ครอบคลุม flow หลักและผ่านจริง |
| Ready for UAT | Tested + ต่อ Google Workspace จริงใน Staging สำเร็จ + มีคู่มือ |
| Production Ready | ผ่าน UAT และเกณฑ์ Phase 8 กับข้อมูลจริง ได้รับการตรวจรับจากโรงเรียน |
| Blocked | รอข้อมูล/สิทธิ์จากภายนอก (ระบุสิ่งที่รอ) |
