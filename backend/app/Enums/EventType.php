<?php

declare(strict_types=1);

namespace App\Enums;

enum EventType: string
{
    use HasLabels;

    case Created = 'created';
    case Acknowledged = 'acknowledged';
    case Qualified = 'qualified';
    case Assigned = 'assigned';
    case StatusChanged = 'status_changed';
    case Message = 'message';
    case Attachment = 'attachment';
    case Solution = 'solution';
    case Approval = 'approval';
    case ResponseSent = 'response_sent';
    case Reopened = 'reopened';
    case Duplicate = 'duplicate';
    case Escalated = 'escalated';
    case Deadline = 'deadline';

    public function label(): string
    {
        return match ($this) {
            self::Created => 'Création',
            self::Acknowledged => 'Accusé de réception',
            self::Qualified => 'Qualification',
            self::Assigned => 'Affectation',
            self::StatusChanged => 'Changement de statut',
            self::Message => 'Message',
            self::Attachment => 'Pièce jointe',
            self::Solution => 'Solution',
            self::Approval => 'Approbation',
            self::ResponseSent => 'Réponse envoyée',
            self::Reopened => 'Réouverture',
            self::Duplicate => 'Doublon',
            self::Escalated => 'Escalade',
            self::Deadline => 'Échéance',
        };
    }
}
