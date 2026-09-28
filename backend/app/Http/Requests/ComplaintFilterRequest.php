<?php

declare(strict_types=1);

namespace App\Http\Requests;

use App\Enums\ComplaintStatus;
use App\Enums\DeadlineFlag;
use App\Enums\ExportFormat;
use Illuminate\Validation\Rule;

/**
 * Filtres communs (§8) + options de liste. Tri sur liste blanche uniquement.
 */
class ComplaintFilterRequest extends ApiRequest
{
    public const SORTS = ['received_at', 'reference', 'status', 'due_at', 'priority'];

    public function rules(): array
    {
        $sorts = array_merge(self::SORTS, array_map(static fn ($s) => '-'.$s, self::SORTS));

        return [
            'from' => ['nullable', 'date_format:Y-m-d'],
            'to' => ['nullable', 'date_format:Y-m-d', 'after_or_equal:from'],
            'as_of' => ['nullable', 'date_format:Y-m-d'],
            'agency_id' => ['nullable', 'integer', 'min:1'],
            'entity_id' => ['nullable', 'integer', 'min:1'],
            'category_id' => ['nullable', 'integer', 'min:1'],
            'product_id' => ['nullable', 'integer', 'min:1'],
            'channel' => ['nullable', 'string', 'max:30', 'exists:channels,code'],
            'status' => ['nullable', Rule::in(ComplaintStatus::values())],
            'search' => ['nullable', 'string', 'max:100'],
            'deadline_flag' => ['nullable', Rule::in(DeadlineFlag::values())],
            'owner_id' => ['nullable', 'integer', 'min:1'],
            'mine' => ['nullable', 'boolean'],
            'sort' => ['nullable', Rule::in($sorts)],
            'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
            'format' => ['nullable', Rule::in(ExportFormat::values())],
            'queue' => ['nullable', Rule::in(['a_echeance', 'en_retard', 'clos_en_retard'])],
        ];
    }
}
