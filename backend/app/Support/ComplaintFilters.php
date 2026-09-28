<?php

declare(strict_types=1);

namespace App\Support;

use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;

/**
 * Filtres communs (§8) partagés par la liste, le tableau de bord, les rapports et les exports.
 */
final class ComplaintFilters
{
    public function __construct(
        public readonly ?CarbonImmutable $from,
        public readonly ?CarbonImmutable $to,
        public readonly CarbonImmutable $asOf,
        public readonly ?int $agencyId = null,
        public readonly ?int $entityId = null,
        public readonly ?int $categoryId = null,
        public readonly ?int $productId = null,
        public readonly ?string $channel = null,
        public readonly ?string $status = null,
    ) {}

    /** @param array<string, mixed> $input */
    public static function fromArray(array $input): self
    {
        $tz = Dt::tz();
        $asOf = ! empty($input['as_of']) ? CarbonImmutable::parse((string) $input['as_of'], $tz)->startOfDay() : Dt::today();

        return new self(
            from: ! empty($input['from']) ? CarbonImmutable::parse((string) $input['from'], $tz)->startOfDay() : null,
            to: ! empty($input['to']) ? CarbonImmutable::parse((string) $input['to'], $tz)->startOfDay() : null,
            asOf: $asOf,
            agencyId: isset($input['agency_id']) && $input['agency_id'] !== '' ? (int) $input['agency_id'] : null,
            entityId: isset($input['entity_id']) && $input['entity_id'] !== '' ? (int) $input['entity_id'] : null,
            categoryId: isset($input['category_id']) && $input['category_id'] !== '' ? (int) $input['category_id'] : null,
            productId: isset($input['product_id']) && $input['product_id'] !== '' ? (int) $input['product_id'] : null,
            channel: ! empty($input['channel']) ? (string) $input['channel'] : null,
            status: ! empty($input['status']) ? (string) $input['status'] : null,
        );
    }

    /**
     * Période par défaut pour les indicateurs : 6 mois glissants jusqu'à la date de calcul.
     */
    public function withDefaultPeriod(): self
    {
        $to = $this->to ?? $this->asOf;
        $from = $this->from ?? $to->subMonthsNoOverflow(5)->startOfMonth();

        return new self($from, $to, $this->asOf, $this->agencyId, $this->entityId, $this->categoryId, $this->productId, $this->channel, $this->status);
    }

    public function withPeriod(?CarbonImmutable $from, ?CarbonImmutable $to): self
    {
        return new self($from, $to, $this->asOf, $this->agencyId, $this->entityId, $this->categoryId, $this->productId, $this->channel, $this->status);
    }

    public function fromUtc(): ?string
    {
        return $this->from ? Dt::db(Dt::startOfLocalDay($this->from)) : null;
    }

    public function toUtc(): ?string
    {
        return $this->to ? Dt::db(Dt::endOfLocalDay($this->to)) : null;
    }

    /** Instant de calcul : fin de la journée locale as_of, en UTC. */
    public function asOfUtc(): string
    {
        return Dt::db(Dt::endOfLocalDay($this->asOf));
    }

    /** Applique les filtres de dimension (hors période). */
    public function applyDimensions(Builder $query): Builder
    {
        return $query
            ->when($this->agencyId, fn (Builder $q, int $v) => $q->where('complaints.receiving_agency_id', $v))
            ->when($this->entityId, fn (Builder $q, int $v) => $q->where('complaints.processing_entity_id', $v))
            ->when($this->categoryId, fn (Builder $q, int $v) => $q->where('complaints.category_id', $v))
            ->when($this->productId, fn (Builder $q, int $v) => $q->where('complaints.product_id', $v))
            ->when($this->channel, fn (Builder $q, string $v) => $q->whereHas('channel', fn (Builder $c) => $c->where('code', $v)))
            ->when($this->status, fn (Builder $q, string $v) => $q->where('complaints.status', $v));
    }

    /** Applique la période sur la date de réception. */
    public function applyReceivedPeriod(Builder $query): Builder
    {
        return $query
            ->when($this->fromUtc(), fn (Builder $q, string $v) => $q->where('complaints.received_at', '>=', $v))
            ->when($this->toUtc(), fn (Builder $q, string $v) => $q->where('complaints.received_at', '<=', $v));
    }

    /** @return array<string, mixed> */
    public function toArray(): array
    {
        return [
            'from' => $this->from?->format('Y-m-d'),
            'to' => $this->to?->format('Y-m-d'),
            'as_of' => $this->asOf->format('Y-m-d'),
            'agency_id' => $this->agencyId,
            'entity_id' => $this->entityId,
            'category_id' => $this->categoryId,
            'product_id' => $this->productId,
            'channel' => $this->channel,
            'status' => $this->status,
        ];
    }

    /** @return array<string, mixed> Filtres de dimension non vides. */
    public function dimensionFilters(): array
    {
        return array_filter([
            'agency_id' => $this->agencyId,
            'entity_id' => $this->entityId,
            'category_id' => $this->categoryId,
            'product_id' => $this->productId,
            'channel' => $this->channel,
            'status' => $this->status,
        ], static fn ($v) => $v !== null);
    }
}
