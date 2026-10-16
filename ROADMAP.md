# Floto Roadmap

Documento vivo con el plan de iteraciones de Floto a partir de todo lo acordado durante las sesiones de trabajo.

## 0) Estado actual (baseline)

### Producto
- App desktop macOS con `Tauri + React + Rust`.
- Editor enfocado a look film/vintage con:
  - controles tonales,
  - simulación film por stock,
  - grano avanzado,
  - halation,
  - layers con blend modes,
  - recipes persistidas,
  - export full-res.

### UX y paneles
- Layout 3 columnas con panel central a altura completa.
- Sidebars con scroll.
- Preview con:
  - hold original,
  - split before/after con slider,
  - zoom + pan,
  - zoom anclado al cursor.

### Engine
- Pipeline no destructivo en Rust (`src-tauri/src/lib.rs`).
- Preview dinámica con modo draft durante interacción.
- Grano refactorizado para evitar look pixelado (value-noise + clumping + chroma).
- Halation reforzado para mejor visibilidad.

### Frontend architecture
- Refactor avanzado aplicado:
  - `EditorRuntime` como orquestador,
  - componentes separados (`EditorToolbar`, `ToneSidebar`, `PreviewViewport`, `LayersSidebar`),
  - hooks por responsabilidad (`useEditorState`, `useRenderQueue`, `usePreviewInteraction`, `useSourceLayerInput`, `useExportFlow`, `useBootAndOriginalPreview`, etc.),
  - mensajes de estado centralizados.

---

## 1) Objetivo macro

Pasar de un editor estilizado muy capaz a una experiencia **pro-grade** en:
- fidelidad de emulación film,
- consistencia de color,
- rendimiento en imágenes grandes,
- mantenibilidad del código para iterar rápido sin regresiones.

---

## 2) Backlog priorizado por iteraciones

## Iteración A - Calidad de preview y usabilidad pro

### A.1 Pan/zoom UX polish
- Doble click para `fit-to-screen`.
- Atajos teclado (`+`, `-`, `0`, `space+drag` opcional).
- Indicador visual de modo pan activo.

### A.2 Before/After
- Drag directo sobre la línea de split (además del slider inferior).
- Opciones de compare: split vertical/horizontal.

### A.3 Layer panel
- Reordenación drag&drop de capas.
- Visual más clara del estado enabled/disabled.

**DoD A**
- Sin regresiones en zoom/pan/split.
- FPS de preview estable en casos medios.

---

## Iteración B - Film emulation v2

### B.1 Grain character v2
- Mantener controles actuales (`grain`, `size`, `clump`, `chroma`, `softness`).
- Añadir calibraciones por stock y nivel ISO con curvas propias.

### B.2 Halation v2
- Mejorar detección de highlights por edge/high-frequency.
- Separar radio y difusión real para evitar glow plano.

### B.3 Perfilado de stocks
- Refinar Portra/HP5 en escenas de referencia.
- Añadir metadata interna de perfiles para recipes más trazables.

**DoD B**
- Comparativas A/B reproducibles contra referencias.
- Presets más distinguibles y consistentes entre fotos.

---

## Iteración C - Rendimiento y escalado

### C.1 Motor
- Optimizar halation (ROI/downsample/selective passes).
- Revisar paralelización Rayon en etapas hot.

### C.2 Preview pipeline
- Scheduler de renders más inteligente (cancel/coalesce agresivo).
- Revisión de cache para evitar recomputes innecesarios.

### C.3 Imágenes grandes
- Empezar renderer por tiles para preview/export.

**DoD C**
- Mejora medible en latencia de sliders.
- Export robusto en imágenes grandes sin bloqueos largos.

---

## Iteración D - Arquitectura pro y calidad técnica

### D.1 API frontend/backend
- Consolidar contrato tipado de commands Tauri.
- Gestión de errores y códigos normalizados.

### D.2 Testing
- Tests unitarios de hooks críticos:
  - `usePreviewInteraction`,
  - `useRenderQueue`,
  - `useSourceLayerInput`,
  - `useEditorState`.
- Tests de integración para flujos clave (open > edit > compare > export).

### D.3 Observabilidad local
- Telemetría mínima dev: tiempos de render por etapa.

**DoD D**
- Cobertura básica en módulos de riesgo.
- Alertas tempranas de regresión en performance.

---

## Iteración E - Road to pro-grade color pipeline

### E.1 Color science
- Estudiar pipeline lineal + mayor precisión (16-bit/float en etapas clave).
- Evaluar consistencia de color entre pantallas/sistemas.

### E.2 Librerías especializadas
- Evaluar adopción parcial para operadores críticos (blur/halation/resampling/color transforms).
- Mantener `lib.rs` como orquestación y firma visual propia.

### E.3 GPU preview
- Prototipo de ruta GPU para interacción real-time.

**DoD E**
- Decisión técnica documentada (keep/build/buy por subsistema).

---

## 3) Workstreams paralelos

## Producto/UX
- Definir presets “hero” (3-5) listos para demo.
- Diseñar flujo de recipes “pro” (save, duplicate, rename, compare).

## Engine
- Banco de imágenes de test (piel, luces nocturnas, alto contraste, B/N).
- Métricas de calidad visual por release.

## Ingeniería
- Reducir superficie de `App` al mínimo y mantener capa runtime limpia.
- Documentar arquitectura de hooks/componentes en `README`.

---

## 4) Riesgos y mitigación

- **Riesgo:** degradación de performance por más realismo.
  - **Mitigación:** feature flags de calidad (draft/high), profiling continuo.

- **Riesgo:** look inconsistente entre fotos.
  - **Mitigación:** dataset de referencia + tuning por escenas.

- **Riesgo:** deuda de frontend al crecer funcionalidades.
  - **Mitigación:** mantener separación por hooks/feature y tests en módulos críticos.

---

## 5) Próximos pasos inmediatos (sprint siguiente)

1. Drag directo de la línea before/after en `PreviewViewport`.
2. Pulido de pan/zoom (fit-to-screen y atajos básicos).
3. Tests unitarios de `usePreviewInteraction` y `useRenderQueue`.
4. Perfilado rápido de halation + grano con 3 imágenes de referencia.

---

## 6) Nota de ejecución

Este roadmap se actualizará por iteración cerrada, incluyendo:
- cambios entregados,
- métricas de rendimiento,
- ajustes de prioridad según feedback visual real.
