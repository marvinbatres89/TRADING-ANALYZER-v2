(function () {
  "use strict";

  const API_URL = "wss://ws.derivws.com/websockets/v3?app_id=1089";

  const $ = (id) => document.getElementById(id);
  const ui = {
    statusBadge: $("statusBadge"),
    market: $("market"),
    testBtn: $("testBtn"),
    connectBtn: $("connectBtn"),
    stopBtn: $("stopBtn"),
    mainMessage: $("mainMessage"),
    price: $("price"),
    lastDigit: $("lastDigit"),
    tickCount: $("tickCount"),
    jsCheck: $("jsCheck"),
    buttonCheck: $("buttonCheck"),
    socketCheck: $("socketCheck"),
    readyState: $("readyState"),
    closeCode: $("closeCode"),
    serverUrl: $("serverUrl"),
    lastEvent: $("lastEvent"),
    log: $("log"),
    digitHistory: $("digitHistory"),
    copyBtn: $("copyBtn")
  };

  let socket = null;
  let pingTimer = null;
  let connectionTimeout = null;
  let tickCount = 0;
  let digits = [];
  let manualClose = false;

  function start() {
    ui.jsCheck.textContent = "Activo";
    writeLog("JavaScript activo.");
    setEvent("Aplicación preparada");
    setMessage("Pulsa primero “Probar botón”.", "success");

    ui.testBtn.addEventListener("click", testButton);
    ui.connectBtn.addEventListener("click", connect);
    ui.stopBtn.addEventListener("click", stop);
    ui.copyBtn.addEventListener("click", copyDiagnostic);

    writeLog("Eventos de los botones registrados.");
  }

  function testButton() {
    ui.buttonCheck.textContent = "Funciona";
    setEvent("Botón de prueba pulsado");
    setMessage("El botón y JavaScript funcionan correctamente. Ahora pulsa “Conectar con Deriv”.", "success");
    writeLog("PRUEBA 1 SUPERADA: el navegador detectó el toque.");
    ui.testBtn.textContent = "✓ Botón funciona";
  }

  function connect() {
    if (!("WebSocket" in window)) {
      ui.socketCheck.textContent = "No compatible";
      setMessage("Este navegador no admite WebSocket.", "error");
      writeLog("ERROR: WebSocket no está disponible en este navegador.");
      return;
    }

    closeSocketSilently();
    resetMarketData();
    manualClose = false;

    ui.buttonCheck.textContent = "Funciona";
    ui.socketCheck.textContent = "Creando...";
    ui.readyState.textContent = "CONNECTING";
    ui.serverUrl.textContent = API_URL;
    ui.closeCode.textContent = "--";
    setBadge("Conectando", "badge-wait");
    setEvent("Creando WebSocket");
    setMessage("Intentando conectar con el servidor oficial de Deriv...", "wait");
    writeLog("PRUEBA 2: se pulsó Conectar.");
    writeLog("Creando WebSocket: " + API_URL);

    ui.connectBtn.disabled = true;
    ui.stopBtn.disabled = false;

    try {
      socket = new WebSocket(API_URL);
      ui.socketCheck.textContent = "Creado";
      writeLog("PRUEBA 3 SUPERADA: objeto WebSocket creado.");
    } catch (error) {
      ui.socketCheck.textContent = "Error al crear";
      setMessage("No se pudo crear la conexión: " + error.message, "error");
      writeLog("ERROR AL CREAR WEBSOCKET: " + error.message);
      restoreButtons();
      return;
    }

    connectionTimeout = setTimeout(function () {
      if (socket && socket.readyState === WebSocket.CONNECTING) {
        writeLog("TIEMPO AGOTADO: el servidor no abrió la conexión en 15 segundos.");
        setMessage("La conexión quedó bloqueada antes de abrirse. Puede ser la red, el navegador o el proveedor de Internet.", "error");
        setEvent("Tiempo de conexión agotado");
        try { socket.close(); } catch (e) {}
      }
    }, 15000);

    socket.onopen = function () {
      clearTimeout(connectionTimeout);
      ui.socketCheck.textContent = "Abierto";
      ui.readyState.textContent = stateName(socket.readyState);
      setBadge("Conectado", "badge-on");
      setEvent("Conexión abierta");
      setMessage("Conectado. Enviando suscripción al mercado...", "success");
      writeLog("PRUEBA 4 SUPERADA: conexión WebSocket abierta.");

      send({ ping: 1, req_id: 1 });
      send({ ticks: ui.market.value, subscribe: 1, req_id: 2 });
      writeLog("Ping enviado.");
      writeLog("Suscripción enviada para: " + ui.market.value);

      pingTimer = setInterval(function () {
        send({ ping: 1, req_id: 99 });
      }, 30000);
    };

    socket.onmessage = function (event) {
      let data;
      try {
        data = JSON.parse(event.data);
      } catch (error) {
        writeLog("Respuesta no válida: " + event.data);
        return;
      }

      if (data.error) {
        const errorText = (data.error.message || "Error desconocido") +
          (data.error.code ? " [" + data.error.code + "]" : "");
        setMessage(errorText, "error");
        setEvent("Error de Deriv");
        writeLog("ERROR DERIV: " + errorText);
        return;
      }

      if (data.msg_type === "ping") {
        writeLog("Respuesta de ping recibida.");
        return;
      }

      if (data.msg_type === "tick" && data.tick) {
        processTick(data.tick);
        return;
      }

      writeLog("Mensaje recibido: " + (data.msg_type || "sin tipo"));
    };

    socket.onerror = function () {
      ui.socketCheck.textContent = "Error";
      setEvent("Error WebSocket");
      setMessage("El navegador notificó un error al intentar conectar.", "error");
      writeLog("ERROR WEBSOCKET: el navegador no proporciona detalles técnicos adicionales.");
    };

    socket.onclose = function (event) {
      clearTimers();
      ui.readyState.textContent = "CLOSED";
      ui.closeCode.textContent = String(event.code || "--");
      ui.socketCheck.textContent = "Cerrado";
      setBadge("Sin conexión", "badge-off");
      setEvent(manualClose ? "Cierre manual" : "Conexión cerrada");
      writeLog("CONEXIÓN CERRADA. Código: " + event.code + ". Motivo: " + (event.reason || "sin motivo"));

      if (!manualClose) {
        setMessage("La conexión se cerró. Copia el diagnóstico o envía una captura completa.", "error");
      } else {
        setMessage("Conexión detenida.", "");
      }
      restoreButtons();
    };
  }

  function processTick(tick) {
    const quote = Number(tick.quote);
    if (!Number.isFinite(quote)) return;

    const decimals = Number.isInteger(tick.pip_size) ? tick.pip_size : 2;
    const formatted = quote.toFixed(decimals);
    const numericCharacters = formatted.replace(/\D/g, "");
    const last = numericCharacters.charAt(numericCharacters.length - 1);

    tickCount += 1;
    digits.push(last);
    if (digits.length > 20) digits.shift();

    ui.price.textContent = formatted;
    ui.lastDigit.textContent = last;
    ui.tickCount.textContent = String(tickCount);
    ui.readyState.textContent = stateName(socket.readyState);
    setEvent("Tick recibido");
    setMessage("Recibiendo precios en tiempo real.", "success");

    if (tickCount === 1) {
      writeLog("PRUEBA 5 SUPERADA: primer tick recibido.");
    }
    renderDigits();
  }

  function send(payload) {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(payload));
    } else {
      writeLog("No se pudo enviar: WebSocket no está abierto.");
    }
  }

  function stop() {
    manualClose = true;
    clearTimers();
    if (socket) {
      try { socket.close(1000, "Cierre solicitado"); } catch (error) {}
    } else {
      restoreButtons();
    }
  }

  function closeSocketSilently() {
    clearTimers();
    if (socket) {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
      try { socket.close(); } catch (error) {}
      socket = null;
    }
  }

  function resetMarketData() {
    tickCount = 0;
    digits = [];
    ui.price.textContent = "--";
    ui.lastDigit.textContent = "--";
    ui.tickCount.textContent = "0";
    ui.digitHistory.innerHTML = "<span>--</span>";
  }

  function clearTimers() {
    if (pingTimer) clearInterval(pingTimer);
    if (connectionTimeout) clearTimeout(connectionTimeout);
    pingTimer = null;
    connectionTimeout = null;
  }

  function restoreButtons() {
    ui.connectBtn.disabled = false;
    ui.stopBtn.disabled = true;
  }

  function stateName(value) {
    return ["CONNECTING", "OPEN", "CLOSING", "CLOSED"][value] || "DESCONOCIDO";
  }

  function renderDigits() {
    ui.digitHistory.innerHTML = "";
    for (let i = digits.length - 1; i >= 0; i--) {
      const item = document.createElement("span");
      item.textContent = digits[i];
      ui.digitHistory.appendChild(item);
    }
  }

  function setBadge(text, className) {
    ui.statusBadge.textContent = text;
    ui.statusBadge.className = "badge " + className;
  }

  function setMessage(text, type) {
    ui.mainMessage.textContent = text;
    ui.mainMessage.className = "message" + (type ? " " + type : "");
  }

  function setEvent(text) {
    ui.lastEvent.textContent = text;
  }

  function writeLog(text) {
    const time = new Date().toLocaleTimeString();
    ui.log.textContent += "\n[" + time + "] " + text;
    ui.log.scrollTop = ui.log.scrollHeight;
  }

  function copyDiagnostic() {
    const text = [
      "Trading Analyzer Pro - Diagnóstico",
      "HTML: " + $("htmlCheck").textContent,
      "JavaScript: " + ui.jsCheck.textContent,
      "Botón: " + ui.buttonCheck.textContent,
      "WebSocket: " + ui.socketCheck.textContent,
      "Estado: " + ui.readyState.textContent,
      "Código de cierre: " + ui.closeCode.textContent,
      "Servidor: " + ui.serverUrl.textContent,
      "Último evento: " + ui.lastEvent.textContent,
      "",
      ui.log.textContent
    ].join("\n");

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(showCopied).catch(function () {
        fallbackCopy(text);
      });
    } else {
      fallbackCopy(text);
    }
  }

  function fallbackCopy(text) {
    const area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.left = "-9999px";
    document.body.appendChild(area);
    area.select();
    try {
      document.execCommand("copy");
      showCopied();
    } catch (error) {
      setMessage("No se pudo copiar. Envíame una captura completa.", "error");
    }
    document.body.removeChild(area);
  }

  function showCopied() {
    ui.copyBtn.textContent = "Copiado";
    setTimeout(function () { ui.copyBtn.textContent = "Copiar"; }, 1500);
  }

  start();
})();
