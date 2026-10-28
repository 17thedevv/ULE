import { createAuthClient } from 'better-auth/react';
import { getApiBaseUrl } from './api';

export const authClient = createAuthClient({
  baseURL: getApiBaseUrl(),
  basePath: '/api/v1/auth',
});
