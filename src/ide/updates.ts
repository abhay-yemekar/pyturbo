/** Observe an installed replacement without treating first installation as an update. */
export function observeAppUpdates(
  registration: ServiceWorkerRegistration,
  onUpdate: (worker: ServiceWorker) => void,
): void {
  const inspect = () => {
    if (registration.waiting && navigator.serviceWorker.controller) onUpdate(registration.waiting);
  };
  const watch = () => {
    registration.installing?.addEventListener('statechange', inspect);
    inspect();
  };
  registration.addEventListener('updatefound', watch);
  watch();
  const check = () => void registration.update().catch(() => {});
  window.addEventListener('focus', check);
  window.addEventListener('online', check);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check();
  });
}

/** Activation is explicit; a controller change by itself must never reload an editor. */
export function activateAppUpdate(worker: ServiceWorker): Promise<void> {
  if (worker.state === 'activated') return Promise.resolve();
  return new Promise((resolve, reject) => {
    const finish = (error?: Error) => {
      clearTimeout(timer);
      navigator.serviceWorker.removeEventListener('controllerchange', controlled);
      if (error) reject(error);
      else resolve();
    };
    const controlled = () => finish();
    const timer = window.setTimeout(
      () => finish(new Error('The update did not activate. Please try again.')),
      10_000,
    );
    navigator.serviceWorker.addEventListener('controllerchange', controlled);
    try {
      if (worker.state === 'redundant') throw new Error('This update is no longer available.');
      worker.postMessage({ type: 'SKIP_WAITING' });
    } catch (error) {
      finish(error instanceof Error ? error : new Error(String(error)));
    }
  });
}
