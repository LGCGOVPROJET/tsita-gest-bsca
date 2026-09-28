<?php

declare(strict_types=1);

namespace App\Enums;

enum ComplaintStatus: string
{
    use HasLabels;

    case Brouillon = 'brouillon';
    case Recu = 'recu';
    case AQualifier = 'a_qualifier';
    case Affecte = 'affecte';
    case EnInvestigation = 'en_investigation';
    case AttenteInformation = 'attente_information';
    case SolutionProposee = 'solution_proposee';
    case AValider = 'a_valider';
    case ReponseEnvoyee = 'reponse_envoyee';
    case Cloture = 'cloture';
    case Reouvert = 'reouvert';

    public function label(): string
    {
        return match ($this) {
            self::Brouillon => 'Brouillon',
            self::Recu => 'Reçu',
            self::AQualifier => 'À qualifier',
            self::Affecte => 'Affecté',
            self::EnInvestigation => 'En investigation',
            self::AttenteInformation => 'Attente d\'information',
            self::SolutionProposee => 'Solution proposée',
            self::AValider => 'À valider',
            self::ReponseEnvoyee => 'Réponse envoyée',
            self::Cloture => 'Clôturé',
            self::Reouvert => 'Réouvert',
        };
    }

    /**
     * Transitions autorisées (§6). Les passages vers « reponse_envoyee » (envoi de réponse)
     * et « reouvert » (réouverture → dossier enfant) passent par des actions dédiées.
     *
     * @return list<self>
     */
    public function allowedTargets(): array
    {
        return match ($this) {
            self::Brouillon => [self::Recu],
            self::Recu => [self::AQualifier],
            self::AQualifier => [self::Affecte],
            self::Affecte => [self::EnInvestigation],
            self::EnInvestigation => [self::AttenteInformation, self::SolutionProposee],
            self::AttenteInformation => [self::EnInvestigation],
            self::SolutionProposee => [self::AValider, self::EnInvestigation],
            self::AValider => [self::SolutionProposee, self::ReponseEnvoyee],
            self::ReponseEnvoyee => [self::Cloture, self::Reouvert],
            self::Cloture => [self::Reouvert],
            self::Reouvert => [self::EnInvestigation],
        };
    }

    public function canTransitionTo(self $target): bool
    {
        return in_array($target, $this->allowedTargets(), true);
    }

    /** Transitions réalisables via POST /transition (hors actions dédiées). */
    public function manualTargets(): array
    {
        return array_values(array_filter(
            $this->allowedTargets(),
            static fn (self $t): bool => ! in_array($t, [self::ReponseEnvoyee, self::Reouvert], true),
        ));
    }

    /** Code du statut simplifié affiché au client (jamais le statut interne brut). */
    public function clientStatus(): string
    {
        return match ($this) {
            self::Brouillon, self::Recu, self::AQualifier => 'recue',
            self::Affecte, self::EnInvestigation, self::SolutionProposee, self::AValider => 'en_cours',
            self::AttenteInformation => 'information_demandee',
            self::ReponseEnvoyee => 'reponse_envoyee',
            self::Cloture => 'cloturee',
            self::Reouvert => 'reouverte',
        };
    }

    public function clientLabel(): string
    {
        return match ($this->clientStatus()) {
            'recue' => 'Reçue',
            'en_cours' => "En cours d'analyse",
            'information_demandee' => 'Information demandée',
            'reponse_envoyee' => 'Réponse envoyée',
            'cloturee' => 'Clôturée',
            default => 'Réouverte',
        };
    }

    public function isAnswered(): bool
    {
        return in_array($this, [self::ReponseEnvoyee, self::Cloture], true);
    }
}
