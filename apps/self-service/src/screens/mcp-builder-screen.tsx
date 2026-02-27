import React, { useState } from 'react';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { copyToClipboard } from '@lightbridge/api-native';
import { useCreateApiKey, useEnsureDefaultAccount, useEnsureDefaultProject } from '@lightbridge/hooks';
import { McpBuilderView } from '../views/mcp-builder-view';

export function McpBuilderScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const [generatedSecret, setGeneratedSecret] = useState<string | null>(null);
  const { mutate: ensureAccount, isPending: isAccountEnsuring } = useEnsureDefaultAccount();
  const { mutate: ensureProject, isPending: isProjectEnsuring } = useEnsureDefaultProject();
  const { mutate: createKey, isPending: isKeyCreating } = useCreateApiKey();

  const handleCreate = async () => {
    try {
      const account = await ensureAccount();
      const project = await ensureProject(account.id);
      await createKey(
        { input: { name: t('apiKeyBuilder.studioKeyName') }, projectId: project.id },
        {
          onSuccess: (data) => {
            if (data?.secret) {
              setGeneratedSecret(data.secret);
            }
          },
        }
      );
    } catch (error) {
      console.error('Failed to create Studio Key with bootstrap:', error);
    }
  };

  const isPending = isAccountEnsuring || isProjectEnsuring || isKeyCreating;

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
      isCreating={isPending}
      generatedSecret={generatedSecret}
    />
  );
}
