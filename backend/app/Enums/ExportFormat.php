<?php

declare(strict_types=1);

namespace App\Enums;

enum ExportFormat: string
{
    use HasLabels;

    case Csv = 'csv';
    case Xlsx = 'xlsx';
    case Pdf = 'pdf';

    public function label(): string
    {
        return match ($this) {
            self::Csv => 'CSV',
            self::Xlsx => 'Excel (XLSX)',
            self::Pdf => 'PDF',
        };
    }
}
