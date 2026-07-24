const tendencia = document.getElementById("tendencia");
const rsi = document.getElementById("rsi");
const volatilidad = document.getElementById("volatilidad");

tendencia.textContent = "Conectando con Deriv...";

const socket = new WebSocket(
  "wss://ws.derivws.com/websockets/v3?app_id=1089"
);

socket.onopen = function () {
  tendencia.textContent = "✅ Conectado a Deriv";

  socket.send(JSON.stringify({
    ticks: "1HZ100V",
    subscribe: 1
  }));
};

socket.onmessage = function (event) {
  const datos = JSON.parse(event.data);

  if (datos.tick) {
    tendencia.textContent = "Precio: " + datos.tick.quote;
    rsi.textContent = "Recibiendo datos...";
    volatilidad.textContent = "Recibiendo datos...";
  }
};

socket.onerror = function () {
  tendencia.textContent = "❌ Error de conexión";
};

socket.onclose = function () {
  tendencia.textContent = "Conexión cerrada";
};
