<?php

declare(strict_types=1);

use App\Enums\Role;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('agencies', function (Blueprint $table): void {
            $table->id();
            $table->string('code', 30)->unique();
            $table->string('name', 150);
            $table->string('city', 100);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::create('processing_entities', function (Blueprint $table): void {
            $table->id();
            $table->string('code', 30)->unique();
            $table->string('name', 150);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::create('categories', function (Blueprint $table): void {
            $table->id();
            $table->string('code', 40)->unique();
            $table->string('label', 150);
            $table->text('description')->nullable();
            $table->boolean('is_active')->default(true);
            $table->unsignedInteger('version')->default(1);
            $table->timestamps();
        });

        Schema::create('products', function (Blueprint $table): void {
            $table->id();
            $table->string('code', 40)->unique();
            $table->string('label', 150);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::create('channels', function (Blueprint $table): void {
            $table->id();
            $table->string('code', 30)->unique();
            $table->string('label', 100);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::create('customers', function (Blueprint $table): void {
            $table->id();
            $table->string('full_name', 150);
            $table->string('email', 190)->nullable()->index();
            $table->string('phone', 40)->nullable();
            $table->text('customer_number')->nullable()->comment('Chiffré (cast encrypted)');
            $table->string('address', 255)->nullable();
            $table->string('preferred_channel', 30)->default('courriel');
            $table->timestamps();
        });

        Schema::create('users', function (Blueprint $table): void {
            $table->id();
            $table->string('name', 150);
            $table->string('email', 190)->unique();
            $table->timestamp('email_verified_at')->nullable();
            $table->string('password');
            $table->enum('role', Role::values());
            $table->foreignId('agency_id')->nullable()->constrained('agencies')->restrictOnDelete();
            $table->foreignId('entity_id')->nullable()->constrained('processing_entities')->restrictOnDelete();
            $table->foreignId('customer_id')->nullable()->constrained('customers')->restrictOnDelete();
            $table->string('phone', 40)->nullable();
            $table->boolean('is_active')->default(true);
            $table->text('mfa_secret')->nullable()->comment('Chiffré (cast encrypted)');
            $table->boolean('mfa_enabled')->default(false);
            $table->unsignedSmallInteger('failed_logins')->default(0);
            $table->timestamp('locked_until')->nullable();
            $table->timestamp('last_login_at')->nullable();
            $table->rememberToken();
            $table->timestamps();
            $table->index('role');
        });

        Schema::create('password_reset_tokens', function (Blueprint $table): void {
            $table->string('email')->primary();
            $table->string('token');
            $table->timestamp('created_at')->nullable();
        });

        Schema::create('sessions', function (Blueprint $table): void {
            $table->string('id')->primary();
            $table->foreignId('user_id')->nullable()->index();
            $table->string('ip_address', 45)->nullable();
            $table->text('user_agent')->nullable();
            $table->longText('payload');
            $table->integer('last_activity')->index();
        });

        Schema::create('settings', function (Blueprint $table): void {
            $table->id();
            $table->string('key', 100)->unique();
            $table->json('value');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('settings');
        Schema::dropIfExists('sessions');
        Schema::dropIfExists('password_reset_tokens');
        Schema::dropIfExists('users');
        Schema::dropIfExists('customers');
        Schema::dropIfExists('channels');
        Schema::dropIfExists('products');
        Schema::dropIfExists('categories');
        Schema::dropIfExists('processing_entities');
        Schema::dropIfExists('agencies');
    }
};
