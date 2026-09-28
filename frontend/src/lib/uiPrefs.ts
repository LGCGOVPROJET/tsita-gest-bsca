/**
 * Préférences d'affichage non sensibles (ex. menu replié), propres à chaque navigateur.
 * Seule exception autorisée à la règle ESLint qui interdit localStorage : aucune donnée
 * personnelle, aucun jeton, aucun code de suivi ne doit passer par ce module.
 */
type UiPref = 'sidebar.collapsed' | 'sidebar.folded';

const PREFIX = 'tsita.ui.';

export function readUiPref(key: UiPref): string | null {
  try {
    // eslint-disable-next-line no-restricted-properties -- préférence d'affichage non sensible
    return localStorage.getItem(PREFIX + key);
  } catch {
    return null;
  }
}

export function writeUiPref(key: UiPref, value: string): void {
  try {
    // eslint-disable-next-line no-restricted-properties -- préférence d'affichage non sensible
    localStorage.setItem(PREFIX + key, value);
  } catch {
    /* stockage indisponible (navigation privée, données bloquées) : la préférence n'est pas conservée */
  }
}
