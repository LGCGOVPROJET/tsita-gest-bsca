<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\AuditLogFilterRequest;
use App\Models\AuditLog;
use App\Support\Dt;
use App\Support\Paginated;
use Illuminate\Http\JsonResponse;

final class AuditLogController extends Controller
{
    public function index(AuditLogFilterRequest $request): JsonResponse
    {
        $f = $request->validated();
        $q = AuditLog::query()->with('user:id,name,email,role')
            ->when($f['user_id'] ?? null, fn ($q, $v) => $q->where('user_id', $v))
            ->when($f['action'] ?? null, fn ($q, $v) => $q->where('action', 'like', addcslashes($v, '%_\\').'%'))
            ->when($f['auditable_type'] ?? null, fn ($q, $v) => $q->where('auditable_type', $v))
            ->when($f['auditable_id'] ?? null, fn ($q, $v) => $q->where('auditable_id', $v))
            ->when($f['from'] ?? null, fn ($q, $v) => $q->where('created_at', '>=', Dt::db(Dt::startOfLocalDay($v))))
            ->when($f['to'] ?? null, fn ($q, $v) => $q->where('created_at', '<=', Dt::db(Dt::endOfLocalDay($v))))
            ->orderByDesc('id');

        return Paginated::response($q->paginate((int) ($f['per_page'] ?? 50)), fn (AuditLog $l) => [
            'id' => $l->id,
            'date' => Dt::iso($l->created_at),
            'user' => $l->user ? ['id' => $l->user->id, 'name' => $l->user->name, 'email' => $l->user->email] : null,
            'action' => $l->action,
            'auditable_type' => $l->auditable_type,
            'auditable_id' => $l->auditable_id,
            'before' => $l->before,
            'after' => $l->after,
            'reason' => $l->reason,
            'ip' => $l->ip,
            'user_agent' => $l->user_agent,
        ], $request);
    }
}
