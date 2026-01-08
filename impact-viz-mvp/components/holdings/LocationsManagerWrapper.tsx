'use client';

import React, { useTransition } from 'react';
import LocationsManager, { type HoldingLocation } from './LocationsManager';

type Props = {
  holdingId: string;
  portfolioId: string;
  locations: HoldingLocation[];
  addAction: (formData: FormData) => Promise<void>;
  updateAction: (formData: FormData) => Promise<void>;
  deleteAction: (formData: FormData) => Promise<void>;
};

export default function LocationsManagerWrapper({
  holdingId,
  portfolioId,
  locations,
  addAction,
  updateAction,
  deleteAction,
}: Props) {
  const [isPending, startTransition] = useTransition();

  const handleAdd = async (location: Omit<HoldingLocation, 'id'>) => {
    const formData = new FormData();
    formData.append('holding_id', holdingId);
    formData.append('portfolio_id', portfolioId);
    formData.append('name', location.name);
    formData.append('lon', String(location.lon));
    formData.append('lat', String(location.lat));
    if (location.status) formData.append('status', location.status);

    startTransition(async () => {
      await addAction(formData);
    });
  };

  const handleUpdate = async (id: string, updates: Partial<HoldingLocation>) => {
    const formData = new FormData();
    formData.append('location_id', id);
    formData.append('holding_id', holdingId);

    if (updates.name !== undefined) formData.append('name', updates.name);
    if (updates.status !== undefined && updates.status !== null) formData.append('status', updates.status);
    if (updates.lon !== undefined) formData.append('lon', String(updates.lon));
    if (updates.lat !== undefined) formData.append('lat', String(updates.lat));

    startTransition(async () => {
      await updateAction(formData);
    });
  };

  const handleDelete = async (id: string) => {
    const formData = new FormData();
    formData.append('location_id', id);
    formData.append('holding_id', holdingId);

    startTransition(async () => {
      await deleteAction(formData);
    });
  };

  return (
    <LocationsManager
      holdingId={holdingId}
      portfolioId={portfolioId}
      locations={locations}
      onAdd={handleAdd}
      onUpdate={handleUpdate}
      onDelete={handleDelete}
    />
  );
}
