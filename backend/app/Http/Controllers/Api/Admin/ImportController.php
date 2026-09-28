<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\ImportRequest;
use App\Http\Resources\ImportBatchResource;
use App\Models\ImportBatch;
use App\Services\LegacyImportService;
use App\Support\Paginated;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class ImportController extends Controller
{
    /** Liste paginée { data, meta } (per_page ≤ 100, défaut 25). */
    public function index(Request $request): JsonResponse
    {
        $data = $request->validate([
            'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);

        return Paginated::response(
            ImportBatch::query()->with('importer')->orderByDesc('id')->paginate((int) ($data['per_page'] ?? 25)),
            ImportBatchResource::class,
            $request,
        );
    }

    public function store(ImportRequest $request, LegacyImportService $service): JsonResponse
    {
        $file = $request->file('file');
        $result = $service->import($file->getRealPath(), $file->getClientOriginalName(), $request->validated('source_system'), $request->user());
        $resource = new ImportBatchResource($result['batch']->load('importer'));
        $resource->withAnomalies = true;

        return $resource->additional(['meta' => [
            'already_imported' => $result['already_imported'],
            'message' => $result['already_imported']
                ? 'Ce fichier a déjà été importé (empreinte SHA-256 identique) : aucun dossier créé.'
                : 'Import terminé.',
        ]])->response()->setStatusCode($result['already_imported'] ? 200 : 201);
    }

    public function show(ImportBatch $import): ImportBatchResource
    {
        $resource = new ImportBatchResource($import->load('importer'));
        $resource->withAnomalies = true;

        return $resource;
    }
}
