<?php

declare(strict_types=1);

namespace App\Services;

use App\Enums\ExportFormat;
use App\Models\Export;
use App\Models\User;
use App\Support\ComplaintFilters;
use App\Support\Dt;
use Barryvdh\DomPDF\Facade\Pdf;
use OpenSpout\Common\Entity\Row;
use OpenSpout\Writer\XLSX\Writer as XlsxWriter;
use Symfony\Component\HttpFoundation\Response;

/**
 * Exports contrôlés CSV / XLSX / PDF.
 * Chaque fichier porte un en-tête : période, filtres, date de calcul, version de règle, utilisateur.
 * Chaque export est journalisé dans la table `exports` (et dans audit_logs).
 */
final class ExportService
{
    public function __construct(
        private readonly DeadlineCalculator $deadlines,
        private readonly AuditLogger $audit,
    ) {}

    /**
     * @param  list<string>  $columns
     * @param  iterable<list<mixed>>  $rows
     * @param  array<int, array{title: string, columns: list<string>, rows: list<list<mixed>>}>  $extraSections
     */
    public function download(
        string $type,
        string $title,
        ExportFormat $format,
        ComplaintFilters $filters,
        User $user,
        array $columns,
        iterable $rows,
        array $extraSections = [],
        bool $anonymized = false,
    ): Response {
        $rows = is_array($rows) ? $rows : iterator_to_array($rows, false);
        $header = $this->headerLines($title, $filters, $user);
        if ($anonymized) {
            $header[] = 'Export agrégé anonymisé : aucune donnée nominative (profil sans permission d\'export nominatif).';
        }
        $sections = array_merge([['title' => $title, 'columns' => $columns, 'rows' => $rows]], $extraSections);
        $rowCount = array_sum(array_map(static fn ($s) => count($s['rows']), $sections));

        Export::query()->create([
            'user_id' => $user->id,
            'type' => $type,
            'format' => $format,
            'filters' => $filters->toArray(),
            'period_from' => $filters->from?->format('Y-m-d'),
            'period_to' => $filters->to?->format('Y-m-d'),
            'as_of' => Dt::endOfLocalDay($filters->asOf),
            'rule_version' => $this->deadlines->finalRuleVersionLabel(),
            'row_count' => $rowCount,
        ]);
        $this->audit->log('export.'.$type, null, null, [
            'format' => $format->value, 'filters' => $filters->toArray(), 'rows' => $rowCount, 'anonymized' => $anonymized,
        ], null, $user);

        $filename = 'tsita-gest-'.$type.'-'.Dt::now()->setTimezone(Dt::tz())->format('Ymd-His').'.'.$format->value;

        return match ($format) {
            ExportFormat::Csv => $this->csv($filename, $header, $sections),
            ExportFormat::Xlsx => $this->xlsx($filename, $header, $sections),
            ExportFormat::Pdf => $this->pdf($filename, $title, $header, $sections),
        };
    }

    /** @return list<string> */
    public function headerLines(string $title, ComplaintFilters $f, User $user): array
    {
        $filters = $f->dimensionFilters();
        $filterText = $filters === [] ? 'aucun' : implode(', ', array_map(static fn ($k, $v) => $k.'='.$v, array_keys($filters), $filters));
        $period = ($f->from?->format('d/m/Y') ?? 'début').' → '.($f->to?->format('d/m/Y') ?? 'fin');
        $lines = [
            'TSITA GEST × BSCA Bank — '.$title,
            'Période : '.$period.' (fuseau '.Dt::tz().')',
            'Filtres : '.$filterText,
            'Date de calcul : '.$f->asOf->format('d/m/Y'),
            'Version de règle : '.($this->deadlines->finalRuleVersionLabel() ?? 'aucune règle applicable'),
            'Utilisateur : '.$user->name.' ('.$user->email.')',
            'Généré le : '.Dt::now()->setTimezone(Dt::tz())->format('d/m/Y H:i'),
        ];
        if (config('app.demo_mode')) {
            $lines[] = 'Données fictives de démonstration — aucun chiffre réel BSCA.';
        }

        return $lines;
    }

    /** Neutralise les formules (injection CSV/Excel). */
    public static function safeCell(mixed $value): string|int|float|null
    {
        if ($value === null || is_int($value) || is_float($value)) {
            return $value;
        }
        if (is_bool($value)) {
            return $value ? 'oui' : 'non';
        }
        $value = (string) $value;
        if ($value !== '' && in_array($value[0], ['=', '+', '-', '@', "\t", "\r"], true) && ! is_numeric($value)) {
            return "'".$value;
        }

        return $value;
    }

    /** @param list<array{title: string, columns: list<string>, rows: list<list<mixed>>}> $sections */
    private function csv(string $filename, array $header, array $sections): Response
    {
        $fh = fopen('php://temp', 'w+');
        fwrite($fh, "\xEF\xBB\xBF");
        foreach ($header as $line) {
            fputcsv($fh, [self::safeCell($line)], ';', '"', '');
        }
        foreach ($sections as $section) {
            fputcsv($fh, [], ';', '"', '');
            fputcsv($fh, [self::safeCell($section['title'])], ';', '"', '');
            fputcsv($fh, $section['columns'], ';', '"', '');
            foreach ($section['rows'] as $row) {
                fputcsv($fh, array_map(self::safeCell(...), $row), ';', '"', '');
            }
        }
        rewind($fh);
        $content = (string) stream_get_contents($fh);
        fclose($fh);

        return response($content, 200, [
            'Content-Type' => 'text/csv; charset=UTF-8',
            'Content-Disposition' => 'attachment; filename="'.$filename.'"',
        ]);
    }

    /** @param list<array{title: string, columns: list<string>, rows: list<list<mixed>>}> $sections */
    private function xlsx(string $filename, array $header, array $sections): Response
    {
        $path = tempnam(sys_get_temp_dir(), 'tg-xlsx-');
        $writer = new XlsxWriter;
        $writer->openToFile($path);
        foreach ($header as $line) {
            $writer->addRow(Row::fromValues([self::safeCell($line)]));
        }
        foreach ($sections as $section) {
            $writer->addRow(Row::fromValues(['']));
            $writer->addRow(Row::fromValues([self::safeCell($section['title'])]));
            $writer->addRow(Row::fromValues($section['columns']));
            foreach ($section['rows'] as $row) {
                $writer->addRow(Row::fromValues(array_map(static fn ($v) => self::safeCell($v) ?? '', $row)));
            }
        }
        $writer->close();
        $content = (string) file_get_contents($path);
        @unlink($path);

        return response($content, 200, [
            'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition' => 'attachment; filename="'.$filename.'"',
        ]);
    }

    /** @param list<array{title: string, columns: list<string>, rows: list<list<mixed>>}> $sections */
    private function pdf(string $filename, string $title, array $header, array $sections): Response
    {
        $e = static fn ($v): string => htmlspecialchars((string) ($v ?? ''), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
        $html = '<html><head><meta charset="utf-8"><style>
            body{font-family:DejaVu Sans,Arial,sans-serif;font-size:9px;color:#172637}
            h1{font-size:15px;color:#12395E;border-bottom:2px solid #D9132C;padding-bottom:4px}
            h2{font-size:11px;color:#0B509A;margin-top:14px}
            .hdr p{margin:1px 0;color:#5A6B7B}
            table{border-collapse:collapse;width:100%;margin-top:4px}
            th{background:#12395E;color:#fff;text-align:left;padding:3px}
            td{border-bottom:1px solid #DDE4EC;padding:3px}
            </style></head><body>';
        $html .= '<h1>'.$e($title).'</h1><div class="hdr">';
        foreach ($header as $line) {
            $html .= '<p>'.$e($line).'</p>';
        }
        $html .= '</div>';
        foreach ($sections as $section) {
            $html .= '<h2>'.$e($section['title']).'</h2><table><thead><tr>';
            foreach ($section['columns'] as $c) {
                $html .= '<th>'.$e($c).'</th>';
            }
            $html .= '</tr></thead><tbody>';
            foreach ($section['rows'] as $row) {
                $html .= '<tr>';
                foreach ($row as $v) {
                    $html .= '<td>'.$e($v).'</td>';
                }
                $html .= '</tr>';
            }
            $html .= '</tbody></table>';
        }
        $html .= '</body></html>';

        $pdf = Pdf::loadHTML($html)->setPaper('a4', 'landscape')->setOption(['isRemoteEnabled' => false, 'isPhpEnabled' => false]);

        return response($pdf->output(), 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => 'attachment; filename="'.$filename.'"',
        ]);
    }
}
