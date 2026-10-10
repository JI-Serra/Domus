import { z } from 'zod';

export const invitationStatuses = [
  'pending',
  'accepted',
  'revoked',
  'expired',
] as const;
export type InvitationStatus = (typeof invitationStatuses)[number];

interface InvitationTiming {
  invitation_status: InvitationStatus;
  invitation_expires_at: string;
}

/**
 * What to show for an invitation. The database keeps `pending` until somebody acts on it, so a pending invitation
 * past its expiry is shown as `expired` (it can no longer be accepted either).
 */
export function invitationDisplayStatus(
  invitation: InvitationTiming,
  now: Date,
): InvitationStatus {
  if (
    invitation.invitation_status === 'pending' &&
    new Date(invitation.invitation_expires_at).getTime() <= now.getTime()
  )
    return 'expired';
  return invitation.invitation_status;
}

/** A pending, unexpired invitation is the only kind that can still be revoked. */
export function canRevokeInvitation(
  invitation: InvitationTiming,
  now: Date,
): boolean {
  return invitationDisplayStatus(invitation, now) === 'pending';
}

/** First administrator of a barrio: the platform admin supplies the email and the name of the person. */
export const firstAdminFormSchema = z.object({
  invited_email: z
    .string()
    .trim()
    .min(1, 'emailRequired')
    .pipe(z.email('emailInvalid'))
    .transform((value) => value.toLowerCase()),
  first_name: z
    .string()
    .trim()
    .min(1, 'firstNameRequired')
    .max(100, 'nameTooLong'),
  last_name: z
    .string()
    .trim()
    .min(1, 'lastNameRequired')
    .max(100, 'nameTooLong'),
});
export type FirstAdminValues = z.output<typeof firstAdminFormSchema>;

/** The invitation secret in the email link: 64 lowercase hex characters (the contract in `acceptInvitationSchema`). */
export function isInvitationToken(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}
