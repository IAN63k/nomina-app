# Flujo de versionado y ramas — nomina-app

Documento de referencia del manejo de versiones del proyecto: cómo se ha venido
trabajando, qué problemas tiene el flujo actual, y el flujo recomendado a aplicar
**de aquí en adelante**. No requiere reescribir el historial pasado.

---

## 1. Estado actual (cómo se ha venido trabajando)

Dos tracks paralelos:

| Track       | Rama base   | Ramas de release             | Versión (ej.) |
|-------------|-------------|------------------------------|---------------|
| Integración | `develop`   | `release/develop/vX.Y.Z`     | 1.3.2         |
| Producción  | `main`      | `release/production/X.Y.Z`   | 1.2.2         |

Convenciones observadas:
- Ramas de feature/fix **en pares**: `fix/recargos-dev` y `fix/recargos-prod`.
  El cambio se desarrolla en `-dev` y se **cherry-pickea** a `-prod`.
- Todos los merges con `--no-ff` (preservan la burbuja de cada feature/release).
- Commit de versión que solo bumpea `package.json`: `Built: version app vX.Y.Z`.
- Las ramas `release/*` se conservan (no se borran). Sin tags de Git.

Patrón de un release (track develop, ejemplo v1.3.2):
```bash
git checkout develop
git checkout -b release/develop/v1.3.2
git merge --no-ff fix/recargos-dev -m "Merge branch 'fix/recargos-dev' into release/develop/v1.3.2"
# bump package.json -> 1.3.2
git commit -am "Built: version app v1.3.2"
git checkout develop
git merge --no-ff release/develop/v1.3.2 -m "Merge branch 'release/develop/v1.3.2' into develop"
```
Producción (ejemplo 1.2.2): igual, pero `fix/recargos-dev`→`fix/recargos-prod`
(vía cherry-pick), `release/production/1.2.2`, merge a `main`.

---

## 2. Lo que está bien ✅

- **Separación `develop` (integración) / `main` (producción)** — base sólida de Gitflow.
- **Merges `--no-ff`** — historial legible; cada feature/release queda agrupado.
- **Convención de nombres consistente** — disciplina y orden.
- **Bump de versión como commit explícito** — rastreable.
- **Rama de release como punto de estabilización** antes de mergear — concepto válido.

---

## 3. Observaciones a corregir ⚠️

### 3.1 Ramas paralelas `-dev`/`-prod` + cherry-pick — (prioridad alta)
Mantener dos copias del mismo cambio y sincronizarlas con cherry-pick:
- Duplica el trabajo y multiplica el riesgo de error humano.
- Genera **SHAs distintos para el mismo cambio** → Git pierde la relación. Al intentar
  mergear `develop`→`main` directamente puede aparecer un **conflicto fantasma** de
  algo que "ya estaba".
- Tener que usar `git cherry` para saber qué falta por contenido es síntoma de estar
  peleando contra la herramienta.

### 3.2 Versiones divergentes entre tracks (1.3.2 vs 1.2.2) — (prioridad alta)
El mismo producto tiene **dos números de versión** a la vez. Genera ambigüedad en
soporte y despliegues ("el cliente tiene 1.2.2, ¿incluye el fix de 1.3.1?"). Un
producto debe tener **una sola línea de versión**.

### 3.3 No hay tags de Git — (prioridad media)
Los releases se marcan solo con nombres de rama y mensajes de commit. El estándar es
un **tag inmutable por release** (`v1.3.2`). Sin tags se pierde `git describe`, los
GitHub Releases y el checkout directo a una versión; y obliga a **conservar todas las
ramas `release/*`** (los tags eliminan esa necesidad).

### 3.4 Mensaje "Built: version app" — (menor)
Dice "Built" (sugiere artefactos de build) pero solo cambia `package.json`.
`chore(release): vX.Y.Z` es más honesto. `npm version X.Y.Z` hace bump **y tag**
de forma atómica.

---

## 4. Flujo recomendado (mismo espíritu, sin los anti-patrones)

Se mantiene `develop` + `main`, pero **una sola rama por cambio** que fluye hacia
adelante. Los **mismos commits** llegan a producción → cero cherry-pick, una sola versión.

```
feat/x ──merge──▶ develop ──(release/x.y.z)──▶ main + tag vX.Y.Z
                                  └────back-merge────▶ develop
```

### 4.1 Trabajar un cambio
```bash
git checkout develop
git checkout -b feat/mi-cambio        # UNA sola rama (sin par -dev/-prod)
# ... commits ...
git checkout develop
git merge --no-ff feat/mi-cambio
git branch -d feat/mi-cambio          # opcional: limpiar
```

### 4.2 Liberar una versión
```bash
git checkout develop
git checkout -b release/1.3.2         # nombre = versión, sin track duplicado

npm version 1.3.2 --no-git-tag-version  # bump package.json (sin tag aún)
git commit -am "chore(release): v1.3.2"

# 1) a producción + tag
git checkout main
git merge --no-ff release/1.3.2
git tag -a v1.3.2 -m "Release v1.3.2"

# 2) de vuelta a develop (mismos commits, sin cherry-pick)
git checkout develop
git merge --no-ff release/1.3.2

# 3) limpiar y publicar
git branch -d release/1.3.2
git push origin main develop --tags
```

> `main` y `develop` comparten la **misma** secuencia de versiones. Producción siempre
> es un subconjunto de develop que avanza por merge, no por copia.

### 4.3 Hotfix urgente en producción
```bash
git checkout main
git checkout -b hotfix/1.3.3
# ... fix ...
npm version 1.3.3 --no-git-tag-version && git commit -am "chore(release): v1.3.3"
git checkout main   && git merge --no-ff hotfix/1.3.3 && git tag -a v1.3.3 -m "Release v1.3.3"
git checkout develop && git merge --no-ff hotfix/1.3.3   # back-merge para no perder el fix
git branch -d hotfix/1.3.3
git push origin main develop --tags
```

### Alternativa más liviana
Si se adopta despliegue continuo: **GitHub Flow** — solo `main` + ramas de feature por
PR + tags por release. Menos ceremonia, ideal para equipos pequeños.

---

## 5. Checklist de migración (incremental, sin reescribir historia)

- [ ] **Dejar de crear pares `-dev`/`-prod`.** Una rama por cambio, hacia adelante.
- [ ] **Unificar la versión.** Elegir UNA línea (sugerido: continuar en 1.3.x y alinear
      `main` en el próximo release). A partir de ahí, `main` y `develop` comparten versión.
- [ ] **Empezar a taggear** cada release (`git tag -a vX.Y.Z`). Taggear retroactivamente
      los releases ya en `main` es opcional pero recomendado.
- [ ] **Back-merge `release`→`develop`** en vez de cherry-pick.
- [ ] **Borrar la rama de release** tras mergear (el tag es la fuente de verdad).
- [ ] (Opcional) Adoptar Conventional Commits + `npm version` para automatizar bump/tag/changelog.

---

## 6. Referencia rápida

| Acción                  | Comando                                             |
|-------------------------|-----------------------------------------------------|
| Nueva feature           | `git checkout develop && git checkout -b feat/x`    |
| Integrar feature        | `git checkout develop && git merge --no-ff feat/x`  |
| Crear release           | `git checkout -b release/X.Y.Z` (desde `develop`)   |
| Bump versión            | `npm version X.Y.Z --no-git-tag-version`            |
| Promover a prod         | `git checkout main && git merge --no-ff release/X.Y.Z` |
| Taggear                 | `git tag -a vX.Y.Z -m "Release vX.Y.Z"`             |
| Back-merge a develop    | `git checkout develop && git merge --no-ff release/X.Y.Z` |
| Publicar                | `git push origin main develop --tags`               |
| Ver versión actual      | `git describe --tags`                               |
