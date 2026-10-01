<?php

namespace Tests\Feature\Settings;

use App\Models\AppSetting;
use App\Rules\PasswordPolicy;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Validator;
use Tests\Concerns\SeedsTenant;
use Tests\TestCase;

class PasswordPolicyTest extends TestCase
{
    use RefreshDatabase, SeedsTenant;

    private function validate(string $password): \Illuminate\Contracts\Validation\Validator
    {
        return Validator::make(['password' => $password], ['password' => [new PasswordPolicy($this->pressingId())]]);
    }

    public function test_a_password_shorter_than_the_configured_minimum_fails(): void
    {
        AppSetting::current($this->pressingId())->update(['password_min_length' => 10]);

        $this->assertTrue($this->validate('Ab1defg')->fails());
    }

    public function test_a_password_without_an_uppercase_fails_when_required(): void
    {
        AppSetting::current($this->pressingId())->update(['password_require_uppercase' => true]);

        $this->assertTrue($this->validate('lowercase1')->fails());
    }

    public function test_a_password_without_a_number_fails_when_required(): void
    {
        AppSetting::current($this->pressingId())->update(['password_require_number' => true]);

        $this->assertTrue($this->validate('NoNumbersHere')->fails());
    }

    public function test_a_password_without_a_symbol_passes_when_symbols_are_not_required(): void
    {
        AppSetting::current($this->pressingId())->update(['password_require_symbol' => false]);

        $this->assertTrue($this->validate('Abcdefg1')->passes());
    }

    public function test_a_password_without_a_symbol_fails_when_symbols_are_required(): void
    {
        AppSetting::current($this->pressingId())->update(['password_require_symbol' => true]);

        $this->assertTrue($this->validate('Abcdefg1')->fails());
    }

    public function test_a_password_satisfying_every_rule_passes(): void
    {
        AppSetting::current($this->pressingId())->update([
            'password_min_length' => 8,
            'password_require_uppercase' => true,
            'password_require_number' => true,
            'password_require_symbol' => true,
        ]);

        $this->assertTrue($this->validate('Abcdef1!')->passes());
    }
}
