<!-- AGENTS.md — Polla Mundialista 2026 -->
# AGENTS.md — Polla Mundialista 2026

Este documento está escrito para agentes de código. Supone que el lector no conoce nada del proyecto y necesita orientación precisa para explorar, modificar y depurar el código sin hacer suposiciones.

---

## 1. Visión general del proyecto

**Polla Mundialista 2026** es un frontend estático, en español, para una polla/predicción de fútbol correspondiente al Mundial 2026 (formato expandido: 48 equipos, 12 grupos y 32 partidos de eliminación directa). Los participantes ingresan con cédula + alias + institución, pronostican los 72 partidos de grupos y luego los 32 partidos del cuadro final. Un panel de administración permite cargar los resultados reales, generar automáticamente los cruces de dieciseisavos de final a partir de las tablas de grupos, recalcular puntajes y gestionar usuarios e instituciones.

- **No hay paso de build.** El repositorio se sirve tal cual como sitio estático.
- **No hay framework frontend** (React, Vue, Angular, etc.). Todo es HTML/CSS/JS vanilla.
- **Backend único:** Firebase Firestore, consumido directamente desde el cliente mediante el SDK de Firebase v10.12.2 por CDN.
- **Autenticación propia:** no usa Firebase Auth. Valida cédula + alias + institución contra la colección `users` de Firestore y guarda la sesión en `localStorage`.

---

## 2. Stack tecnológico y arquitectura

| Capa | Tecnología |
|------|------------|
| Lenguaje | JavaScript (ES modules), HTML5, CSS3 |
| UI/UX | Vanilla JS + CSS custom properties (tema oscuro dorado/marrón) |
| Base de datos | Firebase Firestore (modo cliente, reglas abiertas) |
| Auth | Custom client-side (`localStorage` key `polla_user`) |
| Librerías CDN extra | `jspdf@2.5.1`, `jszip@3.10.1` (solo en admin, para exportar respaldo ZIP/PDF) |
| Banderas | `https://flagcdn.com/` |
| Deploy | Cualquier hosting estático (Netlify, GitHub Pages, etc.) |

**No existen** en este repositorio:
- `package.json`, `package-lock.json`, ni ninguna herramienta de Node/npm.
- Build tools (Vite, Webpack, Rollup, Parcel, etc.).
- `pyproject.toml`, `Cargo.toml`, `composer.json`, `Makefile`, CI/CD configs.
- `.env`; la configuración de Firebase (incluyendo API key pública) está hardcodeada.
- Framework de testing automatizado.

Cada página HTML carga su propio módulo JS con `<script type="module" src="js/xxx.js?v=7.5"></script>` (o un módulo inline en `index.html`, `init-db.html`, `diagnostico.html` y `simular-grupos.html`).

---

## 3. Estructura de archivos y módulos

| Archivo | Propósito |
|---------|-----------|
| `index.html` | Login de participantes (cédula + alias + institución) y toggle para login de administrador. |
| `grupos.html` + `js/grupos.js` | Pantalla de predicciones de la fase de grupos (72 partidos). |
| `final.html` + `js/final.js` | Pantalla de predicciones de la fase final: wizard de 6 pasos (16avos → 8vos → 4tos → semis → 3er lugar → final) con cálculo dinámico de equipos según los propios pronósticos del participante. |
| `admin.html` + `js/admin.js` | Panel de administración: inicializar BD, reiniciar, ingresar resultados reales, generar fase final, habilitar fase final, recalcular puntajes, gestionar usuarios e instituciones, exportar respaldo ZIP/PDF. |
| `ranking.html` + `js/ranking.js` | Rankings separados: puntos de fase de grupos (`puntos_fase_grupos`) y puntos de fase final (`puntos_fase_final`), con filtro por institución. |
| `reglas.html` + `js/reglas.js` | Página pública de reglas; no requiere auth. |
| `init-db.html` | Herramienta de setup único: carga en Firestore los 72 partidos de grupos, los 32 partidos de la fase final, la institución por defecto (`GDR`) y la configuración inicial. |
| `diagnostico.html` | Herramienta de diagnóstico de conexión a Firebase. |
| `simular-grupos.html` | Herramienta de desarrollo: crea 5 usuarios simulados y les genera predicciones aleatorias de grupos. |
| `css/styles.css` | Hoja de estilos global con variables CSS y tema oscuro. |
| `js/firebase-config.js` | Inicializa Firebase y exporta `db`. La API key es pública y está hardcodeada. |
| `js/auth.js` | Helpers de sesión, credenciales de admin, `requireAuth`, `requireAdmin`, `logout`, `updateNav`. |
| `js/data.js` | Datos base: 48 equipos en 12 grupos, códigos ISO de banderas, generadores de fixture, cálculo de tablas y selección de los 8 mejores terceros. |

### Módulos JS principales

- **`firebase-config.js`**: punto único de inicialización de Firebase. Todos los demás módulos lo importan.
- **`auth.js`**: administra `localStorage` (`polla_user`). Credenciales admin hardcodeadas:
  - `ADMIN_USER = "ADMIN"`
  - `ADMIN_PASS = "Mirador12345"`
- **`data.js`**: contiene la fuente de verdad de los grupos y funciones puras para calcular tablas.
- **`grupos.js` / `final.js`**: controladores de página de participante.
- **`admin.js`**: controlador de administración (~2.300 líneas). Es el archivo más complejo; cualquier cambio en lógica de puntajes, resultados o gestión de usuarios probablemente toque este archivo.
- **`ranking.js`**: listeners en tiempo real sobre `users` y renderizado de tablas.
- **`reglas.js`**: muy pequeño, solo actualiza navegación.

---

## 4. Flujo de datos y colecciones de Firestore

### Colecciones utilizadas

| Colección | Contenido | ID de documento |
|-----------|-----------|-----------------|
| `partidos_grupos` | 72 partidos de fase de grupos. | `{grupo}{numero}` (ej. `A1`, `A2`, …) |
| `partidos_final` | 32 partidos de fase final. | `F1` … `F32` |
| `predicciones_grupos` | Predicciones de grupos de cada usuario. | `{cedula}_{alias}_{institucion}_{partidoId}` |
| `predicciones_final` | Predicciones de fase final de cada usuario. | `{cedula}_{alias}_{institucion}_{partidoId}` |
| `users` | Perfiles de usuario. | `{cedula}_{alias}` |
| `instituciones` | Instituciones disponibles. | ID en mayúsculas (ej. `GDR`) |
| `config/app_config` | Configuración global (`fase_actual`, `fase_final_habilitada`, `predicciones_grupos_abiertas`, `predicciones_final_abiertas`). | `app_config` |
| `_diagnostico/test` | Usada solo por `diagnostico.html` para prueba de escritura. | `test` |

### Campos clave en partidos

**Grupos (`partidos_grupos`):**
- `grupo`, `equipo1`, `equipo2`, `goles_equipo1`, `goles_equipo2`, `jugado`, `fecha`.

**Fase final (`partidos_final`):**
- `ronda`, `numero`, `equipo1`, `equipo2`, `goles_equipo1`, `goles_equipo2`.
- `penales_equipo1`, `penales_equipo2` (solo para definir clasificado en caso de empate).
- `jugado`, `ganador`.
- `source_equipo1`, `source_equipo2`: referencia al partido anterior (ej. `F1`) para calcular dinámicamente el equipo.
- `perdedor_source1`, `perdedor_source2`: booleanos que indican si el equipo proviene del **perdedor** del partido fuente (usado para el partido por el 3er lugar).

### IDs de predicciones

Tanto en `predicciones_grupos` como en `predicciones_final`, el ID del documento sigue el patrón:

```
{cedula}_{alias}_{institucion}_{partidoId}
```

Ejemplo: `1234567890_Luis_GDR_A1`.

Esto es importante al borrar o editar predicciones manualmente: siempre se usa `user_id`, `institucion` y `partido_id` como filtros, pero el `docId` final incluye la institución activa.

### Flujo de auth

1. `index.html` carga instituciones en un `<select>`.
2. Valida cédula + alias + institución.
3. Si el usuario existe, actualiza `instituciones` y `institucion_activa`; si es nuevo, crea el doc con puntos en cero. Se permite máximo 2 alias por cédula.
4. Guarda sesión en `localStorage` (`polla_user`) y redirige a `grupos.html`.
5. El admin ingresa con `ADMIN` / `Mirador12345` y se crea una sesión especial con `alias: "Administrador"` y rol admin.

---

## 5. Convenciones de desarrollo y estilo de código

- **Idioma principal:** español. Variables, comentarios, textos de UI y nombres de funciones están en español (ej. `cargarPartidos`, `guardarPredicciones`, `recalcularTodosLosPuntos`).
- **Indentación:** 2 espacios en HTML, CSS y JS.
- **Nombrado de archivos:** minúsculas con guiones (kebab-case): `firebase-config.js`, `simular-grupos.html`.
- **Módulos:** ES modules obligatorios. Imports locales con rutas relativas y cache-bust (`./firebase-config.js?v=7.5`). Imports de Firebase con URLs completas de CDN.
- **Cache busting:** la versión actual es `?v=7.5`, usada de forma casi global en CSS y JS. El footer también muestra "v7.5". Si se realiza un cambio estructural importante, se debe incrementar este número en **todos** los `<script>` y `<link>`.
  - Nota: `init-db.html` actualmente importa `./js/firebase-config.js` **sin** `?v=7.5`, lo cual es una inconsistencia menor.
- **CSS:** usa variables custom en `:root` (ej. `--bg-primary`, `--accent`, `--text-primary`). Diseño mobile-first con media query en `768px`.
- **Sin linter ni formateador configurado.** No hay `.eslintrc`, `.prettierrc`, etc.
- **Sin tests automatizados.**

---

## 6. Proceso de construcción y despliegue

### Build

No hay proceso de build. Abrir cualquier archivo `.html` directamente en un navegador sirve para desarrollo local, siempre y cuando haya conexión a Internet (los SDK de Firebase y librerías extra se cargan por CDN).

Para un entorno más cómodo se puede servir la raíz del repo con cualquier servidor estático, por ejemplo:

```bash
# Si se tiene Python instalado
python -m http.server 8080

# O con Node/npx (aunque no hay package.json en el proyecto)
npx serve .
```

### Despliegue

El despliegue recomendado es hosting estático (Netlify, GitHub Pages, Cloudflare Pages, etc.). Solo hay que servir la raíz del repositorio.

**No existen** scripts de deploy, GitHub Actions, `netlify.toml` ni configuraciones de CI.

### Configuración de Firebase

La configuración de Firebase está hardcodeada en:
- `js/firebase-config.js`
- `diagnostico.html` (repetida inline)

Si se migra a otro proyecto de Firebase, deben actualizarse **ambos** archivos.

---

## 7. Instrucciones de prueba y herramientas de desarrollo

### No hay tests automatizados

La estrategia de prueba es 100% manual y se apoya en tres páginas de soporte:

1. **`init-db.html`** — Setup inicial:
   - Crea los 72 partidos de grupos.
   - Crea los 32 partidos de fase final con placeholders dinámicos.
   - Crea la institución por defecto `GDR`.
   - Crea/actualiza `config/app_config` con `fase_final_habilitada: false`.
   - Uso: abrir en navegador y hacer clic en el botón de inicialización.
   - Nota: en la versión actual hay un pequeño bug en la línea ~142 donde se referencia una variable `instituciones` no definida en ese scope; el mensaje de éxito puede fallar si no se maneja.

2. **`diagnostico.html`** — Diagnóstico de Firebase:
   - Verifica que Firebase se inicialice correctamente.
   - Realiza una prueba de escritura en `_diagnostico/test`.
   - Muestra conteos de documentos en las colecciones principales.

3. **`simular-grupos.html`** — Simulación de usuarios:
   - Crea 5 usuarios ficticios (`SIM001` … `SIM005`).
   - Genera predicciones aleatorias para los 72 partidos de grupos.
   - Usa batches de 450 operaciones para respetar límites de Firestore.

### Flujo de prueba típico

1. Abrir `init-db.html` y cargar la base.
2. Ingresar como participante en `index.html`.
3. Completar predicciones de grupos en `grupos.html`.
4. En `admin.html`, ingresar resultados reales de grupos y luego generar la fase final.
5. Habilitar la fase final desde el panel de admin.
6. Completar predicciones de fase final en `final.html`.
7. Ingresar resultados reales de fase final en `admin.html` y recalcular puntajes.
8. Verificar rankings en `ranking.html`.

---

## 8. Consideraciones de seguridad

- **Autenticación propia y client-side:** no hay tokens ni sesiones server-side. La sesión se guarda en `localStorage` como un objeto JSON plano.
- **Credenciales de admin hardcodeadas:** en `js/auth.js` se definen:
  ```js
  export const ADMIN_USER = "ADMIN";
  export const ADMIN_PASS = "Mirador12345";
  ```
- **API key de Firebase pública:** visible en `firebase-config.js` y `diagnostico.html`. Esto es intencional para un proyecto de demostración con Firestore de reglas abiertas.
- **Firestore rules:** la aplicación asume reglas permisivas. Si se restringen, deben permitir lectura/escritura desde el cliente en: `partidos_grupos`, `partidos_final`, `predicciones_grupos`, `predicciones_final`, `users`, `instituciones`, `config`.
- **Cálculo de puntajes en el cliente:** `recalcularTodosLosPuntos()` corre enteramente en el navegador del admin y luego escribe los puntos en los documentos de usuario. No hay validación server-side de los puntajes.
- **Validación de entradas:** básica (`parseInt`, `min="0" max="20"`, verificación de nulos). No hay sanitización explícita contra XSS, aunque el uso de template literals con contenido controlado reduce el riesgo.
- **Instituciones inactivas:** `index.html` actualmente carga **todas** las instituciones sin filtrar por `activo !== false`, por lo que instituciones inactivas siguen apareciendo en el dropdown de login. Esto contradice lo documentado previamente y es un candidato a corrección si se desea respetar el flag `activo`.

---

## 9. Flujos de trabajo clave

### 9.1 Login y registro de participantes

- El usuario ingresa cédula, alias e institución.
- Se valida contra Firestore; se permite un máximo de 2 alias por cédula.
- Se guarda/actualiza el documento en `users/{cedula}_{alias}`.
- Se redirige a `grupos.html`.

### 9.2 Predicciones de fase de grupos

- `grupos.js` carga los partidos y las predicciones previas filtradas por `user_id` e `institucion`.
- Solo se guardan partidos con ambos goles ingresados.
- Los inputs se deshabilitan cuando el partido real está marcado como `jugado` **o cuando el admin cierra el plazo de predicciones** (`predicciones_grupos_abiertas: false`).
- Botón "Guardar Predicciones" persiste en `predicciones_grupos`.
- Si el plazo está cerrado, se muestra un mensaje en rojo y el botón de guardar queda deshabilitado.

### 9.3 Predicciones de fase final

- La página funciona como un wizard de 6 pasos.
- En 16avos se muestran los nombres reales de equipos cargados por el admin.
- Desde 8vos en adelante, los equipos se calculan dinámicamente (`calcularEquipoDinamico`) a partir de los propios pronósticos del participante.
- Si los goles están empatados, aparecen inputs de penales. Penales iguales no están permitidos.
- Hay dos botones:
  - **"Guardar Progreso"**: guarda lo completado hasta el momento, sin exigir todo el bracket.
  - **"Finalizar y Guardar Todo"**: solo se habilita cuando los 32 partidos son válidos.
- No existe un bloqueo backend tras "finalizar"; el participante puede seguir editando mientras la fase esté abierta.
- Si el admin cierra el plazo (`predicciones_final_abiertas: false`), todos los inputs se deshabilitan, los botones de guardado se ocultan/deshabilitan y se muestra un mensaje de plazo cerrado.

### 9.4 Ingreso de resultados reales (admin)

**Fase de grupos:**
- El admin completa goles en los inputs de `admin.html` y presiona "Guardar Resultados - Fase de Grupos".
- Se marcan automáticamente como `jugado: true` los partidos válidos.
- Al finalizar se ejecuta `recalcularTodosLosPuntos()`.

**Fase final:**
- Wizard de 6 pasos (`guardarRondaActual()`).
- Permite guardado parcial: solo se persisten los partidos válidos; los errores se reportan.
- Se pueden borrar resultados vaciando los inputs.
- Se limpian campos de penales cuando un partido deja de ser empate.
- El admin puede cambiar manualmente el nombre de cualquier equipo en cualquier ronda mediante "✏️ Cambiar".

### 9.5 Generación del cuadro de fase final

- Requisito: todos los partidos de grupos deben tener resultado (`jugado === true`).
- El sistema calcula las tablas de cada grupo (`calcularTablaGrupo`).
- Selecciona los 8 mejores terceros (`seleccionarMejoresTerceros`) usando criterios FIFA: pts → diferencia de gol → goles a favor.
- Actualiza **solo los 16 partidos de dieciseisavos** (`F1`–`F16`) con los nombres reales de equipos.
- Los 16 partidos restantes (`F17`–`F32`) ya fueron creados durante la inicialización de la BD con placeholders dinámicos ("Ganador F1", "Perdedor F29", etc.).
- Luego de generar, el admin debe habilitar explícitamente la fase final para que los participantes accedan a `final.html`.

### 9.6 Recálculo de puntajes

`admin.js` ejecuta `recalcularTodosLosPuntos()`:

**Grupos:**
- Resultado exacto: 3 pts.
- Acierta ganador o empate (pero no exacto): 1 pt.

**Fase final:**
- Resultado exacto a 90 min: 3 pts.
- Acierta ganador o empate a 90 min (pero no exacto): 1 pt.
- Acierta el equipo clasificado: 1 pt.
- **Máximo por partido: 4 pts** (3 por marcador exacto + 1 por clasificado).
- Los penales solo sirven para definir el clasificado; no otorgan puntos por sí mismos.

Los puntos se escriben de vuelta en `users` en batches de 400 operaciones para respetar los límites de Firestore.

### 9.7 Gestión de usuarios (admin)

- Búsqueda por cédula (query Firestore) o por alias (filtrado cliente).
- "Ver predicciones" muestra tablas con predicciones de grupos y final.
- "Borrar predicción" elimina un documento específico.
- "Eliminar usuario" borra el documento de usuario y **todas** sus predicciones.

### 9.8 Gestión de instituciones (admin)

- Agregar institución: ID en mayúsculas, descripción opcional, `activo: true`.
- Activar/desactivar instituciones con un toggle.
- Nota: como se mencionó en seguridad, la pantalla de login no filtra actualmente las inactivas.

---

## 10. Notas importantes e inconsistencias conocidas

Esta sección detalla discrepancias entre documentación anterior, comportamiento real del código y potenciales bugs a tener en cuenta antes de modificar el proyecto.

| Tema | Estado actual |
|------|---------------|
| **Generación de fase final** | Versiones anteriores de la documentación decían que "crea los 16 partidos restantes con placeholders". En realidad, **todos los 32 partidos de fase final se crean durante la inicialización de la BD** (`init-db.html`). La generación del cuadro solo **actualiza** los dieciseisavos (`F1`–`F16`) con equipos reales. |
| **Controles maestros de predicciones** | El admin puede abrir/cerrar la recepción de predicciones de grupos y final mediante toggles en `admin.html`. Cuando están cerrados, los participantes ven sus predicciones en modo solo lectura con un mensaje de plazo cerrado. Los campos `predicciones_grupos_abiertas` y `predicciones_final_abiertas` viven en `config/app_config` y defaultean a `true` si no existen. |
| **Instituciones inactivas en login** | `index.html` carga todas las instituciones sin filtrar por `activo`. Las inactivas siguen apareciendo en el dropdown de login. |
| **IDs de predicciones** | Tanto grupos como final usan el mismo patrón: `{cedula}_{alias}_{institucion}_{partidoId}`. La documentación anterior mencionaba que la fase final "también incluye institución", lo cual es cierto, pero no es diferente a grupos. |
| **Botón "Guardar" en fase final** | Existen dos botones: "Guardar Progreso" (siempre disponible) y "Finalizar y Guardar Todo" (requiere 32 válidos). La redacción anterior podía interpretarse como que el botón de guardar único se deshabilita; no es así. |
| **Detección de admin en ranking** | `ranking.js` usa `user.alias === 'ADMIN'`, pero la sesión de admin guarda `alias: 'Administrador'`. Por eso, el filtro de instituciones y las pestañas especiales de admin **no se muestran** para el administrador en `ranking.html`. |
| **Variable no definida en `init-db.html`** | En la línea ~142 se usa `instituciones.length` en un mensaje de éxito, pero `instituciones` no está definida en ese ámbito. Puede lanzar un error en consola tras inicializar. |
| **`reglas.html` y bloqueo de predicciones** | La página de reglas indica que las predicciones se bloquean permanentemente al guardar, pero en el código no existe un bloqueo backend; los inputs siguen editables mientras la fase esté habilitada. |
| **Cache busting inconsistente** | `init-db.html` importa `./js/firebase-config.js` sin `?v=7.5`. Todas las demás páginas usan la versión. |
| **Exportación PDF** | El admin puede exportar un ZIP/PDF de respaldo. `jspdf` no incluye fuentes personalizadas, por lo que caracteres especiales del español (tildes, eñes) pueden no renderizarse correctamente en el PDF. |

---

## 11. Pautas para agentes que modifiquen este proyecto

- **Mantén el stack simple:** no agregues bundlers, frameworks ni dependencias de Node salvo que el usuario lo solicite explícitamente.
- **Respeta el idioma español** para nombres de variables, funciones, comentarios y textos de UI.
- **Mantén la coherencia de IDs:** si cambias algo en la forma de generar IDs de predicciones o usuarios, actualiza también los lugares que borran/editan esos documentos (`admin.js`, `grupos.js`, `final.js`, `ranking.js`).
- **Cuidado con `admin.js`:** es un archivo muy grande. Antes de modificarlo, busca la función específica (`recalcularTodosLosPuntos`, `guardarRondaActual`, `btn-generar-fase-final`, etc.) y evita tocar lógica ajenas.
- **Firestore limits:** cualquier operación masiva (guardar predicciones, recalcular puntos, exportar datos) debe seguir usando batches de máximo 400-450 operaciones.
- **Actualiza `?v=X` si haces cambios estructurales** que deban invalidar la caché del navegador de los usuarios.
- **Si cambias la configuración de Firebase**, actualiza tanto `js/firebase-config.js` como `diagnostico.html`.
- **Si modificas reglas de negocio** (puntajes, cantidad de equipos, formato del bracket), actualiza también `reglas.html` y este `AGENTS.md` para mantener la documentación sincronizada.

---

Última actualización: 2026-06-10 (basada en la exploración del código actual del repositorio).
