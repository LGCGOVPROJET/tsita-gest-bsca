<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\Models\Customer;
use App\Services\ExportService;
use App\Services\KpiService;
use App\Services\ReferenceGenerator;
use Database\Seeders\HolidaySeeder;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

final class SupportTest extends TestCase
{
    #[Test]
    public function paques_est_calculee_correctement(): void
    {
        $this->assertSame('2025-04-20', HolidaySeeder::easter(2025)->format('Y-m-d'));
        $this->assertSame('2026-04-05', HolidaySeeder::easter(2026)->format('Y-m-d'));
        $this->assertSame('2027-03-28', HolidaySeeder::easter(2027)->format('Y-m-d'));
        $labels = array_column(HolidaySeeder::forYear(2026), 1, 0);
        $this->assertSame('Lundi de Pâques', $labels['2026-04-06']);
        $this->assertSame('Ascension', $labels['2026-05-14']);
        $this->assertSame('Lundi de Pentecôte', $labels['2026-05-25']);
    }

    #[Test]
    public function le_nom_est_masque_pour_la_direction(): void
    {
        $this->assertSame('J. M***', Customer::mask('Jean Moukala'));
        $this->assertSame('É. N***', Customer::mask('élodie de la Nzaba'));
        $this->assertSame('***', Customer::mask(''));
    }

    #[Test]
    public function la_reference_ne_contient_aucune_information_client(): void
    {
        $ref = ReferenceGenerator::format(2026, 18);
        $this->assertSame('TG-BSCA-2026-000018', $ref);
        $this->assertMatchesRegularExpression(ReferenceGenerator::PATTERN, $ref);
    }

    #[Test]
    public function le_taux_expose_numerateur_et_denominateur(): void
    {
        $this->assertSame(['numerator' => 1, 'denominator' => 3, 'value' => 33.3], KpiService::rate(1, 3));
        $this->assertSame(['numerator' => 0, 'denominator' => 0, 'value' => null], KpiService::rate(0, 0));
    }

    #[Test]
    public function les_cellules_d_export_sont_neutralisees(): void
    {
        $this->assertSame("'=SOMME(A1)", ExportService::safeCell('=SOMME(A1)'));
        $this->assertSame("'@cmd", ExportService::safeCell('@cmd'));
        $this->assertSame('-12.5', ExportService::safeCell('-12.5'));
        $this->assertNull(ExportService::safeCell(null));
    }
}
