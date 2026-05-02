import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { useUserProfile } from '../../shared/context/UserProfileContext';
import {
  PROFILE_LIMITS,
  Sex,
  UserProfile,
  computeAge,
  estimateMaxHr,
  isValidDob,
  isValidMaxHrOverride,
  isValidRestingHr,
} from '../../shared/lib/hrZones';
import { Button } from '../../shared/ui/Button';
import { HeartRatePill } from '../../shared/ui/HeartRatePill';
import { Input } from '../../shared/ui/Input';
import { useToast } from '../../shared/ui/Toast';

const SEX_OPTIONS: Array<{ value: Sex; label: string }> = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'unspecified', label: 'Prefer not to say' },
];

function toInputString(value: number | null): string {
  return value == null ? '' : String(value);
}

interface FieldErrors {
  dob?: string;
  restingHr?: string;
  maxHrOverride?: string;
}

export default function Settings() {
  const { profile, setProfile } = useUserProfile();
  const toast = useToast();

  const [dobStr, setDobStr] = useState(profile.dob ?? '');
  const [sex, setSex] = useState<Sex>(profile.sex);
  const [restingHrStr, setRestingHrStr] = useState(toInputString(profile.restingHr));
  const [maxHrStr, setMaxHrStr] = useState(toInputString(profile.maxHrOverride));
  const [errors, setErrors] = useState<FieldErrors>({});

  function parseAndValidate(): { profile: UserProfile; errors: FieldErrors } {
    const next: UserProfile = {
      dob: null,
      sex,
      restingHr: null,
      maxHrOverride: null,
    };
    const fieldErrors: FieldErrors = {};

    const dobTrim = dobStr.trim();
    if (dobTrim) {
      if (!isValidDob(dobTrim)) {
        fieldErrors.dob = `Date of birth must yield an age between ${PROFILE_LIMITS.age.min} and ${PROFILE_LIMITS.age.max}`;
      } else {
        next.dob = dobTrim;
      }
    }

    const restingTrim = restingHrStr.trim();
    if (restingTrim) {
      const parsed = Number(restingTrim);
      if (!isValidRestingHr(parsed)) {
        fieldErrors.restingHr = `Resting HR must be ${PROFILE_LIMITS.restingHr.min}–${PROFILE_LIMITS.restingHr.max}`;
      } else {
        next.restingHr = parsed;
      }
    }

    const maxTrim = maxHrStr.trim();
    if (maxTrim) {
      const parsed = Number(maxTrim);
      if (!isValidMaxHrOverride(parsed)) {
        fieldErrors.maxHrOverride = `Max HR must be ${PROFILE_LIMITS.maxHrOverride.min}–${PROFILE_LIMITS.maxHrOverride.max}`;
      } else {
        next.maxHrOverride = parsed;
      }
    }

    return { profile: next, errors: fieldErrors };
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const { profile: next, errors: fieldErrors } = parseAndValidate();
    if (Object.keys(fieldErrors).length > 0) {
      setErrors(fieldErrors);
      toast.error('Fix errors before saving');
      return;
    }
    setErrors({});
    setProfile(next);
    toast.success('Profile saved');
  }

  const preview = (() => {
    const { profile: next, errors: fieldErrors } = parseAndValidate();
    if (Object.keys(fieldErrors).length > 0) return null;
    const max = estimateMaxHr(next);
    if (max == null) return null;
    return { age: computeAge(next.dob), max };
  })();

  return (
    <div className="space-y-5 max-w-md mx-auto">
      <div className="flex items-center gap-3">
        <Link
          to="/"
          className="p-2 -ml-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-surface-800 transition-colors"
          aria-label="Back to dashboard"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <h1 className="text-2xl font-display font-bold flex-1">Settings</h1>
        <HeartRatePill />
      </div>

      <form onSubmit={handleSubmit} className="card space-y-5">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Profile</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Used to compute heart rate zones during cardio. Stored locally on this device.
          </p>
        </div>

        <Input
          label="Date of birth"
          type="date"
          value={dobStr}
          onChange={(e) => setDobStr(e.target.value)}
          error={errors.dob}
        />

        <div>
          <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Sex
          </span>
          <div className="space-y-2">
            {SEX_OPTIONS.map((option) => (
              <label
                key={option.value}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg border-2 border-gray-200 dark:border-surface-800 bg-white dark:bg-surface-900 cursor-pointer transition-colors hover:border-primary-300 dark:hover:border-primary-700"
              >
                <input
                  type="radio"
                  name="sex"
                  value={option.value}
                  checked={sex === option.value}
                  onChange={() => setSex(option.value)}
                  className="w-4 h-4 text-primary-600 focus:ring-primary-500"
                />
                <span className="text-sm text-gray-900 dark:text-gray-100">{option.label}</span>
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            Picks the most accurate max HR formula. "Prefer not to say" uses a unisex estimate.
          </p>
        </div>

        <div>
          <Input
            label="Resting HR (optional)"
            type="number"
            inputMode="numeric"
            value={restingHrStr}
            onChange={(e) => setRestingHrStr(e.target.value)}
            min={PROFILE_LIMITS.restingHr.min}
            max={PROFILE_LIMITS.restingHr.max}
            placeholder="bpm"
            error={errors.restingHr}
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Measure first thing in the morning before getting up. Without this, zones are calculated from your max HR only.
          </p>
        </div>

        <div>
          <Input
            label="Max HR override (optional)"
            type="number"
            inputMode="numeric"
            value={maxHrStr}
            onChange={(e) => setMaxHrStr(e.target.value)}
            min={PROFILE_LIMITS.maxHrOverride.min}
            max={PROFILE_LIMITS.maxHrOverride.max}
            placeholder="bpm"
            error={errors.maxHrOverride}
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Defaults to a formula based on your age and sex. If you've measured your true max during a hard interval, that beats any formula.
          </p>
        </div>

        {preview != null && (
          <div className="rounded-lg bg-surface-100 dark:bg-surface-850 p-3 text-sm text-gray-700 dark:text-gray-300 space-y-0.5">
            {preview.age != null && (
              <div>
                Age: <span className="font-semibold tabular-nums">{preview.age}</span>
              </div>
            )}
            <div>
              Estimated max HR: <span className="font-semibold tabular-nums">{Math.round(preview.max)} bpm</span>
            </div>
          </div>
        )}

        <Button type="submit" variant="primary" size="lg" className="w-full">
          Save
        </Button>
      </form>
    </div>
  );
}
