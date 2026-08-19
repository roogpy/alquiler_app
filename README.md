# Alquiler de Vehículos

PWA para llevar el calendario de pagos diarios del alquiler de vehículos: qué días se
cobró, qué días no, cuánto entró cada mes y cuánto en total desde el primer día del
alquiler.

Sin backend: todo corre en el navegador y los datos viven en `localStorage` del
dispositivo (igual que `conductor_app`). Se puede instalar en el celular desde el
navegador ("Agregar a la pantalla de inicio") y funciona sin conexión.

## Archivos

| Archivo | Qué hace |
| --- | --- |
| `index.html` | Estructura: tabs Calendario / Resumen / Vehículos y barra inferior |
| `app.js` | Todo el modelo y el render (sin frameworks) |
| `styles.css` | Tema oscuro, grilla del calendario, tarjetas, gráfico de barras |
| `manifest.json` | Metadatos de la PWA |
| `sw.js` | Service worker: código network-first, resto cache-first |
| `icons/` | Iconos 192/512 (regenerables con PIL) |

## Cómo se usa

1. **Vehículos** → cargar nombre, inquilino (opcional), **monto diario**, **fecha de
   inicio del alquiler** y los **días de la semana en que se cobra** (por defecto los 7).
2. **Calendario** → cada día del mes se ve con su estado. Tocando un día se abre el
   detalle para marcarlo:
   - **✓ Pagado** — se guarda el monto recibido (por defecto el diario; se puede editar
     si pagó de menos o de más) y una nota opcional.
   - **✗ No pagó** — el día queda registrado como impago y suma al pendiente.
   - **— Sin cobro** — feriado, vehículo en taller, etc.: ese día no se espera plata.
   - **↺ Limpiar** — vuelve el día a su estado automático.

   El botón **Marcar hoy como pagado** hace lo de todos los días en un toque.
3. **Resumen** → total recibido desde el día 1, pendiente acumulado, días pagados sobre
   días esperados, promedio por día, tabla mes a mes y gráfico de los últimos 12 meses.
   El selector permite ver un vehículo o todos juntos.

### Estados del calendario

| Color | Estado | Significado |
| --- | --- | --- |
| Verde | Pagado | Se recibió el pago (muestra el monto abreviado) |
| Rojo | No pagó | Día vencido marcado como impago |
| Borde ámbar | Pendiente | Día de cobro ya pasado y todavía sin marcar |
| Gris | Sin cobro | Día de la semana no cobrable o marcado como libre |

El **pendiente** suma los días vencidos que no están marcados como pagados: los impagos
explícitos y los que quedaron sin tocar. Los días futuros no suman deuda, pero sí se
pueden marcar como pagados para registrar un adelanto.

## Respaldos

Los datos son locales al navegador: si se limpia el sitio o se cambia de teléfono, se
pierden. En **Vehículos → Copia de seguridad** están *Descargar respaldo* (JSON) y
*Restaurar respaldo*. El **Exportar CSV** del Resumen saca los pagos día por día para
abrir en Excel (separador `;`).

## Correr localmente

Tiene que servirse por HTTP (el service worker no arranca con `file://`):

```bash
python -m http.server 8741 --directory C:/alquiler_app
```

Después abrir <http://localhost:8741>.

## Publicada

<https://roogpy.github.io/alquiler_app/> — repo `roogpy/alquiler_app`, GitHub Pages
sirviendo `main` desde la raíz. Al ser todo estático no hay build: un `git push` a
`main` alcanza y la versión nueva entra en la siguiente apertura (el service worker
va network-first para el código).

### Instalar en el celular

- **Android / Chrome**: abrir la URL → menú ⋮ → *Agregar a la pantalla principal*
  (o *Instalar aplicación*).
- **iPhone / Safari**: abrir la URL → botón compartir → *Agregar a inicio*.

Queda como una app más, en pantalla completa y sin barra del navegador. Los datos son
por dispositivo: si se usa en dos teléfonos, cada uno lleva su propio calendario.
