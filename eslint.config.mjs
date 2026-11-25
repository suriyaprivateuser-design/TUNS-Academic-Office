import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';
import prettier from 'eslint-config-prettier';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTypescript,
  prettier,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    // กันไม่ให้ Client Component ดึงโมดูลฝั่ง Server (credentials, storage, services) เข้า bundle
    files: ['src/components/**/*.{ts,tsx}', 'src/hooks/**/*.{ts,tsx}'],
    rules: {
      // import เฉพาะ "ชนิดข้อมูล" ทำได้ (ถูกลบตอน build) แต่ห้าม import โค้ดที่ทำงานจริง
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              allowTypeImports: true,
              group: [
                '@/lib/env',
                '@/lib/google/*',
                '@/lib/storage/*',
                '@/lib/drive/*',
                '@/repositories/*',
                '@/services/*',
              ],
              message:
                'โมดูลฝั่ง Server ห้าม import จาก shared component/hook — ส่งข้อมูลผ่าน props หรือ Server Action แทน',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['scripts/**/*.ts', 'tests/**/*.ts', 'apps-script/**/*.ts'],
    rules: { 'no-console': 'off' },
  },
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    '.data/**',
    'coverage/**',
    'test-results/**',
    'playwright-report/**',
    'apps-script/dist/**',
  ]),
]);

export default eslintConfig;
