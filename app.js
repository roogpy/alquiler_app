// ---------- Datos ----------
// Un solo objeto en localStorage: los vehiculos y, por vehiculo, un mapa
// fecha -> registro del dia. El calendario se deriva de ahi; no se guarda
// un registro por cada dia del alquiler, solo los dias que se tocaron.
const STORE_KEY = 'alquiler-datos-v1';

const ESTADOS = {
  pagado:  { etiqueta: 'Pagado',   marca: '✓' },
  impago:  { etiqueta: 'No pagó',  marca: '✗' },
  libre:   { etiqueta: 'Sin cobro', marca: '—' },
  pendiente: { etiqueta: 'Pendiente', marca: '•' },
};

// Orden lunes -> domingo, con el indice que devuelve Date.getDay().
const DIAS_SEMANA = [
  { dow: 1, corto: 'L' }, { dow: 2, corto: 'M' }, { dow: 3, corto: 'X' },
  { dow: 4, corto: 'J' }, { dow: 5, corto: 'V' }, { dow: 6, corto: 'S' },
  { dow: 0, corto: 'D' },
];

let datos = { vehiculos: [], pagos: {} };
try {
  const guardado = JSON.parse(localStorage.getItem(STORE_KEY));
  if (guardado && Array.isArray(guardado.vehiculos)) {
    datos = { vehiculos: guardado.vehiculos, pagos: guardado.pagos || {} };
  }
} catch (e) { /* datos corruptos: se arranca vacio */ }

function guardar() {
  localStorage.setItem(STORE_KEY, JSON.stringify(datos));
}

// ---------- Utilidades ----------
function fmt(n) { return '₲ ' + Math.round(n).toLocaleString('es-PY'); }

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

function fechaLegible(iso, conAnio) {
  const opts = { weekday: 'long', day: 'numeric', month: 'long' };
  if (conAnio) opts.year = 'numeric';
  return aFecha(iso).toLocaleDateString('es-PY', opts);
}

function mesLegible(clave, conAnio) {
  const [a, m] = clave.split('-').map(Number);
  return new Date(a, m - 1, 1).toLocaleDateString('es-PY', conAnio ? { month: 'long', year: 'numeric' } : { month: 'long' });
}

function claveMes(iso) { return iso.slice(0, 7); }

function diasDelMes(a, m) { return new Date(a, m, 0).getDate(); }

// ---------- Separador de miles en los campos de monto ----------
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

// Estado de un dia para un vehiculo:
//   fuera     -> anterior al inicio del alquiler
//   pagado / impago / libre -> marcado a mano
//   libre     -> dia de la semana en el que no se cobra
//   futuro    -> todavia no llego
//   pendiente -> se esperaba el pago y no esta marcado
function estadoDia(v, iso) {
  if (iso < v.inicio) return 'fuera';
  const reg = registro(v, iso);
  if (reg) return reg.estado;
  if (!v.dias.includes(aFecha(iso).getDay())) return 'libre';
  if (iso > hoyISO()) return 'futuro';
  return 'pendiente';
}

function montoCobrado(v, iso) {
  const reg = registro(v, iso);
  return reg && reg.estado === 'pagado' ? Number(reg.monto) || 0 : 0;
}

// Recorre los dias de un rango y acumula lo cobrado, lo que falta y los dias.
// `hasta` se recorta a hoy para la deuda: un dia futuro sin marcar no debe nada.
function acumular(v, desde, hasta) {
  const hoy = hoyISO();
  const inicio = desde < v.inicio ? v.inicio : desde;
  const total = { cobrado: 0, deuda: 0, diasPagados: 0, diasEsperados: 0, diasImpagos: 0 };
  for (let iso = inicio; iso <= hasta; iso = sumarDias(iso, 1)) {
    const estado = estadoDia(v, iso);
    if (estado === 'pagado') {
      total.cobrado += montoCobrado(v, iso);
      if (iso <= hoy) { total.diasPagados++; total.diasEsperados++; }
      continue;
    }
    if (iso > hoy || estado === 'libre' || estado === 'fuera' || estado === 'futuro') continue;
    total.diasEsperados++;
    total.deuda += Number(v.monto) || 0;
    if (estado === 'impago') total.diasImpagos++;
  }
  return total;
}

function acumularVehiculos(vehiculos, desde, hasta) {
  const total = { cobrado: 0, deuda: 0, diasPagados: 0, diasEsperados: 0, diasImpagos: 0 };
  vehiculos.forEach(v => {
    const t = acumular(v, desde, hasta);
    Object.keys(total).forEach(k => { total[k] += t[k]; });
  });
  return total;
}

function inicioMasViejo(vehiculos) {
  return vehiculos.reduce((min, v) => (!min || v.inicio < min ? v.inicio : min), null);
}

// ---------- Estado de la UI ----------
let vehSel = datos.vehiculos.length ? datos.vehiculos[0].id : null;
let mesSel = hoyISO().slice(0, 7);
let diaSel = null;
let editando = null;      // id del vehiculo en edicion (form)
let diasForm = [1, 2, 3, 4, 5, 6, 0];

const $ = id => document.getElementById(id);

// ---------- Selectores de vehiculo ----------
function renderSelectores() {
  const hay = datos.vehiculos.length > 0;
  $('sin-vehiculos').hidden = hay;
  $('bloque-calendario').hidden = !hay;

  if (hay && !vehiculoPorId(vehSel)) vehSel = datos.vehiculos[0].id;

  const cal = $('cal-vehiculo');
  cal.innerHTML = '';
  datos.vehiculos.forEach(v => {
    const o = document.createElement('option');
    o.value = v.id;
    o.textContent = v.nombre + (v.inquilino ? ' — ' + v.inquilino : '');
    cal.appendChild(o);
  });
  if (vehSel) cal.value = vehSel;

  const res = $('res-vehiculo');
  const previo = res.value;
  res.innerHTML = '';
  const todos = document.createElement('option');
  todos.value = '';
  todos.textContent = 'Todos los vehículos';
  res.appendChild(todos);
  datos.vehiculos.forEach(v => {
    const o = document.createElement('option');
    o.value = v.id;
    o.textContent = v.nombre + (v.inquilino ? ' — ' + v.inquilino : '');
    res.appendChild(o);
  });
  res.value = datos.vehiculos.some(v => v.id === previo) ? previo : '';
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
  const huecos = (primerDow + 6) % 7;
  for (let i = 0; i < huecos; i++) {
    const h = document.createElement('div');
    h.className = 'dia hueco';
    grilla.appendChild(h);
  }

  const hoy = hoyISO();
  const total = diasDelMes(anio, mes);
  for (let d = 1; d <= total; d++) {
    const iso = mesSel + '-' + String(d).padStart(2, '0');
    const estado = estadoDia(v, iso);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'dia ' + estado;
    if (iso === hoy) btn.classList.add('hoy');
    if (iso === diaSel) btn.classList.add('sel');
    btn.dataset.fecha = iso;
    btn.disabled = estado === 'fuera';

    const num = document.createElement('span');
    num.textContent = d;
    const marca = document.createElement('span');
    marca.className = 'marca';
    if (estado === 'pagado') marca.textContent = fmtCorto(montoCobrado(v, iso));
    else if (estado === 'impago') marca.textContent = '✗';
    else if (estado === 'pendiente') marca.textContent = '•';
    else marca.textContent = ' ';
    btn.append(num, marca);
    grilla.appendChild(btn);
  }

  const ultimo = mesSel + '-' + String(total).padStart(2, '0');
  const t = acumular(v, mesSel + '-01', ultimo);
  $('mes-cobrado').textContent = fmt(t.cobrado);
  const deuda = $('mes-deuda');
  deuda.textContent = fmt(t.deuda);
  deuda.classList.toggle('hay', t.deuda > 0);
  $('mes-dias').textContent = t.diasPagados + ' / ' + t.diasEsperados;

  renderDetalle();
  renderListaMes();
}

function renderDetalle() {
  const caja = $('detalle-dia');
  const v = vehiculoPorId(vehSel);
  if (!diaSel || !v) { caja.hidden = true; return; }
  caja.hidden = false;

  const estado = estadoDia(v, diaSel);
  const reg = registro(v, diaSel);
  $('detalle-titulo').textContent = fechaLegible(diaSel, true);

  const desc = estado === 'pendiente' ? 'Pendiente: se esperaba ' + fmt(v.monto)
    : estado === 'futuro' ? 'Día futuro (podés registrar un adelanto)'
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
    det.innerHTML = '<span>' + fechaLegible(iso, false) + '</span>';
    if (reg.nota) {
      const small = document.createElement('small');
      small.textContent = reg.nota;
      det.appendChild(small);
    }

    const monto = document.createElement('span');
    monto.className = 'monto ' + (reg.estado === 'pagado' ? 'positivo' : 'negativo');
    monto.textContent = reg.estado === 'pagado' ? fmt(reg.monto) : reg.estado === 'impago' ? '−' + fmt(v.monto) : '—';

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

function renderResumen() {
  const vehiculos = vehiculosDelResumen();
  const hoy = hoyISO();
  const desde = inicioMasViejo(vehiculos);

  const tabla = $('res-tabla');
  const grafico = $('res-grafico');
  tabla.innerHTML = '';
  grafico.innerHTML = '';

  if (!desde) {
    $('res-total').textContent = fmt(0);
    $('res-deuda').textContent = fmt(0);
    $('res-dias').textContent = '0 / 0';
    $('res-promedio').textContent = fmt(0);
    $('res-desde').textContent = 'Historial';
    $('res-grafico-total').textContent = fmt(0);
    tabla.innerHTML = '<p class="vacio">Todavía no hay alquileres cargados.</p>';
    return;
  }

  // El fin del rango incluye los adelantos: se toma el ultimo dia marcado si
  // cae despues de hoy, asi un pago adelantado no queda fuera del total.
  let hasta = hoy;
  vehiculos.forEach(v => {
    Object.keys(datos.pagos[v.id] || {}).forEach(iso => { if (iso > hasta) hasta = iso; });
  });

  const t = acumularVehiculos(vehiculos, desde, hasta);
  $('res-total').textContent = fmt(t.cobrado);
  const deuda = $('res-deuda');
  deuda.textContent = fmt(t.deuda);
  deuda.classList.toggle('hay', t.deuda > 0);
  $('res-dias').textContent = t.diasPagados + ' / ' + t.diasEsperados;
  $('res-promedio').textContent = fmt(t.diasPagados ? t.cobrado / t.diasPagados : 0);
  $('res-desde').textContent = 'Desde el ' + fechaLegible(desde, true);

  // Una fila por mes, del mes de inicio hasta el ultimo mes con movimiento.
  const meses = [];
  let cursor = desde.slice(0, 7);
  const ultimoMes = hasta.slice(0, 7);
  while (cursor <= ultimoMes) {
    const [a, m] = cursor.split('-').map(Number);
    const fin = cursor + '-' + String(diasDelMes(a, m)).padStart(2, '0');
    meses.push({ clave: cursor, total: acumularVehiculos(vehiculos, cursor + '-01', fin) });
    cursor = m === 12 ? (a + 1) + '-01' : a + '-' + String(m + 1).padStart(2, '0');
  }

  const env = document.createElement('div');
  env.className = 'envoltorio-tabla';
  const tab = document.createElement('table');
  tab.className = 'tabla';
  tab.innerHTML = '<thead><tr><th>Mes</th><th>Días</th><th>Cobrado</th><th>Pendiente</th></tr></thead>';
  const tbody = document.createElement('tbody');
  meses.slice().reverse().forEach(mes => {
    const tr = document.createElement('tr');
    tr.innerHTML =
      '<td>' + mesLegible(mes.clave, true) + '</td>' +
      '<td>' + mes.total.diasPagados + ' / ' + mes.total.diasEsperados + '</td>' +
      '<td class="cobrado">' + fmt(mes.total.cobrado) + '</td>' +
      '<td class="deuda' + (mes.total.deuda > 0 ? ' hay' : '') + '">' + fmt(mes.total.deuda) + '</td>';
    tbody.appendChild(tr);
  });
  const tr = document.createElement('tr');
  tr.className = 'total';
  tr.innerHTML =
    '<td>Total</td>' +
    '<td>' + t.diasPagados + ' / ' + t.diasEsperados + '</td>' +
    '<td class="cobrado">' + fmt(t.cobrado) + '</td>' +
    '<td class="deuda' + (t.deuda > 0 ? ' hay' : '') + '">' + fmt(t.deuda) + '</td>';
  tbody.appendChild(tr);
  tab.appendChild(tbody);
  env.appendChild(tab);
  tabla.appendChild(env);

  // Grafico: ultimos 12 meses como maximo, para que entre en el celular.
  const barras = meses.slice(-12);
  $('res-grafico-total').textContent = fmt(barras.reduce((s, b) => s + b.total.cobrado, 0));
  const maximo = Math.max(1, ...barras.map(b => b.total.cobrado));
  const mesHoy = hoy.slice(0, 7);
  barras.forEach(b => {
    const col = document.createElement('div');
    col.className = 'columna' + (b.clave === mesHoy ? ' actual' : '');

    const valor = document.createElement('span');
    valor.className = 'valor';
    valor.textContent = b.total.cobrado ? fmtCorto(b.total.cobrado) : '';

    const pista = document.createElement('div');
    pista.className = 'pista';
    const palo = document.createElement('div');
    palo.className = 'palo';
    palo.style.height = Math.max(2, (b.total.cobrado / maximo) * 100) + '%';
    pista.appendChild(palo);

    const lbl = document.createElement('small');
    lbl.textContent = mesLegible(b.clave, false).slice(0, 3);

    col.append(valor, pista, lbl);
    grafico.appendChild(col);
  });
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
    const t = acumular(v, v.inicio, hoyISO());
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
    monto.textContent = fmt(t.cobrado);

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
      if (!confirm('¿Eliminar "' + v.nombre + '" y todos sus pagos registrados?')) return;
      datos.vehiculos = datos.vehiculos.filter(x => x.id !== v.id);
      delete datos.pagos[v.id];
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
  const filas = [['fecha', 'vehiculo', 'inquilino', 'estado', 'monto', 'nota']];
  vehiculosDelResumen().forEach(v => {
    Object.entries(datos.pagos[v.id] || {})
      .sort((a, b) => a[0].localeCompare(b[0]))
      .forEach(([iso, reg]) => {
        filas.push([iso, v.nombre, v.inquilino || '', ESTADOS[reg.estado].etiqueta,
          reg.estado === 'pagado' ? reg.monto : 0, (reg.nota || '').replace(/;/g, ',')]);
      });
  });
  return filas.map(f => f.join(';')).join('\r\n');
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
  renderCalendario();
});

$('res-vehiculo').addEventListener('change', renderResumen);

$('mes-prev').addEventListener('click', () => {
  const [a, m] = mesSel.split('-').map(Number);
  mesSel = m === 1 ? (a - 1) + '-12' : a + '-' + String(m - 1).padStart(2, '0');
  diaSel = null;
  renderCalendario();
});

$('mes-next').addEventListener('click', () => {
  const [a, m] = mesSel.split('-').map(Number);
  mesSel = m === 12 ? (a + 1) + '-01' : a + '-' + String(m + 1).padStart(2, '0');
  diaSel = null;
  renderCalendario();
});

$('cal-grilla').addEventListener('click', e => {
  const btn = e.target.closest('.dia');
  if (!btn || btn.classList.contains('hueco') || btn.disabled) return;
  diaSel = diaSel === btn.dataset.fecha ? null : btn.dataset.fecha;
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
  mesSel = hoy.slice(0, 7);
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
      datos = { vehiculos: nuevo.vehiculos, pagos: nuevo.pagos || {} };
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

conSeparadorMiles($('v-monto'));
conSeparadorMiles($('detalle-monto'));

// ---------- Inicializacion ----------
function renderTodo() {
  renderSelectores();
  renderCalendario();
  renderResumen();
  renderVehiculos();
}

$('fecha-actual').textContent =
  new Date().toLocaleDateString('es-PY', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
$('v-inicio').value = hoyISO();
renderBotonesDias();
renderTodo();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
