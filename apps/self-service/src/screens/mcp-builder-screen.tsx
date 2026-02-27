import React, { useMemo } from 'react';
import { useRouter } from 'expo-router';
import { copyToClipboard } from '@lightbridge/api-native';
import { useApiKeys, useCurrentProject, useEnsureDefaultAccount, useEnsureDefaultProject } from '@lightbridge/hooks';
import { McpBuilderView } from '../views/mcp-builder-view';

export function McpBuilderScreen() {
  const router = useRouter();
  const { data: apiKeys = [] } = useApiKeys();
  useCurrentProject();
  useEnsureDefaultAccount();
  useEnsureDefaultProject();

  // Get the most recent API key if available
  const existingKey = useMemo(() => {
    if (apiKeys.length > 0) {
      // Sort by creation date descending and get the most recent
      const sorted = [...apiKeys].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      return sorted[0];
    }
    return null;
  }, [apiKeys]);

  // Generate a mock secret from the existing key prefix for display
  // In real usage, the full key would be retrieved from a secure store
  const generatedSecret = existingKey ? `${existingKey.key_prefix}****************` : null;

  const handleCreate = async () => {
    // Only redirect if there's no existing key
    if (!existingKey) {
      router.navigate('/api-keys/new');
    }
  };

  return (
    <McpBuilderView
      onBack={() => {
        if (router.canGoBack()) {
          router.back();
          return;
        }

        router.navigate('/home');
      }}
      onCopy={copyToClipboard}
      onCreateKey={handleCreate}
      isCreating={false}
      generatedSecret={generatedSecret}
    />
  );
}
