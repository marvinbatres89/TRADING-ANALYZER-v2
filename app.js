import { DerivConnection } from "./connection.js";

const $ = (id) => document.getElementById(id);

const ui = {
  badge: $("connectionBadge"),
  market: $("marketSelect"),
  connect: $("connectButton"),
  stop: $("stopButton"),
  message: $("statusMessage"),
  price: $("currentPrice"),
  digit: $("lastDigit"),
  count: $("tickCount"),
  server: $("serverUsed"),
  state: $("socketState"),
  lastMessage: $("lastMessage"),
  closeCode: $("closeCode"),
  log: $("eventLog"),
  history: $("digitsHistory"),
  copy: $("copyButton")
};

let ticks = 0;
let digits = [];
let currentServer = "--";

const connection = new DerivConnection({
  onState: (state, url) => {
    currentServer = url || currentServer;
    ui.server.textContent = currentServer;
    ui.state.textContent = state;

    if (state === "OPEN") {
      setBadge("Conectado", "online");
      setMessage("Conexión abierta. Esperando el primer precio...");
      ui.connect.disabled = false;
      ui.stop.disabled = false;
      ui.connect.textContent = "Cambiar mercado";
    } else if (state === "CONNECTING") {
      setBadge("Conectando", "connecting");
      setMessage("Probando conexión con Deriv...");
      ui.connect.disabled = true;
      ui.stop.disabled = false;
    } else {
      setBadge("Desconectado", "offline");
      ui.connect.disabled = false;
      ui.stop.disabled = true;
      ui.connect.textContent = "Conectar";
    }
  },

  onTick: (tick) => {
    const quote = Number(tick.quote);
    if (!Number.isFinite(quote)) return;

    const decimals = Number.isInteger(tick.pip_size) ? tick.pip_size : 2;
    const formatted = quote.toFixed(decimals);
    const lastDigit = formatted.replace(".", "").slice(-1);

    ticks += 1;
    digits.push(lastDigit);
    if (digits.length > 20) digits.shift();

    ui.price.textContent = formatted;
    ui.digit.textContent = lastDigit;
    ui.count.textContent = String(ticks);
    ui.lastMessage.textContent = "tick";
    ui.closeCode.textContent = "--";
    setMessage(`Recibiendo precios de ${ui.market.options[ui.market.selectedIndex].text}.`);
    renderDigits();
  },

  onLog: addLog,

  onError: (message) => {
    ui.lastMessage.textContent = message;
    setMessage(message, true);
    addLog(`ERROR: ${message}`);
  },

  onClose: (event, manual) => {
    ui.closeCode.textContent = String(event.code || "--");
    ui.lastMessage.textContent = manual ? "Cierre manual" : (event.reason || "Cierre inesperado");
    setMessage(
      manual
        ? "La conexión fue detenida."
        : `No fue posible mantener la conexión. Código ${event.code || "--"}. Copia el diagnóstico y envíalo.`,
      !manual
    );
  }
});

ui.connect.addEventListener("click", () => {
  resetData();
  connection.connect(ui.market.value);
});

ui.stop.addEventListener("click", () => {
  connection.stop(true);
  setBadge("Desconectado", "offline");
  ui.state.textContent = "CLOSED";
  ui.connect.disabled = false;
  ui.stop.disabled = true;
  ui.connect.textContent = "Conectar";
  setMessage("La conexión fue detenida.");
  addLog("Conexión detenida por el usuario.");
});

ui.copy.addEventListener("click", async () => {
  const report = [
    `Servidor: ${ui.server.textContent}`,
    `Estado: ${ui.state.textContent}`,
    `Último mensaje: ${ui.lastMessage.textContent}`,
    `Código de cierre: ${ui.closeCode.textContent}`,
    "",
    ui.log.textContent
  ].join("\n");

  try {
    await navigator.clipboard.writeText(report);
    ui.copy.textContent = "Copiado";
    setTimeout(() => ui.copy.textContent = "Copiar", 1500);
  } catch {
    setMessage("No se pudo copiar automáticamente. Haz una captura del diagnóstico.", true);
  }
});

function resetData() {
  ticks = 0;
  digits = [];
  ui.price.textContent = "--";
  ui.digit.textContent = "--";
  ui.count.textContent = "0";
  ui.closeCode.textContent = "--";
  ui.lastMessage.textContent = "--";
  ui.history.innerHTML = "<span>--</span>";
  ui.log.textContent = "Nueva prueba iniciada.";
}

function renderDigits() {
  ui.history.innerHTML = "";
  [...digits].reverse().forEach((digit) => {
    const span = document.createElement("span");
    span.textContent = digit;
    ui.history.appendChild(span);
  });
}

function setBadge(text, className) {
  ui.badge.textContent = text;
  ui.badge.className = `badge ${className}`;
}

function setMessage(text, error = false) {
  ui.message.textContent = text;
  ui.message.className = error ? "status-message error" : "status-message";
}

function addLog(text) {
  const time = new Date().toLocaleTimeString("es-SV");
  ui.log.textContent += `\n[${time}] ${text}`;
  ui.log.scrollTop = ui.log.scrollHeight;
}
