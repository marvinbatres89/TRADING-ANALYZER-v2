(function () {
  "use strict";

  const API_URL = "wss://ws.binaryws.com/websockets/v3";
  const $ = id => document.getElementById(id);

  const ui = {
    statusBadge:$("statusBadge"), loadBtn:$("loadBtn"), market:$("market"),
    connectBtn:$("connectBtn"), stopBtn:$("stopBtn"), mainMessage:$("mainMessage"),
    price:$("price"), lastDigit:$("lastDigit"), tickCount:$("tickCount"),
    digitHistory:$("digitHistory"), jsCheck:$("jsCheck"), socketCheck:$("socketCheck"),
    readyState:$("readyState"), symbolsCheck:$("symbolsCheck"),
    selectedSymbol:$("selectedSymbol"), tickStatus:$("tickStatus"),
    lastEvent:$("lastEvent"), log:$("log"), copyBtn:$("copyBtn")
  };

  let socket = null;
  let mode = "";
  let manualClose = false;
  let tickCounter = 0;
  let digits = [];
  let pingTimer = null;

  function start() {
    ui.jsCheck.textContent = "Activo";
    writeLog("JavaScript activo. Versión 1.5.");
    setMessage("Puedes cargar mercados o probar directamente 1HZ100V.", "success");

    ui.loadBtn.onclick = loadMarkets;
    ui.connectBtn.onclick = connectTicks;
    ui.stopBtn.onclick = stop;
    ui.copyBtn.onclick = copyDiagnostic;
    ui.market.onchange = () => ui.selectedSymbol.textContent = ui.market.value;
  }

  function loadMarkets() {
    openConnection("symbols");
  }

  function connectTicks() {
    ui.selectedSymbol.textContent = ui.market.value;
    openConnection("ticks");
  }

  function openConnection(newMode) {
    closeSilently();
    mode = newMode;
    manualClose = false;

    ui.socketCheck.textContent = "Creando";
    ui.readyState.textContent = "CONNECTING";
    setBadge("Conectando", "badge-wait");
    setEvent(newMode === "symbols" ? "Consultando mercados" : "Conectando ticks");
    setMessage(newMode === "symbols" ? "Consultando mercados oficiales..." : "Esperando precios en tiempo real...", "wait");
    writeLog("Abriendo conexión: " + API_URL);

    ui.loadBtn.disabled = true;
    ui.connectBtn.disabled = true;
    ui.stopBtn.disabled = false;

    try {
      socket = new WebSocket(API_URL);
    } catch (error) {
      fail("No se pudo crear WebSocket: " + error.message);
      restoreButtons();
      return;
    }

    socket.onopen = function () {
      ui.socketCheck.textContent = "Abierto";
      ui.readyState.textContent = "OPEN";
      setBadge("Conectado", "badge-on");
      writeLog("WebSocket abierto.");

      if (mode === "symbols") {
        send({
          active_symbols: "brief",
          product_type: "basic",
          req_id: 1501
        });
        writeLog('Enviado: {"active_symbols":"brief","product_type":"basic"}');
      } else {
        resetTicks();
        ui.tickStatus.textContent = "Esperando";
        send({
          ticks: ui.market.value,
          subscribe: 1,
          req_id: 1502
        });
        writeLog("Suscripción enviada para " + ui.market.value);
      }

      pingTimer = setInterval(() => send({ ping: 1 }), 30000);
    };

    socket.onmessage = function (event) {
      let data;
      try {
        data = JSON.parse(event.data);
      } catch (error) {
        fail("Respuesta JSON inválida.");
        return;
      }

      writeLog("Respuesta: " + (data.msg_type || "sin tipo"));

      if (data.error) {
        fail((data.error.message || "Error de Deriv") +
          (data.error.code ? " [" + data.error.code + "]" : ""));
        return;
      }

      if (data.msg_type === "active_symbols") {
        processSymbols(data.active_symbols);
        return;
      }

      if (data.msg_type === "tick" && data.tick) {
        processTick(data.tick);
      }
    };

    socket.onerror = () => fail("El navegador notificó un error WebSocket.");

    socket.onclose = function (event) {
      clearPing();
      ui.readyState.textContent = "CLOSED";
      ui.socketCheck.textContent = "Cerrado";
      setBadge("Sin conexión", "badge-off");
      writeLog("Conexión cerrada. Código " + event.code + ".");
      restoreButtons();
    };
  }

  function processSymbols(list) {
    if (!Array.isArray(list)) {
      ui.symbolsCheck.textContent = "Formato inválido";
      fail("Deriv no devolvió una lista válida.");
      return;
    }

    writeLog("Mercados recibidos: " + list.length);

    if (list.length === 0) {
      ui.symbolsCheck.textContent = "0 recibidos";
      setMessage("La lista volvió vacía. Usa el mercado de respaldo y pulsa “Recibir precios”.", "error");
      setEvent("Lista vacía");
      manualClose = true;
      try { socket.close(1000, "Lista vacía"); } catch (error) {}
      return;
    }

    const normalized = list.map(item => ({
      symbol: item.symbol || item.underlying_symbol || "",
      name: item.display_name || item.symbol_display_name || item.underlying_display_name ||
            item.symbol || item.underlying_symbol || "Mercado"
    })).filter(item => item.symbol);

    if (!normalized.length) {
      ui.symbolsCheck.textContent = "0 utilizables";
      setMessage("Se recibieron mercados, pero sus campos cambiaron. Copia el diagnóstico.", "error");
      return;
    }

    const selectedBefore = ui.market.value;
    ui.market.innerHTML = "";

    normalized
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach(item => {
        const option = document.createElement("option");
        option.value = item.symbol;
        option.textContent = item.name + " — " + item.symbol;
        ui.market.appendChild(option);
      });

    if ([...ui.market.options].some(option => option.value === selectedBefore)) {
      ui.market.value = selectedBefore;
    }

    ui.symbolsCheck.textContent = normalized.length + " cargados";
    ui.selectedSymbol.textContent = ui.market.value;
    setMessage("Mercados cargados. Ahora pulsa “Recibir precios”.", "success");
    setEvent("Mercados cargados");
    writeLog("Lista agregada al selector.");

    manualClose = true;
    try { socket.close(1000, "Mercados cargados"); } catch (error) {}
  }

  function processTick(tick) {
    const quote = Number(tick.quote);

    if (!Number.isFinite(quote)) {
      fail("El tick llegó sin un precio válido.");
      return;
    }

    const decimals = Number.isInteger(tick.pip_size) ? tick.pip_size : 2;
    const formatted = quote.toFixed(decimals);
    const numericCharacters = formatted.replace(/\D/g, "");
    const last = numericCharacters.slice(-1);

    tickCounter++;
    digits.push(last);
    if (digits.length > 20) digits.shift();

    ui.price.textContent = formatted;
    ui.lastDigit.textContent = last;
    ui.tickCount.textContent = tickCounter;
    ui.tickStatus.textContent = "Recibiendo";
    setBadge("Recibiendo datos", "badge-on");
    setMessage("Precios en tiempo real recibidos correctamente.", "success");
    setEvent("Tick recibido");

    if (tickCounter === 1) {
      writeLog("ÉXITO: primer tick recibido para " + ui.market.value);
    }

    renderDigits();
  }

  function resetTicks() {
    tickCounter = 0;
    digits = [];
    ui.price.textContent = "--";
    ui.lastDigit.textContent = "--";
    ui.tickCount.textContent = "0";
    ui.digitHistory.innerHTML = "<span>--</span>";
  }

  function renderDigits() {
    ui.digitHistory.innerHTML = "";
    [...digits].reverse().forEach(digit => {
      const span = document.createElement("span");
      span.textContent = digit;
      ui.digitHistory.appendChild(span);
    });
  }

  function send(payload) {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(payload));
    }
  }

  function stop() {
    manualClose = true;
    if (socket) {
      try { socket.close(1000, "Cierre solicitado"); } catch (error) {}
    }
    ui.tickStatus.textContent = "Detenido";
    setMessage("Conexión detenida.", "");
  }

  function closeSilently() {
    clearPing();
    if (!socket) return;
    socket.onopen = socket.onmessage = socket.onerror = socket.onclose = null;
    try { socket.close(); } catch (error) {}
    socket = null;
  }

  function clearPing() {
    if (pingTimer) clearInterval(pingTimer);
    pingTimer = null;
  }

  function restoreButtons() {
    ui.loadBtn.disabled = false;
    ui.connectBtn.disabled = false;
    ui.stopBtn.disabled = true;
  }

  function fail(text) {
    ui.tickStatus.textContent = "Error";
    setMessage(text, "error");
    setEvent("Error");
    writeLog("ERROR: " + text);
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
    ui.log.textContent += "\n[" + new Date().toLocaleTimeString() + "] " + text;
    ui.log.scrollTop = ui.log.scrollHeight;
  }

  function copyDiagnostic() {
    const text = [
      "TRADING ANALYZER PRO V1.5",
      "",
      "JavaScript: " + ui.jsCheck.textContent,
      "WebSocket: " + ui.socketCheck.textContent,
      "Estado: " + ui.readyState.textContent,
      "Mercados API: " + ui.symbolsCheck.textContent,
      "Símbolo: " + ui.selectedSymbol.textContent,
      "Ticks: " + ui.tickStatus.textContent,
      "Último evento: " + ui.lastEvent.textContent,
      "Precio: " + ui.price.textContent,
      "Cantidad de ticks: " + ui.tickCount.textContent,
      "",
      ui.log.textContent
    ].join("\n");

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(showCopied).catch(() => fallbackCopy(text));
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
      setMessage("No se pudo copiar. Envía una captura o video.", "error");
    }

    document.body.removeChild(area);
  }

  function showCopied() {
    ui.copyBtn.textContent = "Copiado";
    setTimeout(() => ui.copyBtn.textContent = "Copiar", 1500);
  }

  start();
})();