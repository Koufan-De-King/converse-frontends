import React from 'react';
import { Redirect } from 'expo-router';

import { useAuthSession, useAuthHydration } from '@lightbridge/hooks';
import { isWebPlatform } from '@lightbridge/api-native';
import { AppSplashView } from '../views/app-splash-view';

export default function IndexRoute() {
  const { isAuthenticated } = useAuthSession();
  const { isHydrated } = useAuthHydration();

  // Show splash during hydration to avoid blank screen
  if (!isHydrated) {
    return isWebPlatform() ? <AppSplashView /> : null;
  }

  return <Redirect href={isAuthenticated ? '/home' : '/login'} />;
}
