import { z } from 'zod';
import { todayLocal } from '@/lib/format';
import { optionalAmount } from '@/lib/validation';

export const filingSchema = z.object({
  full_name: z.string().trim().min(2, 'Indiquez votre nom et prénom.').max(150),
  email: z.string().trim().min(1, 'Indiquez votre adresse e-mail.').max(190, '190 caractères maximum.').email('Adresse e-mail invalide (ex. nom@exemple.cg).'),
  phone: z
    .string()
    .trim()
    // Même règle que le serveur : chiffres, espaces, + ( ) . - (6 à 40 caractères).
    .refine((v) => v === '' || /^[0-9+().\s-]{6,40}$/.test(v), 'Numéro de téléphone invalide (ex. +242 06 000 00 00).'),
  customer_number: z.string().trim().max(40, '40 caractères maximum.').regex(/^[A-Za-z0-9-]*$/, 'Lettres, chiffres et tirets uniquement.'),
  preferred_channel: z.string().min(1, 'Choisissez comment recevoir notre réponse.'),
  product_id: z.string().min(1, 'Choisissez le produit concerné.'),
  category_id: z.string(),
  agency_id: z.string(),
  subject: z.string().trim().min(5, "Résumez l'objet en quelques mots (5 caractères minimum).").max(190, '190 caractères maximum.'),
  description: z.string().trim().min(20, 'Décrivez ce qui s’est passé (20 caractères minimum).').max(5000, '5 000 caractères maximum.'),
  operation_date: z.string().refine((v) => v === '' || v <= todayLocal(), "La date de l'opération ne peut pas être dans le futur."),
  amount: optionalAmount.refine((v) => v === '' || v.replace(/[.,].*$/, '').replace(/^0+(?=\d)/, '').length <= 13, 'Montant trop élevé.'),
  currency: z.string(),
  consent: z.boolean().refine((v) => v === true, 'Votre accord est nécessaire pour traiter votre réclamation.'),
});
export type FilingValues = z.infer<typeof filingSchema>;
