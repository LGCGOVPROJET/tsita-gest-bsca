<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;

// Back-end API uniquement : l'interface est servie par le front-end React.
Route::get('/', fn () => response()->json(['name' => 'TSITA GEST API', 'version' => 'v1', 'docs' => '/docs/openapi.yaml']));
