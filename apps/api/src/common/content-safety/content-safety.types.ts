import { UnprocessableEntityException } from '@nestjs/common';

export const CONTENT_SAFETY_CLASSIFIER = Symbol('CONTENT_SAFETY_CLASSIFIER');

export type ContentRestrictionCategory =
  | 'CYBER_ABUSE'
  | 'CREDENTIAL_THEFT'
  | 'WEAPONS'
  | 'SELF_HARM'
  | 'HATE_INCITEMENT'
  | 'CHILD_SEXUAL_ABUSE'
  | 'SAFETY_EVASION';

export interface ContentSafetyClassifierResult {
  restricted: boolean;
  category?: ContentRestrictionCategory;
}

export interface ContentSafetyClassifier {
  classify(text: string): Promise<ContentSafetyClassifierResult | null>;
}

export class ContentRestrictedException extends UnprocessableEntityException {
  readonly code = 'CONTENT_RESTRICTED';

  constructor(readonly category: ContentRestrictionCategory) {
    super({
      code: 'CONTENT_RESTRICTED',
      category,
      message: '请修改学习目标后重试',
    });
  }
}
