import { z } from 'zod';

/** Politique §3 : 12 caractères min., majuscule, minuscule, chiffre, symbole. */
export const passwordSchema = z
  .string()
  .min(12, '12 caractères minimum.')
  .regex(/[A-Z]/, 'Au moins une majuscule.')
  .regex(/[a-z]/, 'Au moins une minuscule.')
  .regex(/\d/, 'Au moins un chiffre.')
  .regex(/[^A-Za-z0-9]/, 'Au moins un symbole.');

/** Montant saisi : vide = inconnu (null), jamais 0 par défaut. */
export const optionalAmount = z
  .string()
  .trim()
  .refine((v) => v === '' || /^\d+([.,]\d{1,2})?$/.test(v), 'Montant invalide (ex. 150000 ou 1500,50).');

export function normalizeAmount(v: string | undefined | null): string | null {
  if (!v || !v.trim()) return null;
  return v.trim().replace(',', '.');
}
