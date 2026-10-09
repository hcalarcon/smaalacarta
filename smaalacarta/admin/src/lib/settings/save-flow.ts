import { normalizeSchedule } from "./schedule";
import { normalizeSettingsText, type SettingsInput } from "./validation";
import { slugify } from "@/lib/superadmin/validation";

// Reglas del guardado único de Configuración (ADMIN-CONFIG-33 a 37): qué cambió, cuándo preguntar
// por la URL y en qué orden se guarda. Sin React: las ve la suite.

// La configuración tal como se valida y se guarda: textos recortados y horarios normalizados. La usan
// la acción del servidor y la validación previa del navegador, para que digan lo mismo.
export function prepareSettings(input: SettingsInput): SettingsInput {
  return normalizeSettingsText({
    ...input,
    tagline: input.tagline.trim(),
    headerImageUrl: input.headerImageUrl.trim(),
    logoUrl: input.logoUrl.trim(),
    menuPdfUrl: input.menuPdfUrl.trim(),
    schedule: normalizeSchedule(input.schedule),
    whatsapp: input.whatsapp.trim(),
  });
}

export type Profile = { name: string; slug: string };

export function profileChanged(saved: Profile, current: Profile): boolean {
  return saved.name.trim() !== current.name.trim() || saved.slug !== current.slug;
}

// La URL que se ofrece si cambió el nombre y la URL quedó como estaba; `null` si no hay nada que
// preguntar. No se toca sola: la URL vieja rompe los links y los QR ya compartidos.
export function regenerateSuggestion(saved: Profile, current: Profile): string | null {
  const nameChanged = current.name.trim() !== saved.name.trim();
  const slugUntouched = current.slug === saved.slug;
  const suggested = slugify(current.name.trim());

  return nameChanged && slugUntouched && suggested && suggested !== current.slug ? suggested : null;
}

type StepResult = { ok: true } | { ok: false };

export type RunSaveResult<P extends StepResult, S extends StepResult> = {
  ok: boolean;
  profile: P | null;
  settings: S | null;
};

// El perfil va primero porque puede fallar por una URL en uso; si falla, la configuración ni se
// intenta y todo queda como sin guardar.
export async function runSave<P extends StepResult, S extends StepResult>(steps: {
  profileChanged: boolean;
  settingsChanged: boolean;
  saveProfile: () => Promise<P>;
  saveSettings: () => Promise<S>;
}): Promise<RunSaveResult<P, S>> {
  let profile: P | null = null;
  let settings: S | null = null;

  if (steps.profileChanged) {
    profile = await steps.saveProfile();
    if (!profile.ok) return { ok: false, profile, settings };
  }

  if (steps.settingsChanged) {
    settings = await steps.saveSettings();
    if (!settings.ok) return { ok: false, profile, settings };
  }

  return { ok: true, profile, settings };
}
