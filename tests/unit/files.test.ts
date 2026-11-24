import { describe, expect, it } from 'vitest';
import { AppError } from '@/lib/errors';
import {
  buildStoredFilename,
  extensionOf,
  parseStoredFilename,
  referenceTail,
  sanitizeOriginalFilename,
} from '@/services/files/naming';
import { cumulativeKeys, resolveFolderPath, safeFolderName } from '@/services/files/paths';
import {
  assertContentMatches,
  assertSafeSvg,
  sniffFileType,
  validateDeclaredFile,
} from '@/services/files/validation';
import { HTML_BYTES, PDF_BYTES, PNG_BYTES } from '../helpers/context';

const encode = (text: string) => new TextEncoder().encode(text);

describe('file naming standard', () => {
  it('builds the examples from the specification', () => {
    expect(
      buildStoredFilename({ moduleCode: 'CL', academicYear: '2569', referenceId: '0001', version: 1, extension: 'pdf' }),
    ).toBe('TUNS-CL-2569-0001-v01.pdf');
    expect(
      buildStoredFilename({ moduleCode: 'MEMO', academicYear: '2569', referenceId: '0001', version: 1, extension: 'DOCX' }),
    ).toBe('TUNS-MEMO-2569-0001-v01.docx');
    expect(
      buildStoredFilename({ moduleCode: 'LP', academicYear: '2569', referenceId: '0001', version: 2, extension: '.pdf' }),
    ).toBe('TUNS-LP-2569-0001-v02.pdf');
  });

  it('accepts attachment suffixes and gateway sequence tokens', () => {
    expect(
      buildStoredFilename({ moduleCode: 'CL', academicYear: '2569', referenceId: '0001-A{{seq:att:2}}', version: 1, extension: 'pdf' }),
    ).toBe('TUNS-CL-2569-0001-A{{seq:att:2}}-v01.pdf');
  });

  it('rejects values that could break out of the pattern', () => {
    const bad = [
      { referenceId: '../0001' },
      { referenceId: '0001 v02' },
      { referenceId: '' },
      { academicYear: '69' },
      { version: 0 },
      { version: 100 },
      { extension: 'pdf/..' },
    ];
    for (const override of bad) {
      expect(() =>
        buildStoredFilename({ moduleCode: 'CL', academicYear: '2569', referenceId: '0001', version: 1, extension: 'pdf', ...override }),
      ).toThrowError(AppError);
    }
  });

  it('round-trips through the parser', () => {
    expect(parseStoredFilename('TUNS-CL-2569-0001-A02-v03.pdf')).toEqual({
      moduleCode: 'CL',
      academicYear: '2569',
      referenceId: '0001-A02',
      version: 3,
      extension: 'pdf',
    });
    expect(parseStoredFilename('report.pdf')).toBeNull();
    expect(parseStoredFilename('TUNS-XX-2569-0001-v01.pdf')).toBeNull();
  });

  it('keeps the user’s original filename safe for metadata and headers', () => {
    expect(sanitizeOriginalFilename('C:\\Users\\ครู\\กำหนดการแข่งขัน.pdf')).toBe('กำหนดการแข่งขัน.pdf');
    expect(sanitizeOriginalFilename('../../etc/passwd')).toBe('passwd');
    expect(sanitizeOriginalFilename('a\u0000b\r\n"c".pdf')).toBe('abc.pdf');
    expect(sanitizeOriginalFilename('..')).toBe('file');
    expect(sanitizeOriginalFilename(`${'ก'.repeat(300)}.pdf`).endsWith('.pdf')).toBe(true);
    expect(sanitizeOriginalFilename(`${'ก'.repeat(300)}.pdf`).length).toBeLessThanOrEqual(180);
  });

  it('extracts extensions and reference tails', () => {
    expect(extensionOf('Report.Final.PDF')).toBe('pdf');
    expect(extensionOf('noextension')).toBe('');
    expect(extensionOf('.gitignore')).toBe('');
    expect(referenceTail('CL-2569-0001')).toBe('0001');
  });
});

describe('folder path resolver', () => {
  const term = { academicYear: '2569', semester: '2' };

  it('routes class leave attachments exactly as in the specification example', () => {
    const segments = resolveFolderPath({ moduleCode: 'CL', documentType: 'attachment', recordRef: 'CL-2569-0001', ...term });
    expect(segments.map((s) => s.name)).toEqual([
      '01_ปีการศึกษา',
      '2569',
      'ภาคเรียนที่ 2',
      '02_หนังสือขอเวลาเรียน',
      'CL-2569-0001',
      '02_เอกสารประกอบ',
    ]);
    expect(cumulativeKeys(segments).at(-1)).toBe(
      'years/ay:2569/sem:2/mod:class-leave/ref:CL-2569-0001/sub:attachment',
    );
    expect(segments.at(-1)?.accessScope).toBe('record');
  });

  it('uses every class leave sub-folder', () => {
    const names = ['letter', 'attachment', 'roster', 'approved', 'evidence'].map(
      (documentType) =>
        resolveFolderPath({ moduleCode: 'CL', documentType, recordRef: 'CL-2569-0001', ...term }).at(-1)?.name,
    );
    expect(names).toEqual(['01_ฉบับร่าง', '02_เอกสารประกอบ', '03_บัญชีรายชื่อ', '04_ฉบับอนุมัติ', '05_หลักฐานการเข้าร่วม']);
  });

  it('routes lesson plans by campaign, department and person', () => {
    const segments = resolveFolderPath({
      moduleCode: 'LP',
      documentType: 'submission',
      recordRef: 'SUB-2569-0003',
      department: { id: 'dept-sci', name: 'วิทยาศาสตร์และเทคโนโลยี' },
      personCode: 'T0042',
      ...term,
    });
    expect(segments.map((s) => s.name)).toEqual([
      '01_ปีการศึกษา',
      '2569',
      'ภาคเรียนที่ 2',
      '03_งานมอบหมายและรับส่งงาน',
      'แผนการจัดการเรียนรู้',
      'SUB-2569-0003',
      'วิทยาศาสตร์และเทคโนโลยี',
      'T0042',
    ]);
  });

  it('routes registers, library documents and assets', () => {
    expect(resolveFolderPath({ moduleCode: 'IN', documentType: 'original', ...term }).map((s) => s.name).slice(-2)).toEqual([
      '01_งานสารบรรณ',
      'หนังสือรับ',
    ]);
    expect(
      resolveFolderPath({ moduleCode: 'LIB', documentType: 'library', category: { key: 'forms', name: 'แบบฟอร์ม' } }).map((s) => s.name),
    ).toEqual(['03_คลังเอกสารกลาง', 'แบบฟอร์ม']);
    expect(resolveFolderPath({ moduleCode: 'AST', documentType: 'school_crest' }).map((s) => s.name)).toEqual([
      '04_Assets',
      'ตราโรงเรียน',
    ]);
  });

  it('refuses to guess a destination when information is missing', () => {
    expect(() => resolveFolderPath({ moduleCode: 'CL', documentType: 'attachment', recordRef: 'CL-1' })).toThrowError(AppError);
    expect(() => resolveFolderPath({ moduleCode: 'CL', documentType: 'attachment', ...term })).toThrowError(AppError);
    expect(() => resolveFolderPath({ moduleCode: 'CL', documentType: 'unknown', recordRef: 'x', ...term })).toThrowError(AppError);
    expect(() => resolveFolderPath({ moduleCode: 'LIB', documentType: 'library' })).toThrowError(AppError);
  });

  it('strips path characters from folder names', () => {
    expect(safeFolderName('a/b\\c:d*e?"f<g>h|i')).toBe('a b c d e f g h i');
    expect(safeFolderName('   ')).toBe('ไม่ระบุชื่อ');
  });
});

describe('file validation', () => {
  it('detects file types from content', () => {
    expect(sniffFileType(PDF_BYTES)).toBe('pdf');
    expect(sniffFileType(PNG_BYTES)).toBe('png');
    expect(sniffFileType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpeg');
    expect(sniffFileType(HTML_BYTES)).toBe('html');
    expect(sniffFileType(encode('<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBe('svg');
    expect(sniffFileType(encode('PK\u0003\u0004......word/document.xml'))).toBe('docx');
    expect(sniffFileType(encode('PK\u0003\u0004......xl/workbook.xml'))).toBe('xlsx');
    expect(sniffFileType(encode('PK\u0003\u0004......something.txt'))).toBe('zip');
    expect(sniffFileType(new Uint8Array())).toBe('empty');
    expect(sniffFileType(encode('MZ\u0090\u0000'))).toBe('unknown');
  });

  it('accepts only allowed extensions and takes the MIME type from the extension', () => {
    expect(validateDeclaredFile({ filename: 'กำหนดการ.PDF', size: 1000 })).toMatchObject({
      extension: 'pdf',
      mimeType: 'application/pdf',
    });
    for (const filename of ['virus.exe', 'macro.docm', 'page.html', 'script.js', 'archive.zip', 'noextension', 'photo.pdf.exe']) {
      expect(() => validateDeclaredFile({ filename, size: 10 }), filename).toThrowError(AppError);
    }
  });

  it('enforces size limits and per-upload restrictions', () => {
    expect(() => validateDeclaredFile({ filename: 'a.pdf', size: 0 })).toThrowError(AppError);
    expect(() => validateDeclaredFile({ filename: 'a.pdf', size: 26 * 1024 * 1024 })).toThrowError(AppError);
    expect(() => validateDeclaredFile({ filename: 'a.pdf', size: 2 * 1024 * 1024 }, { maxSizeBytes: 1024 * 1024 })).toThrowError(AppError);
    expect(() => validateDeclaredFile({ filename: 'a.png', size: 10 }, { allowedExtensions: ['pdf'] })).toThrowError(AppError);
    expect(() => validateDeclaredFile({ filename: 'a.svg', size: 2 * 1024 * 1024 })).toThrowError(AppError);
  });

  it('rejects files whose content does not match the extension', () => {
    expect(() => assertContentMatches('pdf', PDF_BYTES)).not.toThrow();
    expect(() => assertContentMatches('jpg', new Uint8Array([0xff, 0xd8, 0xff]))).not.toThrow();
    expect(() => assertContentMatches('pdf', HTML_BYTES)).toThrowError(AppError);
    expect(() => assertContentMatches('png', PDF_BYTES)).toThrowError(AppError);
    expect(() => assertContentMatches('docx', encode('PK\u0003\u0004 plain.zip'))).toThrowError(AppError);
    expect(() => assertContentMatches('exe', PDF_BYTES)).toThrowError(AppError);
  });

  it('accepts a plain SVG and rejects every scripted or external variant', () => {
    const svg = (inner: string) =>
      encode(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">${inner}</svg>`);
    expect(() =>
      assertSafeSvg(svg('<defs><clipPath id="c"><rect width="5" height="5"/></clipPath></defs><circle cx="5" cy="5" r="4" fill="#942849" clip-path="url(#c)"/><use href="#c"/>')),
    ).not.toThrow();

    const unsafe = [
      '<script>alert(1)</script>',
      '<SCRIPT xlink:href="x.js"/>',
      '<circle onload="alert(1)" r="1"/>',
      '<circle ONCLICK = "alert(1)" r="1"/>',
      '<a href="javascript:alert(1)"><circle r="1"/></a>',
      '<a href="&#106;avascript:alert(1)"><circle r="1"/></a>',
      '<a xlink:href="https://evil.example/"><circle r="1"/></a>',
      '<image href="https://evil.example/track.png"/>',
      '<foreignObject><body xmlns="http://www.w3.org/1999/xhtml"><iframe/></body></foreignObject>',
      '<animate attributeName="href" values="javascript:alert(1)"/>',
      '<set attributeName="onmouseover" to="alert(1)"/>',
      '<style>@import url("https://evil.example/x.css");</style>',
      '<rect fill="url(https://evil.example/x)"/>',
      '<use href="data:image/svg+xml;base64,AAAA#x"/>',
    ];
    for (const inner of unsafe) {
      expect(() => assertSafeSvg(svg(inner)), inner).toThrowError(AppError);
    }
    expect(() =>
      assertSafeSvg(encode('<!DOCTYPE svg [<!ENTITY x "y">]><svg xmlns="http://www.w3.org/2000/svg">&x;</svg>')),
    ).toThrowError(AppError);
  });
});
