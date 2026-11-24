// ค่าเริ่มต้นของ environment สำหรับ unit/integration tests
// ใช้ที่เก็บข้อมูลแบบ local ในหน่วยความจำเสมอ ไม่แตะ Google Workspace จริง
process.env.TZ = 'UTC';
process.env.DATA_DRIVER = 'local';
process.env.LOCAL_DATA_DIR = '';
process.env.AUTH_SECRET = 'test-only-secret-not-for-production-0123456789';
