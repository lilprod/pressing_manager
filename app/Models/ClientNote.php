<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ClientNote extends Model
{
    protected $fillable = ['client_id', 'user_id', 'body'];

    public function client(): BelongsTo
    {
        return $this->belongsTo(Client::class);
    }

    /** « author » plutôt que « user » : évite toute ambiguïté avec la colonne user_id une fois sérialisé. */
    public function author(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }
}
