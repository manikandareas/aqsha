export const THREADS_CHANGED_EVENT = "threads:changed";

export function dispatchThreadsChanged(): void {
  window.dispatchEvent(new Event(THREADS_CHANGED_EVENT));
}
