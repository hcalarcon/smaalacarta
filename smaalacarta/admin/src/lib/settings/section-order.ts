import type { SettingsSection } from "./sections";

export function parseSectionOrder(value: string | null): string[] {
  if (!value) return [];

  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) && parsed.every((id) => typeof id === "string")
      ? parsed
      : [];
  } catch {
    return [];
  }
}

export function orderSettingsSections(
  sections: SettingsSection[],
  preferredIds: readonly string[],
): SettingsSection[] {
  const byId = new Map(sections.map((section) => [section.id, section]));
  const ordered: SettingsSection[] = [];
  const added = new Set<string>();

  for (const id of preferredIds) {
    const section = byId.get(id);
    if (section && !added.has(id)) {
      ordered.push(section);
      added.add(id);
    }
  }

  for (const section of sections) {
    if (!added.has(section.id)) ordered.push(section);
  }

  return ordered;
}
