import { useEffect, useState } from 'react';

// A tiny hash router: "#/buy", "#/item/<id>". The phone's back button and gesture work for free.
export type Route =
  | { name: 'home' }
  | { name: 'buy' }
  | { name: 'use' }
  | { name: 'need' }
  | { name: 'stock'; categoryId?: string }
  | { name: 'item'; id: string }
  | { name: 'money' }
  | { name: 'settings' };

export function parseRoute(hash: string): Route {
  const [name, arg] = hash.replace(/^#\/?/, '').split('/');
  switch (name) {
    case 'buy':
    case 'use':
    case 'need':
    case 'money':
    case 'settings':
      return { name };
    case 'stock':
      return { name: 'stock', categoryId: arg || undefined };
    case 'item':
      return arg ? { name: 'item', id: arg } : { name: 'home' };
    default:
      return { name: 'home' };
  }
}

export function href(route: Route): string {
  switch (route.name) {
    case 'home':
      return '#/';
    case 'stock':
      return route.categoryId ? `#/stock/${route.categoryId}` : '#/stock';
    case 'item':
      return `#/item/${route.id}`;
    default:
      return `#/${route.name}`;
  }
}

export function go(route: Route) {
  window.location.hash = href(route);
}

export function back() {
  if (window.history.length > 1) window.history.back();
  else go({ name: 'home' });
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(window.location.hash));
  useEffect(() => {
    const onChange = () => {
      setRoute(parseRoute(window.location.hash));
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
