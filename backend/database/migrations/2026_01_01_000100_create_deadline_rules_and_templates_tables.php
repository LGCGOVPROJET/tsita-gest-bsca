<?php

declare(strict_types=1);

use App\Enums\DeadlineKind;
use App\Enums\DeadlineUnit;
use App\Enums\RuleSourceType;
use App\Enums\RuleStatus;
use App\Enums\TemplateKind;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('deadline_rules', function (Blueprint $table): void {
            $table->id();
            $table->string('code', 40);
            $table->string('label', 190);
            $table->enum('kind', DeadlineKind::values());
            $table->enum('unit', DeadlineUnit::values());
            $table->unsignedSmallInteger('duration');
            $table->string('start_point', 30)->default('received_at');
            $table->enum('source_type', RuleSourceType::values());
            $table->string('source_reference', 255);
            $table->date('effective_from');
            $table->date('effective_to')->nullable();
            $table->unsignedInteger('version')->default(1);
            $table->enum('status', RuleStatus::values())->default(RuleStatus::Brouillon->value);
            $table->foreignId('validated_by')->nullable()->constrained('users')->restrictOnDelete();
            $table->timestamp('validated_at')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();
            $table->unique(['code', 'version']);
            $table->index(['kind', 'status']);
        });

        Schema::create('holidays', function (Blueprint $table): void {
            $table->id();
            $table->date('date');
            $table->string('label', 150);
            $table->string('calendar_version', 30);
            $table->char('country', 2)->default('CG');
            $table->timestamps();
            $table->unique(['date', 'calendar_version', 'country']);
        });

        Schema::create('response_templates', function (Blueprint $table): void {
            $table->id();
            $table->string('code', 40);
            $table->enum('kind', TemplateKind::values());
            $table->string('label', 150);
            $table->string('subject', 190);
            $table->text('body');
            $table->unsignedInteger('version')->default(1);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
            $table->unique(['code', 'version']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('response_templates');
        Schema::dropIfExists('holidays');
        Schema::dropIfExists('deadline_rules');
    }
};
