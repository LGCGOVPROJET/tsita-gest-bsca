import { ShieldCheck } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Stat, StatList } from '@/components/ui/Stat';
import { MfaEnrollment } from '@/features/auth/MfaEnrollment';

export default function AccountSecurityPage() {
  useDocumentTitle('Sécurité du compte');
  const { user } = useAuth();
  if (!user) return null;
  return (
    <>
      <PageHeader eyebrow="Mon compte" title="Sécurité du compte" sub="Double authentification et informations de connexion." />
      <div className="twocol">
        <Card title="Double authentification (TOTP)">
          <MfaEnrollment />
        </Card>
        <Card title="Mon profil">
          <StatList>
            <Stat label="Nom">{user.name}</Stat>
            <Stat label="E-mail">{user.email}</Stat>
            <Stat label="Rôle">{user.role_label}</Stat>
            <Stat label="Périmètre">{user.agency?.name ?? user.entity?.name ?? 'Toute la banque'}</Stat>
            <Stat label="Double authentification">
              {user.mfa_enabled ? (
                <Badge tone="success" icon={ShieldCheck}>
                  Active
                </Badge>
              ) : (
                <Badge tone={user.mfa_required ? 'warn' : 'outline'}>{user.mfa_required ? 'Exigée par votre profil' : 'Inactive'}</Badge>
              )}
            </Stat>
          </StatList>
          <p className="caption" style={{ marginTop: 10 }}>
            Session fermée après 30 minutes d'inactivité. En cas de perte du téléphone, demandez la réinitialisation à l'administrateur.
          </p>
        </Card>
      </div>
    </>
  );
}
