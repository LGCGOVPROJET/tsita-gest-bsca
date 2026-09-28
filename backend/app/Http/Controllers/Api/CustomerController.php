<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Services\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Recherche de client pour le rattachement lors d'une saisie agent (permission complaints.create).
 * 20 résultats maximum ; accès journalisé ; numéro client masqué.
 */
final class CustomerController extends Controller
{
    public function index(Request $request, AuditLogger $audit): JsonResponse
    {
        $data = $request->validate(['search' => ['required', 'string', 'min:2', 'max:100']]);
        $term = trim($data['search']);
        $like = '%'.addcslashes($term, '%_\\').'%';
        $digits = preg_replace('/\D+/', '', $term) ?? '';

        $customers = Customer::query()
            ->where(function ($q) use ($like, $digits): void {
                $q->where('full_name', 'like', $like)->orWhere('email', 'like', $like);
                if (strlen($digits) >= 4) {
                    $q->orWhereRaw("replace(replace(replace(phone, ' ', ''), '+', ''), '-', '') like ?", ['%'.$digits.'%']);
                }
            })
            ->withCount('complaints')
            ->orderBy('full_name')
            ->limit(20)
            ->get();

        $audit->log('customer.search', null, null, ['search' => mb_substr($term, 0, 100), 'results' => $customers->count()]);

        return response()->json(['data' => $customers->map(fn (Customer $c) => [
            'id' => $c->id,
            'full_name' => $c->full_name,
            'email' => $c->email,
            'phone' => $c->phone,
            'customer_number_masked' => self::maskNumber($c->customer_number),
            'preferred_channel' => $c->preferred_channel,
            'complaints_count' => $c->complaints_count,
        ])->values()]);
    }

    public static function maskNumber(?string $number): ?string
    {
        if ($number === null || $number === '') {
            return null;
        }
        $len = mb_strlen($number);

        return $len <= 4 ? str_repeat('•', $len) : str_repeat('•', $len - 4).mb_substr($number, -4);
    }
}
