<?php

declare(strict_types=1);

namespace App\Support;

use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Format de pagination du contrat : { data: [...], meta: { current_page, last_page, per_page, total } }.
 */
final class Paginated
{
    /**
     * @param  class-string<JsonResource>|callable  $transformer
     * @param  array<string, mixed>  $extra
     */
    public static function response(LengthAwarePaginator $paginator, string|callable $transformer, Request $request, array $extra = []): JsonResponse
    {
        $items = collect($paginator->items())->map(function ($item) use ($transformer, $request) {
            if (is_string($transformer)) {
                return (new $transformer($item))->toArray($request);
            }

            return $transformer($item);
        })->values();

        return response()->json(array_merge([
            'data' => $items,
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'per_page' => $paginator->perPage(),
                'total' => $paginator->total(),
            ],
        ], $extra));
    }
}
