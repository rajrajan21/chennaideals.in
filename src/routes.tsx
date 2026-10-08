import { RouteObject } from 'react-router';
import { lazy } from 'react';
import HomePage from './pages/index';
import ProdNotFoundPage from './pages/_404';

const NotFoundPage = import.meta.env.DEV
  ? lazy(() => import('../dev-tools/src/PageNotFound'))
  : ProdNotFoundPage;

const DealDetailPage = lazy(() => import('./pages/deals/[id]'));
const SubmitDealPage = lazy(() => import('./pages/deals/submit'));
const AuthPage = lazy(() => import('./pages/auth/AuthPage'));

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <HomePage />,
  },
  {
    path: '/deals/:id',
    element: <DealDetailPage />,
  },
  {
    path: '/deals/submit',
    element: <SubmitDealPage />,
  },
  {
    path: '/login',
    element: <AuthPage mode="login" />,
  },
  {
    path: '/signup',
    element: <AuthPage mode="signup" />,
  },
  {
    id: 'airo-not-found',
    path: '*',
    element: <NotFoundPage />,
  },
];

export type Path = '/' | '/deals/:id' | '/deals/submit' | '/login' | '/signup';
export type Params = Record<string, string | undefined>;
