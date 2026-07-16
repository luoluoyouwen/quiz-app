export type ManualUpdateStatus =
  | 'unsupported'
  | 'not-registered'
  | 'up-to-date'
  | 'updating';

const watchedWorkers = new WeakSet<ServiceWorker>();

function activateWorker(registration: ServiceWorkerRegistration, worker: ServiceWorker) {
  const candidate = registration.waiting ?? worker;
  candidate.postMessage({ type: 'SKIP_WAITING' });
}

function watchWorker(registration: ServiceWorkerRegistration, worker: ServiceWorker | null) {
  if (!worker || watchedWorkers.has(worker)) return;
  watchedWorkers.add(worker);

  if (worker.state === 'installed') {
    activateWorker(registration, worker);
    return;
  }

  const handleStateChange = () => {
    if (worker.state === 'installed') {
      worker.removeEventListener('statechange', handleStateChange);
      activateWorker(registration, worker);
    } else if (worker.state === 'activated' || worker.state === 'redundant') {
      worker.removeEventListener('statechange', handleStateChange);
    }
  };

  worker.addEventListener('statechange', handleStateChange);
}

export async function checkForPwaUpdate(): Promise<ManualUpdateStatus> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return 'unsupported';
  }

  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return 'not-registered';

  if (registration.waiting) {
    activateWorker(registration, registration.waiting);
    return 'updating';
  }

  let updateFound = false;
  const handleUpdateFound = () => {
    updateFound = true;
    watchWorker(registration, registration.installing);
  };

  registration.addEventListener('updatefound', handleUpdateFound);
  try {
    await registration.update();
  } finally {
    registration.removeEventListener('updatefound', handleUpdateFound);
  }

  const candidate = registration.waiting ?? registration.installing;
  if (candidate) {
    updateFound = true;
    watchWorker(registration, candidate);
  }

  return updateFound ? 'updating' : 'up-to-date';
}
