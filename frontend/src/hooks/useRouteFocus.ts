import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router';

/**
 * À chaque changement de route (pas au premier affichage) : remonte en haut de page
 * et place le focus sur le h1 de la nouvelle page (WCAG 2.4.3), pour que les lecteurs
 * d'écran annoncent la page. Le titre du document est géré par useDocumentTitle.
 * Les pages chargées paresseusement sont attendues jusqu'à 3 s.
 */
export function useRouteFocus(containerId = 'contenu') {
  const { pathname } = useLocation();
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    window.scrollTo(0, 0);
    let frame = 0;
    const started = performance.now();
    const tryFocus = () => {
      const root = document.getElementById(containerId);
      const h1 = root?.querySelector<HTMLElement>('h1');
      if (h1) {
        if (!h1.hasAttribute('tabindex')) h1.setAttribute('tabindex', '-1');
        h1.focus({ preventScroll: true });
        return;
      }
      if (performance.now() - started < 3000) frame = requestAnimationFrame(tryFocus);
      else root?.focus({ preventScroll: true });
    };
    frame = requestAnimationFrame(tryFocus);
    return () => cancelAnimationFrame(frame);
  }, [pathname, containerId]);
}
