'use client';

import { useState } from 'react';
import PersonaSelector from './PersonaSelector';

type OrgType = 'foundation' | 'daf' | 'nonprofit' | 'impact_investor';
type OrgSize = 'solo' | 'small' | 'medium' | 'large';

export interface QuickIntakeData {
  org_type: OrgType;
  org_name: string;
  org_size: OrgSize;
  primary_focus: string[];
  existing_tools: string[];
}

const FOCUS_AREAS = [
  'Education',
  'Environment',
  'Health',
  'Poverty',
  'Arts & Culture',
  'Community Development',
  'Human Rights',
  'Animal Welfare',
  'Disaster Relief',
  'Research',
];

const EXISTING_TOOLS = [
  'Spreadsheets (Excel/Sheets)',
  'QuickBooks',
  'Salesforce',
  'Blackbaud',
  'Fluxx',
  'Submittable',
  'Other grant management',
  'Paper-based',
];

const SIZE_OPTIONS: { value: OrgSize; label: string; description: string }[] = [
  { value: 'solo', label: 'Just me', description: 'Solo operation' },
  { value: 'small', label: '2-5 people', description: 'Small team' },
  { value: 'medium', label: '6-20 people', description: 'Growing organization' },
  { value: 'large', label: '20+ people', description: 'Large organization' },
];

interface QuickIntakeFormProps {
  onSubmit: (data: QuickIntakeData) => void;
  isLoading?: boolean;
}

export default function QuickIntakeForm({ onSubmit, isLoading }: QuickIntakeFormProps) {
  const [step, setStep] = useState(1);
  const [data, setData] = useState<Partial<QuickIntakeData>>({
    primary_focus: [],
    existing_tools: [],
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const totalSteps = 3;

  const validateStep = (stepNum: number): boolean => {
    const newErrors: Record<string, string> = {};

    if (stepNum === 1 && !data.org_type) {
      newErrors.org_type = 'Please select your organization type';
    }

    if (stepNum === 2) {
      if (!data.org_name?.trim()) {
        newErrors.org_name = 'Organization name is required';
      }
      if (!data.org_size) {
        newErrors.org_size = 'Please select your team size';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (validateStep(step)) {
      if (step < totalSteps) {
        setStep(step + 1);
      } else {
        handleSubmit();
      }
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  const handleSubmit = () => {
    if (data.org_type && data.org_name && data.org_size) {
      onSubmit({
        org_type: data.org_type,
        org_name: data.org_name,
        org_size: data.org_size,
        primary_focus: data.primary_focus || [],
        existing_tools: data.existing_tools || [],
      });
    }
  };

  const toggleArrayItem = (key: 'primary_focus' | 'existing_tools', item: string) => {
    const current = data[key] || [];
    const updated = current.includes(item)
      ? current.filter(i => i !== item)
      : [...current, item];
    setData({ ...data, [key]: updated });
  };

  return (
    <div className="max-w-2xl mx-auto">
      {/* Progress */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-neutral-500">Step {step} of {totalSteps}</span>
          <span className="text-sm text-neutral-500">
            {step === 1 && 'Organization Type'}
            {step === 2 && 'Basic Info'}
            {step === 3 && 'Focus Areas'}
          </span>
        </div>
        <div className="h-2 bg-neutral-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-azure transition-all duration-300"
            style={{ width: `${(step / totalSteps) * 100}%` }}
          />
        </div>
      </div>

      {/* Step 1: Organization Type */}
      {step === 1 && (
        <div className="space-y-6">
          <div>
            <h2 className="text-2xl font-semibold text-neutral-900 mb-2">
              What type of organization are you?
            </h2>
            <p className="text-neutral-600">
              This helps us tailor your experience.
            </p>
          </div>

          <PersonaSelector
            value={data.org_type}
            onChange={(value) => setData({ ...data, org_type: value })}
          />

          {errors.org_type && (
            <p className="text-sm text-red-600">{errors.org_type}</p>
          )}
        </div>
      )}

      {/* Step 2: Basic Info */}
      {step === 2 && (
        <div className="space-y-6">
          <div>
            <h2 className="text-2xl font-semibold text-neutral-900 mb-2">
              Tell us about your organization
            </h2>
            <p className="text-neutral-600">
              We&apos;ll use this to personalize your workspace.
            </p>
          </div>

          {/* Organization Name */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              Organization Name
            </label>
            <input
              type="text"
              value={data.org_name || ''}
              onChange={(e) => setData({ ...data, org_name: e.target.value })}
              placeholder="Enter your organization name"
              className={`
                w-full px-4 py-3 rounded-lg border transition-colors
                ${errors.org_name ? 'border-red-300 focus:border-red-500' : 'border-neutral-200 focus:border-azure'}
                focus:outline-none focus:ring-2 focus:ring-azure/20
              `}
            />
            {errors.org_name && (
              <p className="mt-1 text-sm text-red-600">{errors.org_name}</p>
            )}
          </div>

          {/* Team Size */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              Team Size
            </label>
            <div className="grid grid-cols-2 gap-3">
              {SIZE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setData({ ...data, org_size: option.value })}
                  className={`
                    p-4 rounded-lg border-2 text-left transition-all
                    ${data.org_size === option.value
                      ? 'border-azure bg-azure/5'
                      : 'border-neutral-200 hover:border-neutral-300'
                    }
                  `}
                >
                  <div className="font-medium text-neutral-900">{option.label}</div>
                  <div className="text-sm text-neutral-500">{option.description}</div>
                </button>
              ))}
            </div>
            {errors.org_size && (
              <p className="mt-1 text-sm text-red-600">{errors.org_size}</p>
            )}
          </div>
        </div>
      )}

      {/* Step 3: Focus Areas & Tools */}
      {step === 3 && (
        <div className="space-y-6">
          <div>
            <h2 className="text-2xl font-semibold text-neutral-900 mb-2">
              What areas do you focus on?
            </h2>
            <p className="text-neutral-600">
              Select all that apply. You can always change this later.
            </p>
          </div>

          {/* Focus Areas */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              Primary Focus Areas
            </label>
            <div className="flex flex-wrap gap-2">
              {FOCUS_AREAS.map((area) => {
                const isSelected = data.primary_focus?.includes(area);
                return (
                  <button
                    key={area}
                    type="button"
                    onClick={() => toggleArrayItem('primary_focus', area)}
                    className={`
                      px-4 py-2 rounded-full text-sm transition-all
                      ${isSelected
                        ? 'bg-azure text-white'
                        : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                      }
                    `}
                  >
                    {area}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Existing Tools */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              Current Tools (optional)
            </label>
            <p className="text-sm text-neutral-500 mb-3">
              What do you currently use to manage your work?
            </p>
            <div className="flex flex-wrap gap-2">
              {EXISTING_TOOLS.map((tool) => {
                const isSelected = data.existing_tools?.includes(tool);
                return (
                  <button
                    key={tool}
                    type="button"
                    onClick={() => toggleArrayItem('existing_tools', tool)}
                    className={`
                      px-4 py-2 rounded-full text-sm transition-all
                      ${isSelected
                        ? 'bg-azure text-white'
                        : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                      }
                    `}
                  >
                    {tool}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between mt-8 pt-6 border-t border-neutral-200">
        <button
          type="button"
          onClick={handleBack}
          disabled={step === 1}
          className={`
            px-6 py-2 rounded-lg font-medium transition-colors
            ${step === 1
              ? 'text-neutral-300 cursor-not-allowed'
              : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100'
            }
          `}
        >
          Back
        </button>

        <button
          type="button"
          onClick={handleNext}
          disabled={isLoading}
          className="px-8 py-3 bg-azure text-white rounded-lg font-medium hover:bg-azure/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Saving...
            </span>
          ) : step < totalSteps ? (
            'Continue'
          ) : (
            'Start Conversation'
          )}
        </button>
      </div>
    </div>
  );
}
