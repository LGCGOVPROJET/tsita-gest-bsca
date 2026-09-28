<?php

declare(strict_types=1);

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Base des requêtes API : l'autorisation fine est portée par les policies dans les contrôleurs.
 */
abstract class ApiRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** Codes de devise acceptés (ISO 4217). */
    public const CURRENCIES = ['XAF', 'EUR', 'USD', 'CNY', 'XOF'];

    /** Canaux de réponse souhaités : codes canal réels (§5 channels). */
    public const REPLY_CHANNELS = ['courriel', 'courrier', 'telephone'];

    public const MAX_AMOUNT = 9999999999999.99;
}
