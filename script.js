const boton = document.getElementById("analizarBtn");
const tendencia = document.getElementById("tendencia");
const rsi = document.getElementById("rsi");
const volatilidad = document.getElementById("volatilidad");

let precios = [];

tendencia.textContent = "Conectando con Deriv...";
rsi.textContent = "--";
volatilidad.textContent = "--";

// Conexión pública con Deriv
const socket = new WebSocket(
  "wss://ws.derivws.com/websockets/v3?app_id=1089"
);

// Cuando se abre la conexión
socket.onopen = function () {
  tendencia.textContent = "Conectado. Recibiendo precios...";

  socket.send(
    JSON.stringify({
      ticks: "1HZ100V",
      subscribe: 1
    })
  );
};

// Cuando llegan datos de Deriv
socket.onmessage = function (evento) {
  const datos = JSON.parse(evento.data);

  console.log("Datos recibidos:", datos);

  if (datos.error) {
    tendencia.textContent = "Error: " + datos.error.message;
    return;
  }

  if (datos.tick) {
    const precioActual = Number(datos.tick.quote);

    precios.push(precioActual);

    // Guardamos únicamente los últimos 100 precios
    if (precios.length > 100) {
      precios.shift();
    }

    tendencia.textContent =
      "Recibiendo datos. Precio actual: " + precioActual;

    // Análisis automático al reunir suficientes precios
    if (precios.length >= 30) {
      analizarMercado();
    }
  }
};

// Si ocurre un error de conexión
socket.onerror = function (error) {
  console.error("Error WebSocket:", error);
  tendencia.textContent = "Error al conectar con Deriv.";
};

// Si se cierra la conexión
socket.onclose = function () {
  tendencia.textContent = "Conexión con Deriv cerrada.";
};

// Botón para realizar el análisis manualmente
if (boton) {
  boton.addEventListener("click", function () {
    if (precios.length < 15) {
      alert(
        "Todavía faltan datos. Espera unos segundos y vuelve a intentarlo."
      );
      return;
    }

    analizarMercado();
  });
}

function analizarMercado() {
  calcularTendencia();
  calcularRSI();
  calcularVolatilidad();
}

function calcularTendencia() {
  const periodo = Math.min(20, precios.length);

  const preciosRecientes = precios.slice(-periodo);
  const mitad = Math.floor(preciosRecientes.length / 2);

  const primeraMitad = preciosRecientes.slice(0, mitad);
  const segundaMitad = preciosRecientes.slice(mitad);

  const promedioAnterior = obtenerPromedio(primeraMitad);
  const promedioActual = obtenerPromedio(segundaMitad);

  if (promedioActual > promedioAnterior) {
    tendencia.textContent = "Tendencia alcista 📈";
  } else if (promedioActual < promedioAnterior) {
    tendencia.textContent = "Tendencia bajista 📉";
  } else {
    tendencia.textContent = "Tendencia lateral ➡️";
  }
}

function calcularRSI() {
  const periodo = 14;

  if (precios.length < periodo + 1) {
    rsi.textContent = "Esperando más datos...";
    return;
  }

  const preciosRecientes = precios.slice(-(periodo + 1));

  let ganancias = 0;
  let perdidas = 0;

  for (let i = 1; i < preciosRecientes.length; i++) {
    const cambio = preciosRecientes[i] - preciosRecientes[i - 1];

    if (cambio > 0) {
      ganancias += cambio;
    } else {
      perdidas += Math.abs(cambio);
    }
  }

  const promedioGanancias = ganancias / periodo;
  const promedioPerdidas = perdidas / periodo;

  let valorRSI;

  if (promedioPerdidas === 0) {
    valorRSI = 100;
  } else {
    const fuerzaRelativa =
      promedioGanancias / promedioPerdidas;

    valorRSI =
      100 - 100 / (1 + fuerzaRelativa);
  }

  let mensaje = valorRSI.toFixed(2);

  if (valorRSI >= 70) {
    mensaje += " — Sobrecompra";
  } else if (valorRSI <= 30) {
    mensaje += " — Sobreventa";
  } else {
    mensaje += " — Zona neutral";
  }

  rsi.textContent = mensaje;
}

function calcularVolatilidad() {
  const periodo = Math.min(30, precios.length);
  const preciosRecientes = precios.slice(-periodo);

  const promedio = obtenerPromedio(preciosRecientes);

  const sumaDiferencias = preciosRecientes.reduce(
    function (total, precio) {
      return total + Math.pow(precio - promedio, 2);
    },
    0
  );

  const desviacion = Math.sqrt(
    sumaDiferencias / preciosRecientes.length
  );

  const porcentaje =
    promedio !== 0 ? (desviacion / promedio) * 100 : 0;

  let nivel;

  if (porcentaje < 0.005) {
    nivel = "Baja";
  } else if (porcentaje < 0.02) {
    nivel = "Media";
  } else {
    nivel = "Alta";
  }

  volatilidad.textContent =
    nivel + " — " + porcentaje.toFixed(4) + "%";
}

function obtenerPromedio(lista) {
  if (lista.length === 0) {
    return 0;
  }

  const suma = lista.reduce(function (total, numero) {
    return total + numero;
  }, 0);

  return suma / lista.length;
}