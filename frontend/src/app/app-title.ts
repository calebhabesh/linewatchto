const baseAppTitle = "LineWatch TO";

function normalizeLabel(value: string | undefined) {
  return value?.trim().replace(/\s+/g, " ") ?? "";
}

export function getLineWatchEnvironmentLabel() {
  const configuredLabel = normalizeLabel(process.env.NEXT_PUBLIC_LINEWATCH_ENVIRONMENT_LABEL);

  if (configuredLabel) {
    return configuredLabel;
  }

  return process.env.NODE_ENV === "development" ? "Dev" : "";
}

export function getLineWatchAppTitle() {
  const environmentLabel = getLineWatchEnvironmentLabel();

  if (!environmentLabel) {
    return baseAppTitle;
  }

  if (environmentLabel.toLowerCase().startsWith(baseAppTitle.toLowerCase())) {
    return environmentLabel;
  }

  return `${baseAppTitle} ${environmentLabel}`;
}

export const lineWatchAppTitle = getLineWatchAppTitle();
