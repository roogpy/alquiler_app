// ---------- Datos ----------
// Un solo objeto en localStorage:
//   vehiculos  -> alta de cada auto (monto diario, inicio, dias que se cobra)
//   pagos      -> por vehiculo, mapa fecha -> estado del dia (solo los dias tocados)
//   extras     -> por vehiculo, cobros por fuera del diario (50% de un arreglo, etc.)
//   servicios  -> por vehiculo, trabajos de taller con fecha y kilometraje
const STORE_KEY = 'alquiler-datos-v1';

const ESTADOS = {
  pagado: { etiqueta: 'Pagado' },
  impago: { etiqueta: 'No pagó' },
  pendiente: { etiqueta: 'Pendiente' },
  taller: { etiqueta: 'En taller' },
  libre:  { etiqueta: 'Sin cobro' },
  sinmarcar: { etiqueta: 'Sin marcar' },
};

// Los unicos estados que se cuentan como plata que falta entrar. Un dia del
// pasado sin tocar NO entra: solo es deuda lo que se marca a mano.
const ESTADOS_DEUDA = ['impago', 'pendiente'];

const TIPOS_SERVICIO = {
  mantenimiento: 'Mantenimiento general',
  cubiertas: 'Rotación de cubiertas',
  otro: 'Otro trabajo',
};

// Orden lunes -> domingo, con el indice que devuelve Date.getDay().
const DIAS_SEMANA = [
  { dow: 1, corto: 'L' }, { dow: 2, corto: 'M' }, { dow: 3, corto: 'X' },
  { dow: 4, corto: 'J' }, { dow: 5, corto: 'V' }, { dow: 6, corto: 'S' },
  { dow: 0, corto: 'D' },
];

let datos = { vehiculos: [], pagos: {}, extras: {}, servicios: {} };
try {
  const guardado = JSON.parse(localStorage.getItem(STORE_KEY));
  if (guardado && Array.isArray(guardado.vehiculos)) {
    datos = {
      vehiculos: guardado.vehiculos,
      pagos: guardado.pagos || {},
      extras: guardado.extras || {},
      servicios: guardado.servicios || {},
    };
  }
} catch (e) { /* datos corruptos: se arranca vacio */ }

function guardar() {
  localStorage.setItem(STORE_KEY, JSON.stringify(datos));
}

// ---------- Utilidades ----------
function fmt(n) { return '₲ ' + Math.round(n).toLocaleString('es-PY'); }

function fmtKm(n) { return Math.round(n).toLocaleString('es-PY') + ' km'; }

function fmtCorto(n) {
  const abs = Math.abs(n);
  if (abs < 1000) return String(Math.round(n));
  if (abs < 1000000) return Math.round(n / 1000) + 'k';
  return (n / 1000000).toFixed(1).replace('.', ',') + 'M';
}

function aISO(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function hoyISO() { return aISO(new Date()); }

function aFecha(iso) {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(a, m - 1, d);
}

function sumarDias(iso, n) {
  const f = aFecha(iso);
  f.setDate(f.getDate() + n);
  return aISO(f);
}

function diasEntre(desde, hasta) {
  return Math.round((aFecha(hasta) - aFecha(desde)) / 86400000);
}

function fechaLegible(iso, conAnio) {
  const opts = { weekday: 'long', day: 'numeric', month: 'long' };
  if (conAnio) opts.year = 'numeric';
  return aFecha(iso).toLocaleDateString('es-PY', opts);
}

function fechaCorta(iso) {
  return aFecha(iso).toLocaleDateString('es-PY', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function mesLegible(clave, conAnio) {
  const [a, m] = clave.split('-').map(Number);
  return new Date(a, m - 1, 1).toLocaleDateString('es-PY', conAnio ? { month: 'long', year: 'numeric' } : { month: 'long' });
}

function claveMes(iso) { return iso.slice(0, 7); }

function diasDelMes(a, m) { return new Date(a, m, 0).getDate(); }

function mesSiguiente(clave) {
  const [a, m] = clave.split('-').map(Number);
  return m === 12 ? (a + 1) + '-01' : a + '-' + String(m + 1).padStart(2, '0');
}

function mesAnterior(clave) {
  const [a, m] = clave.split('-').map(Number);
  return m === 1 ? (a - 1) + '-12' : a + '-' + String(m - 1).padStart(2, '0');
}

function finDeMes(clave) {
  const [a, m] = clave.split('-').map(Number);
  return clave + '-' + String(diasDelMes(a, m)).padStart(2, '0');
}

// ---------- Separador de miles en los campos numericos ----------
function formatoMiles(texto) {
  const digitos = String(texto).replace(/\D/g, '').replace(/^0+(?=\d)/, '');
  return digitos ? Number(digitos).toLocaleString('es-PY') : '';
}

function montoDe(input) { return Number(input.value.replace(/\D/g, '')); }

function conSeparadorMiles(input) {
  input.addEventListener('input', () => {
    const digitosAntes = input.value.slice(0, input.selectionStart).replace(/\D/g, '').length;
    input.value = formatoMiles(input.value);
    // Recolocar el cursor contando digitos: si no, los puntos que se agregan
    // lo empujan al final y no se puede corregir el medio del numero.
    let i = 0, vistos = 0;
    while (i < input.value.length && vistos < digitosAntes) {
      if (/\d/.test(input.value[i])) vistos++;
      i++;
    }
    input.setSelectionRange(i, i);
  });
}

function descargar(nombre, contenido, tipo) {
  const url = URL.createObjectURL(new Blob([contenido], { type: tipo }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------- Modelo ----------
function vehiculoPorId(id) { return datos.vehiculos.find(v => v.id === id) || null; }

function registro(v, iso) { return (datos.pagos[v.id] || {})[iso] || null; }

function extrasDe(v) { return datos.extras[v.id] || []; }

function serviciosDe(v) { return datos.servicios[v.id] || []; }

// Estado de un dia para un vehiculo:
//   fuera     -> anterior al inicio del alquiler
//   pagado / impago / pendiente / taller / libre -> marcado a mano
//   libre     -> dia de la semana en el que no se cobra
//   futuro    -> todavia no llego
//   sinmarcar -> dia de cobro ya pasado que todavia no se clasifico
function estadoDia(v, iso) {
  if (iso < v.inicio) return 'fuera';
  const reg = registro(v, iso);
  if (reg) return reg.estado;
  if (!v.dias.includes(aFecha(iso).getDay())) return 'libre';
  if (iso > hoyISO()) return 'futuro';
  return 'sinmarcar';
}

function montoCobrado(v, iso) {
  const reg = registro(v, iso);
  return reg && reg.estado === 'pagado' ? Number(reg.monto) || 0 : 0;
}

// Recorre los dias de un rango y acumula lo cobrado, lo que falta y los dias.
// Solo generan deuda los dias marcados como Pendiente o No pago: los que
// quedaron sin marcar se cuentan aparte y no ensucian el total.
function acumular(v, desde, hasta) {
  const hoy = hoyISO();
  const inicio = desde < v.inicio ? v.inicio : desde;
  const total = {
    cobrado: 0, deuda: 0, extras: 0, diarioTaller: 0,
    diasPagados: 0, diasEsperados: 0, diasImpagos: 0, diasTaller: 0, diasSinMarcar: 0,
    pendientes: [],
  };

  for (let iso = inicio; iso <= hasta; iso = sumarDias(iso, 1)) {
    const estado = estadoDia(v, iso);
    if (estado === 'pagado') {
      total.cobrado += montoCobrado(v, iso);
      if (iso <= hoy) { total.diasPagados++; total.diasEsperados++; }
      continue;
    }
    // Dia en taller: no se espera el diario, asi que no suma deuda ni entra
    // en los dias esperados. Se guarda aparte cuanto diario representa.
    if (estado === 'taller' && iso <= hoy) {
      total.diasTaller++;
      total.diarioTaller += Number(v.monto) || 0;
      continue;
    }
    if (iso > hoy || estado === 'fuera' || estado === 'futuro') continue;
    // Dia de cobro que paso y quedo sin clasificar: se avisa, no se cobra.
    if (estado === 'sinmarcar') { total.diasSinMarcar++; continue; }
    if (!ESTADOS_DEUDA.includes(estado)) continue;

    total.diasEsperados++;
    total.deuda += Number(v.monto) || 0;
    if (estado === 'impago') total.diasImpagos++;
    total.pendientes.push({ fecha: iso, vehiculo: v, monto: Number(v.monto) || 0, estado });
  }

  extrasDe(v).forEach(x => {
    if (x.fecha >= desde && x.fecha <= hasta) total.extras += Number(x.monto) || 0;
  });

  return total;
}

function acumularVehiculos(vehiculos, desde, hasta) {
  const total = {
    cobrado: 0, deuda: 0, extras: 0, diarioTaller: 0,
    diasPagados: 0, diasEsperados: 0, diasImpagos: 0, diasTaller: 0, diasSinMarcar: 0,
    pendientes: [],
  };
  vehiculos.forEach(v => {
    const t = acumular(v, desde, hasta);
    Object.keys(total).forEach(k => {
      if (k === 'pendientes') total.pendientes = total.pendientes.concat(t.pendientes);
      else total[k] += t[k];
    });
  });
  return total;
}

function inicioMasViejo(vehiculos) {
  return vehiculos.reduce((min, v) => (!min || v.inicio < min ? v.inicio : min), null);
}

// Ultima fecha con movimiento: sirve para no dejar afuera un adelanto o un
// pago adicional cargado con fecha futura.
function ultimoMovimiento(vehiculos) {
  let ultimo = hoyISO();
  vehiculos.forEach(v => {
    Object.keys(datos.pagos[v.id] || {}).forEach(iso => { if (iso > ultimo) ultimo = iso; });
    extrasDe(v).forEach(x => { if (x.fecha > ultimo) ultimo = x.fecha; });
  });
  return ultimo;
}

function ultimoServicio(v, tipo) {
  return serviciosDe(v)
    .filter(s => s.tipo === tipo)
    .sort((a, b) => b.fecha.localeCompare(a.fecha))[0] || null;
}

// ---------- Estado de la UI ----------
let vehSel = datos.vehiculos.length ? datos.vehiculos[0].id : null;
let mesSel = hoyISO().slice(0, 7);
let diaSel = null;
let editando = null;        // id del vehiculo en edicion
let editandoServicio = null; // id del trabajo en edicion
let diasForm = [1, 2, 3, 4, 5, 6, 0];
let rangoManual = false;     // el usuario toco las fechas del Resumen

const $ = id => document.getElementById(id);

// ---------- Selectores de vehiculo ----------
function opcionesVehiculo(select, conTodos) {
  const previo = select.value;
  select.innerHTML = '';
  if (conTodos) {
    const todos = document.createElement('option');
    todos.value = '';
    todos.textContent = 'Todos los vehículos';
    select.appendChild(todos);
  }
  datos.vehiculos.forEach(v => {
    const o = document.createElement('option');
    o.value = v.id;
    o.textContent = v.nombre + (v.inquilino ? ' — ' + v.inquilino : '');
    select.appendChild(o);
  });
  if (conTodos) select.value = datos.vehiculos.some(v => v.id === previo) ? previo : '';
  else if (vehSel) select.value = vehSel;
}

function renderSelectores() {
  const hay = datos.vehiculos.length > 0;
  $('sin-vehiculos').hidden = hay;
  $('bloque-calendario').hidden = !hay;

  if (hay && !vehiculoPorId(vehSel)) vehSel = datos.vehiculos[0].id;

  opcionesVehiculo($('cal-vehiculo'), false);
  opcionesVehiculo($('tal-vehiculo'), false);
  opcionesVehiculo($('res-vehiculo'), true);
}

// ---------- Tab Calendario ----------
function renderCalendario() {
  if (!datos.vehiculos.length) return;
  const v = vehiculoPorId(vehSel);
  if (!v) return;

  const [anio, mes] = mesSel.split('-').map(Number);
  $('mes-titulo').textContent = mesLegible(mesSel, true);

  const dow = $('cal-dow');
  dow.innerHTML = '';
  DIAS_SEMANA.forEach(d => {
    const s = document.createElement('span');
    s.textContent = d.corto;
    dow.appendChild(s);
  });

  const grilla = $('cal-grilla');
  grilla.innerHTML = '';

  // Huecos hasta el primer dia: la semana arranca el lunes.
  const primerDow = new Date(anio, mes - 1, 1).getDay();
  for (let i = 0; i < (primerDow + 6) % 7; i++) {
    const h = document.createElement('div');
    h.className = 'dia hueco';
    grilla.appendChild(h);
  }

  const hoy = hoyISO();
  const conExtra = {};
  extrasDe(v).forEach(x => { if (claveMes(x.fecha) === mesSel) conExtra[x.fecha] = true; });

  const total = diasDelMes(anio, mes);
  for (let d = 1; d <= total; d++) {
    const iso = mesSel + '-' + String(d).padStart(2, '0');
    const estado = estadoDia(v, iso);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'dia ' + estado;
    if (iso === hoy) btn.classList.add('hoy');
    if (iso === diaSel) btn.classList.add('sel');
    if (conExtra[iso]) btn.classList.add('con-extra');
    btn.dataset.fecha = iso;
    btn.disabled = estado === 'fuera';

    const num = document.createElement('span');
    num.textContent = d;
    const marca = document.createElement('span');
    marca.className = 'marca';
    if (estado === 'pagado') marca.textContent = fmtCorto(montoCobrado(v, iso));
    else if (estado === 'impago') marca.textContent = '✗';
    else if (estado === 'taller') marca.textContent = '🔧';
    else if (estado === 'pendiente') marca.textContent = '•';
    else marca.textContent = ' ';
    if (estado === 'sinmarcar') btn.title = 'Sin marcar';
    btn.append(num, marca);
    grilla.appendChild(btn);
  }

  const t = acumular(v, mesSel + '-01', finDeMes(mesSel));
  $('mes-cobrado').textContent = fmt(t.cobrado + t.extras);
  const deuda = $('mes-deuda');
  deuda.textContent = fmt(t.deuda);
  deuda.classList.toggle('hay', t.deuda > 0);
  $('mes-dias').textContent = t.diasPagados + ' / ' + t.diasEsperados;
  $('mes-taller').textContent = t.diasTaller;
  $('mes-extras').textContent = fmt(t.extras);

  renderDetalle();
  renderListaMes();
  renderExtras();
}

function renderDetalle() {
  const caja = $('detalle-dia');
  const v = vehiculoPorId(vehSel);
  if (!diaSel || !v) { caja.hidden = true; return; }
  caja.hidden = false;

  const estado = estadoDia(v, diaSel);
  const reg = registro(v, diaSel);
  $('detalle-titulo').textContent = fechaLegible(diaSel, true);

  const desc = estado === 'pendiente' ? 'Pendiente: debe ' + fmt(v.monto)
    : estado === 'sinmarcar' ? 'Sin marcar — no cuenta como deuda hasta que lo marques'
    : estado === 'futuro' ? 'Día futuro (podés registrar un adelanto)'
    : estado === 'taller' ? 'En taller — no se cobra el diario'
    : ESTADOS[estado] ? ESTADOS[estado].etiqueta : '';
  $('detalle-estado').textContent = desc;

  $('detalle-monto').value = formatoMiles(reg && reg.estado === 'pagado' ? reg.monto : v.monto);
  $('detalle-nota').value = reg && reg.nota ? reg.nota : '';
}

function renderListaMes() {
  const lista = $('lista-mes');
  lista.innerHTML = '';
  const v = vehiculoPorId(vehSel);
  if (!v) return;

  const marcados = Object.entries(datos.pagos[v.id] || {})
    .filter(([iso]) => claveMes(iso) === mesSel)
    .sort((a, b) => b[0].localeCompare(a[0]));

  if (!marcados.length) {
    const li = document.createElement('li');
    li.className = 'vacio';
    li.textContent = 'Sin días marcados en este mes. Tocá un día del calendario para registrarlo.';
    lista.appendChild(li);
    return;
  }

  marcados.forEach(([iso, reg]) => {
    const li = document.createElement('li');

    const chip = document.createElement('span');
    chip.className = 'chip ' + reg.estado;
    chip.textContent = ESTADOS[reg.estado].etiqueta;

    const det = document.createElement('div');
    det.className = 'detalle';
    const titulo = document.createElement('span');
    titulo.textContent = fechaLegible(iso, false);
    det.appendChild(titulo);
    if (reg.nota) {
      const small = document.createElement('small');
      small.textContent = reg.nota;
      det.appendChild(small);
    }

    const monto = document.createElement('span');
    monto.className = 'monto ' + (reg.estado === 'pagado' ? 'positivo' : 'negativo');
    monto.textContent = reg.estado === 'pagado' ? fmt(reg.monto)
      : ESTADOS_DEUDA.includes(reg.estado) ? '−' + fmt(v.monto) : '—';

    const borrar = document.createElement('button');
    borrar.className = 'icono borrar';
    borrar.type = 'button';
    borrar.textContent = '🗑';
    borrar.title = 'Quitar la marca de este día';
    borrar.addEventListener('click', () => {
      delete datos.pagos[v.id][iso];
      guardar();
      renderTodo();
    });

    li.append(chip, det, monto, borrar);
    lista.appendChild(li);
  });
}

function renderExtras() {
  const lista = $('lista-extras');
  lista.innerHTML = '';
  const v = vehiculoPorId(vehSel);
  if (!v) return;

  const delMes = extrasDe(v)
    .filter(x => claveMes(x.fecha) === mesSel)
    .sort((a, b) => b.fecha.localeCompare(a.fecha));

  if (!delMes.length) {
    const li = document.createElement('li');
    li.className = 'vacio';
    li.textContent = 'Sin pagos adicionales en ' + mesLegible(mesSel, false) + '.';
    lista.appendChild(li);
    return;
  }

  delMes.forEach(x => {
    const li = document.createElement('li');

    const chip = document.createElement('span');
    chip.className = 'chip extra';
    chip.textContent = 'Extra';

    const det = document.createElement('div');
    det.className = 'detalle';
    const titulo = document.createElement('span');
    titulo.textContent = x.concepto || 'Pago adicional';
    const small = document.createElement('small');
    small.textContent = fechaLegible(x.fecha, false);
    det.append(titulo, small);

    const monto = document.createElement('span');
    monto.className = 'monto positivo';
    monto.textContent = fmt(x.monto);

    const borrar = document.createElement('button');
    borrar.className = 'icono borrar';
    borrar.type = 'button';
    borrar.textContent = '🗑';
    borrar.title = 'Eliminar el pago adicional';
    borrar.addEventListener('click', () => {
      datos.extras[v.id] = extrasDe(v).filter(y => y.id !== x.id);
      guardar();
      renderTodo();
    });

    li.append(chip, det, monto, borrar);
    lista.appendChild(li);
  });
}

function marcarDia(iso, estado) {
  const v = vehiculoPorId(vehSel);
  if (!v) return;
  if (!datos.pagos[v.id]) datos.pagos[v.id] = {};

  if (estado === 'limpiar') {
    delete datos.pagos[v.id][iso];
  } else {
    const nota = $('detalle-nota').value.trim();
    const monto = estado === 'pagado' ? (montoDe($('detalle-monto')) || Number(v.monto) || 0) : 0;
    datos.pagos[v.id][iso] = { estado, monto, nota };
  }
  guardar();
  renderTodo();
}

// ---------- Tab Resumen ----------
function vehiculosDelResumen() {
  const id = $('res-vehiculo').value;
  return id ? datos.vehiculos.filter(v => v.id === id) : datos.vehiculos;
}

// Rango por defecto: todo el alquiler. Si el usuario escribio fechas, mandan
// las suyas (rangoManual) hasta que apriete "Todo el alquiler".
function rangoResumen(vehiculos) {
  const desdeInput = $('res-desde-input');
  const hastaInput = $('res-hasta-input');
  const inicio = inicioMasViejo(vehiculos);
  const fin = ultimoMovimiento(vehiculos);

  if (!rangoManual || !desdeInput.value || !hastaInput.value) {
    desdeInput.value = inicio || hoyISO();
    hastaInput.value = fin;
  }
  let desde = desdeInput.value;
  let hasta = hastaInput.value;
  if (desde > hasta) { const x = desde; desde = hasta; hasta = x; }
  return { desde, hasta };
}

function renderResumen() {
  const vehiculos = vehiculosDelResumen();
  const tabla = $('res-tabla');
  const grafico = $('res-grafico');
  const pendientes = $('res-pendientes');
  tabla.innerHTML = '';
  grafico.innerHTML = '';
  pendientes.innerHTML = '';

  if (!vehiculos.length) {
    ['res-total', 'res-deuda', 'res-diario', 'res-extras', 'res-pendientes-total', 'res-grafico-total']
      .forEach(id => { $(id).textContent = fmt(0); });
    $('res-dias').textContent = '0 / 0';
    $('res-taller').textContent = '0';
    $('res-sinmarcar').textContent = '0';
    $('res-rango').textContent = 'Historial';
    tabla.innerHTML = '<p class="vacio">Todavía no hay alquileres cargados.</p>';
    return;
  }

  const { desde, hasta } = rangoResumen(vehiculos);
  const t = acumularVehiculos(vehiculos, desde, hasta);

  $('res-total').textContent = fmt(t.cobrado + t.extras);
  const deuda = $('res-deuda');
  deuda.textContent = fmt(t.deuda);
  deuda.classList.toggle('hay', t.deuda > 0);
  $('res-dias').textContent = t.diasPagados + ' / ' + t.diasEsperados;
  $('res-taller').textContent = t.diasTaller;
  $('res-sinmarcar').textContent = t.diasSinMarcar;
  $('res-diario').textContent = fmt(t.cobrado);
  $('res-extras').textContent = fmt(t.extras);
  $('res-rango').textContent = 'Del ' + fechaLegible(desde, true) + ' al ' + fechaLegible(hasta, true);

  // Dias adeudados, del mas reciente al mas viejo. Los dias en taller y los
  // sin cobro no entran: no se esperaba plata de esos dias, asi que no son
  // deuda ni figuran en la lista.
  $('res-pendientes-total').textContent = fmt(t.deuda);
  const partes = ['Acá solo entra lo que marcaste como Pendiente o No pagó.'];
  if (t.diasSinMarcar) {
    partes.push('Hay ' + t.diasSinMarcar + (t.diasSinMarcar === 1 ? ' día de cobro sin marcar' : ' días de cobro sin marcar') +
      ': no cuentan como deuda hasta que los marques.');
  }
  if (t.diasTaller) {
    partes.push(t.diasTaller + (t.diasTaller === 1 ? ' día en taller' : ' días en taller') +
      ' (' + fmt(t.diarioTaller) + ' de diario) tampoco suman.');
  }
  $('res-nota-taller').textContent = partes.join(' ');
  const ordenados = t.pendientes.sort((a, b) => b.fecha.localeCompare(a.fecha));
  if (!ordenados.length) {
    const li = document.createElement('li');
    li.className = 'vacio';
    li.textContent = 'Sin pendientes marcados en este período.';
    pendientes.appendChild(li);
  } else {
    ordenados.slice(0, 30).forEach(p => {
      const li = document.createElement('li');

      const chip = document.createElement('span');
      chip.className = 'chip ' + p.estado;
      chip.textContent = p.estado === 'impago' ? 'No pagó' : 'Pendiente';

      const det = document.createElement('div');
      det.className = 'detalle';
      const titulo = document.createElement('span');
      titulo.textContent = fechaLegible(p.fecha, false);
      det.appendChild(titulo);
      const small = document.createElement('small');
      const atraso = diasEntre(p.fecha, hoyISO());
      small.textContent = p.vehiculo.nombre + (atraso > 0 ? ' · hace ' + atraso + (atraso === 1 ? ' día' : ' días') : '');
      det.appendChild(small);

      const monto = document.createElement('span');
      monto.className = 'monto negativo';
      monto.textContent = fmt(p.monto);

      li.append(chip, det, monto);
      pendientes.appendChild(li);
    });
    if (ordenados.length > 30) {
      const li = document.createElement('li');
      li.className = 'vacio';
      li.textContent = 'y ' + (ordenados.length - 30) + ' días más.';
      pendientes.appendChild(li);
    }
  }

  // Una fila por mes dentro del rango.
  const meses = [];
  let cursor = claveMes(desde);
  const ultimoMes = claveMes(hasta);
  while (cursor <= ultimoMes) {
    const ini = cursor + '-01' < desde ? desde : cursor + '-01';
    const fin = finDeMes(cursor) > hasta ? hasta : finDeMes(cursor);
    meses.push({ clave: cursor, total: acumularVehiculos(vehiculos, ini, fin) });
    cursor = mesSiguiente(cursor);
  }

  const env = document.createElement('div');
  env.className = 'envoltorio-tabla';
  const tab = document.createElement('table');
  tab.className = 'tabla';
  tab.innerHTML = '<thead><tr><th>Mes</th><th>Pagados</th><th>Taller</th><th>Diario</th><th>Adicional</th><th>Pendiente</th></tr></thead>';
  const tbody = document.createElement('tbody');
  meses.slice().reverse().forEach(mes => {
    const tr = document.createElement('tr');
    tr.innerHTML =
      '<td>' + mesLegible(mes.clave, true) + '</td>' +
      '<td>' + mes.total.diasPagados + ' / ' + mes.total.diasEsperados + '</td>' +
      '<td class="taller">' + (mes.total.diasTaller || '—') + '</td>' +
      '<td class="cobrado">' + fmt(mes.total.cobrado) + '</td>' +
      '<td>' + fmt(mes.total.extras) + '</td>' +
      '<td class="deuda' + (mes.total.deuda > 0 ? ' hay' : '') + '">' + fmt(mes.total.deuda) + '</td>';
    tbody.appendChild(tr);
  });
  const tr = document.createElement('tr');
  tr.className = 'total';
  tr.innerHTML =
    '<td>Total</td>' +
    '<td>' + t.diasPagados + ' / ' + t.diasEsperados + '</td>' +
    '<td class="taller">' + (t.diasTaller || '—') + '</td>' +
    '<td class="cobrado">' + fmt(t.cobrado) + '</td>' +
    '<td>' + fmt(t.extras) + '</td>' +
    '<td class="deuda' + (t.deuda > 0 ? ' hay' : '') + '">' + fmt(t.deuda) + '</td>';
  tbody.appendChild(tr);
  tab.appendChild(tbody);
  env.appendChild(tab);
  tabla.appendChild(env);

  // Grafico: ultimos 12 meses como maximo, para que entre en el celular.
  const barras = meses.slice(-12).map(m => ({ clave: m.clave, monto: m.total.cobrado + m.total.extras }));
  $('res-grafico-total').textContent = fmt(barras.reduce((s, b) => s + b.monto, 0));
  const maximo = Math.max(1, ...barras.map(b => b.monto));
  const mesHoy = claveMes(hoyISO());
  barras.forEach(b => {
    const col = document.createElement('div');
    col.className = 'columna' + (b.clave === mesHoy ? ' actual' : '');

    const valor = document.createElement('span');
    valor.className = 'valor';
    valor.textContent = b.monto ? fmtCorto(b.monto) : '';

    const pista = document.createElement('div');
    pista.className = 'pista';
    const palo = document.createElement('div');
    palo.className = 'palo';
    palo.style.height = Math.max(2, (b.monto / maximo) * 100) + '%';
    pista.appendChild(palo);

    const lbl = document.createElement('small');
    lbl.textContent = mesLegible(b.clave, false).slice(0, 3);

    col.append(valor, pista, lbl);
    grafico.appendChild(col);
  });
}

// ---------- Tab Taller ----------
function renderTaller() {
  const ultimos = $('tal-ultimos');
  const lista = $('lista-servicios');
  ultimos.innerHTML = '';
  lista.innerHTML = '';

  const v = vehiculoPorId($('tal-vehiculo').value) || vehiculoPorId(vehSel);
  if (!v) {
    $('tal-dias').textContent = '0';
    $('tal-gasto').textContent = fmt(0);
    ultimos.innerHTML = '<p class="vacio">Cargá un vehículo para registrar sus trabajos.</p>';
    return;
  }

  const t = acumular(v, v.inicio, hoyISO());
  $('tal-dias').textContent = t.diasTaller;
  $('tal-gasto').textContent = fmt(serviciosDe(v).reduce((s, x) => s + (Number(x.costo) || 0), 0));

  // Tarjetas de "ultimo mantenimiento" y "ultima rotacion": la fecha, el
  // kilometraje de ese dia y cuanto hace que se hizo.
  ['mantenimiento', 'cubiertas'].forEach(tipo => {
    const s = ultimoServicio(v, tipo);
    const fila = document.createElement('div');
    fila.className = 'ultimo';

    const et = document.createElement('span');
    et.className = 'ultimo-tipo';
    et.textContent = (tipo === 'mantenimiento' ? '🛠 ' : '🛞 ') + TIPOS_SERVICIO[tipo];
    fila.appendChild(et);

    const val = document.createElement('div');
    val.className = 'ultimo-valor';
    if (!s) {
      val.innerHTML = '<span class="sin-dato">Sin registro</span>';
    } else {
      const dias = diasEntre(s.fecha, hoyISO());
      val.innerHTML =
        '<strong>' + fechaCorta(s.fecha) + '</strong>' +
        '<span>' + (s.km ? fmtKm(s.km) : 'sin km') + '</span>' +
        '<small>hace ' + dias + (dias === 1 ? ' día' : ' días') + (s.nota ? ' · ' + s.nota : '') + '</small>';
    }
    fila.appendChild(val);
    ultimos.appendChild(fila);
  });

  const trabajos = serviciosDe(v).slice().sort((a, b) => b.fecha.localeCompare(a.fecha));
  if (!trabajos.length) {
    const li = document.createElement('li');
    li.className = 'vacio';
    li.textContent = 'Todavía no hay trabajos registrados.';
    lista.appendChild(li);
    return;
  }

  trabajos.forEach(s => {
    const li = document.createElement('li');

    const chip = document.createElement('span');
    chip.className = 'chip serv-' + s.tipo;
    chip.textContent = s.tipo === 'mantenimiento' ? 'Mant.' : s.tipo === 'cubiertas' ? 'Cubiertas' : 'Otro';

    const det = document.createElement('div');
    det.className = 'detalle';
    const titulo = document.createElement('span');
    titulo.textContent = fechaCorta(s.fecha) + (s.km ? ' · ' + fmtKm(s.km) : '');
    det.appendChild(titulo);
    if (s.nota) {
      const small = document.createElement('small');
      small.textContent = s.nota;
      det.appendChild(small);
    }

    const monto = document.createElement('span');
    monto.className = 'monto';
    monto.textContent = s.costo ? fmt(s.costo) : '—';

    const acciones = document.createElement('div');
    acciones.className = 'acciones-item';

    const editar = document.createElement('button');
    editar.className = 'icono';
    editar.type = 'button';
    editar.textContent = '✏';
    editar.title = 'Editar';
    editar.addEventListener('click', () => cargarServicioEnForm(v, s));

    const borrar = document.createElement('button');
    borrar.className = 'icono borrar';
    borrar.type = 'button';
    borrar.textContent = '🗑';
    borrar.title = 'Eliminar';
    borrar.addEventListener('click', () => {
      datos.servicios[v.id] = serviciosDe(v).filter(x => x.id !== s.id);
      guardar();
      renderTodo();
    });

    acciones.append(editar, borrar);
    li.append(chip, det, monto, acciones);
    lista.appendChild(li);
  });
}

function cargarServicioEnForm(v, s) {
  editandoServicio = s.id;
  $('serv-titulo').textContent = '✏ Editar trabajo';
  $('s-id').value = s.id;
  $('s-tipo').value = s.tipo;
  $('s-fecha').value = s.fecha;
  $('s-km').value = s.km ? formatoMiles(s.km) : '';
  $('s-costo').value = s.costo ? formatoMiles(s.costo) : '';
  $('s-nota').value = s.nota || '';
  $('s-mitad').checked = false;
  $('btn-cancelar-serv').hidden = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function limpiarFormServicio() {
  editandoServicio = null;
  $('serv-titulo').textContent = '➕ Registrar trabajo';
  $('form-servicio').reset();
  $('s-fecha').value = hoyISO();
  $('btn-cancelar-serv').hidden = true;
}

// ---------- Tab Vehiculos ----------
function renderBotonesDias() {
  const caja = $('v-dias');
  caja.innerHTML = '';
  DIAS_SEMANA.forEach(d => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = d.corto;
    b.className = diasForm.includes(d.dow) ? 'activo' : '';
    b.addEventListener('click', () => {
      diasForm = diasForm.includes(d.dow) ? diasForm.filter(x => x !== d.dow) : diasForm.concat(d.dow);
      renderBotonesDias();
    });
    caja.appendChild(b);
  });
}

function renderVehiculos() {
  const lista = $('lista-vehiculos');
  lista.innerHTML = '';

  if (!datos.vehiculos.length) {
    const li = document.createElement('li');
    li.className = 'vacio';
    li.textContent = 'Ningún vehículo cargado todavía.';
    lista.appendChild(li);
    return;
  }

  datos.vehiculos.forEach(v => {
    const t = acumular(v, v.inicio, ultimoMovimiento([v]));
    const li = document.createElement('li');

    const det = document.createElement('div');
    det.className = 'detalle';
    const titulo = document.createElement('span');
    titulo.textContent = v.nombre + (v.inquilino ? ' — ' + v.inquilino : '');
    const small = document.createElement('small');
    small.textContent = fmt(v.monto) + ' por día · desde ' + fechaLegible(v.inicio, true) +
      ' · ' + v.dias.length + ' días/semana';
    det.append(titulo, small);

    const monto = document.createElement('span');
    monto.className = 'monto positivo';
    monto.textContent = fmt(t.cobrado + t.extras);

    const acciones = document.createElement('div');
    acciones.className = 'acciones-item';

    const editar = document.createElement('button');
    editar.className = 'icono';
    editar.type = 'button';
    editar.textContent = '✏';
    editar.title = 'Editar';
    editar.addEventListener('click', () => cargarEnForm(v));

    const borrar = document.createElement('button');
    borrar.className = 'icono borrar';
    borrar.type = 'button';
    borrar.textContent = '🗑';
    borrar.title = 'Eliminar';
    borrar.addEventListener('click', () => {
      if (!confirm('¿Eliminar "' + v.nombre + '" con todos sus pagos, adicionales y trabajos?')) return;
      datos.vehiculos = datos.vehiculos.filter(x => x.id !== v.id);
      delete datos.pagos[v.id];
      delete datos.extras[v.id];
      delete datos.servicios[v.id];
      if (vehSel === v.id) vehSel = datos.vehiculos.length ? datos.vehiculos[0].id : null;
      guardar();
      renderTodo();
    });

    acciones.append(editar, borrar);
    li.append(det, monto, acciones);
    lista.appendChild(li);
  });
}

function cargarEnForm(v) {
  editando = v.id;
  $('form-titulo').textContent = '✏ Editar vehículo';
  $('v-id').value = v.id;
  $('v-nombre').value = v.nombre;
  $('v-inquilino').value = v.inquilino || '';
  $('v-monto').value = formatoMiles(v.monto);
  $('v-inicio').value = v.inicio;
  diasForm = v.dias.slice();
  renderBotonesDias();
  $('btn-cancelar').hidden = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function limpiarForm() {
  editando = null;
  $('form-titulo').textContent = '➕ Nuevo vehículo';
  $('form-vehiculo').reset();
  $('v-inicio').value = hoyISO();
  diasForm = [1, 2, 3, 4, 5, 6, 0];
  renderBotonesDias();
  $('btn-cancelar').hidden = true;
}

// ---------- Exportar / importar ----------
function filasCSV() {
  const filas = [['fecha', 'vehiculo', 'inquilino', 'tipo', 'estado', 'monto', 'km', 'nota']];
  const limpiar = s => String(s || '').replace(/;/g, ',');

  vehiculosDelResumen().forEach(v => {
    Object.entries(datos.pagos[v.id] || {}).forEach(([iso, reg]) => {
      filas.push([iso, v.nombre, v.inquilino || '', 'diario', ESTADOS[reg.estado].etiqueta,
        reg.estado === 'pagado' ? reg.monto : 0, '', limpiar(reg.nota)]);
    });
    extrasDe(v).forEach(x => {
      filas.push([x.fecha, v.nombre, v.inquilino || '', 'adicional', 'Pagado', x.monto, '', limpiar(x.concepto)]);
    });
    serviciosDe(v).forEach(s => {
      filas.push([s.fecha, v.nombre, v.inquilino || '', 'taller', TIPOS_SERVICIO[s.tipo],
        s.costo || 0, s.km || '', limpiar(s.nota)]);
    });
  });

  const cabecera = filas.shift();
  filas.sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  return [cabecera].concat(filas).map(f => f.join(';')).join('\r\n');
}

// ---------- Navegacion entre tabs ----------
document.querySelector('.nav-inferior').addEventListener('click', e => {
  const btn = e.target.closest('button');
  if (!btn) return;
  document.querySelectorAll('.nav-inferior button').forEach(b => b.classList.toggle('activa', b === btn));
  document.querySelectorAll('main .tab').forEach(t => t.classList.toggle('activa', t.id === 'tab-' + btn.dataset.tab));
});

// ---------- Eventos ----------
$('cal-vehiculo').addEventListener('change', e => {
  vehSel = e.target.value;
  diaSel = null;
  $('tal-vehiculo').value = vehSel;
  renderCalendario();
  renderTaller();
});

$('tal-vehiculo').addEventListener('change', e => {
  vehSel = e.target.value;
  diaSel = null;
  $('cal-vehiculo').value = vehSel;
  renderCalendario();
  renderTaller();
});

$('res-vehiculo').addEventListener('change', renderResumen);

$('res-desde-input').addEventListener('change', () => { rangoManual = true; renderResumen(); });
$('res-hasta-input').addEventListener('change', () => { rangoManual = true; renderResumen(); });
$('btn-rango-todo').addEventListener('click', () => { rangoManual = false; renderResumen(); });

$('mes-prev').addEventListener('click', () => { mesSel = mesAnterior(mesSel); diaSel = null; renderCalendario(); });
$('mes-next').addEventListener('click', () => { mesSel = mesSiguiente(mesSel); diaSel = null; renderCalendario(); });

$('cal-grilla').addEventListener('click', e => {
  const btn = e.target.closest('.dia');
  if (!btn || btn.classList.contains('hueco') || btn.disabled) return;
  diaSel = diaSel === btn.dataset.fecha ? null : btn.dataset.fecha;
  $('ex-fecha').value = diaSel || hoyISO();
  renderCalendario();
});

$('detalle-dia').querySelector('.acciones').addEventListener('click', e => {
  const btn = e.target.closest('button');
  if (!btn || !diaSel) return;
  marcarDia(diaSel, btn.dataset.estado);
});

$('btn-hoy-pagado').addEventListener('click', () => {
  const v = vehiculoPorId(vehSel);
  if (!v) return;
  const hoy = hoyISO();
  if (hoy < v.inicio) { alert('El alquiler arranca el ' + fechaLegible(v.inicio, true) + '.'); return; }
  mesSel = claveMes(hoy);
  diaSel = hoy;
  if (!datos.pagos[v.id]) datos.pagos[v.id] = {};
  const reg = datos.pagos[v.id][hoy];
  datos.pagos[v.id][hoy] = {
    estado: 'pagado',
    monto: reg && reg.estado === 'pagado' ? reg.monto : (Number(v.monto) || 0),
    nota: reg ? reg.nota || '' : '',
  };
  guardar();
  renderTodo();
});

$('form-extra').addEventListener('submit', e => {
  e.preventDefault();
  const v = vehiculoPorId(vehSel);
  if (!v) return;
  const monto = montoDe($('ex-monto'));
  const fecha = $('ex-fecha').value;
  if (!monto || !fecha) return;

  if (!datos.extras[v.id]) datos.extras[v.id] = [];
  datos.extras[v.id].push({
    id: 'x' + Date.now(),
    fecha,
    monto,
    concepto: $('ex-concepto').value.trim(),
  });
  guardar();
  mesSel = claveMes(fecha);
  $('ex-monto').value = '';
  $('ex-concepto').value = '';
  renderTodo();
});

$('form-servicio').addEventListener('submit', e => {
  e.preventDefault();
  const v = vehiculoPorId($('tal-vehiculo').value) || vehiculoPorId(vehSel);
  if (!v) return;

  const s = {
    id: editandoServicio || ('s' + Date.now()),
    tipo: $('s-tipo').value,
    fecha: $('s-fecha').value,
    km: montoDe($('s-km')),
    costo: montoDe($('s-costo')),
    nota: $('s-nota').value.trim(),
  };
  if (!s.fecha) return;

  if (!datos.servicios[v.id]) datos.servicios[v.id] = [];
  if (editandoServicio) {
    datos.servicios[v.id] = serviciosDe(v).map(x => (x.id === editandoServicio ? s : x));
  } else {
    datos.servicios[v.id].push(s);
  }

  // El 50/50 de los arreglos: se registra el cobro al inquilino como pago
  // adicional, con el concepto armado a partir del trabajo.
  if ($('s-mitad').checked && s.costo > 0) {
    if (!datos.extras[v.id]) datos.extras[v.id] = [];
    datos.extras[v.id].push({
      id: 'x' + Date.now(),
      fecha: s.fecha,
      monto: Math.round(s.costo / 2),
      concepto: '50% ' + (s.nota || TIPOS_SERVICIO[s.tipo]),
    });
  }

  guardar();
  limpiarFormServicio();
  renderTodo();
});

$('btn-cancelar-serv').addEventListener('click', limpiarFormServicio);

$('form-vehiculo').addEventListener('submit', e => {
  e.preventDefault();
  if (!diasForm.length) { alert('Elegí al menos un día de la semana en el que se cobra.'); return; }

  const v = {
    id: editando || ('v' + Date.now()),
    nombre: $('v-nombre').value.trim(),
    inquilino: $('v-inquilino').value.trim(),
    monto: montoDe($('v-monto')),
    inicio: $('v-inicio').value,
    dias: diasForm.slice().sort(),
  };
  if (!v.nombre || !v.monto || !v.inicio) return;

  if (editando) {
    datos.vehiculos = datos.vehiculos.map(x => (x.id === editando ? v : x));
  } else {
    datos.vehiculos.push(v);
    vehSel = v.id;
  }
  guardar();
  limpiarForm();
  renderTodo();
});

$('btn-cancelar').addEventListener('click', limpiarForm);

$('btn-csv').addEventListener('click', () => {
  descargar('alquiler-pagos-' + hoyISO() + '.csv', '﻿' + filasCSV(), 'text/csv;charset=utf-8');
});

$('btn-exportar').addEventListener('click', () => {
  descargar('alquiler-respaldo-' + hoyISO() + '.json', JSON.stringify(datos, null, 2), 'application/json');
});

$('btn-importar').addEventListener('click', () => $('archivo-import').click());

$('archivo-import').addEventListener('change', e => {
  const archivo = e.target.files[0];
  if (!archivo) return;
  const lector = new FileReader();
  lector.onload = () => {
    try {
      const nuevo = JSON.parse(lector.result);
      if (!nuevo || !Array.isArray(nuevo.vehiculos)) throw new Error('formato');
      if (!confirm('Esto reemplaza los datos actuales por los del respaldo. ¿Seguir?')) return;
      datos = {
        vehiculos: nuevo.vehiculos,
        pagos: nuevo.pagos || {},
        extras: nuevo.extras || {},
        servicios: nuevo.servicios || {},
      };
      vehSel = datos.vehiculos.length ? datos.vehiculos[0].id : null;
      guardar();
      renderTodo();
      alert('Respaldo restaurado.');
    } catch (err) {
      alert('El archivo no parece un respaldo válido.');
    }
  };
  lector.readAsText(archivo);
  e.target.value = '';
});

[$('v-monto'), $('detalle-monto'), $('ex-monto'), $('s-km'), $('s-costo')].forEach(conSeparadorMiles);

// ---------- Inicializacion ----------
function renderTodo() {
  renderSelectores();
  renderCalendario();
  renderResumen();
  renderTaller();
  renderVehiculos();
}

$('fecha-actual').textContent =
  new Date().toLocaleDateString('es-PY', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
$('v-inicio').value = hoyISO();
$('s-fecha').value = hoyISO();
$('ex-fecha').value = hoyISO();
renderBotonesDias();
renderTodo();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
