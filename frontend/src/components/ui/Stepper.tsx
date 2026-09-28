import { Check } from 'lucide-react';

export interface StepDef {
  key: string;
  label: string;
  alert?: boolean;
}

interface StepperProps {
  steps: StepDef[];
  current: number;
  label: string;
  showProgress?: boolean;
}

export function Stepper({ steps, current, label, showProgress = true }: StepperProps) {
  const complete = current >= steps.length;
  const pct = complete ? 100 : steps.length > 1 ? Math.round((current / (steps.length - 1)) * 100) : 100;
  return (
    <div>
      <ol className="stepper" aria-label={label}>
        {steps.map((s, i) => {
          const state = i < current ? 'done' : i === current ? 'current' : 'todo';
          return (
            <li key={s.key} className={`${state} ${s.alert ? 'alert' : ''}`} aria-current={i === current ? 'step' : undefined}>
              <span className="step-dot" aria-hidden="true">
                {state === 'done' ? <Check size={16} /> : i + 1}
              </span>
              <span className="step-label">{s.label}</span>
              <span className="sr-only">{state === 'done' ? ' (terminée)' : state === 'current' ? ' (étape en cours)' : ' (à venir)'}</span>
            </li>
          );
        })}
      </ol>
      {showProgress && (
        <div
          className="progress"
          role="progressbar"
          aria-label="Progression"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-valuetext={complete ? 'Toutes les étapes sont terminées' : `Étape ${current + 1} sur ${steps.length}`}
        >
          <span style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}
