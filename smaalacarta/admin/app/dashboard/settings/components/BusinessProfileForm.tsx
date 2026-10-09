"use client";

import { useSettingsSave } from "./SettingsSaveProvider";
import Field from "@/components/ui/Field";
import Section from "@/components/ui/Section";
import { menuUrl } from "@/lib/menu-url";

// Datos del negocio (nombre y URL). No tiene botón propio: los guarda el botón flotante junto con el
// resto de Configuración (ADMIN-CONFIG-33).
export default function BusinessProfileForm() {
  const { name, setName, slug, setSlug, profileErrors, save } = useSettingsSave();

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
      noValidate
    >
      <Section
        id="datos"
        title="Datos del negocio"
        description="El nombre y la URL de tu menú público."
      >
        <Field
          label="Nombre del negocio"
          value={name}
          onChange={(event) => setName(event.target.value)}
          error={profileErrors.name}
        />

        <div>
          <Field
            label="URL de tu menú"
            value={slug}
            onChange={(event) => setSlug(event.target.value.toLowerCase())}
            hint={`Tus clientes entran por ${menuUrl(slug || "tu-negocio")}`}
            error={profileErrors.slug}
            autoCapitalize="none"
          />

          <p className="mt-1.5 text-sm text-amber-700">
            Si la cambiás, el link y el código QR que ya compartiste dejan de funcionar.
          </p>
        </div>
      </Section>
    </form>
  );
}
