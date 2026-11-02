import { Global, Module } from '@nestjs/common';
import { ContentSafetyPolicyService } from './content-safety-policy.service';
import { CONTENT_SAFETY_CLASSIFIER, ContentSafetyClassifier } from './content-safety.types';

const noopClassifier: ContentSafetyClassifier = {
  classify: async () => null,
};

@Global()
@Module({
  providers: [
    ContentSafetyPolicyService,
    { provide: CONTENT_SAFETY_CLASSIFIER, useValue: noopClassifier },
  ],
  exports: [ContentSafetyPolicyService, CONTENT_SAFETY_CLASSIFIER],
})
export class ContentSafetyModule {}
