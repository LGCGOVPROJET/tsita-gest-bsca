<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Support\Dt;
use Illuminate\Http\Request;

class AdminUserResource extends UserResource
{
    public function toArray(Request $request): array
    {
        return parent::toArray($request) + [
            'phone' => $this->phone,
            'is_active' => (bool) $this->is_active,
            'locked_until' => Dt::iso($this->locked_until),
            'last_login_at' => Dt::iso($this->last_login_at),
            'customer_id' => $this->customer_id,
            'created_at' => Dt::iso($this->created_at),
        ];
    }
}
