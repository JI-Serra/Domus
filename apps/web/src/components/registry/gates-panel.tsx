'use client';

import { formatDateTime } from '@domus/domain/format';
import { formatJoinCode } from '@domus/domain/registry-ui';
import {
  CircleCheck,
  CircleOff,
  DoorOpen,
  Footprints,
  Car,
  Pencil,
  Plus,
  Smartphone,
  Tablet,
  Unplug,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { AuthNotice } from '@/components/auth/auth-notice';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Countdown, useCountdown } from '@/components/ui/countdown';
import { EmptyState } from '@/components/ui/empty-state';
import { Field, Input, Select } from '@/components/ui/field';
import { InfoButton } from '@/components/ui/info-button';
import { OneTimeSecret } from '@/components/ui/one-time-secret';
import { Sheet } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import {
  createPairingAction,
  revokeDeviceAction,
  saveGateAction,
} from '@/app/(app)/registry/gates/actions';
import { useSubmitAction } from '@/lib/platform/use-submit-action';
import type { DeviceRow, GateRow } from '@/lib/registry/data';
import { useEventId } from '@/lib/registry/use-event-id';
import { useOnSuccess } from '@/lib/registry/use-on-success';
import { useRunAction } from '@/lib/registry/use-run-action';
import { useErrorMessage } from './use-error-message';

const iconProps = {
  'aria-hidden': true,
  className: 'size-5',
  strokeWidth: 2,
} as const;

function GateForm({ gate, onDone }: { gate?: GateRow; onDone: () => void }) {
  const t = useTranslations('registry.gates.form');
  const message = useErrorMessage();
  const { state, onSubmit, pending } = useSubmitAction(
    saveGateAction.bind(null, gate?.gate_id ?? null),
  );
  const eventId = useEventId(state);
  useOnSuccess(state, onDone);
  const values = state.status === 'error' ? (state.values ?? {}) : {};
  const errors = state.status === 'error' ? state.errors : {};
  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <input type="hidden" name="client_event_id" value={eventId} />
      {state.status === 'error' && state.formError ? (
        <AuthNotice tone="error">{message(state.formError)}</AuthNotice>
      ) : null}
      <Field label={t('name')} error={message(errors.gate_name)}>
        <Input
          name="gate_name"
          defaultValue={values.gate_name ?? gate?.gate_name ?? ''}
          maxLength={100}
          autoComplete="off"
        />
      </Field>
      <Field label={t('kind')} error={message(errors.gate_kind)}>
        <Select
          name="gate_kind"
          defaultValue={values.gate_kind ?? gate?.gate_kind ?? 'vehicular'}
        >
          <option value="vehicular">{t('vehicular')}</option>
          <option value="pedestrian">{t('pedestrian')}</option>
        </Select>
      </Field>
      <Switch
        name="gate_is_active"
        label={t('active')}
        defaultChecked={
          state.status === 'error'
            ? values.gate_is_active === 'on'
            : (gate?.gate_is_active ?? true)
        }
      />
      <div className="flex flex-wrap justify-end gap-3">
        <Button variant="secondary" onClick={onDone} disabled={pending}>
          {t('cancel')}
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? t('saving') : gate ? t('save') : t('create')}
        </Button>
      </div>
    </form>
  );
}

/** The one screen that shows a pairing code: large, copyable, with the ten-minute countdown. */
function PairingCode({
  code,
  expiresAt,
  tabletUrl,
  onRegenerate,
  onClose,
  pending,
}: {
  code: string;
  expiresAt: string;
  tabletUrl: string;
  onRegenerate: () => void;
  onClose: () => void;
  pending: boolean;
}) {
  const t = useTranslations('registry.gates.pairing');
  const seconds = useCountdown(expiresAt);
  const expired = seconds === 0;
  return (
    <div className="flex flex-col gap-4">
      {expired ? (
        <AuthNotice tone="error">{t('expired')}</AuthNotice>
      ) : (
        <OneTimeSecret
          label={t('codeLabel')}
          value={formatJoinCode(code)}
          copyLabel={t('copy')}
          copiedLabel={t('copied')}
          info={{
            label: t('infoLabel'),
            text: t('info', { url: tabletUrl }),
          }}
        >
          <Countdown
            expiresAt={expiresAt}
            label={t('expiresIn')}
            expiredLabel={t('expiredShort')}
          />
        </OneTimeSecret>
      )}
      <div className="flex flex-wrap justify-end gap-3">
        {expired ? (
          <Button onClick={onRegenerate} disabled={pending}>
            {t('regenerate')}
          </Button>
        ) : null}
        <Button variant="secondary" onClick={onClose}>
          {t('close')}
        </Button>
      </div>
    </div>
  );
}

export interface GatesPanelProps {
  gates: readonly GateRow[];
  devices: readonly DeviceRow[];
  writable: boolean;
  timeZone: string;
  /** Address of the pairing page on the tablet (`<origin>/devices/pair`). */
  tabletUrl: string;
}

/** Gates (M02-F07): create / edit, generate a pairing code, and the registered devices with their last sync. */
export function GatesPanel({
  gates,
  devices,
  writable,
  timeZone,
  tabletUrl,
}: GatesPanelProps) {
  const t = useTranslations('registry.gates');
  const noticeT = useTranslations('registry.notices');
  const message = useErrorMessage();
  const [editing, setEditing] = useState<GateRow | 'new' | null>(null);
  const [revoking, setRevoking] = useState<DeviceRow | null>(null);
  const [pairingGate, setPairingGate] = useState<GateRow | null>(null);
  const pairing = useRunAction();
  const revoke = useRunAction();

  const gateName = (gateId: string) =>
    gates.find((gate) => gate.gate_id === gateId)?.gate_name ?? '—';
  const generate = (gate: GateRow) => {
    setPairingGate(gate);
    pairing.run(() => createPairingAction(gate.gate_id));
  };
  const parsed = (() => {
    if (!pairing.value) return null;
    try {
      return JSON.parse(pairing.value) as { code: string; expiresAt: string };
    } catch {
      return null;
    }
  })();
  const closePairing = () => {
    pairing.clear();
    setPairingGate(null);
  };

  return (
    <div className="flex flex-col gap-6">
      <Card density="dense" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1">
            <h2 className="text-app-heading">{t('title')}</h2>
            <InfoButton label={t('infoLabel')}>{t('info')}</InfoButton>
          </div>
          {writable ? (
            <Button
              icon={<Plus {...iconProps} />}
              onClick={() => setEditing('new')}
            >
              {t('add')}
            </Button>
          ) : null}
        </div>
        {pairing.error && !pairingGate ? (
          <AuthNotice tone="error">{message(pairing.error)}</AuthNotice>
        ) : null}
        {gates.length === 0 ? (
          <EmptyState icon={DoorOpen} title={t('empty')} align="start" />
        ) : (
          <ul aria-label={t('listLabel')} className="flex flex-col">
            {gates.map((gate) => (
              <li
                key={gate.gate_id}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-hairline py-3 first:border-t-0"
              >
                <div className="flex min-w-0 flex-1 basis-56 flex-col gap-1">
                  <span className="text-app-subheading">{gate.gate_name}</span>
                  <span className="flex flex-wrap items-center gap-2">
                    <Badge
                      tone="neutral"
                      icon={
                        gate.gate_kind === 'vehicular' ? (
                          <Car
                            aria-hidden="true"
                            className="size-[1.25em]"
                            strokeWidth={2}
                          />
                        ) : (
                          <Footprints
                            aria-hidden="true"
                            className="size-[1.25em]"
                            strokeWidth={2}
                          />
                        )
                      }
                    >
                      {t(`kind.${gate.gate_kind}`)}
                    </Badge>
                    {gate.gate_is_active ? (
                      <Badge
                        tone="success"
                        icon={
                          <CircleCheck
                            aria-hidden="true"
                            className="size-[1.25em]"
                            strokeWidth={2}
                          />
                        }
                      >
                        {t('active')}
                      </Badge>
                    ) : (
                      <Badge
                        tone="neutral"
                        icon={
                          <CircleOff
                            aria-hidden="true"
                            className="size-[1.25em]"
                            strokeWidth={2}
                          />
                        }
                      >
                        {t('inactive')}
                      </Badge>
                    )}
                  </span>
                </div>
                {writable ? (
                  <div className="flex flex-wrap gap-2">
                    {gate.gate_is_active ? (
                      <Button
                        variant="secondary"
                        icon={<Smartphone {...iconProps} />}
                        disabled={pairing.pending}
                        aria-label={t('pairNamed', { name: gate.gate_name })}
                        onClick={() => generate(gate)}
                      >
                        {t('pair')}
                      </Button>
                    ) : null}
                    <Button
                      variant="secondary"
                      icon={<Pencil {...iconProps} />}
                      aria-label={t('editNamed', { name: gate.gate_name })}
                      onClick={() => setEditing(gate)}
                    >
                      {t('edit')}
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card density="dense" className="flex flex-col gap-4">
        <h2 className="text-app-heading">{t('devicesTitle')}</h2>
        {revoke.error ? (
          <AuthNotice tone="error">{message(revoke.error)}</AuthNotice>
        ) : null}
        {revoke.notice ? (
          <AuthNotice tone="success">
            {noticeT.has(revoke.notice as 'saved')
              ? noticeT(revoke.notice as 'saved')
              : noticeT('saved')}
          </AuthNotice>
        ) : null}
        {devices.length === 0 ? (
          <EmptyState icon={Tablet} title={t('devicesEmpty')} align="start" />
        ) : (
          <div className="overflow-x-auto">
            <table aria-label={t('devicesLabel')} className="w-full text-left">
              <thead>
                <tr className="text-app-caption text-text-secondary">
                  <th scope="col" className="px-3 py-2 font-normal">
                    {t('device.name')}
                  </th>
                  <th
                    scope="col"
                    className="hidden px-3 py-2 font-normal sm:table-cell"
                  >
                    {t('device.gate')}
                  </th>
                  <th scope="col" className="px-3 py-2 font-normal">
                    {t('device.status')}
                  </th>
                  <th
                    scope="col"
                    className="hidden px-3 py-2 font-normal md:table-cell"
                  >
                    {t('device.lastSync')}
                  </th>
                  <th scope="col" className="px-3 py-2 font-normal">
                    <span className="sr-only">{t('device.actions')}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {devices.map((device) => (
                  <tr
                    key={device.device_id}
                    className="border-t border-hairline"
                  >
                    <td className="px-3 py-2 text-app-subheading">
                      {device.device_name}
                    </td>
                    <td className="hidden px-3 py-2 text-app-body-dense sm:table-cell">
                      {gateName(device.gate_id)}
                    </td>
                    <td className="px-3 py-2">
                      {device.device_status === 'active' ? (
                        <Badge
                          tone="success"
                          icon={
                            <CircleCheck
                              aria-hidden="true"
                              className="size-[1.25em]"
                              strokeWidth={2}
                            />
                          }
                        >
                          {t('device.active')}
                        </Badge>
                      ) : (
                        <Badge
                          tone="danger"
                          icon={
                            <Unplug
                              aria-hidden="true"
                              className="size-[1.25em]"
                              strokeWidth={2}
                            />
                          }
                        >
                          {t('device.revoked')}
                        </Badge>
                      )}
                    </td>
                    <td className="hidden px-3 py-2 text-app-body-dense md:table-cell">
                      {device.device_last_sync_at
                        ? formatDateTime(device.device_last_sync_at, timeZone)
                        : t('device.never')}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {writable && device.device_status === 'active' ? (
                        <Button
                          variant="secondary"
                          className="max-md:size-(--control-height) max-md:px-0"
                          icon={<Unplug {...iconProps} />}
                          aria-label={t('device.revokeNamed', {
                            name: device.device_name,
                          })}
                          onClick={() => setRevoking(device)}
                        >
                          <span className="max-md:sr-only">
                            {t('device.revoke')}
                          </span>
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Sheet
        open={editing !== null}
        title={editing === 'new' ? t('addTitle') : t('editTitle')}
        closeLabel={t('close')}
        onClose={() => setEditing(null)}
      >
        {editing !== null ? (
          <GateForm
            gate={editing === 'new' ? undefined : editing}
            onDone={() => setEditing(null)}
          />
        ) : null}
      </Sheet>

      <Sheet
        open={pairingGate !== null}
        title={t('pairingTitle', { name: pairingGate?.gate_name ?? '' })}
        closeLabel={t('close')}
        onClose={closePairing}
      >
        {pairingGate && pairing.error ? (
          <div className="flex flex-col gap-4">
            <AuthNotice tone="error">{message(pairing.error)}</AuthNotice>
            <div className="flex justify-end">
              <Button variant="secondary" onClick={closePairing}>
                {t('pairing.close')}
              </Button>
            </div>
          </div>
        ) : null}
        {pairingGate && parsed ? (
          <PairingCode
            code={parsed.code}
            expiresAt={parsed.expiresAt}
            tabletUrl={tabletUrl}
            pending={pairing.pending}
            onRegenerate={() => generate(pairingGate)}
            onClose={closePairing}
          />
        ) : null}
        {pairingGate && !parsed && !pairing.error ? (
          <p role="status" className="text-text-secondary">
            {t('pairing.generating')}
          </p>
        ) : null}
      </Sheet>

      <ConfirmDialog
        open={revoking !== null}
        title={t('device.revokeTitle')}
        confirmLabel={t('device.revokeConfirm')}
        cancelLabel={t('device.cancel')}
        tone="destructive"
        pending={revoke.pending}
        onCancel={() => setRevoking(null)}
        onConfirm={() => {
          const target = revoking;
          if (!target) return;
          revoke.run(() => revokeDeviceAction(target.device_id));
          setRevoking(null);
        }}
      >
        {revoking
          ? t('device.revokeBody', { name: revoking.device_name })
          : null}
      </ConfirmDialog>
    </div>
  );
}
