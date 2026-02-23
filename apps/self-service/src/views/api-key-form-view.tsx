import React, { useEffect, useMemo, useRef, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";

import {
  Button,
  Card,
  Div,
  Heading,
  Scroll,
  Stack,
  Text,
} from "@lightbridge/ui";
import { useThemeColors } from "../hooks/use-theme-colors";

type PlatformId = "vscode" | "cursor" | "claude" | "intellij";
type ServerId = "brave-search" | "firecrawl" | "browserless" | "context7";

type ServerDefinition = {
  id: ServerId;
  nameKey: string;
  descriptionKey: string;
  iconName: keyof typeof Ionicons.glyphMap;
  iconTone: "warningSoft" | "errorSoft" | "successSoft" | "accentSoft";
  iconColor: "secondary" | "error" | "success" | "accent";
  command: string;
  args: string[];
  env: Record<string, string>;
  type: "stdio" | "sse";
};

type PlatformDefinition = {
  id: PlatformId;
  labelKey: string;
  configTitleKey: string;
  filePath: string;
};

const serverDefinitions: ServerDefinition[] = [
  {
    id: "brave-search",
    nameKey: "apiKeyBuilder.servers.braveSearch.name",
    descriptionKey: "apiKeyBuilder.servers.braveSearch.description",
    iconName: "search",
    iconTone: "warningSoft",
    iconColor: "secondary",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-brave-search"],
    env: { BRAVE_API_KEY: "YOUR_API_KEY_HERE" },
    type: "stdio",
  },
  {
    id: "firecrawl",
    nameKey: "apiKeyBuilder.servers.firecrawl.name",
    descriptionKey: "apiKeyBuilder.servers.firecrawl.description",
    iconName: "flame",
    iconTone: "errorSoft",
    iconColor: "error",
    command: "npx",
    args: ["-y", "firecrawl-mcp"],
    env: { FC_API_KEY: "YOUR_API_KEY_HERE" },
    type: "stdio",
  },
  {
    id: "browserless",
    nameKey: "apiKeyBuilder.servers.browserless.name",
    descriptionKey: "apiKeyBuilder.servers.browserless.description",
    iconName: "globe",
    iconTone: "successSoft",
    iconColor: "success",
    command: "npx",
    args: ["-y", "@browserless/mcp-server"],
    env: { BLESS_TOKEN: "YOUR_TOKEN_HERE" },
    type: "sse",
  },
  {
    id: "context7",
    nameKey: "apiKeyBuilder.servers.context7.name",
    descriptionKey: "apiKeyBuilder.servers.context7.description",
    iconName: "hardware-chip",
    iconTone: "accentSoft",
    iconColor: "accent",
    command: "npx",
    args: ["-y", "context7-mcp"],
    env: { C7_TOKEN: "YOUR_TOKEN_HERE" },
    type: "stdio",
  },
];

const platformDefinitions: PlatformDefinition[] = [
  {
    id: "vscode",
    labelKey: "apiKeyBuilder.platforms.vscode",
    configTitleKey: "apiKeyBuilder.configCards.vscode",
    filePath: ".vscode/mcp.json",
  },
  {
    id: "cursor",
    labelKey: "apiKeyBuilder.platforms.cursor",
    configTitleKey: "apiKeyBuilder.configCards.cursor",
    filePath: "~/.cursor/mcp.json",
  },
  {
    id: "claude",
    labelKey: "apiKeyBuilder.platforms.claude",
    configTitleKey: "apiKeyBuilder.configCards.claude",
    filePath: "claude_desktop_config.json",
  },
  {
    id: "intellij",
    labelKey: "apiKeyBuilder.platforms.intellij",
    configTitleKey: "apiKeyBuilder.configCards.intellij",
    filePath: ".idea/mcp.xml",
  },
];

const initialSelectedServers: Record<ServerId, boolean> = {
  "brave-search": true,
  firecrawl: true,
  browserless: true,
  context7: true,
};

function buildConfig(
  platform: PlatformId,
  selectedServers: Record<ServerId, boolean>,
) {
  const rootKey = platform === "vscode" ? "servers" : "mcpServers";
  const result: Record<string, unknown> = {};

  for (const server of serverDefinitions) {
    if (!selectedServers[server.id]) {
      continue;
    }

    const entry: Record<string, unknown> = {
      command: server.command,
      args: server.args,
      env: server.env,
    };

    if (platform === "vscode") {
      entry.type = server.type;
    }

    result[server.id] = entry;
  }

  return JSON.stringify({ [rootKey]: result }, null, 2);
}

export function ApiKeyFormView({
  onBack,
  onCopy,
  onPaste,
}: {
  onBack: () => void;
  onCopy: (value: string) => Promise<void> | void;
  onPaste: () => Promise<string>;
}) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const [activePlatform, setActivePlatform] = useState<PlatformId>("vscode");
  const [selectedServers, setSelectedServers] = useState<
    Record<ServerId, boolean>
  >(initialSelectedServers);
  const [configText, setConfigText] = useState("");
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");
  const [pasteState, setPasteState] = useState<"idle" | "pasted">("idle");
  const feedbackResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeConfig = useMemo(
    () =>
      platformDefinitions.find((platform) => platform.id === activePlatform) ??
      platformDefinitions[0],
    [activePlatform],
  );

  const generatedConfigText = useMemo(
    () => buildConfig(activePlatform, selectedServers),
    [activePlatform, selectedServers],
  );

  useEffect(() => {
    setConfigText(generatedConfigText);
  }, [generatedConfigText]);

  useEffect(
    () => () => {
      if (feedbackResetTimer.current) {
        clearTimeout(feedbackResetTimer.current);
      }
    },
    [],
  );

  const toggleServer = (serverId: ServerId) => {
    setSelectedServers((previous) => ({
      ...previous,
      [serverId]: !previous[serverId],
    }));
  };

  const handleCopy = async () => {
    try {
      await onCopy(configText);
      setCopyState("copied");
      setPasteState("idle");

      if (feedbackResetTimer.current) {
        clearTimeout(feedbackResetTimer.current);
      }

      feedbackResetTimer.current = setTimeout(() => {
        setCopyState("idle");
      }, 1800);
    } catch {
      setCopyState("idle");
    }
  };

  const handlePaste = async () => {
    try {
      const value = await onPaste();
      setConfigText(value);
      setPasteState("pasted");
      setCopyState("idle");

      if (feedbackResetTimer.current) {
        clearTimeout(feedbackResetTimer.current);
      }

      feedbackResetTimer.current = setTimeout(() => {
        setPasteState("idle");
      }, 1800);
    } catch {
      setPasteState("idle");
    }
  };

  return (
    <Div tone="muted" width="full" style={{ flex: 1 }}>
      <Div
        tone="surface"
        width="full"
        style={{
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          paddingHorizontal: 14,
          paddingVertical: 12,
        }}
      >
        <Stack direction="row" align="center" justify="between" width="full">
          <Button
            variant="ghost"
            size="iconSm"
            onPress={onBack}
            accessibilityLabel={t("apiKeyBuilder.back")}
          >
            <Ionicons name="arrow-back" size={21} color={colors.ink} />
          </Button>

          <Heading tone="subtitle" style={{ fontSize: 18, color: colors.ink }}>
            {t("apiKeyBuilder.title")}
          </Heading>

          <Div size="iconSm" />
        </Stack>
      </Div>

      <Scroll tone="muted" pad="none" style={{ flex: 1 }}>
        <Div
          width="full"
          style={{
            paddingHorizontal: 20,
            paddingTop: 18,
            paddingBottom: 140,
          }}
        >
          <Stack gap="md">
            <Text intent="eyebrow" style={{ letterSpacing: 0.3 }}>
              {t("apiKeyBuilder.sections.servers")}
            </Text>

            <Stack gap="sm" width="full">
              {serverDefinitions.map((server) => {
                const enabled = selectedServers[server.id];
                const iconColor = colors[server.iconColor];

                return (
                  <Card
                    key={server.id}
                    size="sm"
                    accessibilityRole="button"
                    onPress={() => toggleServer(server.id)}
                    style={{
                      borderWidth: 1,
                      borderColor: colors.border,
                    }}
                  >
                    <Stack
                      direction="row"
                      align="center"
                      justify="between"
                      width="full"
                    >
                      <Stack
                        direction="row"
                        align="center"
                        gap="sm"
                        width="full"
                        style={{ flex: 1 }}
                      >
                        <Div
                          tone={server.iconTone}
                          rounded="xl"
                          size="iconMd"
                          align="center"
                          justify="center"
                        >
                          <Ionicons
                            name={server.iconName}
                            size={19}
                            color={iconColor}
                          />
                        </Div>

                        <Stack gap="xs" width="full" style={{ flex: 1 }}>
                          <Text intent="bodyStrong">{t(server.nameKey)}</Text>
                          <Text intent="caption">
                            {t(server.descriptionKey)}
                          </Text>
                        </Stack>
                      </Stack>

                      <Div
                        rounded="full"
                        style={{
                          width: 50,
                          height: 28,
                          padding: 3,
                          backgroundColor: enabled
                            ? colors.primary
                            : colors.border,
                        }}
                      >
                        <Div
                          tone="surface"
                          rounded="full"
                          style={{
                            width: 22,
                            height: 22,
                            alignSelf: enabled ? "flex-end" : "flex-start",
                          }}
                        />
                      </Div>
                    </Stack>
                  </Card>
                );
              })}
            </Stack>

            <Div style={{ height: 10 }} />

            <Text intent="eyebrow" style={{ letterSpacing: 0.3 }}>
              {t("apiKeyBuilder.sections.generated")}
            </Text>

            <Div
              tone="surface"
              rounded="xl"
              pad="sm"
              width="full"
              style={{
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Stack direction="row" width="full" style={{ gap: 6 }}>
                {platformDefinitions.map((platform) => {
                  const active = platform.id === activePlatform;

                  return (
                    <Div
                      key={platform.id}
                      rounded="md"
                      tone={active ? "surface" : "default"}
                      align="center"
                      justify="center"
                      style={{
                        flex: 1,
                        paddingVertical: 8,
                        borderWidth: active ? 1 : 0,
                        borderColor: colors.border,
                      }}
                      accessibilityRole="button"
                      onPress={() => setActivePlatform(platform.id)}
                    >
                      <Text
                        intent={active ? "link" : "caption"}
                        align="center"
                        style={{ fontSize: 12 }}
                      >
                        {t(platform.labelKey)}
                      </Text>
                    </Div>
                  );
                })}
              </Stack>
            </Div>

            <Card
              size="sm"
              style={{
                borderWidth: 1,
                borderColor: colors.border,
                overflow: "hidden",
                padding: 0,
              }}
            >
              <Div
                tone="muted"
                style={{
                  borderBottomWidth: 1,
                  borderBottomColor: colors.border,
                  paddingHorizontal: 12,
                  paddingVertical: 12,
                }}
              >
                <Stack
                  direction="row"
                  align="center"
                  justify="between"
                  width="full"
                >
                  <Stack direction="row" align="center" gap="sm">
                    <Div
                      tone="brand"
                      rounded="md"
                      size="iconSm"
                      align="center"
                      justify="center"
                    >
                      <Ionicons
                        name="code-slash"
                        size={14}
                        color={colors.surface}
                      />
                    </Div>
                    <Text intent="bodyStrong">
                      {t(activeConfig.configTitleKey)}
                    </Text>
                  </Stack>

                  <Stack direction="row" align="center" gap="xs">
                    <Div
                      tone="brandSoft"
                      rounded="md"
                      pad="sm"
                      accessibilityRole="button"
                      onPress={() => {
                        void handlePaste();
                      }}
                    >
                      <Stack direction="row" align="center" gap="xs">
                        <Ionicons
                          name={
                            pasteState === "pasted" ? "checkmark" : "clipboard"
                          }
                          size={14}
                          color={colors.primary}
                        />
                        <Text intent="link" style={{ fontSize: 14 }}>
                          {pasteState === "pasted"
                            ? t("apiKeyBuilder.pasted")
                            : t("apiKeyBuilder.paste")}
                        </Text>
                      </Stack>
                    </Div>

                    <Div
                      tone="brandSoft"
                      rounded="md"
                      pad="sm"
                      accessibilityRole="button"
                      onPress={() => {
                        void handleCopy();
                      }}
                    >
                      <Stack direction="row" align="center" gap="xs">
                        <Ionicons
                          name={copyState === "copied" ? "checkmark" : "copy"}
                          size={14}
                          color={colors.primary}
                        />
                        <Text intent="link" style={{ fontSize: 14 }}>
                          {copyState === "copied"
                            ? t("apiKeyBuilder.copied")
                            : t("apiKeyBuilder.copy")}
                        </Text>
                      </Stack>
                    </Div>
                  </Stack>
                </Stack>
              </Div>

              <Div
                tone="surface"
                style={{ paddingHorizontal: 12, paddingVertical: 12 }}
              >
                <Stack
                  direction="row"
                  align="center"
                  justify="between"
                  width="full"
                >
                  <Stack direction="row" align="center" gap="xs">
                    <Ionicons name="folder" size={14} color={colors.subtle} />
                    <Text intent="caption" style={{ fontSize: 13 }}>
                      {activeConfig.filePath}
                    </Text>
                  </Stack>
                  <Div
                    tone="brandSoft"
                    rounded="sm"
                    style={{ paddingHorizontal: 8, paddingVertical: 3 }}
                  >
                    <Text intent="link" style={{ fontSize: 12 }}>
                      {t("apiKeyBuilder.json")}
                    </Text>
                  </Div>
                </Stack>

                <Div
                  tone="muted"
                  rounded="xl"
                  style={{
                    marginTop: 12,
                    borderWidth: 1,
                    borderColor: colors.border,
                    padding: 12,
                  }}
                >
                  <Text
                    intent="key"
                    selectable
                    style={{
                      color: colors.ink,
                      fontSize: 11,
                      lineHeight: 18,
                      fontFamily: "monospace",
                    }}
                  >
                    {configText}
                  </Text>
                </Div>
              </Div>
            </Card>
          </Stack>
        </Div>
      </Scroll>
    </Div>
  );
}
