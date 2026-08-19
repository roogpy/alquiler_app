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
| `index.html` | Estructura: tabs Calendario / Resumen / Taller / Vehículos y barra inferior |
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
   - **• Pendiente** — todavía debe ese diario. Suma al pendiente igual que el impago;
     la nota sirve para anotar el arreglo ("paga el lunes").
   - **🔧 En taller** — el auto estuvo con el mecánico: no se cobra el diario y el día
     suma al contador de *días en taller*. La **nota** queda para anotar el trabajo.
   - **— Sin cobro** — feriado, vehículo parado: ese día no se espera plata.
   - **↺ Limpiar** — vuelve el día a su estado automático.

   El botón **Marcar hoy como pagado** hace lo de todos los días en un toque. Abajo del
   calendario está el form de **pago adicional**, para los cobros por fuera del diario
   (el 50% de un arreglo, una multa): llevan fecha, monto y concepto, no cuentan como
   día pagado y marcan el día con un `+` en el calendario.
3. **Resumen** → con **rango de fechas** (por defecto todo el alquiler): recibido total,
   pendiente, **días pagados / esperados**, **días en taller**, cobros diarios contra
   pagos adicionales, la lista de **días pendientes de cobro** con cuántos días de
   atraso lleva cada uno, tabla mes a mes y gráfico de los últimos 12 meses. El selector
   permite ver un vehículo o todos juntos.
4. **Taller** → **último mantenimiento general** y **última rotación de cubiertas**, cada
   uno con su fecha, el kilometraje de ese día y hace cuántos días fue. Debajo, el form
   para registrar un trabajo (tipo, fecha, km, costo, detalle) y el historial completo.
   Tildando *Cobrar el 50% al inquilino* se crea solo el pago adicional por la mitad del
   costo.

### Estados del calendario

| Color | Estado | Significado |
| --- | --- | --- |
| Verde | Pagado | Se recibió el pago (muestra el monto abreviado) |
| Rojo | No pagó | Día vencido marcado como impago |
| Borde ámbar | Pendiente | Marcado a mano: debe ese diario |
| Azul 🔧 | En taller | Día con el mecánico: no se cobra y se cuenta aparte |
| Gris | Sin cobro | Día de la semana no cobrable o marcado como libre |
| Neutro | Sin marcar | Día de cobro que pasó y todavía no se clasificó |

El **pendiente** suma únicamente los días marcados a mano como **Pendiente** o
**No pagó**. Un día de cobro que pasó y quedó **sin marcar** no es deuda: se cuenta
aparte, en la tarjeta *Sin marcar* del Resumen, para no inventar deuda que no existe.
Los días futuros tampoco suman, pero sí se pueden marcar como pagados para registrar un
adelanto.

Los días **en taller** y los **sin cobro** no generan deuda: no entran en los días
esperados, no suman al pendiente y no aparecen en la lista de días pendientes. El
Resumen lo dice en la tarjeta de pendientes (cuántos días fueron y cuánto diario
representan) y los muestra en su propia columna *Taller* de la tabla mensual.

## Respaldos

Los datos son locales al navegador: si se limpia el sitio o se cambia de teléfono, se
pierden. En **Vehículos → Copia de seguridad** están *Descargar respaldo* (JSON) y
*Restaurar respaldo*. El **Exportar CSV** del Resumen saca todo ordenado por fecha para
abrir en Excel (separador `;`), con una columna `tipo` que distingue `diario`,
`adicional` y `taller`.

Los respaldos de la primera versión (sin adicionales ni trabajos) se restauran igual:
esos dos bloques quedan vacíos.

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
