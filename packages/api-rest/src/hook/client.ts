import { client } from '../client/client.gen';
import { ClientOptions, RequestOptions } from '../client/client';
import { Config as ApiConfig } from '../client/core/types.gen';

export type ClientInitOptions = ClientOptions & ApiConfig;

let isInitialized = false;
let latestApiOptions: ClientInitOptions;
let latestUsageOptions: ClientInitOptions;

export function useClientInit(apiOptions: ClientInitOptions, usageOptions: ClientInitOptions) {
  latestApiOptions = apiOptions;
  latestUsageOptions = usageOptions;

  if (!isInitialized) {
    const originalRequest = client.request.bind(client);

    // Proxy the request method to inject the correct baseURL and security on the fly
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (client.request as any) = async (options: any) => {
      const isUsage =
        options.url?.startsWith('/v1/usage') ||
        options.url?.startsWith('/v1/otel') ||
        options.url?.startsWith('/health');

      const targetConfig = isUsage ? latestUsageOptions : latestApiOptions;
      const baseUrl = targetConfig.baseURL;

      // Ensure security is present so setAuthParams is called
      const security = options.security ?? [{ type: 'http', scheme: 'bearer' }];

      // Debugging 401
      if (__DEV__) {
        const authValue = await (typeof targetConfig.auth === 'function'
          ? targetConfig.auth({ type: 'http' } as any)
          : targetConfig.auth);
        console.log(`[API Client] Request: ${options.url} -> ${baseUrl}${options.url}`);
        console.log(`[API Client] Auth Token: ${authValue ? 'Present (starts with ' + (authValue as string).substring(0, 10) + '...)' : 'Missing'}`);
        console.log(`[API Client] Security Config: ${JSON.stringify(security)}`);
      }

      // @ts-ignore - dynamic baseURL injection and async return type
      return originalRequest({
        ...options,
        security,
        baseURL: baseUrl,
      });
    };

    isInitialized = true;
  }

  // Still call setConfig to apply global settings (headers, auth, etc.)
  // We use apiOptions as the "base" config since auth/etc should be same
  // We add security here as well just in case
  client.setConfig({
    ...(apiOptions as unknown as ClientOptions),
    // @ts-ignore
    security: [{ type: 'http', scheme: 'bearer' }],
  });

  return client;
}
