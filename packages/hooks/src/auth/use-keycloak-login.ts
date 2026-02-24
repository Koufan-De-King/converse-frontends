import { useEffect, useMemo, useState } from 'react';
import * as AuthSession from 'expo-auth-session';
import { CodeChallengeMethod } from 'expo-auth-session';

import type { AuthSession as StoredSession } from './auth-types';
import { persistAuthSession } from './use-auth-session';
import { setAuthSession } from './auth-store';

export type KeycloakConfig = {
  issuer: string;
  clientId: string;
  scopes?: string[];
  redirectUri?: string;
  scheme?: string;
};

function normalizeIssuer(issuer: string) {
  return issuer.replace(/\/+$/, '');
}

function buildKeycloakFallbackDiscovery(issuer: string): AuthSession.DiscoveryDocument {
  const normalizedIssuer = normalizeIssuer(issuer);

  return {
    authorizationEndpoint: `${normalizedIssuer}/protocol/openid-connect/auth`,
    tokenEndpoint: `${normalizedIssuer}/protocol/openid-connect/token`,
    revocationEndpoint: `${normalizedIssuer}/protocol/openid-connect/revoke`,
    userInfoEndpoint: `${normalizedIssuer}/protocol/openid-connect/userinfo`,
    endSessionEndpoint: `${normalizedIssuer}/protocol/openid-connect/logout`,
  };
}

export function useKeycloakLogin(config: KeycloakConfig) {
  const [discovery, setDiscovery] = useState<AuthSession.DiscoveryDocument | null>(null);

  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();
    const fallback = buildKeycloakFallbackDiscovery(config.issuer);

    const loadDiscovery = async () => {
      const normalizedIssuer = normalizeIssuer(config.issuer);
      const discoveryUrl = `${normalizedIssuer}/.well-known/openid-configuration`;

      try {
        const response = await fetch(discoveryUrl, { signal: controller.signal });
        if (!response.ok) {
          throw new Error(`Discovery request failed (${response.status})`);
        }

        const payload = (await response.json()) as AuthSession.DiscoveryDocument;
        if (mounted) {
          setDiscovery(payload);
        }
      } catch {
        if (mounted) {
          // Keep login flow available even when discovery fetch fails at startup.
          setDiscovery(fallback);
        }
      }
    };

    void loadDiscovery();

    return () => {
      mounted = false;
      controller.abort();
    };
  }, [config.issuer]);

  const redirectUri = useMemo(
    () =>
      config.redirectUri ??
      AuthSession.makeRedirectUri({
        scheme: config.scheme,
        path: 'auth',
      }),
    [config.redirectUri, config.scheme]
  );

  const [isLoading, setIsLoading] = useState(false);

  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: config.clientId,
      redirectUri,
      scopes: config.scopes ?? ['openid', 'profile', 'email'],
      responseType: AuthSession.ResponseType.Code,
      usePKCE: true,
      codeChallengeMethod: CodeChallengeMethod.S256,
    },
    discovery
  );

  useEffect(() => {
    const handleResponse = async () => {
      if (!discovery || !response || response.type !== 'success') {
        return;
      }

      setIsLoading(true);

      try {
        const tokenResult = await AuthSession.exchangeCodeAsync(
          {
            clientId: config.clientId,
            code: response.params.code,
            redirectUri,
            extraParams: {
              code_verifier: request?.codeVerifier ?? '',
            },
          },
          discovery
        );

        const tokens = {
          accessToken: tokenResult.accessToken,
          refreshToken: tokenResult.refreshToken,
          idToken: tokenResult.idToken,
          expiresAt: tokenResult.expiresIn ? Date.now() + tokenResult.expiresIn * 1000 : undefined,
          tokenType: tokenResult.tokenType,
          scope: tokenResult.scope,
        };

        let user = null;

        if (discovery.userInfoEndpoint) {
          const userInfoResponse = await fetch(discovery.userInfoEndpoint, {
            headers: {
              Authorization: `Bearer ${tokenResult.accessToken}`,
            },
          });

          if (userInfoResponse.ok) {
            const payload = (await userInfoResponse.json()) as {
              sub: string;
              name?: string;
              preferred_username?: string;
              email?: string;
            };

            user = {
              id: payload.sub,
              name: payload.name ?? payload.preferred_username,
              email: payload.email,
            };
          }
        }

        const session: StoredSession = {
          id: 'current',
          user,
          tokens,
        };

        setAuthSession(session);
        await persistAuthSession(session);
      } finally {
        setIsLoading(false);
      }
    };

    handleResponse();
  }, [config.clientId, discovery, redirectUri, request?.codeVerifier, response]);

  return {
    request,
    isLoading,
    promptAsync,
  };
}
