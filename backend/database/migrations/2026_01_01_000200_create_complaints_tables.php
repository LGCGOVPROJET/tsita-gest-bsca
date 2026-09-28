<?php

declare(strict_types=1);

use App\Enums\AttachmentClassification;
use App\Enums\ComplaintStatus;
use App\Enums\DeadlineKind;
use App\Enums\DeadlineStatus;
use App\Enums\DeadlineUnit;
use App\Enums\Decision;
use App\Enums\DeliveryStatus;
use App\Enums\EventType;
use App\Enums\MessageDirection;
use App\Enums\MessageKind;
use App\Enums\Priority;
use App\Enums\RiskLevel;
use App\Enums\ScanStatus;
use App\Enums\TaskStatus;
use App\Enums\Visibility;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Séquence annuelle des références (verrou ligne anti-collision).
        Schema::create('reference_sequences', function (Blueprint $table): void {
            $table->unsignedSmallInteger('year')->primary();
            $table->unsignedInteger('last_number')->default(0);
            $table->timestamps();
        });

        Schema::create('complaints', function (Blueprint $table): void {
            $table->id();
            $table->string('reference', 25)->unique();
            $table->string('tracking_code_hash');
            $table->foreignId('customer_id')->constrained('customers')->restrictOnDelete();
            $table->foreignId('channel_id')->constrained('channels')->restrictOnDelete();
            $table->foreignId('receiving_agency_id')->nullable()->constrained('agencies')->restrictOnDelete();
            $table->foreignId('processing_entity_id')->nullable()->constrained('processing_entities')->restrictOnDelete();
            $table->foreignId('category_id')->nullable()->constrained('categories')->restrictOnDelete();
            $table->foreignId('product_id')->nullable()->constrained('products')->restrictOnDelete();
            $table->string('subject', 190);
            $table->text('description');
            $table->date('operation_date')->nullable();
            $table->enum('status', ComplaintStatus::values())->default(ComplaintStatus::Recu->value);
            $table->enum('decision', Decision::values())->nullable();
            $table->enum('priority', Priority::values())->default(Priority::Normale->value);
            $table->enum('risk_level', RiskLevel::values())->default(RiskLevel::Faible->value);
            $table->decimal('amount', 15, 2)->nullable()->comment('NULL = montant inconnu (jamais 0)');
            $table->char('currency', 3)->nullable();
            $table->boolean('amount_flagged')->default(false)->comment('Montant hors norme');
            $table->timestamp('received_at');
            $table->timestamp('acknowledged_at')->nullable();
            $table->enum('acknowledgment_status', DeliveryStatus::values())->default(DeliveryStatus::EnAttente->value);
            $table->timestamp('final_response_at')->nullable();
            $table->timestamp('closed_at')->nullable();
            $table->foreignId('owner_id')->nullable()->constrained('users')->restrictOnDelete();
            $table->foreignId('deputy_id')->nullable()->constrained('users')->restrictOnDelete();
            $table->foreignId('parent_complaint_id')->nullable()->constrained('complaints')->restrictOnDelete();
            $table->foreignId('duplicate_of_id')->nullable()->constrained('complaints')->restrictOnDelete();
            $table->timestamp('mediation_requested_at')->nullable();
            $table->string('source_system', 50)->nullable();
            $table->string('source_id', 100)->nullable();
            $table->string('source_status_label', 150)->nullable();
            $table->timestamp('consent_at')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->restrictOnDelete();
            $table->timestamps();

            $table->index('status');
            $table->index('received_at');
            $table->index('final_response_at');
            $table->index('receiving_agency_id', 'complaints_receiving_agency_idx');
            $table->index('processing_entity_id', 'complaints_processing_entity_idx');
            $table->index('owner_id', 'complaints_owner_idx');
            $table->unique(['source_system', 'source_id']);
        });

        Schema::create('complaint_events', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('complaint_id')->constrained('complaints')->restrictOnDelete();
            $table->enum('type', EventType::values());
            $table->enum('from_status', ComplaintStatus::values())->nullable();
            $table->enum('to_status', ComplaintStatus::values())->nullable();
            $table->string('title', 190);
            $table->text('description')->nullable();
            $table->enum('visibility', Visibility::values())->default(Visibility::Internal->value);
            $table->foreignId('actor_id')->nullable()->constrained('users')->restrictOnDelete();
            $table->text('reason')->nullable();
            $table->timestamp('created_at')->useCurrent();
            $table->index(['complaint_id', 'created_at']);
        });

        Schema::create('complaint_deadlines', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('complaint_id')->constrained('complaints')->restrictOnDelete();
            $table->foreignId('deadline_rule_id')->constrained('deadline_rules')->restrictOnDelete();
            $table->unsignedInteger('rule_version');
            $table->enum('kind', DeadlineKind::values());
            $table->enum('unit', DeadlineUnit::values());
            $table->timestamp('due_at');
            $table->timestamp('initial_due_at')->comment('Jamais modifié');
            $table->timestamp('announced_at')->nullable()->comment('Nouvelle date annoncée au client (distincte)');
            $table->timestamp('met_at')->nullable();
            $table->enum('status', DeadlineStatus::values())->default(DeadlineStatus::EnCours->value);
            $table->timestamps();
            $table->unique(['complaint_id', 'kind']);
            $table->index(['kind', 'due_at']);
        });

        Schema::create('attachments', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('complaint_id')->constrained('complaints')->restrictOnDelete();
            $table->foreignId('uploaded_by')->nullable()->constrained('users')->restrictOnDelete();
            $table->boolean('uploaded_by_client')->default(false);
            $table->string('original_name', 255);
            $table->string('stored_path', 255);
            $table->string('mime', 100);
            $table->unsignedBigInteger('size');
            $table->char('sha256', 64);
            $table->enum('classification', AttachmentClassification::values())->default(AttachmentClassification::Interne->value);
            $table->enum('visibility', Visibility::values())->default(Visibility::Internal->value);
            $table->enum('scan_status', ScanStatus::values())->default(ScanStatus::EnAttente->value);
            $table->timestamps();
            $table->index('sha256');
        });

        Schema::create('messages', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('complaint_id')->constrained('complaints')->restrictOnDelete();
            $table->enum('kind', MessageKind::values());
            $table->enum('direction', MessageDirection::values())->nullable();
            $table->foreignId('channel_id')->nullable()->constrained('channels')->restrictOnDelete();
            $table->foreignId('author_id')->nullable()->constrained('users')->restrictOnDelete();
            $table->boolean('author_is_client')->default(false);
            $table->string('subject', 190)->nullable();
            $table->text('body');
            $table->enum('delivery_status', DeliveryStatus::values())->nullable();
            $table->timestamp('sent_at')->nullable();
            $table->foreignId('template_id')->nullable()->constrained('response_templates')->restrictOnDelete();
            $table->timestamps();
            $table->index(['complaint_id', 'kind']);
        });

        Schema::create('tasks', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('complaint_id')->constrained('complaints')->restrictOnDelete();
            $table->string('title', 190);
            $table->text('description')->nullable();
            $table->foreignId('assignee_id')->nullable()->constrained('users')->restrictOnDelete();
            $table->timestamp('due_at')->nullable();
            $table->enum('status', TaskStatus::values())->default(TaskStatus::AFaire->value);
            $table->timestamp('completed_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('tasks');
        Schema::dropIfExists('messages');
        Schema::dropIfExists('attachments');
        Schema::dropIfExists('complaint_deadlines');
        Schema::dropIfExists('complaint_events');
        Schema::dropIfExists('complaints');
        Schema::dropIfExists('reference_sequences');
    }
};
