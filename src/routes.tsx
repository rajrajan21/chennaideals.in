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
const DealAlertsPage = lazy(() => import('./pages/alerts'));
const ForgotPasswordPage = lazy(() => import('./pages/auth/ForgotPassword'));
const ResetPasswordPage = lazy(() => import('./pages/auth/ResetPassword'));

export const routes: RouteObject[] = [
  { path: '/', element: <HomePage /> },
  { path: '/deals/:id', element: <DealDetailPage /> },
  { path: '/deals/submit', element: <SubmitDealPage /> },
  { path: '/alerts', element: <DealAlertsPage /> },
  { path: '/login', element: <AuthPage mode="login" providers={["google", "facebook"]} /> },
  { path: '/signup', element: <AuthPage mode="signup" providers={["google", "facebook"]} /> },
  { path: '/forgot-password', element: <ForgotPasswordPage /> },
  { path: '/reset-password', element: <ResetPasswordPage /> },
  { id: 'airo-not-found', path: '*', element: <NotFoundPage /> },
];

export type Path = '/' | '/deals/:id' | '/deals/submit' | '/alerts' | '/login' | '/signup' | '/forgot-password' | '/reset-password';
export type Params = Record<string, string | undefined>;
