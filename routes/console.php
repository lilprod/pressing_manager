<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Schedule::command('licenses:send-reminders')->dailyAt('08:00');
Schedule::command('subscriptions:expire')->dailyAt('01:00');
Schedule::command('subscriptions:send-reminders')->dailyAt('08:00');
Schedule::command('hr:mark-absences')->dailyAt('23:30');
Schedule::command('loyalty:expire-points')->dailyAt('02:00');
Schedule::command('loyalty:recalculate-spend')->dailyAt('02:15');
