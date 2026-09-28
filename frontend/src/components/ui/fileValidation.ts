/** Contraintes des pièces (§9.2) : pdf/jpg/png, 10 Mo max., 5 fichiers max. */
export const ALLOWED_MIME = ['application/pdf', 'image/jpeg', 'image/png'];
export const ALLOWED_EXT = ['.pdf', '.jpg', '.jpeg', '.png'];
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

export function validateFiles(current: File[], incoming: File[], maxFiles: number): { accepted: File[]; errors: string[] } {
  const errors: string[] = [];
  const accepted: File[] = [];
  for (const f of incoming) {
    const ext = f.name.slice(f.name.lastIndexOf('.')).toLowerCase();
    // L'extension doit être autorisée, et le type déclaré par le navigateur aussi lorsqu'il est connu.
    if (!ALLOWED_EXT.includes(ext) || (f.type !== '' && !ALLOWED_MIME.includes(f.type))) {
      errors.push(`« ${f.name} » : format non accepté (PDF, JPG ou PNG uniquement).`);
      continue;
    }
    if (f.size > MAX_FILE_BYTES) {
      errors.push(`« ${f.name} » : fichier trop volumineux (10 Mo maximum).`);
      continue;
    }
    if (current.length + accepted.length >= maxFiles) {
      errors.push(`Nombre maximal de fichiers atteint (${maxFiles}).`);
      break;
    }
    if (current.some((c) => c.name === f.name && c.size === f.size)) continue;
    accepted.push(f);
  }
  return { accepted, errors };
}
