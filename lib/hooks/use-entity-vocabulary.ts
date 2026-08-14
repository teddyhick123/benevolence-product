'use client';

import { apiRequest, readJson } from "@/lib/api/client";

import { useEffect, useState } from 'react';
import {
  DEFAULT_ENTITY_VOCABULARY,
  type EntityVocabulary,
  type EntityVocabularyType,
} from '@/lib/organizations/view-config';

export function useEntityVocabulary(orgId?: string | null) {
  const [vocabulary, setVocabulary] = useState<Record<EntityVocabularyType, EntityVocabulary>>(DEFAULT_ENTITY_VOCABULARY);

  useEffect(() => {
    if (!orgId) {
      setVocabulary(DEFAULT_ENTITY_VOCABULARY);
      return;
    }

    let cancelled = false;
    apiRequest(`/api/org/${orgId}/view-config?include_vocabulary=true`)
      .then(async res => {
        const json = await readJson(res).catch(() => ({}));
        if (!res.ok) throw new Error(json.error ?? 'Failed to load vocabulary');
        return json;
      })
      .then(json => {
        if (!cancelled) setVocabulary(json.vocabulary ?? DEFAULT_ENTITY_VOCABULARY);
      })
      .catch(() => {
        if (!cancelled) setVocabulary(DEFAULT_ENTITY_VOCABULARY);
      });

    return () => {
      cancelled = true;
    };
  }, [orgId]);

  return vocabulary;
}
