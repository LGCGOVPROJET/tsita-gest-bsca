<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Enums\AttachmentClassification;
use App\Enums\ComplaintStatus;
use App\Enums\ControlResult;
use App\Enums\DeliveryStatus;
use App\Enums\MessageKind;
use App\Enums\Visibility;
use App\Http\Controllers\Controller;
use App\Http\Requests\AcknowledgeRequest;
use App\Http\Requests\AssignRequest;
use App\Http\Requests\AttachmentRequest;
use App\Http\Requests\ControlRequest;
use App\Http\Requests\DuplicateRequest;
use App\Http\Requests\MessageRequest;
use App\Http\Requests\ReopenRequest;
use App\Http\Requests\SendResponseRequest;
use App\Http\Requests\TransitionRequest;
use App\Http\Resources\ComplaintDetailResource;
use App\Models\Complaint;
use App\Models\ResponseTemplate;
use App\Models\User;
use App\Services\AttachmentService;
use App\Services\ComplaintWorkflow;
use Illuminate\Http\JsonResponse;

/**
 * Actions métier sur un dossier. Chaque action est autorisée par ComplaintPolicy (permission + périmètre).
 */
final class ComplaintActionController extends Controller
{
    public function __construct(private readonly ComplaintWorkflow $workflow) {}

    private function detail(Complaint $complaint, int $status = 200): JsonResponse
    {
        return (new ComplaintDetailResource($complaint->refresh()->load(ComplaintDetailResource::WITH_DETAIL)))
            ->response()->setStatusCode($status);
    }

    public function transition(TransitionRequest $request, Complaint $complaint): JsonResponse
    {
        $this->authorize('transition', $complaint);
        $this->workflow->transition($complaint, ComplaintStatus::from($request->validated('to_status')), $request->validated('reason'), $request->user());

        return $this->detail($complaint);
    }

    public function assign(AssignRequest $request, Complaint $complaint): JsonResponse
    {
        $this->authorize('assign', $complaint);
        $owner = User::query()->findOrFail((int) $request->validated('owner_id'));
        $deputy = $request->validated('deputy_id') ? User::query()->findOrFail((int) $request->validated('deputy_id')) : null;
        $entityId = $request->validated('processing_entity_id');
        $this->workflow->assign($complaint, $owner, $deputy, $entityId !== null ? (int) $entityId : null, $request->validated('reason'), $request->user());

        return $this->detail($complaint);
    }

    public function acknowledge(AcknowledgeRequest $request, Complaint $complaint): JsonResponse
    {
        $this->authorize('acknowledge', $complaint);
        $template = $request->validated('template_id') ? ResponseTemplate::query()->find((int) $request->validated('template_id')) : null;
        $this->workflow->acknowledge($complaint, $template, $request->validated('channel'), DeliveryStatus::from($request->validated('delivery_status')), $request->user());

        return $this->detail($complaint);
    }

    public function message(MessageRequest $request, Complaint $complaint): JsonResponse
    {
        $kind = MessageKind::from($request->validated('kind'));
        $this->authorize($kind === MessageKind::InternalNote ? 'addNote' : 'respond', $complaint);
        $this->workflow->addMessage($complaint, $kind, $request->validated('body'), $request->validated('channel'), $request->user());

        return $this->detail($complaint, 201);
    }

    public function attachment(AttachmentRequest $request, Complaint $complaint, AttachmentService $attachments): JsonResponse
    {
        $this->authorize('attach', $complaint);
        $attachments->store(
            $complaint,
            $request->file('file'),
            AttachmentClassification::from($request->validated('classification')),
            Visibility::from($request->validated('visibility')),
            $request->user(),
        );

        return $this->detail($complaint, 201);
    }

    public function sendResponse(SendResponseRequest $request, Complaint $complaint): JsonResponse
    {
        $this->authorize('respond', $complaint);
        $template = $request->validated('template_id') ? ResponseTemplate::query()->find((int) $request->validated('template_id')) : null;
        $this->workflow->sendResponse($complaint, $request->validated('body'), $template, $request->validated('channel'), $request->user());

        return $this->detail($complaint);
    }

    public function reopen(ReopenRequest $request, Complaint $complaint): JsonResponse
    {
        $this->authorize('reopen', $complaint);
        $result = $this->workflow->reopen($complaint, $request->validated('reason'), $request->user());

        return (new ComplaintDetailResource($result['complaint']->load(ComplaintDetailResource::WITH_DETAIL)))
            ->additional(['meta' => ['tracking_code' => $result['tracking_code'], 'parent_reference' => $complaint->reference]])
            ->response()->setStatusCode(201);
    }

    public function markDuplicate(DuplicateRequest $request, Complaint $complaint): JsonResponse
    {
        $this->authorize('markDuplicate', $complaint);
        $original = Complaint::query()->findOrFail((int) $request->validated('duplicate_of_id'));
        $this->authorize('view', $original);
        $this->workflow->markDuplicate($complaint, $original, $request->validated('reason'), $request->user());

        return $this->detail($complaint);
    }

    public function control(ControlRequest $request, Complaint $complaint): JsonResponse
    {
        $this->authorize('control', $complaint);
        $this->workflow->addControl($complaint, ControlResult::from($request->validated('result')), $request->validated('findings'), $request->user());

        return $this->detail($complaint, 201);
    }
}
