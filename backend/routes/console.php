<?php

declare(strict_types=1);

use App\Services\DeadlineCalculator;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('tsita:refresh-deadlines', function (DeadlineCalculator $calculator): void {
    $count = $calculator->refreshOverdue();
    $this->info("Échéances passées au statut « dépassée » : {$count}");
})->purpose('Met à jour le statut des échéances échues non atteintes');

Schedule::command('tsita:refresh-deadlines')->hourly();
