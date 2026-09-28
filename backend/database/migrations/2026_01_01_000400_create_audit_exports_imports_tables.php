<?php

declare(strict_types=1);

use App\Enums\AnomalyResolution;
use App\Enums\ExportFormat;
use App\Enums\ImportStatus;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('audit_logs', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained('users')->restrictOnDelete();
            $table->string('action', 100);
            $table->string('auditable_type', 150)->nullable();
            $table->unsignedBigInteger('auditable_id')->nullable();
            $table->json('before')->nullable();
            $table->json('after')->nullable();
            $table->text('reason')->nullable();
            $table->string('ip', 45)->nullable();
            $table->string('user_agent', 500)->nullable();
            $table->timestamp('created_at')->useCurrent();
            $table->index(['auditable_type', 'auditable_id']);
            $table->index('action');
            $table->index('created_at');
        });

        Schema::create('exports', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->restrictOnDelete();
            $table->string('type', 50);
            $table->enum('format', ExportFormat::values());
            $table->json('filters');
            $table->date('period_from')->nullable();
            $table->date('period_to')->nullable();
            $table->timestamp('as_of');
            $table->string('rule_version', 100)->nullable();
            $table->unsignedInteger('row_count')->default(0);
            $table->timestamp('created_at')->useCurrent();
        });

        Schema::create('import_batches', function (Blueprint $table): void {
            $table->id();
            $table->string('filename', 255);
            $table->char('file_sha256', 64)->unique();
            $table->string('source_system', 50);
            $table->enum('status', ImportStatus::values())->default(ImportStatus::EnCours->value);
            $table->unsignedInteger('rows_total')->default(0);
            $table->unsignedInteger('rows_created')->default(0);
            $table->unsignedInteger('rows_skipped')->default(0);
            $table->unsignedInteger('rows_anomalies')->default(0);
            $table->json('report')->nullable();
            $table->foreignId('imported_by')->constrained('users')->restrictOnDelete();
            $table->timestamp('created_at')->useCurrent();
        });

        Schema::create('import_anomalies', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('import_batch_id')->constrained('import_batches')->restrictOnDelete();
            $table->unsignedInteger('row_number');
            $table->string('source_id', 100)->nullable();
            $table->string('issue', 500);
            $table->json('raw');
            $table->enum('resolution_status', AnomalyResolution::values())->default(AnomalyResolution::ATraiter->value);
            $table->foreignId('resolved_by')->nullable()->constrained('users')->restrictOnDelete();
            $table->timestamp('resolved_at')->nullable();
            $table->timestamps();
        });

        // Tables append-only : interdiction des UPDATE/DELETE au niveau MySQL.
        if (DB::getDriverName() === 'mysql') {
            foreach (['audit_logs', 'complaint_events'] as $t) {
                DB::unprepared("DROP TRIGGER IF EXISTS {$t}_no_update");
                DB::unprepared("DROP TRIGGER IF EXISTS {$t}_no_delete");
                DB::unprepared("CREATE TRIGGER {$t}_no_update BEFORE UPDATE ON {$t} FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Table {$t} en ajout seul : modification interdite'");
                DB::unprepared("CREATE TRIGGER {$t}_no_delete BEFORE DELETE ON {$t} FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Table {$t} en ajout seul : suppression interdite'");
            }
        }
    }

    public function down(): void
    {
        if (DB::getDriverName() === 'mysql') {
            foreach (['audit_logs', 'complaint_events'] as $t) {
                DB::unprepared("DROP TRIGGER IF EXISTS {$t}_no_update");
                DB::unprepared("DROP TRIGGER IF EXISTS {$t}_no_delete");
            }
        }
        Schema::dropIfExists('import_anomalies');
        Schema::dropIfExists('import_batches');
        Schema::dropIfExists('exports');
        Schema::dropIfExists('audit_logs');
    }
};
