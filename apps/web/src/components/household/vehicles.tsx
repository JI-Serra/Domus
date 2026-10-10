'use client';

import { formatPlate } from '@domus/domain/household';
import { Car } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import {
  removeVehicleAction,
  saveVehicleAction,
} from '@/app/(app)/home/actions';
import { useTenantWritable } from '@/components/tenant/tenant-status';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Field, Input } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import type { VehicleView } from '@/lib/household/view';
import { useSubmitAction } from '@/lib/platform/use-submit-action';
import {
  ActionNotice,
  noticeOf,
  useActionRunner,
  useErrorMessage,
} from './notice';
import type { Notice } from './notice';

function VehicleForm({
  vehicle,
  onDone,
  onCancel,
}: {
  vehicle: VehicleView | null;
  onDone: (notice: Notice | null) => void;
  onCancel: () => void;
}) {
  const t = useTranslations('household');
  const message = useErrorMessage();
  const { state, onSubmit, pending } = useSubmitAction(
    saveVehicleAction.bind(null, vehicle?.vehicleId ?? null),
  );
  const [eventId] = useState(() => crypto.randomUUID());
  useEffect(() => {
    if (state.status === 'success') onDone(noticeOf(state));
    // `onDone` only closes the sheet; the success state is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  const values = state.status === 'error' ? (state.values ?? {}) : {};
  const errors = state.status === 'error' ? state.errors : {};

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {state.status === 'error' && state.formError ? (
        <ActionNotice notice={{ tone: 'error', key: state.formError }} />
      ) : null}
      <input type="hidden" name="client_event_id" value={eventId} />
      <Field
        label={t('vehicles.plate')}
        info={{
          label: t('vehicles.plateInfoLabel'),
          text: t('vehicles.plateInfo'),
        }}
        error={message(errors.vehicle_plate_code)}
      >
        <Input
          name="vehicle_plate_code"
          defaultValue={
            values.vehicle_plate_code ??
            (vehicle ? formatPlate(vehicle.plate) : '')
          }
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          maxLength={16}
          className="tnum uppercase"
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field
          label={t('vehicles.make')}
          error={message(errors.vehicle_make_name)}
        >
          <Input
            name="vehicle_make_name"
            defaultValue={values.vehicle_make_name ?? vehicle?.make ?? ''}
            autoComplete="off"
            maxLength={100}
          />
        </Field>
        <Field
          label={t('vehicles.model')}
          error={message(errors.vehicle_model_name)}
        >
          <Input
            name="vehicle_model_name"
            defaultValue={values.vehicle_model_name ?? vehicle?.model ?? ''}
            autoComplete="off"
            maxLength={100}
          />
        </Field>
        <Field
          label={t('vehicles.color')}
          error={message(errors.vehicle_color_name)}
        >
          <Input
            name="vehicle_color_name"
            defaultValue={values.vehicle_color_name ?? vehicle?.color ?? ''}
            autoComplete="off"
            maxLength={100}
          />
        </Field>
      </div>
      <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onCancel} disabled={pending}>
          {t('cancel')}
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? t('saving') : t('save')}
        </Button>
      </div>
    </form>
  );
}

function VehicleRow({
  vehicle,
  canManage,
  onNotice,
}: {
  vehicle: VehicleView;
  canManage: boolean;
  onNotice: (notice: Notice | null) => void;
}) {
  const t = useTranslations('household');
  const writable = useTenantWritable();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const { run, pending } = useActionRunner();
  const plate = formatPlate(vehicle.plate);
  const details = [vehicle.make, vehicle.model, vehicle.color]
    .filter(Boolean)
    .join(' · ');

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-card-dense bg-surface-0 p-4">
      <div className="flex min-w-0 flex-1 basis-40 flex-col">
        <span className="tnum text-app-subheading">{plate}</span>
        {details ? (
          <span className="truncate text-app-caption text-text-secondary">
            {details}
          </span>
        ) : null}
      </div>
      {canManage ? (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            disabled={!writable}
            aria-label={t('vehicles.editLabel', { plate })}
            onClick={() => setEditing(true)}
          >
            {t('members.edit')}
          </Button>
          <Button
            variant="destructive"
            disabled={!writable}
            aria-label={t('vehicles.removeLabel', { plate })}
            onClick={() => setConfirming(true)}
          >
            {t('vehicles.remove')}
          </Button>
        </div>
      ) : null}
      <Sheet
        open={editing}
        title={t('vehicles.editTitle')}
        closeLabel={t('close')}
        onClose={() => setEditing(false)}
      >
        <VehicleForm
          vehicle={vehicle}
          onDone={(done) => {
            setEditing(false);
            onNotice(done);
          }}
          onCancel={() => setEditing(false)}
        />
      </Sheet>
      <ConfirmDialog
        open={confirming}
        title={t('vehicles.removeTitle', { plate })}
        confirmLabel={
          pending ? t('vehicles.removing') : t('vehicles.removeConfirm')
        }
        cancelLabel={t('cancel')}
        tone="destructive"
        pending={pending}
        onCancel={() => setConfirming(false)}
        onConfirm={() =>
          run(
            () => removeVehicleAction(vehicle.vehicleId),
            (result) => {
              setConfirming(false);
              onNotice(noticeOf(result));
            },
          )
        }
      >
        {t('vehicles.removeBody')}
      </ConfirmDialog>
    </li>
  );
}

/** Vehicles of the unit. Holders add, edit and remove; members only look. */
export function VehicleSection({
  vehicles,
  canManage,
}: {
  vehicles: readonly VehicleView[];
  canManage: boolean;
}) {
  const t = useTranslations('household');
  const writable = useTenantWritable();
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  return (
    <Card density="dense" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-app-heading">{t('sections.vehicles')}</h2>
        {canManage ? (
          <Button disabled={!writable} onClick={() => setAdding(true)}>
            {t('vehicles.add')}
          </Button>
        ) : null}
      </div>
      <ActionNotice notice={notice} />
      {vehicles.length === 0 ? (
        <EmptyState icon={Car} title={t('vehicles.empty')} align="start" />
      ) : (
        <ul
          aria-label={t('vehicles.listLabel')}
          className="flex flex-col gap-3"
        >
          {vehicles.map((vehicle) => (
            <VehicleRow
              key={vehicle.vehicleId}
              vehicle={vehicle}
              canManage={canManage}
              onNotice={setNotice}
            />
          ))}
        </ul>
      )}
      <Sheet
        open={adding}
        title={t('vehicles.addTitle')}
        closeLabel={t('close')}
        onClose={() => setAdding(false)}
      >
        <VehicleForm
          vehicle={null}
          onDone={(done) => {
            setAdding(false);
            setNotice(done);
          }}
          onCancel={() => setAdding(false)}
        />
      </Sheet>
    </Card>
  );
}
