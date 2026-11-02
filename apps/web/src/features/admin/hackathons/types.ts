import type { Hackathon, Submission, UploadedFileMeta } from '@secondplanet/shared-types';
import { hackathonsApi } from '../../../lib/hackathonsApi';

export type RegistrationMode = 'internal' | 'external';
export type RegistrationFieldType =
  | 'text'
  | 'textarea'
  | 'select'
  | 'multiselect'
  | 'number'
  | 'url'
  | 'file';

export interface RegistrationField {
  id: string;
  label: string;
  type: RegistrationFieldType;
  required: boolean;
  placeholder?: string;
  options?: string[];
  maxLength?: number;
}

export type AdminHackathon = Hackathon & {
  registrationMode?: RegistrationMode;
  registrationFields?: RegistrationField[];
};

export type RegistrationAttachment = UploadedFileMeta;

export interface AdminRegistration {
  id: string;
  hackathonId: string;
  userId: string;
  user?: { name?: string | null; email?: string | null } | null;
  answers?: Record<string, unknown> | Array<{ fieldId: string; value: unknown }>;
  formSnapshot?: RegistrationField[] | { fields?: RegistrationField[] } | null;
  reviewStatus?: string | null;
  reviewNote?: string | null;
  attachments?: RegistrationAttachment[];
  registeredAt: Date | string;
}

export type AdminSubmission = Submission & {
  team?: { id: string; name: string } | null;
  user?: { name?: string | null; email?: string | null } | null;
};

type Page<T> = T[] | { items?: T[]; data?: T[]; registrations?: T[]; submissions?: T[] };

interface AdminApi {
  getRegistrations: (
    hackathonId: string,
    params: { status?: string; search?: string },
  ) => Promise<Page<AdminRegistration>>;
  reviewRegistration: (
    hackathonId: string,
    registrationId: string,
    payload: { reviewStatus: string; reviewNote?: string; force?: boolean },
  ) => Promise<AdminRegistration>;
  getRegistrationAttachmentUrl: (
    hackathonId: string,
    registrationId: string,
    fieldId: string,
  ) => Promise<{ downloadUrl: string }>;
  getSubmissionAttachmentUrl: (
    hackathonId: string,
    submissionId: string,
    index: number,
  ) => Promise<{ downloadUrl: string }>;
}

// Temporary feature-local typing until the shared API/types land on this branch.
export const adminHackathonsApi = hackathonsApi as unknown as typeof hackathonsApi & AdminApi;

export function pageItems<T>(page: Page<T>): T[] {
  if (Array.isArray(page)) return page;
  return page.items ?? page.data ?? page.registrations ?? page.submissions ?? [];
}
