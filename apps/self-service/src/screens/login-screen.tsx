import React, { useEffect } from 'react';

import { useRouter } from 'expo-router';
import { useAuthSession, useAuthHydration, useKeycloakLogin } from '@lightbridge/hooks';
import { useRuntimeConfig } from '../configs/runtime-config';
import { LoginView } from '../views/login-view';

export function LoginScreen() {
  const { isAuthenticated } = useAuthSession();
  const { isHydrated } = useAuthHydration();
  const runtimeConfig = useRuntimeConfig();
  const { promptAsync, isLoading } = useKeycloakLogin(runtimeConfig.keycloak);
  const router = useRouter();

  useEffect(() => {
    if (isHydrated && isAuthenticated) {
      router.replace('/home');
    }
  }, [isHydrated, isAuthenticated, router]);

  if (!isHydrated || isAuthenticated) {
    return null;
  }

  return (
    <LoginView
      onSsoPress={() => promptAsync()}
      onHelpPress={() => router.push('/help')}
      loading={isLoading}
    />
  );
}
