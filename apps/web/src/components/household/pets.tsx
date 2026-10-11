'use client';

import { petPhotoPath, petPhotoProblem } from '@domus/domain/household';
import { createBrowserClient } from '@domus/supabase/browser';
import { PawPrint } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { removePetAction, savePetAction } from '@/app/(app)/home/actions';
import { useTenantWritable } from '@/components/tenant/tenant-status';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Field, Input } from '@/components/ui/field';
import { FilePicker } from '@/components/ui/file-picker';
import { InfoButton } from '@/components/ui/info-button';
import { Sheet } from '@/components/ui/sheet';
import type { PetView } from '@/lib/household/view';
import { useSubmitAction } from '@/lib/platform/use-submit-action';
import {
  ActionNotice,
  noticeOf,
  useActionRunner,
  useErrorMessage,
} from './notice';
import type { Notice } from './notice';

const PHOTO_ACCEPT = 'image/png,image/jpeg,image/webp';

/** A pet's photo (a short-lived signed URL of a private object) or a neutral placeholder. */
function PetPhoto({
  url,
  alt,
  className = 'size-14',
}: {
  url: string | null;
  alt: string;
  className?: string;
}) {
  return url ? (
    // A signed URL of a private object: next/image cannot (and need not) optimize it.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={alt}
      className={`${className} shrink-0 rounded-card-dense bg-surface-2 object-cover`}
    />
  ) : (
    <span
      aria-hidden="true"
      className={`${className} flex shrink-0 items-center justify-center rounded-card-dense bg-surface-2 text-text-secondary`}
    >
      <PawPrint className="size-6" strokeWidth={1.75} />
    </span>
  );
}

function PetForm({
  pet,
  photoUrl,
  tenantId,
  unitId,
  onDone,
  onCancel,
}: {
  pet: PetView | null;
  photoUrl: string | null;
  tenantId: string;
  unitId: string;
  onDone: (notice: Notice | null) => void;
  onCancel: () => void;
}) {
  const t = useTranslations('household');
  const message = useErrorMessage();
  const { state, onSubmit, pending } = useSubmitAction(
    savePetAction.bind(null, pet?.petId ?? null),
  );
  const [eventId] = useState(() => crypto.randomUUID());
  // The browser uploads the photo to the private bucket as soon as it is chosen; only the path travels with the form.
  const [photoPath, setPhotoPath] = useState('');
  const [chosenName, setChosenName] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  useEffect(() => {
    if (state.status === 'success') onDone(noticeOf(state));
    // `onDone` only closes the sheet; the success state is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  const values = state.status === 'error' ? (state.values ?? {}) : {};
  const errors = state.status === 'error' ? state.errors : {};

  const choose = async (file: File | null) => {
    setPhotoError(null);
    setPhotoPath('');
    setChosenName(null);
    setPreviewUrl(null);
    if (!file) {
      setRemovePhoto(true);
      return;
    }
    setRemovePhoto(false);
    const problem = petPhotoProblem(file);
    if (problem) {
      setPhotoError(problem);
      return;
    }
    setUploading(true);
    const path = petPhotoPath(tenantId, unitId, crypto.randomUUID(), file.type);
    const { error } = await createBrowserClient()
      .storage.from('pet-photo')
      .upload(path, file, { contentType: file.type });
    setUploading(false);
    if (error) {
      setPhotoError('photoUploadFailed');
      return;
    }
    setPhotoPath(path);
    setChosenName(file.name);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const hasStoredPhoto = Boolean(pet?.photoPath) && !removePhoto;
  const shownUrl = previewUrl ?? (hasStoredPhoto ? photoUrl : null);

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {state.status === 'error' && state.formError ? (
        <ActionNotice notice={{ tone: 'error', key: state.formError }} />
      ) : null}
      <input type="hidden" name="client_event_id" value={eventId} />
      <input type="hidden" name="pet_photo_path" value={photoPath} />
      <input type="hidden" name="remove_photo" value={removePhoto ? '1' : ''} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('pets.name')} error={message(errors.pet_name)}>
          <Input
            name="pet_name"
            defaultValue={values.pet_name ?? pet?.name ?? ''}
            autoComplete="off"
            maxLength={100}
          />
        </Field>
        <Field
          label={t('pets.species')}
          error={message(errors.pet_species_name)}
        >
          <Input
            name="pet_species_name"
            defaultValue={values.pet_species_name ?? pet?.species ?? ''}
            autoComplete="off"
            maxLength={100}
          />
        </Field>
      </div>
      <Field label={t('pets.breed')} error={message(errors.pet_breed_name)}>
        <Input
          name="pet_breed_name"
          defaultValue={values.pet_breed_name ?? pet?.breed ?? ''}
          autoComplete="off"
          maxLength={100}
        />
      </Field>
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-1">
          <span className="text-app-subheading">{t('pets.photo')}</span>
          <InfoButton label={t('pets.photoInfoLabel')}>
            {t('pets.photoInfo')}
          </InfoButton>
        </div>
        <div className="flex items-center gap-3">
          <PetPhoto
            url={shownUrl}
            alt={pet ? t('pets.photoAlt', { name: pet.name }) : ''}
          />
          <FilePicker
            accept={PHOTO_ACCEPT}
            chooseLabel={t('pets.choosePhoto')}
            emptyLabel={t('pets.noPhoto')}
            clearLabel={t('pets.removePhoto')}
            fileName={chosenName ?? (hasStoredPhoto ? t('pets.photo') : null)}
            disabled={uploading || pending}
            invalid={Boolean(photoError)}
            onChange={(file) => void choose(file)}
          />
        </div>
        {uploading ? (
          <p role="status" className="text-app-caption text-text-secondary">
            {t('pets.uploading')}
          </p>
        ) : null}
        {photoError || errors.photo ? (
          <ActionNotice
            notice={{ tone: 'error', key: photoError ?? errors.photo ?? '' }}
          />
        ) : null}
      </div>
      <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onCancel} disabled={pending}>
          {t('cancel')}
        </Button>
        <Button type="submit" disabled={pending || uploading}>
          {pending ? t('saving') : t('save')}
        </Button>
      </div>
    </form>
  );
}

function PetRow({
  pet,
  photoUrl,
  canManage,
  tenantId,
  unitId,
  onNotice,
}: {
  pet: PetView;
  photoUrl: string | null;
  canManage: boolean;
  tenantId: string;
  unitId: string;
  onNotice: (notice: Notice | null) => void;
}) {
  const t = useTranslations('household');
  const writable = useTenantWritable();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const { run, pending } = useActionRunner();
  const details = [pet.species, pet.breed].filter(Boolean).join(' · ');

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-card-dense bg-surface-0 p-4">
      <PetPhoto url={photoUrl} alt={t('pets.photoAlt', { name: pet.name })} />
      <div className="flex min-w-0 flex-1 basis-32 flex-col">
        <span className="truncate text-app-subheading">{pet.name}</span>
        <span className="truncate text-app-caption text-text-secondary">
          {details}
        </span>
      </div>
      {canManage ? (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            disabled={!writable}
            aria-label={t('pets.editLabel', { name: pet.name })}
            onClick={() => setEditing(true)}
          >
            {t('members.edit')}
          </Button>
          <Button
            variant="destructive"
            disabled={!writable}
            aria-label={t('pets.removeLabel', { name: pet.name })}
            onClick={() => setConfirming(true)}
          >
            {t('pets.remove')}
          </Button>
        </div>
      ) : null}
      <Sheet
        open={editing}
        title={t('pets.editTitle')}
        closeLabel={t('close')}
        onClose={() => setEditing(false)}
      >
        <PetForm
          pet={pet}
          photoUrl={photoUrl}
          tenantId={tenantId}
          unitId={unitId}
          onDone={(done) => {
            setEditing(false);
            onNotice(done);
          }}
          onCancel={() => setEditing(false)}
        />
      </Sheet>
      <ConfirmDialog
        open={confirming}
        title={t('pets.removeTitle', { name: pet.name })}
        confirmLabel={pending ? t('pets.removing') : t('pets.removeConfirm')}
        cancelLabel={t('cancel')}
        tone="destructive"
        pending={pending}
        onCancel={() => setConfirming(false)}
        onConfirm={() =>
          run(
            () => removePetAction(pet.petId),
            (result) => {
              setConfirming(false);
              onNotice(noticeOf(result));
            },
          )
        }
      >
        {t('pets.removeBody')}
      </ConfirmDialog>
    </li>
  );
}

/** Pets of the unit, with an optional photo kept in the private `pet-photo` bucket. */
export function PetSection({
  pets,
  photoUrls,
  canManage,
  tenantId,
  unitId,
}: {
  pets: readonly PetView[];
  /** Short-lived signed URL per pet id, for the pets that have a photo. */
  photoUrls: Readonly<Record<string, string>>;
  canManage: boolean;
  tenantId: string;
  unitId: string;
}) {
  const t = useTranslations('household');
  const writable = useTenantWritable();
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  return (
    <Card density="dense" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-app-heading">{t('sections.pets')}</h2>
        {canManage ? (
          <Button disabled={!writable} onClick={() => setAdding(true)}>
            {t('pets.add')}
          </Button>
        ) : null}
      </div>
      <ActionNotice notice={notice} />
      {pets.length === 0 ? (
        <EmptyState icon={PawPrint} title={t('pets.empty')} align="start" />
      ) : (
        <ul aria-label={t('pets.listLabel')} className="flex flex-col gap-3">
          {pets.map((pet) => (
            <PetRow
              key={pet.petId}
              pet={pet}
              photoUrl={photoUrls[pet.petId] ?? null}
              canManage={canManage}
              tenantId={tenantId}
              unitId={unitId}
              onNotice={setNotice}
            />
          ))}
        </ul>
      )}
      <Sheet
        open={adding}
        title={t('pets.addTitle')}
        closeLabel={t('close')}
        onClose={() => setAdding(false)}
      >
        <PetForm
          pet={null}
          photoUrl={null}
          tenantId={tenantId}
          unitId={unitId}
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
