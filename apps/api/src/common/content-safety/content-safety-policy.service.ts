import { Inject, Injectable } from '@nestjs/common';
import {
  CONTENT_SAFETY_CLASSIFIER,
  ContentRestrictedException,
  ContentRestrictionCategory,
  ContentSafetyClassifier,
} from './content-safety.types';

type Rule = {
  category: ContentRestrictionCategory;
  pattern: RegExp;
  allowEducationalContext?: boolean;
};

const EDUCATIONAL_CONTEXT = /(?:防御|检测|预防|安全教育|历史|新闻|风险|求助|康复|识别|治理|伦理|defen[cs]e|detect|prevent|history|news|safety|recovery|awareness)/i;
const EXECUTION_INTENT = /(?:步骤|教程|脚本|代码|配方|制作|实施|绕过|窃取|攻击|武器化|不被发现|how\s+to|step[- ]by[- ]step|code|script|build|make|steal|bypass|evade|weaponize)/i;
const NEGATED_EXECUTION = /(?:不提供|不包含|不要给出|仅讲防御|without|do not provide).{0,24}(?:步骤|教程|脚本|代码|攻击|instructions?|steps?|code|script)/i;

const RULES: Rule[] = [
  { category: 'CHILD_SEXUAL_ABUSE', pattern: /(?:未成年|儿童|child|minor).{0,24}(?:色情|性内容|裸照|sexual|porn|nude)/i },
  { category: 'CREDENTIAL_THEFT', pattern: /(?:钓鱼|phishing|窃取|偷取|steal|harvest).{0,32}(?:密码|口令|凭据|cookie|token|api\s*key|password|credential)/i },
  { category: 'SAFETY_EVASION', pattern: /(?:绕过|规避|关闭|破解|bypass|evade|disable|jailbreak).{0,32}(?:安全|审核|审查|风控|moderation|guardrail|safety filter)/i },
  { category: 'WEAPONS', pattern: /(?:炸弹|爆炸物|枪支|毒剂|生物武器|bomb|explosive|firearm|poison|bioweapon).{0,40}(?:步骤|配方|制作|组装|how\s+to|recipe|build|make)/i },
  { category: 'SELF_HARM', pattern: /(?:自杀|自残|结束生命|suicide|self[- ]harm).{0,40}(?:方法|步骤|最有效|不被发现|how\s+to|method|instructions?)/i, allowEducationalContext: true },
  { category: 'HATE_INCITEMENT', pattern: /(?:消灭|驱逐|杀死|清洗|exterminate|kill|expel).{0,32}(?:种族|民族|宗教|同性恋|残疾人|racial|ethnic|religious|gay|disabled)/i },
  { category: 'CYBER_ABUSE', pattern: /(?:入侵|攻击|恶意软件|勒索软件|键盘记录器|exploit|hack|malware|ransomware|keylogger).{0,64}(?:步骤|教程|脚本|代码|绕过|窃取|how\s+to|step[- ]by[- ]step|script|code|bypass|steal)/i, allowEducationalContext: true },
];

@Injectable()
export class ContentSafetyPolicyService {
  constructor(
    @Inject(CONTENT_SAFETY_CLASSIFIER)
    private readonly classifier: ContentSafetyClassifier,
  ) {}

  async assertAllowed(text: string): Promise<void> {
    const normalized = text.normalize('NFKC').replace(/\s+/g, ' ').trim();
    for (const rule of RULES) {
      if (!rule.pattern.test(normalized)) continue;
      if (rule.allowEducationalContext && EDUCATIONAL_CONTEXT.test(normalized) &&
        (!EXECUTION_INTENT.test(normalized) || NEGATED_EXECUTION.test(normalized))) {
        continue;
      }
      throw new ContentRestrictedException(rule.category);
    }
    const result = await this.classifier.classify(normalized);
    if (result?.restricted) {
      throw new ContentRestrictedException(result.category ?? 'SAFETY_EVASION');
    }
  }
}
