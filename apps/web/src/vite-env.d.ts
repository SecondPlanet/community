/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  // 已有
  readonly VITE_API_BASE_URL?: string;

  // 站点级 env(2026-07-21 mock-audit 引入, 用于替换硬编码文案)
  /** 全站平台名(footer 用), 默认 'SecondPlanet' */
  readonly VITE_PUBLIC_PLATFORM_NAME?: string;
  /** ICP 备案号（footer 用），未设置时不显示备案信息 */
  readonly VITE_ICP?: string;
  /** 社区版人工联系邮箱（购买咨询 / 订单协助 / 账号申诉）；不设则引导到社区 Issue */
  readonly VITE_PUBLIC_CONTACT_EMAIL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
