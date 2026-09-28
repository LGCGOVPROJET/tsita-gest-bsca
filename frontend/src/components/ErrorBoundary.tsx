import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (import.meta.env.DEV) console.error(error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="status-page" role="alert">
          <img src="/bsca-wide.png" alt="BSCA Bank" width={220} height={56} />
          <p className="eyebrow">Erreur inattendue</p>
          <h1>Un problème est survenu</h1>
          <p className="sub">L'affichage de cette page a échoué. Vos données n'ont pas été modifiées.</p>
          <div className="row" style={{ justifyContent: 'center', marginTop: 16 }}>
            <button type="button" className="btn" onClick={() => window.location.reload()}>
              Recharger la page
            </button>
            <a className="btn alt" href="/">
              Retour à l'accueil
            </a>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
