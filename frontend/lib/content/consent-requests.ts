/**
 * Copy for the public consent page (`/consent/`) —
 * actors/consent-intake/consent-request-email T-8 (English only, D-4).
 *
 * The data-protection contact is the one named in the consent text itself
 * ("Rights of Data Subjects" section of the admin-managed edition); it is
 * repeated here because the dead-end page (FR-11) must show it WITHOUT the
 * edition, which is only returned for a valid link.
 */

export const DATA_PROTECTION_CONTACT = {
  name: 'Sylvia Kalemera',
  email: 'S.Kalemera@cgiar.org',
} as const;

export const CONSENT_PAGE_COPY = {
  title: 'Consent to publish your information',
  intro:
    'The ACCELERATE Tanzania Registry would like to publish the information below about your organization. Please review it and the consent text, then accept or decline.',
  loading: 'Loading your consent request…',

  previewHeading: 'Information that will be published',
  previewNote:
    'This is exactly what the public profile will show if you accept. It cannot be edited from this page.',

  consentTitle: 'Consent for Publication of Information',
  respondentHeading: 'Your details',
  respondentNote: 'We keep these as the record of who gave consent. They are not published.',

  noTokenTitle: 'Open the link from your email again',
  noTokenBody:
    'For your security this page removes the private part of its address once it has loaded, so it cannot be refreshed. Your link has not been used. Please open it again from the email we sent you.',

  deadEndTitle: 'This link is no longer valid',
  deadEndBody:
    'It may have expired, already been used, or been replaced by a newer email. If you have questions about the publication of your organization’s information, please contact the data protection contact:',

  throttledTitle: 'Please try again in a moment',
  throttledBody: 'There have been too many requests. Wait a minute, then try again.',

  errorTitle: 'We could not reach the server',
  errorBody: 'Check your connection and try again. Your link has not been used.',

  retry: 'Try again',

  accept: 'Accept',
  accepting: 'Sending…',
  decline: 'Decline',
  declineConfirmTitle: 'Decline publication?',
  declineConfirmBody:
    'Your organization’s information will not be published. This link cannot be used again once you decline.',
  declineConfirm: 'Yes, decline',
  declineBack: 'Go back',

  acceptedTitle: 'Thank you, your consent is recorded',
  acceptedBody:
    'Your organization’s profile is now published in the ACCELERATE Tanzania Registry.',
  acceptedLink: 'View your public profile',
  declinedTitle: 'Your decision is recorded',
  declinedBody:
    'Your organization’s information will not be published. You do not need to do anything else.',

  checkboxRequired: 'Read the consent text to the end and tick the box to accept.',
  submitFailed: 'We could not record your response. Please try again.',
  submitThrottled: 'Too many attempts. Please wait a minute and try again.',
} as const;

export type RespondentField = 'name' | 'position' | 'email' | 'phone';

export const RESPONDENT_FIELDS: ReadonlyArray<{
  key: RespondentField;
  label: string;
  type: 'text' | 'email' | 'tel';
  autoComplete: string;
  required: string;
}> = [
  {
    key: 'name',
    label: 'Name of authorized representative',
    type: 'text',
    autoComplete: 'name',
    required: 'Enter the name of the authorized representative.',
  },
  {
    key: 'position',
    label: 'Position / Title',
    type: 'text',
    autoComplete: 'organization-title',
    required: 'Enter your position or title.',
  },
  {
    key: 'email',
    label: 'Email',
    type: 'email',
    autoComplete: 'email',
    required: 'Enter your email address.',
  },
  {
    key: 'phone',
    label: 'Telephone',
    type: 'tel',
    autoComplete: 'tel',
    required: 'Enter your telephone number.',
  },
];
