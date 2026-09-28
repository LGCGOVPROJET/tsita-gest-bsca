<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Enums\DeadlineKind;
use App\Enums\ExportFormat;
use App\Http\Controllers\Controller;
use App\Http\Requests\ComplaintFilterRequest;
use App\Http\Requests\QualifyComplaintRequest;
use App\Http\Requests\StoreComplaintRequest;
use App\Http\Resources\ComplaintDetailResource;
use App\Http\Resources\ComplaintListItemResource;
use App\Models\Complaint;
use App\Services\AuditLogger;
use App\Services\ComplaintIntakeService;
use App\Services\ComplaintSearch;
use App\Services\ComplaintWorkflow;
use App\Services\DeadlineCalculator;
use App\Services\ExportService;
use App\Support\ComplaintFilters;
use App\Support\Dt;
use App\Support\Paginated;
use Illuminate\Http\JsonResponse;
use Symfony\Component\HttpFoundation\Response;

final class ComplaintController extends Controller
{
    public function __construct(
        private readonly ComplaintSearch $search,
        private readonly AuditLogger $audit,
    ) {}

    public function index(ComplaintFilterRequest $request): JsonResponse
    {
        $this->authorize('viewAny', Complaint::class);
        $filters = ComplaintFilters::fromArray($request->validated());
        $q = $this->search->query($filters, $request->user(), $request->validated())->with(ComplaintListItemResource::WITH);
        $this->search->applySort($q, $request->validated('sort'));

        return Paginated::response(
            $q->paginate(min((int) ($request->validated('per_page') ?? 25), 100)),
            ComplaintListItemResource::class,
            $request,
        );
    }

    public function store(StoreComplaintRequest $request, ComplaintIntakeService $intake): JsonResponse
    {
        $this->authorize('create', Complaint::class);
        $files = array_values($request->file('attachments', []) ?? []);
        $result = $intake->createByAgent($request->validated(), $files, $request->user());
        $complaint = $result['complaint']->load(ComplaintDetailResource::WITH_DETAIL);

        return (new ComplaintDetailResource($complaint))
            ->additional(['meta' => ['tracking_code' => $result['tracking_code']]])
            ->response()->setStatusCode(201);
    }

    public function show(Complaint $complaint): ComplaintDetailResource
    {
        $this->authorize('view', $complaint);
        $this->audit->log('complaint.view', $complaint);

        return new ComplaintDetailResource($complaint->load(ComplaintDetailResource::WITH_DETAIL));
    }

    public function update(QualifyComplaintRequest $request, Complaint $complaint, ComplaintWorkflow $workflow): ComplaintDetailResource
    {
        $this->authorize('qualify', $complaint);
        $data = $request->validated();
        $reason = (string) $data['reason'];
        unset($data['reason']);
        $workflow->qualify($complaint, $data, $reason, $request->user());

        return new ComplaintDetailResource($complaint->refresh()->load(ComplaintDetailResource::WITH_DETAIL));
    }

    public function export(ComplaintFilterRequest $request, ExportService $exports, DeadlineCalculator $deadlines): Response
    {
        $this->authorize('export', Complaint::class);
        $filters = ComplaintFilters::fromArray($request->validated());
        $format = ExportFormat::from($request->validated('format') ?? 'csv');
        $q = $this->search->query($filters, $request->user(), $request->validated())->with(array_merge(ComplaintListItemResource::WITH, ['product']));
        $this->search->applySort($q, $request->validated('sort'));

        $rows = [];
        $q->limit(10000)->get()->each(function (Complaint $c) use (&$rows, $deadlines): void {
            $flag = $deadlines->flag($c);
            $rows[] = [
                $c->reference,
                Dt::parseLocal($c->received_at)->format('d/m/Y H:i'),
                $c->channel?->label,
                $c->receivingAgency?->name,
                $c->processingEntity?->name,
                $c->category?->label,
                $c->product?->label,
                $c->customer?->full_name,
                $c->subject,
                $c->status->label(),
                $c->decision?->label(),
                $c->priority->label(),
                $c->amount === null ? '' : (string) $c->amount,
                $c->currency,
                $c->deadlineOf(DeadlineKind::ReponseFinale)?->due_at ? Dt::parseLocal($c->deadlineOf(DeadlineKind::ReponseFinale)->due_at)->format('d/m/Y') : '',
                $flag->label(),
                $c->final_response_at ? Dt::parseLocal($c->final_response_at)->format('d/m/Y H:i') : '',
                $c->owner?->name,
            ];
        });

        return $exports->download('reclamations', 'Liste des réclamations', $format, $filters, $request->user(), [
            'Référence', 'Réception', 'Canal', 'Agence de réception', 'Entité de traitement', 'Catégorie', 'Produit',
            'Client', 'Objet', 'Statut', 'Décision', 'Priorité', 'Montant', 'Devise', 'Échéance finale',
            'Signal d\'échéance', 'Réponse finale', 'Propriétaire',
        ], $rows);
    }
}
