import type { UplinkApi } from './index';

declare global {
  interface Window {
    uplink: UplinkApi;
  }
}
