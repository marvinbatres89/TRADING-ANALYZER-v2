const tendencia = document.getElementById("tendencia");
const rsi = document.getElementById("rsi");
const volatilidad = document.getElementById("volatilidad");
const boton = document.getElementById("analizarBtn");

let precios = [];

tendencia.textContent = "Conectando con Deriv...";

const socket = new WebSocket(
  "wss://ws.derivws.com/websockets/v3?app_id=1089"
);

socket.onopen = function () {
  tendencia.textContent = "✅ Conectado a Deriv";

  socket.send(
    JSON.stringify({
      ticks: "1HZ100V",
      subscribe: 1
    })
  );
};

socket.onmessage = function (event) {
  const datos = JSON.parse(event.data);
                  Console. Long(datos);
  
  if (datos.error) {
    tendencia.textContent = "Error: " + datos.error.message;
    return;
  }

  if (datos.tick) {
    const precioActual = Number(datos.tick.quote);

    precios.push(precioActual);

    if (precios.length > 100) {
      precios.shift();
    }

    tendencia.textContent =
      "Precio actual: " + precioActual.toFixed(2);

    rsi.textContent =
      "Datos recibidos: " + precios.length;

    volatilidad.textContent =
      "Esperando análisis...";
  }
};

socket.onerror = function () {
  tendencia.textContent = "❌ Error de conexión";
};

socket.onclose = function () {
  tendencia.textContent = "Conexión cerrada";
};

boton.addEventListener("click", function () {
  if (precios.length < 10) {
    alert("Espera unos segundos para recibir más precios.");
    return;
  }

  alert("Ya tenemos suficientes datos para analizar.");
});
