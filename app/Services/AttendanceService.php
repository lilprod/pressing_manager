<?php

namespace App\Services;

use App\Exceptions\AttendanceException;
use App\Models\Attendance;
use App\Models\Shift;
use App\Models\User;
use Illuminate\Support\Facades\DB;

class AttendanceService
{
    /** Au-delà de ce délai après le début du créneau prévu, le pointage est marqué "retard". */
    private const LATE_GRACE_MINUTES = 15;

    public function clockIn(User $user, int $agencyId): Attendance
    {
        return DB::transaction(function () use ($user, $agencyId) {
            $open = Attendance::query()
                ->where('user_id', $user->id)
                ->whereNull('clock_out')
                ->whereNotNull('clock_in')
                ->lockForUpdate()
                ->exists();

            if ($open) {
                throw AttendanceException::alreadyClockedIn();
            }

            $now = now();

            $shift = Shift::query()
                ->where('user_id', $user->id)
                ->whereDate('starts_at', $now->toDateString())
                ->orderBy('starts_at')
                ->first();

            $status = 'present';
            if ($shift && $now->greaterThan($shift->starts_at->addMinutes(self::LATE_GRACE_MINUTES))) {
                $status = 'retard';
            }

            return Attendance::create([
                'agency_id' => $agencyId,
                'user_id' => $user->id,
                'shift_id' => $shift?->id,
                'clock_in' => $now,
                'status' => $status,
            ]);
        });
    }

    public function clockOut(User $user): Attendance
    {
        return DB::transaction(function () use ($user) {
            $attendance = Attendance::query()
                ->where('user_id', $user->id)
                ->whereNull('clock_out')
                ->whereNotNull('clock_in')
                ->lockForUpdate()
                ->latest('clock_in')
                ->first();

            if (! $attendance) {
                throw AttendanceException::noOpenAttendance();
            }

            $attendance->update(['clock_out' => now()]);

            return $attendance;
        });
    }

    /**
     * Marque "absent" les créneaux du jour donné dont le créneau est terminé sans
     * aucun pointage associé (ni entrée, ni sortie).
     */
    public function markAbsences(\DateTimeInterface $date): int
    {
        $shifts = Shift::query()
            ->whereDate('starts_at', $date->format('Y-m-d'))
            ->where('ends_at', '<', now())
            ->get();

        $marked = 0;

        foreach ($shifts as $shift) {
            $hasAttendance = Attendance::query()->where('shift_id', $shift->id)->exists();

            if (! $hasAttendance) {
                Attendance::create([
                    'agency_id' => $shift->agency_id,
                    'user_id' => $shift->user_id,
                    'shift_id' => $shift->id,
                    'status' => 'absent',
                ]);
                $marked++;
            }
        }

        return $marked;
    }
}
