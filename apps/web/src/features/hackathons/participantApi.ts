import type {
  HackathonRegistration,
  Submission,
  Team,
  TeamMember,
  UploadedFileMeta,
} from '@secondplanet/shared-types';
import { hackathonsApi } from '../../lib/hackathonsApi';

export type RegistrationAnswer = string | number | string[] | UploadedFileMeta | null;
export type RegistrationAnswers = Record<string, RegistrationAnswer>;

export type ParticipantRegistration = Omit<HackathonRegistration, 'answers'> & {
  answers?: RegistrationAnswers | null;
};

export interface ParticipantTeam extends Team {
  memberCount?: number;
  members?: Array<TeamMember & { userName?: string | null; userAvatar?: string | null }>;
}

export interface ParticipantSubmission extends Omit<Submission, 'attachments'> {
  attachments?: UploadedFileMeta[] | null;
}

export interface SubmissionPayload {
  title: string;
  description: string;
  demoUrl?: string;
  repoUrl?: string;
  videoUrl?: string;
  teamId?: string;
  status?: 'draft' | 'submitted';
  attachments?: UploadedFileMeta[];
}

// Local adapters keep this feature compatible while the shared API contract rolls out.
export const participantApi = {
  register: (id: string, answers: RegistrationAnswers) =>
    (hackathonsApi.register as unknown as (
      hackathonId: string,
      payload: { answers: RegistrationAnswers },
    ) => Promise<ParticipantRegistration>)(id, { answers }),

  getMyRegistration: async (id: string) =>
    (await hackathonsApi.getMyRegistration(id)) as ParticipantRegistration | null,

  getTeams: async (id: string) => (await hackathonsApi.getTeams(id)) as ParticipantTeam[],

  getMySubmissions: async (id: string) =>
    (await hackathonsApi.getMySubmissions(id)) as ParticipantSubmission[],

  createSubmission: (id: string, payload: SubmissionPayload) =>
    (hackathonsApi.createSubmission as unknown as (
      hackathonId: string,
      body: SubmissionPayload,
    ) => Promise<ParticipantSubmission>)(id, payload),

  updateSubmission: (id: string, submissionId: string, payload: Partial<SubmissionPayload>) =>
    (hackathonsApi.updateSubmission as unknown as (
      hackathonId: string,
      id: string,
      body: Partial<SubmissionPayload>,
    ) => Promise<ParticipantSubmission>)(id, submissionId, payload),

  getRegistrationAttachmentUrl: (hackathonId: string, registrationId: string, fieldId: string) =>
    ((hackathonsApi as unknown as Record<string, unknown>).getRegistrationAttachmentUrl as (
      hackathonId: string,
      registrationId: string,
      fieldId: string,
    ) => Promise<{ downloadUrl: string }>)(hackathonId, registrationId, fieldId),

  getSubmissionAttachmentUrl: (hackathonId: string, submissionId: string, index: number) =>
    ((hackathonsApi as unknown as Record<string, unknown>).getSubmissionAttachmentUrl as (
      hackathonId: string,
      submissionId: string,
      index: number,
    ) => Promise<{ downloadUrl: string }>)(hackathonId, submissionId, index),
};

export function isApproved(registration?: ParticipantRegistration | null) {
  if (!registration || registration.status === 'cancelled') return false;
  return registration.reviewStatus === 'approved';
}

export function isActiveRegistration(registration?: ParticipantRegistration | null) {
  return !!registration && registration.status !== 'cancelled';
}

export const REVIEW_LABELS = {
  pending: '待审核',
  approved: '已通过',
  waitlisted: '候补',
  rejected: '未通过',
} as const;
