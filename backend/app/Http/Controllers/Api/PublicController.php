<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Enums\AttachmentClassification;
use App\Enums\MessageKind;
use App\Enums\Visibility;
use App\Http\Controllers\Controller;
use App\Http\Requests\PublicComplaintRequest;
use App\Http\Requests\TrackRequest;
use App\Models\Agency;
use App\Models\Attachment;
use App\Models\Category;
use App\Models\Complaint;
use App\Models\Product;
use App\Services\AttachmentService;
use App\Services\AuditLogger;
use App\Services\ClientViewPresenter;
use App\Services\ComplaintIntakeService;
use App\Services\ComplaintWorkflow;
use App\Services\PublicTrackingGuard;
use App\Services\TrackingCodeService;
use Illuminate\Http\JsonResponse;

/**
 * Portail client sans compte (throttle 10/min/IP). Aucune donnée interne n'est exposée.
 */
final class PublicController extends Controller
{
    private const NOT_FOUND = 'Dossier introuvable ou code de suivi invalide.';

    public function __construct(
        private readonly TrackingCodeService $tracking,
        private readonly ClientViewPresenter $presenter,
        private readonly ComplaintWorkflow $workflow,
        private readonly AuditLogger $audit,
        private readonly PublicTrackingGuard $guard,
    ) {}

    public function referentials(): JsonResponse
    {
        return response()->json([
            'categories' => Category::query()->active()->orderBy('label')->get(['id', 'label']),
            'products' => Product::query()->active()->orderBy('label')->get(['id', 'label']),
            'channels_reply' => ['courriel', 'courrier', 'telephone'],
            'agencies' => Agency::query()->active()->orderBy('name')->get(['id', 'name', 'city']),
        ]);
    }

    public function store(PublicComplaintRequest $request, ComplaintIntakeService $intake): JsonResponse
    {
        $files = array_values($request->file('attachments', []) ?? []);
        $result = $intake->createFromPortal($request->validated(), $files);

        return response()->json(['data' => $intake->confirmation($result['complaint'], $result['tracking_code'])], 201);
    }

    /**
     * Référence + code de suivi, sous contrôle anti-force brute (par référence ET par IP).
     * Réponses identiques que la référence existe ou non (404 neutre, 429 neutre).
     */
    private function resolve(TrackRequest $request): Complaint|JsonResponse
    {
        $reference = (string) $request->input('reference');
        $wait = $this->guard->blockedFor($reference, $request->ip());
        if ($wait > 0) {
            return response()->json(['message' => 'Trop de tentatives pour ce dossier. Réessayez plus tard.'], 429)
                ->header('Retry-After', (string) $wait);
        }
        $complaint = $this->tracking->resolve($reference, (string) $request->input('tracking_code'));
        if ($complaint === null) {
            $this->guard->failure($reference, $request->ip());

            return response()->json(['message' => self::NOT_FOUND], 404);
        }
        $this->guard->success($reference);

        return $complaint;
    }

    public function track(TrackRequest $request): JsonResponse
    {
        $complaint = $this->resolve($request);
        if ($complaint instanceof JsonResponse) {
            return $complaint;
        }
        $this->audit->log('public.track', $complaint, null, null, null, null);

        return response()->json(['data' => $this->presenter->present($complaint)]);
    }

    public function message(TrackRequest $request): JsonResponse
    {
        $complaint = $this->resolve($request);
        if ($complaint instanceof JsonResponse) {
            return $complaint;
        }
        $this->workflow->addMessage($complaint, MessageKind::ClientMessage, (string) $request->input('body'), 'portail', null, true);

        return response()->json(['data' => $this->presenter->present($complaint->refresh())], 201);
    }

    public function attachment(TrackRequest $request, AttachmentService $attachments): JsonResponse
    {
        $complaint = $this->resolve($request);
        if ($complaint instanceof JsonResponse) {
            return $complaint;
        }
        if (Attachment::query()->where('complaint_id', $complaint->id)->where('uploaded_by_client', true)->count() >= 20) {
            return response()->json(['message' => 'Nombre maximal de documents atteint pour ce dossier.', 'errors' => ['file' => ['Nombre maximal de documents atteint pour ce dossier.']]], 422);
        }
        $attachments->store($complaint, $request->file('file'), AttachmentClassification::Client, Visibility::Client, null, true);

        return response()->json(['data' => $this->presenter->present($complaint->refresh())], 201);
    }

    public function reopen(TrackRequest $request, ComplaintIntakeService $intake): JsonResponse
    {
        $complaint = $this->resolve($request);
        if ($complaint instanceof JsonResponse) {
            return $complaint;
        }
        $result = $this->workflow->reopen($complaint, (string) $request->input('reason'), null, true);

        return response()->json(['data' => $intake->confirmation($result['complaint'], $result['tracking_code']) + [
            'parent_reference' => $complaint->reference,
        ]], 201);
    }
}
