# Ramas y qué las protege

`main` es producción: Vercel publica desde ahí los dos proyectos en línea
(`smaalacarta` → la landing, `democlientes` → los menús). Cada persona trabaja en
su propia rama y nada llega a `main` sin un pull request. Herni es el dueño del
proyecto y el único que mergea; lo de Fede necesita además su aprobación.

```
dev-herni ──PR──┐
                ├──▶ main ──▶ producción
dev-fede  ──PR──┘
```

| Rama | De quién | Quién pushea | Cómo entra algo |
| --- | --- | --- | --- |
| `main` | de los dos | nadie directo | pull request desde una `dev-*` |
| `dev-herni` | Herni (git: `hcalarcon`) | Herni y su Claude | commits directos |
| `dev-fede` | Fede (git: `FedeAtadia`) | Fede y su Claude | commits directos |

Las dos personas trabajan con Claude. Las reglas que tienen que respetar los dos
están escritas en [`CLAUDE.md`](../CLAUDE.md), que ambos leen al empezar cada
sesión; este documento explica el porqué y los comandos.

## Las reglas

| | `main` | `dev-*` |
| --- | --- | --- |
| Push directo | no — pull request obligatorio | sí, solo el dueño de la rama |
| CI (`ci`) tiene que pasar | sí | corre en cada push, avisa en rojo |
| Los builds de Vercel tienen que pasar | sí | no |
| Aprobaciones | **1** (la de Herni, para los PR de Fede) | ninguna |
| Rama al día antes de mergear | sí | — |
| Force push / borrar la rama | prohibido | prohibido |
| Un admin puede saltearlas | solo mergeando un PR (así mergea Herni los suyos), nunca con push directo | no aplica |

## Por qué cada regla

- **Cada uno en su rama.** Dos personas (y dos Claude) escribiendo en la misma
  rama se pisan. Con una rama por persona nunca hay dos escritores. Esto no lo
  puede imponer GitHub, porque los rulesets no distinguen usuarios dentro de un
  patrón de ramas: es un acuerdo, y por eso está también en `CLAUDE.md`.
- **Pull request obligatorio a `main`.** Todo cambio es visible antes de entrar y
  CI tiene contra qué correr.
- **Lo de Fede lo aprueba Herni.** Herni es el dueño y responde por lo que se
  publica: nada de Fede llega a producción sin su aprobación. Lo de Herni no
  necesita la de Fede; Fede puede mirarlo y comentar, pero no lo bloquea. GitHub
  no deja aprobar el PR propio, así que Herni mergea los suyos con el salteo de
  administrador, que solo funciona sobre un PR.
- **Solo Herni mergea, y siempre un humano.** Claude puede abrir el PR y
  describirlo. Aprobar y mergear es una decisión de una persona, y en `main`
  es la de Herni. Como trabajan juntos, quien abre un PR se lo avisa al otro.
- **`ci` tiene que pasar** — lint, la suite completa de tests y el build del
  admin. Ver [`.github/workflows/ci.yml`](../.github/workflows/ci.yml).
- **Los builds de Vercel tienen que pasar.** Es el build del propio host, para que
  nada entre con los tests en verde mientras lo que se publica está roto. Los
  contextos son **`Vercel – smaalacarta`** y **`Vercel – democlientes`** (con
  guion largo). El admin todavía no tiene proyecto en Vercel; cuando lo tenga, su
  contexto se agrega al ruleset de `main`.
- **Rama al día antes de mergear.** El PR se reconstruye contra el `main` actual,
  así lo que se probó es lo que se publica.
- **Aprobaciones viejas se descartan.** Un commit nuevo después de una aprobación
  la anula; si no, "aprobado" puede terminar significando "aprobé otra cosa".
- **Sin force push ni borrado**, en `main` y en las `dev-*`. Son historia compartida.
- **El admin puede saltearlas solo mergeando un PR.** Es lo que usa Herni para
  mergear los suyos, y también la salida si CI o Vercel dejan de reportar. Como
  el salteo también permite mergear con CI en rojo, la regla es mirar el check
  antes de mergear. No permite pushear directo a `main`.

## Aplicar las reglas

El repositorio es público, así que GitHub permite rulesets en el plan gratuito.
Hace falta ser administrador del repositorio (`hcalarcon`).

**En este orden**, porque el check `ci` solo puede pasar cuando el workflow ya
existe en `main`:

1. Mergear a `main` el PR que trae el workflow (y este documento).
2. Recién ahí aplicar los dos rulesets:

```bash
gh api --method POST repos/hcalarcon/smaalacarta/rulesets --input .github/rulesets/main.json
```

```bash
gh api --method POST repos/hcalarcon/smaalacarta/rulesets --input .github/rulesets/dev.json
```

Verificar que quedaron (el segundo comando lista las reglas realmente vigentes):

```bash
gh api repos/hcalarcon/smaalacarta/rulesets --jq '.[] | "\(.name) — \(.enforcement)"'
```

```bash
gh api repos/hcalarcon/smaalacarta/rules/branches/main --jq '.[].type'
```

Si la importación rechaza `bypass_actors`, sacarlo del archivo y agregarlo
después en **Settings → Rules → Bypass list**. El `actor_id: 5` es el rol de
administrador del repositorio.

## Día a día

**Empezar** (cada sesión, los dos):

```bash
git checkout dev-herni        # o dev-fede
git fetch && git merge origin/main
```

**Trabajar.** Commits chicos en tu rama, con el ciclo de
[WORKFLOW.md](WORKFLOW.md): requisito → test → código → suite, lint y build.
Anotá en [PLAN.md](PLAN.md) qué tarea tomás, con tu nombre.

**Subir tu trabajo** (backup, y para que el otro lo vea):

```bash
git push origin dev-herni
```

**Pedir que entre a `main`:**

```bash
git fetch && git merge origin/main     # resolvé conflictos acá, en tu rama
npm test && npm run lint && npm run build     # en smaalacarta/admin
gh pr create --base main --title "Lo que hace este cambio"
```

Si lo abre Fede, Herni lo revisa y lo aprueba. En los dos casos lo mergea Herni con
**merge commit** (sin squash: así `main` y las `dev-*` no se separan). Vercel
publica producción desde `main`.

**Después del merge**, los dos, ese mismo día:

```bash
git fetch && git merge origin/main
```

Un PR es una funcionalidad. Si tu rama acumula más de una semana sin llegar a
`main`, los conflictos se juntan: cortá el trabajo y mergeá lo que ya está.

### Si hay conflictos

Se resuelven en **tu rama**, después de traer `main`. Nunca se edita `main` ni la
rama del otro para "arreglarlo".

### Arreglo urgente

El mismo camino: commit en tu rama, PR a `main`, y Herni lo mergea. Es unos
minutos más lento que un push a `main`, y a cambio lo que se publica pasó por CI.

## Base de datos

Cada uno tiene su **propio proyecto de Supabase**, y cada uno aplica las
migraciones a la suya (`npm run db:push`). Lo compartido son los archivos de
`admin/supabase/migrations/`, no la base.

- Una migración que ya llegó a `main` **no se edita**: se agrega otra.
- Toda tabla nueva lleva RLS por `business_id` en la misma migración.
- Después de una migración: `npm run db:types` y commitear
  `src/types/database.ts` junto con ella.
- Avisá antes de crear una migración si otra tarea de [PLAN.md](PLAN.md) también
  toca el esquema: dos migraciones con la misma tabla se ordenan por fecha, y
  conviene decidirlo antes de escribirlas.
- Las claves y tokens (`.env.local`, `.env.supabase`) no se commitean ni se
  comparten: cada uno usa los suyos. Solo se versionan las plantillas `.env*.example`.

## Para considerar más adelante

- **Un proyecto de Vercel para el admin**, y su contexto en el ruleset de `main`.
- **Un archivo `CODEOWNERS`**, si las revisiones tienen que ir siempre a una
  persona en particular.
- **Una rama de integración (`development`)**, si el equipo crece y probar lo de
  todos junto antes de producción empieza a hacer falta.

Qué tiene que hacer el sistema está en [SPEC.md](SPEC.md); cómo trabajar sobre
él, en [WORKFLOW.md](WORKFLOW.md).
