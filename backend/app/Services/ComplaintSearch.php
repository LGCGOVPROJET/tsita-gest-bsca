<?php

declare(strict_types=1);

namespace App\Services;

use App\Enums\Role;
use App\Models\Complaint;
use App\Models\User;
use App\Support\ComplaintFilters;
use App\Support\Dt;
use Illuminate\Database\Eloquent\Builder;

/**
 * Construction de la requête de liste (périmètre + filtres §8 + recherche + tri whitelisté).
 * Partagée par la liste, l'export et les files d'échéance pour garantir des filtres identiques.
 */
final class ComplaintSearch
{
    /** Correspondance tri public → expression SQL (liste blanche : aucune entrée utilisateur interpolée). */
    private const SORT_SQL = [
        'received_at' => 'complaints.received_at',
        'reference' => 'complaints.reference',
        'status' => 'complaints.status',
        'priority' => "field(complaints.priority, 'critique', 'haute', 'normale', 'basse')",
    ];

    /** @param array<string, mixed> $options */
    public function query(ComplaintFilters $filters, User $user, array $options = []): Builder
    {
        $q = Complaint::query()->visibleTo($user);
        $filters->applyDimensions($q);
        $filters->applyReceivedPeriod($q);

        $search = trim((string) ($options['search'] ?? ''));
        if ($search !== '') {
            $like = '%'.addcslashes($search, '%_\\').'%';
            $q->where(function (Builder $w) use ($like, $user): void {
                $w->where('complaints.reference', 'like', $like)
                    ->orWhere('complaints.subject', 'like', $like);
                // La direction ne peut pas rechercher par nom de client (données nominatives).
                if ($user->role !== Role::Direction) {
                    $w->orWhereHas('customer', fn (Builder $c) => $c->where('full_name', 'like', $like));
                }
            });
        }
        if (! empty($options['deadline_flag'])) {
            $q->whereDeadlineFlag((string) $options['deadline_flag'], Dt::db(Dt::now()));
        }
        if (! empty($options['owner_id'])) {
            $q->where('complaints.owner_id', (int) $options['owner_id']);
        }
        if (! empty($options['mine'])) {
            $q->where(fn (Builder $w) => $w->where('complaints.owner_id', $user->id)->orWhere('complaints.deputy_id', $user->id));
        }

        return $q;
    }

    public function applySort(Builder $q, ?string $sort, string $default = '-received_at'): Builder
    {
        $sort = $sort ?: $default;
        $desc = str_starts_with($sort, '-');
        $key = ltrim($sort, '-');
        $dir = $desc ? 'desc' : 'asc';

        if ($key === 'due_at') {
            $due = Complaint::deadlineSql('reponse_finale');
            $q->orderByRaw("{$due} is null asc")->orderByRaw("{$due} {$dir}");
        } elseif (isset(self::SORT_SQL[$key])) {
            $q->orderByRaw(self::SORT_SQL[$key].' '.$dir);
        }

        return $q->orderBy('complaints.id', $dir);
    }
}
