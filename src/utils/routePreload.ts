import type { ComponentType } from 'react';

type RouteModule = { default: ComponentType<any> };

let bankDetailRoutePromise: Promise<RouteModule> | null = null;
let practiceRoutePromise: Promise<RouteModule> | null = null;

function loadRoute(
  current: Promise<RouteModule> | null,
  setCurrent: (promise: Promise<RouteModule> | null) => void,
  loader: () => Promise<RouteModule>,
): Promise<RouteModule> {
  if (current) return current;

  const promise = loader().catch((error) => {
    setCurrent(null);
    throw error;
  });
  setCurrent(promise);
  return promise;
}

export function loadBankDetailRoute(): Promise<RouteModule> {
  return loadRoute(
    bankDetailRoutePromise,
    (promise) => { bankDetailRoutePromise = promise; },
    () => import('../pages/BankDetail'),
  );
}

export function loadPracticeRoute(): Promise<RouteModule> {
  return loadRoute(
    practiceRoutePromise,
    (promise) => { practiceRoutePromise = promise; },
    () => import('../pages/Practice'),
  );
}

export function preloadBankDetailRoute(): void {
  void loadBankDetailRoute().catch(() => undefined);
}

export function preloadPracticeRoute(): void {
  void loadPracticeRoute().catch(() => undefined);
}
