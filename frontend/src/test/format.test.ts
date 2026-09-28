import { describe, expect, it } from 'vitest';
import { addDays, formatDate, formatDateTime, formatMoney, formatPercent, monthStart, todayLocal } from '@/lib/format';

const nbsp = (s: string) => s.replace(/[\u00a0\u202f]/g, ' ');

describe('formatMoney', () => {
  it('affiche « Inconnu » pour un montant null, vide ou non défini (jamais 0)', () => {
    expect(formatMoney(null, 'XAF')).toBe('Inconnu');
    expect(formatMoney(undefined, 'XAF')).toBe('Inconnu');
    expect(formatMoney('', 'XAF')).toBe('Inconnu');
    expect(formatMoney(null, null)).toBe('Inconnu');
  });

  it('formate un montant en FCFA selon fr-FR', () => {
    expect(nbsp(formatMoney('150000.00', 'XAF'))).toBe('150 000 FCFA');
  });

  it('conserve un montant nul réel (0) distinct de l’inconnu', () => {
    expect(nbsp(formatMoney('0.00', 'XAF'))).toBe('0 FCFA');
  });

  it('signale une devise absente plutôt que d’en inventer une', () => {
    expect(nbsp(formatMoney('1500.5', null))).toBe('1 500,5 (devise non précisée)');
  });

  it('formate les autres devises', () => {
    expect(nbsp(formatMoney(1234.5, 'EUR'))).toBe('1 234,50 €');
  });
});

describe('dates Africa/Brazzaville', () => {
  it('convertit un horodatage UTC vers l’heure de Brazzaville (UTC+1)', () => {
    expect(formatDateTime('2026-09-27T23:30:00Z')).toBe('28/09/2026 à 00:30');
  });

  it('ne décale pas une date seule', () => {
    expect(formatDate('2026-01-01')).toBe('01/01/2026');
  });

  it('calcule le jour local', () => {
    expect(todayLocal(new Date('2026-12-31T23:30:00Z'))).toBe('2027-01-01');
  });

  it('gère les décalages de jours et de mois', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(monthStart('2026-09-28', 5)).toBe('2026-04-01');
  });

  it('affiche un taux non calculable si dénominateur nul', () => {
    expect(formatPercent(null)).toBe('Non calculable');
    expect(nbsp(formatPercent(73.46))).toBe('73,5 %');
  });
});
