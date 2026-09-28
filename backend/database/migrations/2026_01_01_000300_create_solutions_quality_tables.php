<?php

declare(strict_types=1);

use App\Enums\ApprovalDecision;
use App\Enums\ControlResult;
use App\Enums\Decision;
use App\Enums\QualityActionStatus;
use App\Enums\SolutionStatus;
use App\Enums\SolutionType;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('solutions', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('complaint_id')->constrained('complaints')->restrictOnDelete();
            $table->unsignedInteger('version');
            $table->enum('type', SolutionType::values());
            $table->text('description');
            $table->text('root_cause')->nullable();
            $table->decimal('amount', 15, 2)->nullable();
            $table->char('currency', 3)->nullable();
            $table->enum('decision', Decision::values());
            $table->enum('status', SolutionStatus::values())->default(SolutionStatus::Brouillon->value);
            $table->boolean('requires_n2')->default(false);
            $table->foreignId('proposed_by')->constrained('users')->restrictOnDelete();
            $table->timestamp('submitted_at')->nullable();
            $table->timestamps();
            $table->unique(['complaint_id', 'version']);
            $table->index('status');
        });

        Schema::create('approvals', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('solution_id')->constrained('solutions')->restrictOnDelete();
            $table->unsignedTinyInteger('level');
            $table->foreignId('approver_id')->constrained('users')->restrictOnDelete();
            $table->enum('decision', ApprovalDecision::values());
            $table->text('comment')->nullable();
            $table->timestamp('decided_at');
            $table->timestamps();
        });

        Schema::create('quality_controls', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('complaint_id')->constrained('complaints')->restrictOnDelete();
            $table->foreignId('controller_id')->constrained('users')->restrictOnDelete();
            $table->enum('result', ControlResult::values());
            $table->text('findings')->nullable();
            $table->timestamp('controlled_at');
            $table->timestamps();
        });

        Schema::create('quality_actions', function (Blueprint $table): void {
            $table->id();
            $table->string('title', 190);
            $table->text('root_cause');
            $table->foreignId('category_id')->nullable()->constrained('categories')->restrictOnDelete();
            $table->foreignId('owner_id')->nullable()->constrained('users')->restrictOnDelete();
            $table->foreignId('owner_entity_id')->nullable()->constrained('processing_entities')->restrictOnDelete();
            $table->timestamp('due_at')->nullable();
            $table->enum('status', QualityActionStatus::values())->default(QualityActionStatus::Planifiee->value);
            $table->text('effectiveness_measure')->nullable();
            $table->text('evidence')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->timestamps();
        });

        Schema::create('complaint_quality_action', function (Blueprint $table): void {
            $table->foreignId('complaint_id')->constrained('complaints')->restrictOnDelete();
            $table->foreignId('quality_action_id')->constrained('quality_actions')->restrictOnDelete();
            $table->primary(['complaint_id', 'quality_action_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('complaint_quality_action');
        Schema::dropIfExists('quality_actions');
        Schema::dropIfExists('quality_controls');
        Schema::dropIfExists('approvals');
        Schema::dropIfExists('solutions');
    }
};
