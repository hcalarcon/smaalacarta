# Ramas y qué las protege

`main` es producción: Vercel publica desde ahí los dos proyectos en línea
(`smaalacarta` → la landing, `democlientes` → los menús). Nada llega a `main` sin
haber pasado antes por `development` y por una corrida verde de CI.

```
rama de trabajo ──PR──▶ development ──PR──▶ main ──▶ producción
 (sale de               (se acumula          (release)
  development)           todo)
```

| | `development` | `main` |
| --- | --- | --- |
| Push directo | no — pull request obligatorio | no — pull request obligatorio |
| CI (`ci`) tiene que pasar | sí | sí |
| Los builds de Vercel tienen que pasar | sí | sí |
| Aprobaciones | 0 | **1**, de alguien con permiso de escritura |
| Rama al día antes de mergear | no | sí |
| Force push / borrar la rama | prohibido | prohibido |
| Un admin puede saltear las reglas | sí | sí |

Son dos controles, desparejos a propósito. A una máquina las dos ramas le piden
lo mismo: tests en verde y un build que realmente se publica. Lo que `main` suma
es una persona — el release es lo que cambia lo que ven los clientes, así que
alguien lo firma. El trabajo diario hacia `development` nunca espera a que el
otro esté disponible.

## Hoy estas reglas son un acuerdo, no un candado

El repositorio es privado y está en el plan gratuito de GitHub, que no permite
rulesets ni protección de ramas (la API responde *"Upgrade to GitHub Pro or make
this repository public"*). Hasta que eso cambie:

- **CI corre igual** en cada pull request y en cada push a `development` y
  `main`, y marca en rojo lo que falla. Nada impide mergear en rojo: no se hace.
- **Un `git push origin main` funciona técnicamente.** No se hace. Todo entra
  por pull request, también los arreglos urgentes.
- **Las reglas ya están escritas** en [`.github/rulesets/`](../.github/rulesets/),
  así que el día que se pueda activarlas es un comando (ver *Aplicarlas*).

## Por qué existe cada regla

- **Pull request obligatorio.** Ningún push directo a ninguna de las dos ramas:
  todo cambio es visible antes de entrar y CI tiene contra qué correr.
- **`ci` tiene que pasar** — lint, la suite completa de tests y el build del
  admin. El build va a propósito: corre TypeScript y prueba que la app compila,
  que es lo que se va a publicar. Ver
  [`.github/workflows/ci.yml`](../.github/workflows/ci.yml).
- **Los builds de Vercel tienen que pasar, en las dos ramas.** Es el build del
  propio host, para que nada entre con los tests en verde mientras lo que se
  publica está roto. En `development` detecta el error en la rama que lo causó,
  y no en el release, cuando desenredarlo es problema de otro. Dos detalles:
  - Los contextos requeridos son **`Vercel – smaalacarta`** y
    **`Vercel – democlientes`** (con guion largo), cuya descripción dice
    "Deployment has completed". Si Vercel agrega un check `Vercel Preview
    Comments`, ese no se exige: solo maneja el comentario del PR.
  - El admin todavía no tiene proyecto en Vercel. Cuando lo tenga, su contexto
    se agrega a los dos rulesets.
- **Una aprobación en `main`.** GitHub solo cuenta aprobaciones de usuarios con
  permiso de escritura o más, que es exactamente "colaboradores del repo".
- **Rama al día antes de mergear, solo en `main`.** Obliga a que el PR de release
  se reconstruya contra el `main` actual, así lo que se probó es lo que se
  publica. En `development` está apagado: obligaría a rebasear cada PR cada vez
  que entra otro, fricción sin ganancia en una rama de integración.
- **Aprobaciones viejas se descartan en `main`.** Commits nuevos después de una
  aprobación la anulan. Si no, "aprobado" puede terminar significando "aprobé
  otra cosa".
- **Sin force push ni borrado.** Las dos ramas son historia compartida.
- **Un admin puede saltearlas.** Si CI o la integración de Vercel dejan de
  reportar, reglas absolutas bloquearían todos los merges. El salteo es una
  salida de emergencia, no una costumbre, y queda registrado.

## Aplicarlas

**Requiere dos cosas:** que el repo esté en GitHub Pro (o sea público) y un
administrador del repositorio (`hcalarcon`; permiso de escritura no alcanza).
Cualquiera de los dos métodos sirve; el JSON es el mismo.

### Con la CLI

```bash
gh api --method POST repos/hcalarcon/smaalacarta/rulesets --input .github/rulesets/development.json
```

```bash
gh api --method POST repos/hcalarcon/smaalacarta/rulesets --input .github/rulesets/main.json
```

### Desde el navegador

**Settings → Rules → Rulesets → New ruleset → Import a ruleset**, y subir
`.github/rulesets/development.json` y `.github/rulesets/main.json`.

Si la importación rechaza `bypass_actors`, sacarlo del archivo y agregarlo
después en **Bypass list → Repository admin**. El `actor_id: 5` es el id que
GitHub usa para el rol de administrador del repositorio.

### En este orden

El check `ci` solo puede pasar cuando el workflow existe en la rama destino:

1. Mergear el PR que agrega el workflow en `development`.
2. Abrir `development` → `main` y mergearlo, para que `main` tenga el workflow
   antes de protegerla.
3. Aplicar los dos rulesets.

## Verificar que quedaron

```bash
gh api repos/hcalarcon/smaalacarta/rulesets --jq '.[] | "\(.name) — \(.enforcement)"'
```

```bash
gh api repos/hcalarcon/smaalacarta/rules/branches/main --jq '.[].type'
```

El segundo lista las reglas realmente vigentes sobre `main`, que es el dato
confiable.

## Día a día

```bash
git checkout development && git pull
```

```bash
git checkout -b feat/lo-que-sea
```

```bash
gh pr create --base development
```

Toda rama sale de `development`, nunca de `main`: una rama de `main` no tiene lo
acumulado desde el último release, y al volver a `development` arrastra ese
hueco.

| Prefijo | Para qué |
| --- | --- |
| `feat/` | comportamiento nuevo |
| `fix/` | corregir algo que no cumple la [SPEC](SPEC.md) |
| `test/` | especificar y testear comportamiento existente |
| `docs/` | solo documentación |
| `chore/` | dependencias, configuración, herramientas |

Los mensajes de commit y los PR citan los ids de requisito que tocan
(`CARRITO-3`, `HORARIO-2`).

### Release

Un release es un pull request como cualquier otro, y lo aprueba alguien distinto
de quien lo abre:

```bash
gh pr create --base main --head development --title "Release"
```

Cuando se mergea, Vercel publica producción desde `main`.

Un arreglo urgente sigue el mismo camino: `fix/` desde `development`, PR a
`development`, y enseguida el PR de release. Es más lento que un push a `main`
por unos minutos y a cambio lo que se publica pasó por CI.

## Para considerar más adelante

- **Un proyecto de Vercel para el admin**, y su contexto en los rulesets.
- **Un archivo `CODEOWNERS`**, si las revisiones tienen que ir siempre a una
  persona en particular.
- **Merges squash hacia `development`**, si la historia de las ramas resulta más
  ruidosa que útil.

Qué tiene que hacer el sistema está en [SPEC.md](SPEC.md); cómo trabajar sobre
él, en [WORKFLOW.md](WORKFLOW.md).
