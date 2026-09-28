<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Validation des rapports par la conformité (qui, quand, quel périmètre, quelle version de règle).
        Schema::create('report_validations', function (Blueprint $table): void {
            $table->id();
            $table->string('type', 50);
            $table->date('period_from');
            $table->date('period_to');
            $table->json('filters');
            $table->char('filters_hash', 64)->comment('SHA-256 des filtres de dimension normalisés');
            $table->date('as_of');
            $table->string('rule_version', 100)->nullable();
            $table->json('snapshot')->nullable()->comment('Chiffres rapprochés au moment de la validation');
            $table->text('comment')->nullable();
            $table->foreignId('validated_by')->constrained('users')->restrictOnDelete();
            $table->timestamp('validated_at');
            $table->timestamps();
            $table->index(['type', 'period_from', 'period_to', 'filters_hash'], 'report_validations_scope_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('report_validations');
    }
};
