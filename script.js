'use strict';

const API_URL = 'wss://ws.binaryws.com/websockets/v3';
const MAX_PRECIOS = 120;
const MAX_DIGITOS = 50;
const MIN_DATOS = 20;
const $ = (id) => document.getElementById(id);

const ui = {
  estadoConexion: $('estadoConexion'), mercado: $('mercado'), estrategia: $('estrategia'),
  conectarBtn: $('conectarBtn'), detenerBtn: $('detenerBtn'), mensajeSistema: $('mensajeSistema'),
  precioActual: $('precioActual'), ultimoDigito: $('ultimoDigito'), cantidadDatos: $('cantidadDatos'),
  tendencia: $('tendencia'), rsi: $('rsi'), volatilidad: $('volatilidad'), riesgo: $('riesgo'),
  estadoAnalisis: $('estadoAnalisis'), senal: $('senal'), confianza: $('confianza'),
  explicacion: $('explicacion'), historial: $('historialDigitos')
};

let ws = null;
let precios = [];
let digitos = [];
let pingTimer = null;
let cierreManual = false;

ui.conectarBtn.addEventListener('click', conectar);
ui.detenerBtn.addEventListener('click', () => detener(true));
ui.mercado.addEventListener('change', () => { if (ws?.readyState === WebSocket.OPEN) conectar(); });
ui.estrategia.addEventListener('change', analizar);

function conectar() {
  detener(false);
  limpiar();
  cierreManual = false;
  cambiarEstado('Conectando', 'conectando');
  mensaje(`Abriendo conexión para ${ui.mercado.options[ui.mercado.selectedIndex].text}…`);
  ui.conectarBtn.disabled = true;
  ui.detenerBtn.disabled = false;

  try { ws = new WebSocket(API_URL); }
  catch (error) { fallo(`No se pudo crear la conexión: ${error.message}`); return; }

  const timeout = setTimeout(() => {
    if (ws?.readyState === WebSocket.CONNECTING) {
      try { ws.close(); } catch {}
      fallo('La conexión tardó demasiado. Revisa tu internet e inténtalo otra vez.');
    }
  }, 12000);

  ws.onopen = () => {
    clearTimeout(timeout);
    cambiarEstado('Conectado', 'conectado');
    mensaje('Conexión abierta. Recibiendo precios en tiempo real…');
    ui.conectarBtn.disabled = false;
    ui.conectarBtn.textContent = 'Cambiar mercado';
    enviar({ ticks: ui.mercado.value, subscribe: 1, req_id: 101 });
    pingTimer = setInterval(() => enviar({ ping: 1 }), 30000);
  };

  ws.onmessage = (event) => {
    let data;
    try { data = JSON.parse(event.data); }
    catch { fallo('Deriv envió una respuesta que no se pudo leer.'); return; }
    if (data.error) {
      const codigo = data.error.code ? ` (${data.error.code})` : '';
      fallo(`${data.error.message}${codigo}`);
      return;
    }
    if (data.msg_type === 'tick' && data.tick) recibirTick(data.tick);
  };

  ws.onerror = () => mensaje('El navegador reportó un error de red con el WebSocket.', true);

  ws.onclose = (event) => {
    clearTimeout(timeout);
    limpiarTemporizadores();
    ws = null;
    ui.conectarBtn.disabled = false;
    ui.detenerBtn.disabled = true;
    ui.conectarBtn.textContent = 'Conectar y analizar';
    if (cierreManual) {
      cambiarEstado('Desconectado', 'desconectado');
      mensaje('Análisis detenido.');
      return;
    }
    cambiarEstado('Conexión cerrada', 'desconectado');
    const detalle = event.reason ? ` Motivo: ${event.reason}` : '';
    mensaje(`La conexión se cerró (código ${event.code}).${detalle}`, true);
  };
}

function enviar(objeto) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(objeto));
}

function detener(manual) {
  cierreManual = manual;
  limpiarTemporizadores();
  if (ws) {
    ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null;
    try { ws.close(1000, 'Cierre solicitado'); } catch {}
    ws = null;
  }
  ui.conectarBtn.disabled = false;
  ui.detenerBtn.disabled = true;
  ui.conectarBtn.textContent = 'Conectar y analizar';
  if (manual) { cambiarEstado('Desconectado', 'desconectado'); mensaje('Análisis detenido.'); }
}

function limpiarTemporizadores() {
  if (pingTimer) clearInterval(pingTimer);
  pingTimer = null;
}

function recibirTick(tick) {
  const precio = Number(tick.quote);
  if (!Number.isFinite(precio)) return;
  const decimales = Number.isInteger(tick.pip_size) ? tick.pip_size : 2;
  const texto = precio.toFixed(decimales);
  const ultimo = Number(texto.replace('.', '').slice(-1));

  precios.push(precio); digitos.push(ultimo);
  if (precios.length > MAX_PRECIOS) precios.shift();
  if (digitos.length > MAX_DIGITOS) digitos.shift();

  ui.precioActual.textContent = texto;
  ui.ultimoDigito.textContent = ultimo;
  ui.cantidadDatos.textContent = precios.length;
  actualizarFrecuencias(); actualizarHistorial();

  if (precios.length < MIN_DATOS) {
    ui.estadoAnalisis.textContent = `Reuniendo datos: ${precios.length}/${MIN_DATOS}`;
    mostrarSenal('ESPERAR', 'esperar', '--', 'El sistema está reuniendo una muestra mínima antes de analizar.');
  } else analizar();
}

function analizar() {
  if (precios.length < MIN_DATOS) return;
  const tendencia = calcularTendencia();
  const rsi = calcularRSI(14);
  const vol = calcularVolatilidad();
  ui.tendencia.textContent = tendencia;
  ui.rsi.textContent = rsi.toFixed(1);
  ui.volatilidad.textContent = vol.nivel;
  ui.riesgo.textContent = vol.nivel === 'Alta' ? 'Alto' : vol.nivel === 'Media' ? 'Medio' : 'Bajo';
  ui.estadoAnalisis.textContent = 'Análisis actualizado';

  const estrategia = ui.estrategia.value;
  if (estrategia === 'rise-fall') analizarRiseFall(tendencia, rsi, vol);
  else if (estrategia === 'even-odd') analizarEvenOdd();
  else if (estrategia === 'over-under') analizarOverUnder();
  else analizarMatchesDiffers();
}

function calcularTendencia() {
  const m = precios.slice(-20);
  const a = promedio(m.slice(0, 10));
  const b = promedio(m.slice(10));
  const cambio = ((b - a) / a) * 100;
  if (cambio > 0.015) return 'Alcista';
  if (cambio < -0.015) return 'Bajista';
  return 'Lateral';
}

function calcularRSI(periodo) {
  const m = precios.slice(-(periodo + 1));
  let ganancias = 0, perdidas = 0;
  for (let i = 1; i < m.length; i++) {
    const cambio = m[i] - m[i - 1];
    if (cambio > 0) ganancias += cambio;
    else perdidas += Math.abs(cambio);
  }
  const g = ganancias / periodo, p = perdidas / periodo;
  if (p === 0) return g === 0 ? 50 : 100;
  return 100 - 100 / (1 + g / p);
}

function calcularVolatilidad() {
  const m = precios.slice(-20), media = promedio(m);
  const varianza = m.reduce((s, x) => s + Math.pow(x - media, 2), 0) / m.length;
  const porcentaje = (Math.sqrt(varianza) / media) * 100;
  return { porcentaje, nivel: porcentaje >= 0.08 ? 'Alta' : porcentaje >= 0.03 ? 'Media' : 'Baja' };
}

function analizarRiseFall(tendencia, rsi, vol) {
  let rise = 0, fall = 0; const razones = [];
  if (tendencia === 'Alcista') { rise += 35; razones.push('La tendencia reciente es alcista.'); }
  if (tendencia === 'Bajista') { fall += 35; razones.push('La tendencia reciente es bajista.'); }
  if (rsi >= 52 && rsi < 70) { rise += 25; razones.push('El RSI muestra impulso comprador.'); }
  if (rsi <= 48 && rsi > 30) { fall += 25; razones.push('El RSI muestra impulso vendedor.'); }
  if (rsi >= 70) { fall += 15; razones.push('El RSI está elevado y puede haber agotamiento.'); }
  if (rsi <= 30) { rise += 15; razones.push('El RSI está bajo y puede haber rebote.'); }
  if (vol.nivel === 'Alta') { rise -= 10; fall -= 10; razones.push('La volatilidad alta reduce la claridad.'); }
  const diferencia = Math.abs(rise - fall);
  if (rise >= 45 && rise > fall && diferencia >= 15) mostrarSenal('POSIBLE RISE', 'compra', Math.min(85, rise), razones.join(' '));
  else if (fall >= 45 && fall > rise && diferencia >= 15) mostrarSenal('POSIBLE FALL', 'venta', Math.min(85, fall), razones.join(' '));
  else mostrarSenal('ESPERAR', 'esperar', Math.max(0, diferencia), 'No existe coincidencia suficiente entre tendencia, RSI y volatilidad.');
}

function analizarEvenOdd() {
  const m = digitos.slice(-30); const pares = m.filter(d => d % 2 === 0).length;
  const pp = pares / m.length * 100, pi = 100 - pp;
  if (pp >= 63) mostrarSenal('DOMINIO PAR', 'compra', Math.round(pp), `Los pares representan ${pp.toFixed(1)}% de la muestra reciente.`);
  else if (pi >= 63) mostrarSenal('DOMINIO IMPAR', 'venta', Math.round(pi), `Los impares representan ${pi.toFixed(1)}% de la muestra reciente.`);
  else mostrarSenal('ESPERAR', 'esperar', Math.round(Math.max(pp, pi)), 'La distribución de pares e impares está relativamente equilibrada.');
}

function analizarOverUnder() {
  const m = digitos.slice(-30); const altos = m.filter(d => d >= 5).length;
  const pa = altos / m.length * 100, pb = 100 - pa;
  if (pa >= 63) mostrarSenal('DOMINIO 5–9', 'compra', Math.round(pa), `Los dígitos 5–9 representan ${pa.toFixed(1)}% de la muestra.`);
  else if (pb >= 63) mostrarSenal('DOMINIO 0–4', 'venta', Math.round(pb), `Los dígitos 0–4 representan ${pb.toFixed(1)}% de la muestra.`);
  else mostrarSenal('ESPERAR', 'esperar', Math.round(Math.max(pa, pb)), 'No existe dominio claro entre dígitos bajos y altos.');
}

function analizarMatchesDiffers() {
  const f = frecuencias(), total = digitos.length;
  let mejor = 0;
  for (let i = 1; i < 10; i++) if (f[i] > f[mejor]) mejor = i;
  const p = f[mejor] / total * 100;
  if (p >= 22) mostrarSenal(`DÍGITO DESTACADO: ${mejor}`, 'compra', Math.round(p), `El dígito ${mejor} aparece en ${p.toFixed(1)}% de la muestra.`);
  else mostrarSenal('ESPERAR', 'esperar', Math.round(p), 'Ningún dígito destaca suficientemente en la muestra reciente.');
}

function frecuencias() {
  const f = Array(10).fill(0);
  digitos.forEach(d => f[d]++);
  return f;
}

function actualizarFrecuencias() {
  const f = frecuencias(), total = digitos.length || 1;
  f.forEach((n, i) => $(`digito${i}`).textContent = `${Math.round(n / total * 100)}%`);
}

function actualizarHistorial() {
  ui.historial.innerHTML = '';
  digitos.slice(-20).reverse().forEach(d => {
    const s = document.createElement('span'); s.textContent = d; ui.historial.appendChild(s);
  });
}

function promedio(lista) { return lista.reduce((a, b) => a + b, 0) / lista.length; }
function cambiarEstado(texto, clase) { ui.estadoConexion.textContent = texto; ui.estadoConexion.className = `estado ${clase}`; }
function mensaje(texto, error = false) { ui.mensajeSistema.textContent = texto; ui.mensajeSistema.className = `mensaje-sistema${error ? ' error' : ''}`; }
function mostrarSenal(texto, clase, puntuacion, explicacion) {
  ui.senal.textContent = texto; ui.senal.className = `senal ${clase}`;
  ui.confianza.textContent = `Puntuación de coincidencia: ${puntuacion}${puntuacion === '--' ? '' : '/100'}`;
  ui.explicacion.textContent = `${explicacion} La muestra pasada no garantiza el siguiente resultado.`;
}
function fallo(texto) {
  cambiarEstado('Error', 'desconectado'); mensaje(texto, true);
  ui.estadoAnalisis.textContent = 'No se reciben datos';
  ui.conectarBtn.disabled = false; ui.detenerBtn.disabled = true;
  ui.conectarBtn.textContent = 'Intentar nuevamente';
  mostrarSenal('ERROR', 'venta', 0, texto);
}
function limpiar() {
  precios = []; digitos = [];
  ui.precioActual.textContent = '--'; ui.ultimoDigito.textContent = '--'; ui.cantidadDatos.textContent = '0';
  ui.tendencia.textContent = ui.rsi.textContent = ui.volatilidad.textContent = ui.riesgo.textContent = '--';
  ui.estadoAnalisis.textContent = 'Esperando datos'; ui.historial.innerHTML = '<span>--</span>';
  for (let i = 0; i < 10; i++) $(`digito${i}`).textContent = '0%';
  mostrarSenal('ESPERAR', 'esperar', '--', 'El sistema todavía no ha reunido suficientes datos.');
}
