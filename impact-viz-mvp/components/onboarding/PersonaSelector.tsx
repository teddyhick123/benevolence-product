'use client';

import { BuildingOffice2Icon, UserGroupIcon, HeartIcon, ChartBarIcon } from '@heroicons/react/24/outline';

type OrgType = 'foundation' | 'daf' | 'nonprofit' | 'impact_investor';

interface PersonaOption {
  id: OrgType;
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  examples: string[];
}

const PERSONAS: PersonaOption[] = [
  {
    id: 'foundation',
    name: 'Foundation',
    description: 'Private or family foundation managing grants and impact',
    icon: BuildingOffice2Icon,
    examples: ['Family Foundation', 'Private Foundation', 'Corporate Foundation'],
  },
  {
    id: 'daf',
    name: 'Donor-Advised Fund',
    description: 'DAF sponsor or account holder managing contributions',
    icon: HeartIcon,
    examples: ['DAF Account', 'Community Foundation DAF', 'Charitable Gift Fund'],
  },
  {
    id: 'nonprofit',
    name: 'Nonprofit',
    description: 'Nonprofit organization tracking impact and donors',
    icon: UserGroupIcon,
    examples: ['501(c)(3)', 'Charity', 'Social Enterprise'],
  },
  {
    id: 'impact_investor',
    name: 'Impact Investor',
    description: 'Impact investor tracking portfolio metrics and returns',
    icon: ChartBarIcon,
    examples: ['Impact Fund', 'Social Impact', 'ESG Portfolio'],
  },
];

interface PersonaSelectorProps {
  value?: OrgType;
  onChange: (value: OrgType) => void;
}

export default function PersonaSelector({ value, onChange }: PersonaSelectorProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {PERSONAS.map((persona) => {
        const Icon = persona.icon;
        const isSelected = value === persona.id;

        return (
          <button
            key={persona.id}
            type="button"
            onClick={() => onChange(persona.id)}
            className={`
              relative p-6 rounded-xl border-2 text-left transition-all
              ${isSelected
                ? 'border-azure bg-azure/5 shadow-md'
                : 'border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50'
              }
            `}
          >
            {/* Selected indicator */}
            {isSelected && (
              <div className="absolute top-3 right-3">
                <div className="w-5 h-5 bg-azure rounded-full flex items-center justify-center">
                  <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
              </div>
            )}

            {/* Icon */}
            <div className={`
              w-12 h-12 rounded-lg flex items-center justify-center mb-4
              ${isSelected ? 'bg-azure text-white' : 'bg-neutral-100 text-neutral-600'}
            `}>
              <Icon className="w-6 h-6" />
            </div>

            {/* Content */}
            <h3 className={`font-semibold mb-1 ${isSelected ? 'text-azure' : 'text-neutral-900'}`}>
              {persona.name}
            </h3>
            <p className="text-sm text-neutral-600 mb-3">
              {persona.description}
            </p>

            {/* Examples */}
            <div className="flex flex-wrap gap-1">
              {persona.examples.map((example) => (
                <span
                  key={example}
                  className={`
                    text-xs px-2 py-0.5 rounded-full
                    ${isSelected ? 'bg-azure/10 text-azure' : 'bg-neutral-100 text-neutral-500'}
                  `}
                >
                  {example}
                </span>
              ))}
            </div>
          </button>
        );
      })}
    </div>
  );
}
