<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Enums\ApprovalDecision;
use App\Enums\SolutionStatus;
use App\Http\Controllers\Controller;
use App\Http\Requests\ApproveSolutionRequest;
use App\Http\Requests\SolutionRequest;
use App\Http\Resources\SolutionResource;
use App\Models\Complaint;
use App\Models\Solution;
use App\Services\SolutionService;
use App\Support\Paginated;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

final class SolutionController extends Controller
{
    public function __construct(private readonly SolutionService $solutions) {}

    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', Solution::class);
        // « status » accepte une valeur ou une liste séparée par des virgules (ex. soumise,approuvee_n1).
        $statuses = array_values(array_filter(array_map('trim', explode(',', (string) $request->query('status', '')))));
        $request->merge(['statuses' => $statuses]);
        $data = $request->validate([
            'statuses' => ['array', 'max:5'],
            'statuses.*' => [Rule::in(SolutionStatus::values())],
            'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ], ['statuses.*.in' => 'Statut de solution inconnu.']);
        $q = Solution::query()
            ->with(['complaint', 'proposer', 'approvals.approver'])
            ->whereHas('complaint', fn ($c) => $c->visibleTo($request->user()))
            ->when($data['statuses'] ?? [], fn ($q, $s) => $q->whereIn('status', $s))
            ->orderByDesc('updated_at')->orderByDesc('id');

        return Paginated::response($q->paginate((int) ($data['per_page'] ?? 25)), SolutionResource::class, $request);
    }

    public function store(SolutionRequest $request, Complaint $complaint): JsonResponse
    {
        $this->authorize('propose', $complaint);
        $solution = $this->solutions->propose($complaint, $request->validated(), $request->user());

        return (new SolutionResource($solution->load(['complaint', 'proposer', 'approvals'])))->response()->setStatusCode(201);
    }

    public function submit(Request $request, Solution $solution): SolutionResource
    {
        $this->authorize('submit', $solution);
        $solution = $this->solutions->submit($solution, $request->user());

        return new SolutionResource($solution->load(['complaint', 'proposer', 'approvals.approver']));
    }

    public function approve(ApproveSolutionRequest $request, Solution $solution): SolutionResource
    {
        $this->authorize('approve', $solution);
        $solution = $this->solutions->approve($solution, ApprovalDecision::from($request->validated('decision')), $request->validated('comment'), $request->user());

        return new SolutionResource($solution->load(['complaint', 'proposer', 'approvals.approver']));
    }
}
