// ========================================
// TRADING ANALYZER PRO
// Conexión y análisis inicial del mercado
// ========================================

const estadoConexion = document.getElementById("estadoConexion");
const mercadoSelect = document.getElementById("mercado");
const estrategiaSelect = document.getElementById("estrategia");
const conectarBtn = document.getElementById("conectarBtn");

const precioActualElemento = document.getElementById("precioActual");
const ultimoDigitoElemento = document.getElementById("ultimoDigito");
const cantidadDatosElemento = document.getElementById("cantidadDatos");

const tendenciaElemento = document.getElementById("tendencia");
const rsiElemento = document.getElementById("rsi");
const volatilidadElemento = document.getElementById("volatilidad");
const riesgoElemento = document.getElementById("riesgo");

const estadoAnalisis = document.getElementById("estadoAnalisis");
const senalElemento = document.getElementById("senal");
const confianzaElemento = document.getElementById("confianza");
const explicacionElemento = document.getElementById("explicacion");
const historialDigitosElemento =
  document.getElementById("historialDigitos");

let socket = null;
let precios = [];
let digitos = [];
let mercadoActual = "";
let conectado = false;

// Cantidad máxima de datos guardados
const LIMITE_PRECIOS = 100;
const LIMITE_DIGITOS = 50;

// ========================================
// BOTÓN PRINCIPAL
// ========================================

conectarBtn.addEventListener("click", function () {
  conectarMercado();
});

// Si se cambia el mercado, se vuelve a conectar
mercadoSelect.addEventListener("change", function () {
  if (conectado) {
    conectarMercado();
  }
});

// Si cambia la estrategia, actualiza el análisis
estrategiaSelect.addEventListener("change", function () {
  if (precios.length >= 20) {
    actualizarAnalisis();
  }
});

// ========================================
// CONEXIÓN CON DERIV
// ========================================

function conectarMercado() {
  cerrarConexionAnterior();
  limpiarDatos();

  mercadoActual = mercadoSelect.value;

  cambiarEstadoConexion("Conectando...", false);
  estadoAnalisis.textContent = "Iniciando conexión";
  conectarBtn.textContent = "Conectando...";

  try {
    socket = new WebSocket(
      "wss://ws.binaryws.com/websockets/v3"
    );
  } catch (error) {
    mostrarError("No fue posible iniciar la conexión.");
    return;
  }

  socket.onopen = function () {
    conectado = true;

    cambiarEstadoConexion("Conectado", true);
    conectarBtn.textContent = "Cambiar mercado";
    estadoAnalisis.textContent = "Recibiendo precios";

    solicitarTicks();
  };

  socket.onmessage = function (evento) {
    procesarMensaje(evento);
  };

  socket.onerror = function () {
    mostrarError("Ocurrió un error de conexión.");
  };

  socket.onclose = function () {
    conectado = false;

    cambiarEstadoConexion("Desconectado", false);
    conectarBtn.textContent = "Conectar y analizar";

    if (precios.length === 0) {
      estadoAnalisis.textContent = "Conexión cerrada";
    }
  };
}

function solicitarTicks() {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    return;
  }

  const solicitud = {
    ticks: mercadoActual,
    subscribe: 1
  };

  socket.send(JSON.stringify(solicitud));
}

function procesarMensaje(evento) {
  let datos;

  try {
    datos = JSON.parse(evento.data);
  } catch (error) {
    mostrarError("Se recibió una respuesta no válida.");
    return;
  }

  if (datos.error) {
    mostrarError(datos.error.message);
    return;
  }

  if (datos.msg_type === "tick" && datos.tick) {
    procesarTick(datos.tick);
  }
}

function procesarTick(tick) {
  const precio = Number(tick.quote);

  if (!Number.isFinite(precio)) {
    return;
  }

  const decimales = obtenerDecimales(tick);
  const precioFormateado = precio.toFixed(decimales);
  const ultimoDigito = Number(
    precioFormateado.charAt(precioFormateado.length - 1)
  );

  precios.push(precio);
  digitos.push(ultimoDigito);

  if (precios.length > LIMITE_PRECIOS) {
    precios.shift();
  }

  if (digitos.length > LIMITE_DIGITOS) {
    digitos.shift();
  }

  precioActualElemento.textContent = precioFormateado;
  ultimoDigitoElemento.textContent = ultimoDigito;
  cantidadDatosElemento.textContent = precios.length;

  actualizarHistorial();
  actualizarFrecuencia();

  if (precios.length < 20) {
    estadoAnalisis.textContent =
      "Reuniendo datos: " + precios.length + "/20";

    senalElemento.textContent = "ESPERAR";
    senalElemento.className = "senal esperar";

    confianzaElemento.textContent =
      "Confianza estimada: --%";

    explicacionElemento.textContent =
      "El sistema está reuniendo suficientes precios para realizar el análisis.";

    return;
  }

  actualizarAnalisis();
}

// ========================================
// FORMATO DEL PRECIO
// ========================================

function obtenerDecimales(tick) {
  if (
    Number.isInteger(tick.pip_size) &&
    tick.pip_size >= 0 &&
    tick.pip_size <= 10
  ) {
    return tick.pip_size;
  }

  const textoPrecio = String(tick.quote);

  if (textoPrecio.includes(".")) {
    return textoPrecio.split(".")[1].length;
  }

  return 2;
}

// ========================================
// ANÁLISIS GENERAL
// ========================================

function actualizarAnalisis() {
  const tendencia = calcularTendencia();
  const rsi = calcularRSI(14);
  const volatilidad = calcularVolatilidad();
  const riesgo = calcularRiesgo(volatilidad);
  const estrategia = estrategiaSelect.value;

  tendenciaElemento.textContent = tendencia;
  rsiElemento.textContent =
    rsi === null ? "--" : rsi.toFixed(1);
  volatilidadElemento.textContent = volatilidad.nivel;
  riesgoElemento.textContent = riesgo;

  estadoAnalisis.textContent = "Análisis actualizado";

  if (estrategia === "rise-fall") {
    analizarRiseFall(tendencia, rsi, volatilidad);
  } else if (estrategia === "even-odd") {
    analizarEvenOdd();
  } else if (estrategia === "over-under") {
    analizarOverUnder();
  } else if (estrategia === "matches-differs") {
    analizarMatchesDiffers();
  }
}

// ========================================
// TENDENCIA
// ========================================

function calcularTendencia() {
  if (precios.length < 20) {
    return "--";
  }

  const recientes = precios.slice(-20);
  const primeraMitad = recientes.slice(0, 10);
  const segundaMitad = recientes.slice(10);

  const promedioPrimero = promedio(primeraMitad);
  const promedioSegundo = promedio(segundaMitad);

  const diferencia =
    ((promedioSegundo - promedioPrimero) /
      promedioPrimero) *
    100;

  if (diferencia > 0.015) {
    return "Alcista";
  }

  if (diferencia < -0.015) {
    return "Bajista";
  }

  return "Lateral";
}

// ========================================
// RSI
// ========================================

function calcularRSI(periodo) {
  if (precios.length < periodo + 1) {
    return null;
  }

  const muestra = precios.slice(-(periodo + 1));

  let ganancias = 0;
  let perdidas = 0;

  for (let i = 1; i < muestra.length; i++) {
    const cambio = muestra[i] - muestra[i - 1];

    if (cambio > 0) {
      ganancias += cambio;
    } else if (cambio < 0) {
      perdidas += Math.abs(cambio);
    }
  }

  const promedioGanancias = ganancias / periodo;
  const promedioPerdidas = perdidas / periodo;

  if (promedioPerdidas === 0) {
    return promedioGanancias === 0 ? 50 : 100;
  }

  const fuerzaRelativa =
    promedioGanancias / promedioPerdidas;

  return 100 - 100 / (1 + fuerzaRelativa);
}

// ========================================
// VOLATILIDAD
// ========================================

function calcularVolatilidad() {
  const muestra = precios.slice(-20);

  if (muestra.length < 2) {
    return {
      nivel: "--",
      porcentaje: 0
    };
  }

  const media = promedio(muestra);

  const varianza =
    muestra.reduce(function (total, precio) {
      return total + Math.pow(precio - media, 2);
    }, 0) / muestra.length;

  const desviacion = Math.sqrt(varianza);
  const porcentaje = (desviacion / media) * 100;

  let nivel = "Baja";

  if (porcentaje >= 0.08) {
    nivel = "Alta";
  } else if (porcentaje >= 0.03) {
    nivel = "Media";
  }

  return {
    nivel: nivel,
    porcentaje: porcentaje
  };
}

function calcularRiesgo(volatilidad) {
  if (volatilidad.nivel === "Alta") {
    return "Alto";
  }

  if (volatilidad.nivel === "Media") {
    return "Medio";
  }

  return "Bajo";
}

// ========================================
// ESTRATEGIA RISE / FALL
// ========================================

function analizarRiseFall(tendencia, rsi, volatilidad) {
  let puntosRise = 0;
  let puntosFall = 0;
  let explicaciones = [];

  if (tendencia === "Alcista") {
    puntosRise += 35;
    explicaciones.push("La tendencia reciente es alcista.");
  }

  if (tendencia === "Bajista") {
    puntosFall += 35;
    explicaciones.push("La tendencia reciente es bajista.");
  }

  if (rsi >= 52 && rsi < 70) {
    puntosRise += 25;
    explicaciones.push("El RSI mantiene impulso comprador.");
  }

  if (rsi <= 48 && rsi > 30) {
    puntosFall += 25;
    explicaciones.push("El RSI mantiene impulso vendedor.");
  }

  if (rsi >= 70) {
    puntosFall += 15;
    explicaciones.push(
      "El RSI está en una zona elevada y puede existir agotamiento."
    );
  }

  if (rsi <= 30) {
    puntosRise += 15;
    explicaciones.push(
      "El RSI está en una zona baja y puede existir rebote."
    );
  }

  if (volatilidad.nivel === "Alta") {
    puntosRise -= 10;
    puntosFall -= 10;
    explicaciones.push(
      "La volatilidad es alta, por lo que aumenta el riesgo."
    );
  }

  const diferencia = Math.abs(puntosRise - puntosFall);

  if (
    puntosRise >= 45 &&
    puntosRise > puntosFall &&
    diferencia >= 15
  ) {
    mostrarSenal(
      "POSIBLE RISE",
      "compra",
      limitarConfianza(puntosRise),
      explicaciones.join(" ")
    );
    return;
  }

  if (
    puntosFall >= 45 &&
    puntosFall > puntosRise &&
    diferencia >= 15
  ) {
    mostrarSenal(
      "POSIBLE FALL",
      "venta",
      limitarConfianza(puntosFall),
      explicaciones.join(" ")
    );
    return;
  }

  mostrarSenal(
    "ESPERAR",
    "esperar",
    Math.max(30, diferencia),
    "No existe una coincidencia suficientemente clara entre tendencia, RSI y volatilidad."
  );
}

// ========================================
// ESTRATEGIA EVEN / ODD
// ========================================

function analizarEvenOdd() {
  const muestra = digitos.slice(-30);

  let pares = 0;
  let impares = 0;

  muestra.forEach(function (digito) {
    if (digito % 2 === 0) {
      pares++;
    } else {
      impares++;
    }
  });

  const porcentajePares =
    (pares / muestra.length) * 100;
  const porcentajeImpares =
    (impares / muestra.length) * 100;

  if (porcentajePares >= 63) {
    mostrarSenal(
      "DOMINIO PAR",
      "compra",
      Math.round(porcentajePares),
      "Los dígitos pares representan " +
        porcentajePares.toFixed(1) +
        "% de la muestra reciente. Esto describe la muestra, pero no garantiza el siguiente dígito."
    );
    return;
  }

  if (porcentajeImpares >= 63) {
    mostrarSenal(
      "DOMINIO IMPAR",
      "venta",
      Math.round(porcentajeImpares),
      "Los dígitos impares representan " +
        porcentajeImpares.toFixed(1) +
        "% de la muestra reciente. Esto describe la muestra, pero no garantiza el siguiente dígito."
    );
    return;
  }

  mostrarSenal(
    "ESPERAR",
    "esperar",
    Math.round(
      Math.max(porcentajePares, porcentajeImpares)
    ),
    "La distribución entre números pares e impares está relativamente equilibrada."
  );
}

// ========================================
// ESTRATEGIA OVER / UNDER
// ========================================

function analizarOverUnder() {
  const muestra = digitos.slice(-30);

  let altos = 0;
  let bajos = 0;

  muestra.forEach(function (digito) {
    if (digito >= 5) {
      altos++;
    } else {
      bajos++;
    }
  });

  const porcentajeAltos =
    (altos / muestra.length) * 100;
  const porcentajeBajos =
    (bajos / muestra.length) * 100;

  if (porcentajeAltos >= 63) {
    mostrarSenal(
      "DOMINIO 5–9",
      "compra",
      Math.round(porcentajeAltos),
      "Los dígitos entre 5 y 9 dominan la muestra reciente con " +
        porcentajeAltos.toFixed(1) +
        "%."
    );
    return;
  }

  if (porcentajeBajos >= 63) {
    mostrarSenal(
      "DOMINIO 0–4",
      "venta",
      Math.round(porcentajeBajos),
      "Los dígitos entre 0 y 4 dominan la muestra reciente con " +
        porcentajeBajos.toFixed(1) +
        "%."
    );
    return;
  }

  mostrarSenal(
    "ESPERAR",
    "esperar",
    Math.round(
      Math.max(porcentajeAltos, porcentajeBajos)
    ),
    "No existe un dominio claro entre los dígitos bajos y altos."
  );
}

// ========================================
// ESTRATEGIA MATCHES / DIFFERS
// ========================================

function analizarMatchesDiffers() {
  const frecuencias = contarFrecuencias();
  const total = digitos.length;

  let digitoMasFrecuente = 0;
  let frecuenciaMayor = frecuencias[0];

  frecuencias.forEach(function (cantidad, digito) {
    if (cantidad > frecuenciaMayor) {
      frecuenciaMayor = cantidad;
      digitoMasFrecuente = digito;
    }
  });

  const porcentajeMayor =
    (frecuenciaMayor / total) * 100;

  if (porcentajeMayor >= 22) {
    mostrarSenal(
      "DÍGITO DESTACADO: " + digitoMasFrecuente,
      "compra",
      Math.round(porcentajeMayor),
      "El dígito " +
        digitoMasFrecuente +
        " es el más frecuente de la muestra con " +
        porcentajeMayor.toFixed(1) +
        "%. La frecuencia pasada no garantiza que vuelva a aparecer."
    );
    return;
  }

  mostrarSenal(
    "ESPERAR",
    "esperar",
    Math.round(porcentajeMayor),
    "Ningún dígito presenta una frecuencia suficientemente destacada."
  );
}

// ========================================
// FRECUENCIA E HISTORIAL
// ========================================

function contarFrecuencias() {
  const frecuencias = new Array(10).fill(0);

  digitos.forEach(function (digito) {
    frecuencias[digito]++;
  });

  return frecuencias;
}

function actualizarFrecuencia() {
  const frecuencias = contarFrecuencias();
  const total = digitos.length;

  frecuencias.forEach(function (cantidad, digito) {
    const elemento =
      document.getElementById("digito" + digito);

    const porcentaje =
      total === 0 ? 0 : (cantidad / total) * 100;

    elemento.textContent =
      porcentaje.toFixed(0) + "%";
  });
}

function actualizarHistorial() {
  historialDigitosElemento.innerHTML = "";

  const ultimos = digitos.slice(-20).reverse();

  ultimos.forEach(function (digito) {
    const circulo = document.createElement("span");
    circulo.textContent = digito;

    historialDigitosElemento.appendChild(circulo);
  });
}

// ========================================
// UTILIDADES
// ========================================

function promedio(lista) {
  if (lista.length === 0) {
    return 0;
  }

  const suma = lista.reduce(function (total, numero) {
    return total + numero;
  }, 0);

  return suma / lista.length;
}

function limitarConfianza(valor) {
  return Math.max(0, Math.min(85, Math.round(valor)));
}

function mostrarSenal(
  texto,
  clase,
  confianza,
  explicacion
) {
  senalElemento.textContent = texto;
  senalElemento.className = "senal " + clase;

  confianzaElemento.textContent =
    "Confianza estimada: " + confianza + "%";

  explicacionElemento.textContent = explicacion;
}

function cambiarEstadoConexion(texto, estaConectado) {
  estadoConexion.textContent = texto;

  if (estaConectado) {
    estadoConexion.className = "estado conectado";
  } else {
    estadoConexion.className = "estado desconectado";
  }
}

function limpiarDatos() {
  precios = [];
  digitos = [];

  precioActualElemento.textContent = "--";
  ultimoDigitoElemento.textContent = "--";
  cantidadDatosElemento.textContent = "0";

  tendenciaElemento.textContent = "--";
  rsiElemento.textContent = "--";
  volatilidadElemento.textContent = "--";
  riesgoElemento.textContent = "--";

  estadoAnalisis.textContent = "Esperando datos";

  historialDigitosElemento.innerHTML =
    "<span>--</span>";

  for (let digito = 0; digito <= 9; digito++) {
    document.getElementById(
      "digito" + digito
    ).textContent = "0%";
  }

  mostrarSenal(
    "ESPERAR",
    "esperar",
    0,
    "Selecciona un mercado y espera a que el sistema reúna suficientes datos."
  );
}

function cerrarConexionAnterior() {
  conectado = false;

  if (socket) {
    socket.onopen = null;
    socket.onmessage = null;
    socket.onerror = null;
    socket.onclose = null;

    if (
      socket.readyState === WebSocket.OPEN ||
      socket.readyState === WebSocket.CONNECTING
    ) {
      socket.close();
    }
  }

  socket = null;
}

function mostrarError(mensaje) {
  conectado = false;

  cambiarEstadoConexion("Error", false);
  estadoAnalisis.textContent = "No se reciben datos";
  conectarBtn.textContent = "Intentar nuevamente";

  mostrarSenal(
    "ERROR",
    "venta",
    0,
    mensaje
  );
}
