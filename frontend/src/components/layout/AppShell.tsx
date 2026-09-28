import { Suspense, useEffect, useState } from 'react';
import { Outlet } from 'react-router';
import { useRouteFocus } from '@/hooks/useRouteFocus';
import { readUiPref, writeUiPref } from '@/lib/uiPrefs';
import { useAuth } from '@/lib/auth-context';
import { can } from '@/lib/permissions';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { CommandPalette } from './CommandPalette';
import { PageSkeleton } from './PageSkeleton';

export function AppShell() {
  const [palette, setPalette] = useState(false);
  // Préférence d'affichage du menu (confort par utilisateur, stockage local non critique).
  const [collapsed, setCollapsed] = useState(() => readUiPref('sidebar.collapsed') === '1');
  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    writeUiPref('sidebar.collapsed', next ? '1' : '0');
  };

  const { user } = useAuth();
  const searchEnabled = can(user, 'complaints.view');

  useEffect(() => {
    if (!searchEnabled) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPalette((p) => !p);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [searchEnabled]);

  useRouteFocus();

  return (
    <div className={`app${collapsed ? ' collapsed' : ''}`}>
      <a href="#contenu" className="skip-link">
        Aller au contenu principal
      </a>
      <Sidebar collapsed={collapsed} onToggle={toggleCollapsed} />
      <div className="workspace">
        <Topbar onOpenSearch={() => setPalette(true)} />
        <main className="content" id="contenu" tabIndex={-1}>
          <Suspense fallback={<PageSkeleton />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
      <CommandPalette open={palette} onClose={() => setPalette(false)} />
    </div>
  );
}
