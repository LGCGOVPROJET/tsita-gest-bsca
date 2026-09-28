<?php

declare(strict_types=1);

namespace App\Exceptions;

use Illuminate\Http\JsonResponse;
use RuntimeException;

/**
 * Règle métier non respectée → 422 { message, errors: { champ: [..] } }.
 */
final class BusinessRuleException extends RuntimeException
{
    /** @param array<string, list<string>> $errors */
    public function __construct(string $message, private readonly array $errors = [])
    {
        parent::__construct($message);
    }

    public static function field(string $field, string $message): self
    {
        return new self($message, [$field => [$message]]);
    }

    public function render(): JsonResponse
    {
        return response()->json([
            'message' => $this->getMessage(),
            'errors' => $this->errors === [] ? ['general' => [$this->getMessage()]] : $this->errors,
        ], 422);
    }
}
