'use client';

import { Car, PawPrint, Pencil, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { AuthNotice } from '@/components/auth/auth-notice';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Field, Input } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import {
  archivePetAction,
  archiveVehicleAction,
  savePetAction,
  saveVehicleAction,
} from '@/app/(app)/registry/units/actions';
import { useSubmitAction } from '@/lib/platform/use-submit-action';
import type { UnitSheet } from '@/lib/registry/data';
import { useEventId } from '@/lib/registry/use-event-id';
import { useOnSuccess } from '@/lib/registry/use-on-success';
import { useRunAction } from '@/lib/registry/use-run-action';
import { useErrorMessage } from './use-error-message';

type Vehicle = UnitSheet['vehicles'][number];
type Pet = UnitSheet['pets'][number];

const iconProps = {
  'aria-hidden': true,
  className: 'size-5',
  strokeWidth: 2,
} as const;

function VehicleForm({
  unitId,
  vehicle,
  onDone,
}: {
  unitId: string;
  vehicle?: Vehicle;
  onDone: () => void;
}) {
  const t = useTranslations('registry.vehicles.form');
  const message = useErrorMessage();
  const { state, onSubmit, pending } = useSubmitAction(
    saveVehicleAction.bind(null, unitId, vehicle?.vehicle_id ?? null),
  );
  const eventId = useEventId(state);
  useOnSuccess(state, onDone);
  const values = state.status === 'error' ? (state.values ?? {}) : {};
  const errors = state.status === 'error' ? state.errors : {};
  const value = (name: string, stored?: string | null) =>
    values[name] ?? stored ?? '';
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <input type="hidden" name="client_event_id" value={eventId} />
      {state.status === 'error' && state.formError ? (
        <AuthNotice tone="error">{message(state.formError)}</AuthNotice>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('plate')} error={message(errors.vehicle_plate_code)}>
          <Input
            name="vehicle_plate_code"
            defaultValue={value(
              'vehicle_plate_code',
              vehicle?.vehicle_plate_code,
            )}
            maxLength={16}
            autoCapitalize="characters"
            autoComplete="off"
          />
        </Field>
        <Field label={t('make')} error={message(errors.vehicle_make_name)}>
          <Input
            name="vehicle_make_name"
            defaultValue={value(
              'vehicle_make_name',
              vehicle?.vehicle_make_name,
            )}
            autoComplete="off"
          />
        </Field>
        <Field label={t('model')} error={message(errors.vehicle_model_name)}>
          <Input
            name="vehicle_model_name"
            defaultValue={value(
              'vehicle_model_name',
              vehicle?.vehicle_model_name,
            )}
            autoComplete="off"
          />
        </Field>
        <Field label={t('color')} error={message(errors.vehicle_color_name)}>
          <Input
            name="vehicle_color_name"
            defaultValue={value(
              'vehicle_color_name',
              vehicle?.vehicle_color_name,
            )}
            autoComplete="off"
          />
        </Field>
      </div>
      <div className="flex flex-wrap justify-end gap-3">
        <Button variant="secondary" onClick={onDone} disabled={pending}>
          {t('cancel')}
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? t('saving') : vehicle ? t('save') : t('add')}
        </Button>
      </div>
    </form>
  );
}

function PetForm({
  unitId,
  pet,
  onDone,
}: {
  unitId: string;
  pet?: Pet;
  onDone: () => void;
}) {
  const t = useTranslations('registry.pets.form');
  const message = useErrorMessage();
  const { state, onSubmit, pending } = useSubmitAction(
    savePetAction.bind(null, unitId, pet?.pet_id ?? null),
  );
  const eventId = useEventId(state);
  useOnSuccess(state, onDone);
  const values = state.status === 'error' ? (state.values ?? {}) : {};
  const errors = state.status === 'error' ? state.errors : {};
  const value = (name: string, stored?: string | null) =>
    values[name] ?? stored ?? '';
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <input type="hidden" name="client_event_id" value={eventId} />
      {state.status === 'error' && state.formError ? (
        <AuthNotice tone="error">{message(state.formError)}</AuthNotice>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('name')} error={message(errors.pet_name)}>
          <Input
            name="pet_name"
            defaultValue={value('pet_name', pet?.pet_name)}
            autoComplete="off"
          />
        </Field>
        <Field label={t('species')} error={message(errors.pet_species_name)}>
          <Input
            name="pet_species_name"
            defaultValue={value('pet_species_name', pet?.pet_species_name)}
            autoComplete="off"
          />
        </Field>
        <Field label={t('breed')} error={message(errors.pet_breed_name)}>
          <Input
            name="pet_breed_name"
            defaultValue={value('pet_breed_name', pet?.pet_breed_name)}
            autoComplete="off"
          />
        </Field>
      </div>
      <div className="flex flex-wrap justify-end gap-3">
        <Button variant="secondary" onClick={onDone} disabled={pending}>
          {t('cancel')}
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? t('saving') : pet ? t('save') : t('add')}
        </Button>
      </div>
    </form>
  );
}

export function VehiclesCard({
  unitId,
  vehicles,
  writable,
}: {
  unitId: string;
  vehicles: readonly Vehicle[];
  writable: boolean;
}) {
  const t = useTranslations('registry.vehicles');
  const message = useErrorMessage();
  const [editing, setEditing] = useState<Vehicle | 'new' | null>(null);
  const [archiving, setArchiving] = useState<Vehicle | null>(null);
  const action = useRunAction();
  return (
    <Card density="dense" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-app-heading">{t('title')}</h2>
        {writable ? (
          <Button
            variant="secondary"
            icon={<Plus {...iconProps} />}
            onClick={() => setEditing('new')}
          >
            {t('add')}
          </Button>
        ) : null}
      </div>
      {action.error ? (
        <AuthNotice tone="error">{message(action.error)}</AuthNotice>
      ) : null}
      {vehicles.length === 0 ? (
        <EmptyState
          icon={Car}
          title={t('empty')}
          align="start"
          className="py-3"
        />
      ) : (
        <ul aria-label={t('listLabel')} className="flex flex-col">
          {vehicles.map((vehicle) => (
            <li
              key={vehicle.vehicle_id}
              className="flex flex-wrap items-center gap-3 border-t border-hairline py-2 first:border-t-0"
            >
              <div className="flex min-w-0 flex-1 basis-40 flex-col">
                <span className="font-mono text-app-subheading tracking-wider">
                  {vehicle.vehicle_plate_code}
                </span>
                <span className="text-app-caption text-text-secondary">
                  {[
                    vehicle.vehicle_make_name,
                    vehicle.vehicle_model_name,
                    vehicle.vehicle_color_name,
                  ]
                    .filter(Boolean)
                    .join(' · ') || '—'}
                </span>
              </div>
              {writable ? (
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    size="icon"
                    aria-label={t('editNamed', {
                      plate: vehicle.vehicle_plate_code,
                    })}
                    onClick={() => setEditing(vehicle)}
                  >
                    <Pencil {...iconProps} />
                  </Button>
                  <Button
                    variant="secondary"
                    size="icon"
                    aria-label={t('archiveNamed', {
                      plate: vehicle.vehicle_plate_code,
                    })}
                    onClick={() => setArchiving(vehicle)}
                  >
                    <Trash2 {...iconProps} />
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <Sheet
        open={editing !== null}
        title={editing === 'new' ? t('addTitle') : t('editTitle')}
        closeLabel={t('close')}
        onClose={() => setEditing(null)}
      >
        {editing !== null ? (
          <VehicleForm
            unitId={unitId}
            vehicle={editing === 'new' ? undefined : editing}
            onDone={() => setEditing(null)}
          />
        ) : null}
      </Sheet>
      <ConfirmDialog
        open={archiving !== null}
        title={t('archiveTitle')}
        confirmLabel={t('archiveConfirm')}
        cancelLabel={t('cancel')}
        tone="destructive"
        pending={action.pending}
        onCancel={() => setArchiving(null)}
        onConfirm={() => {
          const target = archiving;
          if (!target) return;
          action.run(() => archiveVehicleAction(unitId, target.vehicle_id));
          setArchiving(null);
        }}
      >
        {archiving
          ? t('archiveBody', { plate: archiving.vehicle_plate_code })
          : null}
      </ConfirmDialog>
    </Card>
  );
}

export function PetsCard({
  unitId,
  pets,
  writable,
}: {
  unitId: string;
  pets: readonly Pet[];
  writable: boolean;
}) {
  const t = useTranslations('registry.pets');
  const message = useErrorMessage();
  const [editing, setEditing] = useState<Pet | 'new' | null>(null);
  const [archiving, setArchiving] = useState<Pet | null>(null);
  const action = useRunAction();
  return (
    <Card density="dense" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-app-heading">{t('title')}</h2>
        {writable ? (
          <Button
            variant="secondary"
            icon={<Plus {...iconProps} />}
            onClick={() => setEditing('new')}
          >
            {t('add')}
          </Button>
        ) : null}
      </div>
      {action.error ? (
        <AuthNotice tone="error">{message(action.error)}</AuthNotice>
      ) : null}
      {pets.length === 0 ? (
        <EmptyState
          icon={PawPrint}
          title={t('empty')}
          align="start"
          className="py-3"
        />
      ) : (
        <ul aria-label={t('listLabel')} className="flex flex-col">
          {pets.map((pet) => (
            <li
              key={pet.pet_id}
              className="flex flex-wrap items-center gap-3 border-t border-hairline py-2 first:border-t-0"
            >
              <div className="flex min-w-0 flex-1 basis-40 flex-col">
                <span className="text-app-subheading">{pet.pet_name}</span>
                <span className="text-app-caption text-text-secondary">
                  {[pet.pet_species_name, pet.pet_breed_name]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </div>
              {writable ? (
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    size="icon"
                    aria-label={t('editNamed', { name: pet.pet_name })}
                    onClick={() => setEditing(pet)}
                  >
                    <Pencil {...iconProps} />
                  </Button>
                  <Button
                    variant="secondary"
                    size="icon"
                    aria-label={t('archiveNamed', { name: pet.pet_name })}
                    onClick={() => setArchiving(pet)}
                  >
                    <Trash2 {...iconProps} />
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <Sheet
        open={editing !== null}
        title={editing === 'new' ? t('addTitle') : t('editTitle')}
        closeLabel={t('close')}
        onClose={() => setEditing(null)}
      >
        {editing !== null ? (
          <PetForm
            unitId={unitId}
            pet={editing === 'new' ? undefined : editing}
            onDone={() => setEditing(null)}
          />
        ) : null}
      </Sheet>
      <ConfirmDialog
        open={archiving !== null}
        title={t('archiveTitle')}
        confirmLabel={t('archiveConfirm')}
        cancelLabel={t('cancel')}
        tone="destructive"
        pending={action.pending}
        onCancel={() => setArchiving(null)}
        onConfirm={() => {
          const target = archiving;
          if (!target) return;
          action.run(() => archivePetAction(unitId, target.pet_id));
          setArchiving(null);
        }}
      >
        {archiving ? t('archiveBody', { name: archiving.pet_name }) : null}
      </ConfirmDialog>
    </Card>
  );
}
