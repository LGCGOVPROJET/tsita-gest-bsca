<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Enums\AttachmentClassification;
use App\Enums\MessageKind;
use App\Enums\Visibility;
use App\Http\Controllers\Controller;
use App\Http\Requests\ClientActionRequest;
use App\Models\Attachment;
use App\Models\Complaint;
use App\Services\AttachmentService;
use App\Services\AuditLogger;
use App\Services\ClientViewPresenter;
use App\Services\ComplaintIntakeService;
use App\Services\ComplaintWorkflow;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Espace client connecté (rôle client) : uniquement ses propres dossiers, vue client filtrée.
 */
final class ClientComplaintController extends Controller
{
    public function __construct(private readonly ClientViewPresenter $presenter) {}

    public function index(Request $request): JsonResponse
    {
        $items = Complaint::query()->visibleTo($request->user())
            ->with(['category', 'product', 'deadlines'])
            ->orderByDesc('received_at')
            ->limit(200)
            ->get()
            ->map(fn (Complaint $c) => $this->presenter->summary($c))
            ->values();

        return response()->json(['data' => $items]);
    }

    public function show(Request $request, string $reference, AuditLogger $audit): JsonResponse
    {
        $complaint = Complaint::query()->visibleTo($request->user())
            ->where('reference', strtoupper($reference))
            ->first();
        if ($complaint === null) {
            return response()->json(['message' => 'Dossier introuvable.'], 404);
        }
        $audit->log('client.view', $complaint);

        return response()->json(['data' => $this->presenter->present($complaint)]);
    }

    private function own(Request $request, string $reference): ?Complaint
    {
        return Complaint::query()->visibleTo($request->user())->where('reference', strtoupper($reference))->first();
    }

    private function notFound(): JsonResponse
    {
        return response()->json(['message' => 'Dossier introuvable.'], 404);
    }

    public function message(ClientActionRequest $request, string $reference, ComplaintWorkflow $workflow): JsonResponse
    {
        $complaint = $this->own($request, $reference);
        if ($complaint === null) {
            return $this->notFound();
        }
        $workflow->addMessage($complaint, MessageKind::ClientMessage, (string) $request->validated('body'), 'portail', $request->user(), true);

        return response()->json(['data' => $this->presenter->present($complaint->refresh())], 201);
    }

    public function attachment(ClientActionRequest $request, string $reference, AttachmentService $attachments): JsonResponse
    {
        $complaint = $this->own($request, $reference);
        if ($complaint === null) {
            return $this->notFound();
        }
        if (Attachment::query()->where('complaint_id', $complaint->id)->where('uploaded_by_client', true)->count() >= 20) {
            return response()->json(['message' => 'Nombre maximal de documents atteint pour ce dossier.', 'errors' => ['file' => ['Nombre maximal de documents atteint pour ce dossier.']]], 422);
        }
        $attachments->store($complaint, $request->file('file'), AttachmentClassification::Client, Visibility::Client, $request->user(), true);

        return response()->json(['data' => $this->presenter->present($complaint->refresh())], 201);
    }

    public function reopen(ClientActionRequest $request, string $reference, ComplaintWorkflow $workflow, ComplaintIntakeService $intake): JsonResponse
    {
        $complaint = $this->own($request, $reference);
        if ($complaint === null) {
            return $this->notFound();
        }
        $result = $workflow->reopen($complaint, (string) $request->validated('reason'), $request->user(), true);

        return response()->json(['data' => $intake->confirmation($result['complaint'], $result['tracking_code']) + [
            'parent_reference' => $complaint->reference,
        ]], 201);
    }
}
