<?php

declare(strict_types=1);

namespace Tests;

use App\Enums\ComplaintStatus;
use App\Models\Channel;
use App\Models\Complaint;
use App\Models\Customer;
use App\Models\User;
use App\Services\DeadlineCalculator;
use App\Services\ReferenceGenerator;
use App\Services\TrackingCodeService;
use App\Support\Dt;
use Carbon\CarbonImmutable;
use Database\Seeders\DeadlineRuleSeeder;
use Database\Seeders\HolidaySeeder;
use Database\Seeders\ReferentialSeeder;
use Database\Seeders\TemplateSeeder;
use Database\Seeders\UserSeeder;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Illuminate\Support\Facades\Hash;

abstract class TestCase extends BaseTestCase
{
    /** Référentiels, comptes démo, calendrier, règles de démonstration, modèles. */
    protected function seedBase(): void
    {
        $this->seed([ReferentialSeeder::class, UserSeeder::class, HolidaySeeder::class, DeadlineRuleSeeder::class, TemplateSeeder::class]);
        app(DeadlineCalculator::class)->flushCache();
    }

    protected function user(string $prefix): User
    {
        return User::query()->where('email', $prefix.'@bsca.demo')->firstOrFail();
    }

    /** Date locale Africa/Brazzaville → instant UTC. */
    protected function local(string $datetime): CarbonImmutable
    {
        return CarbonImmutable::parse($datetime, Dt::tz())->setTimezone('UTC');
    }

    /**
     * Crée un dossier (échéances planifiées) pour les tests.
     *
     * @param  array<string, mixed>  $attributes
     */
    protected function makeComplaint(array $attributes = [], ?string $trackingCode = null): Complaint
    {
        $received = $attributes['received_at'] ?? Dt::now()->subDays(2);
        unset($attributes['received_at']);
        $customer = isset($attributes['customer_id']) ? null : Customer::query()->create(['full_name' => 'Jean Moukala', 'email' => 'jean@exemple.invalid', 'preferred_channel' => 'email']);

        $complaint = Complaint::query()->create(array_merge([
            'reference' => app(ReferenceGenerator::class)->next($received),
            'tracking_code_hash' => Hash::make(TrackingCodeService::normalize($trackingCode ?? 'ABCD2345')),
            'customer_id' => $customer?->id,
            'channel_id' => Channel::query()->where('code', 'agence')->value('id'),
            'subject' => 'Objet fictif de test',
            'description' => 'Description fictive de test.',
            'status' => ComplaintStatus::Recu,
            'priority' => 'normale',
            'risk_level' => 'faible',
            'received_at' => $received,
            'acknowledgment_status' => 'en_attente',
        ], $attributes));
        app(DeadlineCalculator::class)->scheduleFor($complaint);

        return $complaint->refresh();
    }

    /** En-têtes d'une requête SPA (origine déclarée « stateful »). */
    protected function spa(): static
    {
        return $this->withHeaders(['Origin' => 'http://localhost:5180', 'Referer' => 'http://localhost:5180/', 'Accept' => 'application/json']);
    }
}
