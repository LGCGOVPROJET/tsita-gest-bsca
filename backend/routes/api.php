<?php

declare(strict_types=1);

use App\Http\Controllers\Api\Admin\AdminOverviewController;
use App\Http\Controllers\Api\Admin\AuditLogController;
use App\Http\Controllers\Api\Admin\DeadlineRuleController;
use App\Http\Controllers\Api\Admin\ImportController;
use App\Http\Controllers\Api\Admin\ReferentialAdminController;
use App\Http\Controllers\Api\Admin\UserController;
use App\Http\Controllers\Api\AttachmentController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\ClientComplaintController;
use App\Http\Controllers\Api\ComplaintActionController;
use App\Http\Controllers\Api\ComplaintController;
use App\Http\Controllers\Api\CustomerController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\DeadlineController;
use App\Http\Controllers\Api\PublicController;
use App\Http\Controllers\Api\QualityController;
use App\Http\Controllers\Api\ReferentialController;
use App\Http\Controllers\Api\ReportController;
use App\Http\Controllers\Api\SolutionController;
use App\Http\Controllers\Api\TaskController;
use App\Http\Controllers\Api\WorkloadController;
use Illuminate\Support\Facades\Route;

/*
| API TSITA GEST — /api/v1 (contrat : docs/ARCHITECTURE.md §9).
*/
Route::prefix('v1')->group(function (): void {

    // ----- Authentification -----
    Route::prefix('auth')->group(function (): void {
        Route::post('login', [AuthController::class, 'login'])->middleware('throttle:login');
        Route::post('forgot-password', [AuthController::class, 'forgotPassword'])->middleware('throttle:login');
        Route::post('reset-password', [AuthController::class, 'resetPassword'])->middleware('throttle:login');

        Route::middleware(['auth:sanctum', 'active'])->group(function (): void {
            Route::post('logout', [AuthController::class, 'logout']);
            Route::get('me', [AuthController::class, 'me']);
            Route::post('mfa/setup', [AuthController::class, 'mfaSetup']);
            Route::post('mfa/confirm', [AuthController::class, 'mfaConfirm'])->middleware('throttle:login');
        });
    });

    // ----- Portail public (sans compte) -----
    Route::prefix('public')->middleware('throttle:public')->group(function (): void {
        Route::get('referentials', [PublicController::class, 'referentials']);
        Route::post('complaints', [PublicController::class, 'store']);
        Route::post('track', [PublicController::class, 'track']);
        Route::post('track/messages', [PublicController::class, 'message']);
        Route::post('track/attachments', [PublicController::class, 'attachment']);
        Route::post('track/reopen', [PublicController::class, 'reopen']);
    });

    // ----- Client connecté -----
    Route::prefix('client')->middleware(['auth:sanctum', 'active:client', 'mfa.enrolled', 'throttle:api'])->group(function (): void {
        Route::get('complaints', [ClientComplaintController::class, 'index']);
        Route::get('complaints/{reference}', [ClientComplaintController::class, 'show'])->where('reference', 'TG-BSCA-\d{4}-\d{6}');
        Route::post('complaints/{reference}/messages', [ClientComplaintController::class, 'message'])->where('reference', 'TG-BSCA-\d{4}-\d{6}');
        Route::post('complaints/{reference}/attachments', [ClientComplaintController::class, 'attachment'])->where('reference', 'TG-BSCA-\d{4}-\d{6}');
        Route::post('complaints/{reference}/reopen', [ClientComplaintController::class, 'reopen'])->where('reference', 'TG-BSCA-\d{4}-\d{6}');
    });

    // ----- Interne (collaborateurs) -----
    Route::middleware(['auth:sanctum', 'active:staff', 'mfa.enrolled', 'throttle:api'])->group(function (): void {
        Route::get('referentials', [ReferentialController::class, 'index']);
        Route::get('customers', [CustomerController::class, 'index'])->middleware('can:complaints.create');

        // Export nominatif : permission complaints.export exigée dès le routage (défense en profondeur).
        Route::get('complaints/export', [ComplaintController::class, 'export'])->middleware('can:complaints.export');
        Route::get('complaints', [ComplaintController::class, 'index']);
        Route::post('complaints', [ComplaintController::class, 'store']);
        Route::get('complaints/{complaint}', [ComplaintController::class, 'show'])->whereNumber('complaint');
        Route::patch('complaints/{complaint}', [ComplaintController::class, 'update'])->whereNumber('complaint');

        Route::prefix('complaints/{complaint}')->whereNumber('complaint')->group(function (): void {
            Route::post('transition', [ComplaintActionController::class, 'transition']);
            Route::post('assign', [ComplaintActionController::class, 'assign']);
            Route::post('acknowledge', [ComplaintActionController::class, 'acknowledge']);
            Route::post('messages', [ComplaintActionController::class, 'message']);
            Route::post('attachments', [ComplaintActionController::class, 'attachment']);
            Route::post('tasks', [TaskController::class, 'store']);
            Route::post('solutions', [SolutionController::class, 'store']);
            Route::post('send-response', [ComplaintActionController::class, 'sendResponse']);
            Route::post('reopen', [ComplaintActionController::class, 'reopen']);
            Route::post('mark-duplicate', [ComplaintActionController::class, 'markDuplicate']);
            Route::post('controls', [ComplaintActionController::class, 'control']);
        });

        Route::get('attachments/{attachment}/download', [AttachmentController::class, 'download'])->whereNumber('attachment');
        Route::patch('tasks/{task}', [TaskController::class, 'update'])->whereNumber('task');

        Route::get('solutions', [SolutionController::class, 'index']);
        Route::post('solutions/{solution}/submit', [SolutionController::class, 'submit'])->whereNumber('solution');
        Route::post('solutions/{solution}/approve', [SolutionController::class, 'approve'])->whereNumber('solution');

        Route::get('dashboard', DashboardController::class)->middleware('can:dashboard.view');
        Route::get('me/workload', WorkloadController::class);
        Route::get('deadlines', DeadlineController::class)->middleware('can:deadlines.view');

        Route::get('quality/actions', [QualityController::class, 'index']);
        Route::post('quality/actions', [QualityController::class, 'store']);
        Route::patch('quality/actions/{action}', [QualityController::class, 'update'])->whereNumber('action');
        Route::get('quality/recurring', [QualityController::class, 'recurring']);

        Route::get('reports/activity', [ReportController::class, 'activity'])->middleware('can:reports.view');
        Route::post('reports/activity/validate', [ReportController::class, 'validateActivity'])->middleware('can:reports.validate');

        // ----- Administration -----
        Route::prefix('admin')->group(function (): void {
            // Vue d'ensemble : contrôle de permission (au moins une permission admin.*) dans le contrôleur.
            Route::get('overview', AdminOverviewController::class);
            Route::middleware('can:admin.users')->group(function (): void {
                Route::get('users', [UserController::class, 'index']);
                Route::post('users', [UserController::class, 'store']);
                Route::get('users/{user}', [UserController::class, 'show'])->whereNumber('user');
                Route::patch('users/{user}', [UserController::class, 'update'])->whereNumber('user');
            });

            $types = ['agencies', 'entities', 'categories', 'products', 'templates', 'holidays'];
            Route::middleware('can:admin.referentials')->group(function () use ($types): void {
                Route::get('{type}', [ReferentialAdminController::class, 'index'])->whereIn('type', $types);
                Route::post('{type}', [ReferentialAdminController::class, 'store'])->whereIn('type', $types);
                Route::patch('{type}/{id}', [ReferentialAdminController::class, 'update'])->whereIn('type', $types)->whereNumber('id');
                Route::delete('{type}/{id}', [ReferentialAdminController::class, 'destroy'])->whereIn('type', $types)->whereNumber('id');
            });

            // Règles de délai : middleware can: (défense en profondeur) + policy dans le contrôleur.
            Route::get('deadline-rules', [DeadlineRuleController::class, 'index'])->middleware('can:viewAny,App\\Models\\DeadlineRule');
            Route::post('deadline-rules', [DeadlineRuleController::class, 'store'])->middleware('can:admin.rules');
            Route::patch('deadline-rules/{rule}', [DeadlineRuleController::class, 'update'])->whereNumber('rule')->middleware('can:admin.rules');
            Route::delete('deadline-rules/{rule}', [DeadlineRuleController::class, 'destroy'])->whereNumber('rule')->middleware('can:admin.rules');
            Route::post('deadline-rules/{rule}/validate', [DeadlineRuleController::class, 'validateRule'])->whereNumber('rule')->middleware('can:admin.rules.validate');

            Route::get('audit-logs', [AuditLogController::class, 'index'])->middleware('can:admin.audit');

            Route::middleware('can:admin.imports')->group(function (): void {
                Route::get('imports', [ImportController::class, 'index']);
                Route::post('imports', [ImportController::class, 'store']);
                Route::get('imports/{import}', [ImportController::class, 'show'])->whereNumber('import');
            });
        });
    });
});
