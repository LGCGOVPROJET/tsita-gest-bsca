import { describe, expect, it } from 'vitest';
import { validateFiles } from '@/components/ui/fileValidation';

const file = (name: string, type: string, size = 1000) => {
  const f = new File(['x'], name, { type });
  Object.defineProperty(f, 'size', { value: size });
  return f;
};

describe('validation des pièces', () => {
  it('accepte pdf/jpg/png', () => {
    const r = validateFiles([], [file('a.pdf', 'application/pdf'), file('b.png', 'image/png')], 5);
    expect(r.accepted).toHaveLength(2);
    expect(r.errors).toHaveLength(0);
  });
  it('refuse un format non autorisé et un fichier > 10 Mo', () => {
    const r = validateFiles([], [file('a.exe', 'application/x-msdownload'), file('b.pdf', 'application/pdf', 11 * 1024 * 1024)], 5);
    expect(r.accepted).toHaveLength(0);
    expect(r.errors[0]).toMatch(/format non accepté/);
    expect(r.errors[1]).toMatch(/10 Mo/);
  });
  it('refuse une extension autorisée dont le type réel est interdit, et un type autorisé avec une extension interdite', () => {
    const r = validateFiles([], [file('facture.pdf', 'text/html'), file('photo.svg', 'image/png'), file('scan.jpg', '')], 5);
    expect(r.accepted.map((f) => f.name)).toEqual(['scan.jpg']);
    expect(r.errors).toHaveLength(2);
  });
  it('limite à 5 fichiers', () => {
    const existing = Array.from({ length: 4 }, (_, i) => file(`f${i}.pdf`, 'application/pdf'));
    const r = validateFiles(existing, [file('x.pdf', 'application/pdf'), file('y.pdf', 'application/pdf')], 5);
    expect(r.accepted).toHaveLength(1);
    expect(r.errors[0]).toMatch(/Nombre maximal/);
  });
});
