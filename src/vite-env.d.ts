/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_USE_MOCKS?: string;
  readonly VITE_API_URL?: string;
  readonly VITE_WS_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Written by the AWS stack at deploy time (public/config.js locally). Wins over the VITE_* build settings. */
interface Window {
  TING_CONFIG?: { useMocks?: boolean; apiUrl?: string; wsUrl?: string; ocrAssetBase?: string; auth?: { domain: string; clientId: string; idp: string; region?: string; userPoolId?: string } };
}
