<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Enums\TaskStatus;
use App\Http\Controllers\Controller;
use App\Http\Requests\TaskRequest;
use App\Http\Resources\TaskResource;
use App\Models\Complaint;
use App\Models\Task;
use App\Services\AuditLogger;
use App\Support\Dt;
use Illuminate\Http\JsonResponse;

final class TaskController extends Controller
{
    public function __construct(private readonly AuditLogger $audit) {}

    public function store(TaskRequest $request, Complaint $complaint): JsonResponse
    {
        $this->authorize('manageTasks', $complaint);
        $task = Task::query()->create($request->validated() + ['complaint_id' => $complaint->id, 'status' => $request->validated('status') ?? TaskStatus::AFaire->value]);
        $this->audit->log('task.create', $task, null, $task->only(['title', 'assignee_id', 'due_at', 'status']));

        return (new TaskResource($task->load('assignee')))->response()->setStatusCode(201);
    }

    public function update(TaskRequest $request, Task $task): TaskResource
    {
        $this->authorize('update', $task);
        $before = $task->only(['title', 'assignee_id', 'due_at', 'status']);
        $task->fill($request->validated());
        if ($task->isDirty('status')) {
            $task->completed_at = $task->status === TaskStatus::Terminee ? Dt::now() : null;
        }
        $task->save();
        $this->audit->log('task.update', $task, $before, $task->only(['title', 'assignee_id', 'due_at', 'status']));

        return new TaskResource($task->load('assignee'));
    }
}
