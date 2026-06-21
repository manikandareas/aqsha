import { disableTool } from "eve/tools";

/**
 * Matikan built-in `grep` (Slice 6.4). Astra Lite = asisten riset/tulis berbasis
 * service in-process (D-E), BUKAN agen sandbox/eksekusi. Tool web bawaan eve
 * di-override oleh tool kita sendiri (search_web/search_papers/dst.). Sandbox +
 * tool tulis = P5/P7.
 */
export default disableTool();
