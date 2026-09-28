<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\ComplaintStatus;
use App\Enums\DeadlineKind;
use App\Enums\Decision;
use App\Enums\DeliveryStatus;
use App\Enums\Priority;
use App\Enums\RiskLevel;
use App\Enums\Role;
use App\Models\Concerns\SerializesLocalDates;
use App\Support\Dt;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

/**
 * Réclamation. Aucune suppression n'est offerte aux profils métier.
 *
 * @property ComplaintStatus $status
 * @property ?Decision $decision
 */
class Complaint extends Model
{
    use SerializesLocalDates;

    /** @var list<string> */
    protected $fillable = [
        'reference', 'tracking_code_hash', 'customer_id', 'channel_id', 'receiving_agency_id',
        'processing_entity_id', 'category_id', 'product_id', 'subject', 'description', 'operation_date',
        'status', 'decision', 'priority', 'risk_level', 'amount', 'currency', 'amount_flagged',
        'received_at', 'acknowledged_at', 'acknowledgment_status', 'final_response_at', 'closed_at',
        'owner_id', 'deputy_id', 'parent_complaint_id', 'duplicate_of_id', 'mediation_requested_at',
        'source_system', 'source_id', 'source_status_label', 'consent_at', 'created_by',
    ];

    /** @var list<string> */
    protected $hidden = ['tracking_code_hash'];

    protected function casts(): array
    {
        return [
            'status' => ComplaintStatus::class,
            'decision' => Decision::class,
            'priority' => Priority::class,
            'risk_level' => RiskLevel::class,
            'acknowledgment_status' => DeliveryStatus::class,
            'amount' => 'decimal:2',
            'amount_flagged' => 'boolean',
            'operation_date' => 'date',
            'received_at' => 'datetime',
            'acknowledged_at' => 'datetime',
            'final_response_at' => 'datetime',
            'closed_at' => 'datetime',
            'mediation_requested_at' => 'datetime',
            'consent_at' => 'datetime',
        ];
    }

    // ----- Relations -----

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function channel(): BelongsTo
    {
        return $this->belongsTo(Channel::class);
    }

    public function receivingAgency(): BelongsTo
    {
        return $this->belongsTo(Agency::class, 'receiving_agency_id');
    }

    public function processingEntity(): BelongsTo
    {
        return $this->belongsTo(ProcessingEntity::class, 'processing_entity_id');
    }

    public function category(): BelongsTo
    {
        return $this->belongsTo(Category::class);
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function owner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'owner_id');
    }

    public function deputy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'deputy_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function parent(): BelongsTo
    {
        return $this->belongsTo(self::class, 'parent_complaint_id');
    }

    public function children(): HasMany
    {
        return $this->hasMany(self::class, 'parent_complaint_id');
    }

    public function duplicateOf(): BelongsTo
    {
        return $this->belongsTo(self::class, 'duplicate_of_id');
    }

    public function events(): HasMany
    {
        return $this->hasMany(ComplaintEvent::class);
    }

    public function deadlines(): HasMany
    {
        return $this->hasMany(ComplaintDeadline::class);
    }

    public function finalDeadline(): HasOne
    {
        return $this->hasOne(ComplaintDeadline::class)->where('kind', DeadlineKind::ReponseFinale->value);
    }

    public function attachments(): HasMany
    {
        return $this->hasMany(Attachment::class);
    }

    public function messages(): HasMany
    {
        return $this->hasMany(Message::class);
    }

    public function tasks(): HasMany
    {
        return $this->hasMany(Task::class);
    }

    public function solutions(): HasMany
    {
        return $this->hasMany(Solution::class);
    }

    public function controls(): HasMany
    {
        return $this->hasMany(QualityControl::class);
    }

    public function qualityActions(): BelongsToMany
    {
        return $this->belongsToMany(QualityAction::class, 'complaint_quality_action');
    }

    // ----- Helpers -----

    public function deadlineOf(DeadlineKind $kind): ?ComplaintDeadline
    {
        return $this->deadlines->firstWhere('kind', $kind);
    }

    /** Équivalent PHP du scope visibleTo (contrôle unitaire dans les policies). */
    public function isVisibleTo(User $user): bool
    {
        return match ($user->role) {
            Role::Client => $user->customer_id !== null && $this->customer_id === $user->customer_id,
            Role::AgentAccueil => ($user->agency_id !== null && $this->receiving_agency_id === $user->agency_id)
                || $this->created_by === $user->id,
            Role::Gestionnaire, Role::Responsable => $this->owner_id === $user->id
                || $this->deputy_id === $user->id
                || ($user->entity_id !== null && $this->processing_entity_id === $user->entity_id)
                // File « à orienter » : un dossier sans entité de traitement reste visible des
                // gestionnaires et responsables, seuls habilités à le qualifier, jusqu'à son orientation.
                || $this->processing_entity_id === null,
            Role::Qualite, Role::Conformite, Role::Direction => true,
            Role::Admin => false,
        };
    }

    public function isOpen(): bool
    {
        return $this->final_response_at === null;
    }

    // ----- Scopes -----

    /**
     * Périmètre de visibilité par rôle (§4). Toujours appliqué côté serveur.
     */
    public function scopeVisibleTo(Builder $query, User $user): Builder
    {
        return match ($user->role) {
            Role::Client => $query->where('complaints.customer_id', $user->customer_id ?? 0),
            Role::AgentAccueil => $query->where(function (Builder $q) use ($user): void {
                $q->where('complaints.receiving_agency_id', $user->agency_id ?? 0)
                    ->orWhere('complaints.created_by', $user->id);
            }),
            Role::Gestionnaire, Role::Responsable => $query->where(function (Builder $q) use ($user): void {
                $q->where('complaints.owner_id', $user->id)
                    ->orWhere('complaints.deputy_id', $user->id)
                    ->orWhere('complaints.processing_entity_id', $user->entity_id ?? 0)
                    ->orWhereNull('complaints.processing_entity_id'); // file « à orienter »
            }),
            Role::Qualite, Role::Conformite, Role::Direction => $query,
            Role::Admin => $query->whereRaw('1 = 0'),
        };
    }

    /** Ajoute les échéances (réponse finale, pré-alerte, accusé) en colonnes calculées. */
    public function scopeWithDeadlineColumns(Builder $query): Builder
    {
        if ($query->getQuery()->columns === null) {
            $query->select('complaints.*');
        }
        foreach (['reponse_finale' => 'final_due_at', 'prealerte' => 'prealert_at', 'accuse' => 'ack_due_at'] as $kind => $alias) {
            $query->selectSub(
                ComplaintDeadline::query()->select('due_at')
                    ->whereColumn('complaint_deadlines.complaint_id', 'complaints.id')
                    ->where('complaint_deadlines.kind', $kind)
                    ->limit(1),
                $alias,
            );
        }

        return $query;
    }

    /** Sous-requête SQL de l'échéance d'un type donné (pour filtres/tri). */
    public static function deadlineSql(string $kind): string
    {
        return "(select cd.due_at from complaint_deadlines cd where cd.complaint_id = complaints.id and cd.kind = '".addslashes($kind)."' limit 1)";
    }

    /**
     * Filtre sur le signal d'échéance calculé à l'instant $asOfUtc (chaîne 'Y-m-d H:i:s' UTC).
     */
    public function scopeWhereDeadlineFlag(Builder $query, string $flag, string $asOfUtc): Builder
    {
        $due = self::deadlineSql('reponse_finale');
        $pre = self::deadlineSql('prealerte');
        $ack = self::deadlineSql('accuse');
        $open = '(complaints.final_response_at is null or complaints.final_response_at > ?)';
        // Accusé non envoyé dont l'échéance tombe au plus tard le jour de calcul (fin de journée locale).
        $eod = Dt::db(Dt::endOfLocalDay(CarbonImmutable::parse($asOfUtc, 'UTC')));
        $risk = "(({$pre} is not null and {$pre} <= ?) or ({$ack} is not null and {$ack} <= '{$eod}' and (complaints.acknowledged_at is null or complaints.acknowledged_at > ?)))";

        return match ($flag) {
            'sans_regle' => $query->whereRaw("{$due} is null"),
            'clos_en_retard' => $query->whereRaw("{$due} is not null and complaints.final_response_at is not null and complaints.final_response_at <= ? and complaints.final_response_at > {$due}", [$asOfUtc]),
            'en_retard' => $query->whereRaw("{$due} is not null and {$open} and {$due} < ?", [$asOfUtc, $asOfUtc]),
            'a_risque' => $query->whereRaw("{$due} is not null and {$open} and {$due} >= ? and {$risk}", [$asOfUtc, $asOfUtc, $asOfUtc, $asOfUtc]),
            'ok' => $query->whereRaw("{$due} is not null")
                ->whereRaw("not ({$open} and {$due} < ?)", [$asOfUtc, $asOfUtc])
                ->whereRaw("not ({$open} and {$due} >= ? and {$risk})", [$asOfUtc, $asOfUtc, $asOfUtc, $asOfUtc])
                ->whereRaw("not (complaints.final_response_at is not null and complaints.final_response_at <= ? and complaints.final_response_at > {$due})", [$asOfUtc]),
            default => $query,
        };
    }
}
