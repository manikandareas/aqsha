import { localDev, none } from "eve/channels/auth";
import { eveChannel } from "eve/channels/eve";

/**
 * Channel eve — SPIKE (Slice 6.0). Auth sementara: buka di localhost
 * (`localDev`) + terima anonim (`none`) supaya spike "hello Astra" jalan tanpa
 * token. Channel `/eve/v1/session*` di-host PROSES eve (bukan api-v2);
 * `withEve` mem-proxy dari origin web-v2.
 *
 * Slice 6.1 GANTI ini dengan Clerk AuthFn custom + `onMessage` ownership gate
 * (drop `none()`; `localDev()` non-prod saja).
 */
export default eveChannel({
  auth: [localDev(), none()],
});
