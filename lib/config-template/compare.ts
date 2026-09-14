import { canonicalValueJson } from '@/lib/config-template/canonical';
import {
  CONFIG_TEMPLATE_SECTIONS,
  naturalKey,
  type ConfigTemplate,
  type ConfigTemplateSection,
} from '@/lib/config-template/types';

export type ConfigComparisonItem = {
  section: ConfigTemplateSection | 'modules';
  key: string;
  status: 'create' | 'update' | 'same' | 'extra';
};

export type ConfigComparison = {
  create: ConfigComparisonItem[];
  update: ConfigComparisonItem[];
  same: ConfigComparisonItem[];
  extra: ConfigComparisonItem[];
};

function itemJson(item: unknown): string {
  return canonicalValueJson(item);
}

function push(result: ConfigComparison, item: ConfigComparisonItem): void {
  result[item.status].push(item);
}

function compareSection(
  result: ConfigComparison,
  section: ConfigTemplateSection,
  templateRows: ConfigTemplate[ConfigTemplateSection],
  liveRows: ConfigTemplate[ConfigTemplateSection],
): void {
  const templateByKey = new Map(templateRows.map(row => [naturalKey(section, row), row]));
  const liveByKey = new Map(liveRows.map(row => [naturalKey(section, row), row]));

  for (const [key, template] of templateByKey) {
    const live = liveByKey.get(key);
    push(result, {
      section,
      key,
      status: !live ? 'create' : itemJson(template) === itemJson(live) ? 'same' : 'update',
    });
  }
  for (const key of liveByKey.keys()) {
    if (!templateByKey.has(key)) push(result, { section, key, status: 'extra' });
  }
}

/** Pure comparison shared by preview and apply. It never deletes extras. */
export function compareConfig(template: ConfigTemplate, live: ConfigTemplate): ConfigComparison {
  const result: ConfigComparison = { create: [], update: [], same: [], extra: [] };
  const templateModules = new Set(template.modules);
  const liveModules = new Set(live.modules);
  for (const moduleSlug of templateModules) {
    push(result, { section: 'modules', key: moduleSlug, status: liveModules.has(moduleSlug) ? 'same' : 'create' });
  }
  for (const moduleSlug of liveModules) {
    if (!templateModules.has(moduleSlug)) push(result, { section: 'modules', key: moduleSlug, status: 'extra' });
  }

  for (const section of CONFIG_TEMPLATE_SECTIONS) {
    compareSection(result, section, template[section], live[section]);
  }

  for (const status of Object.keys(result) as Array<keyof ConfigComparison>) {
    result[status].sort((left, right) =>
      left.section.localeCompare(right.section) || left.key.localeCompare(right.key));
  }
  return result;
}
