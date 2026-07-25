(function () {
  "use strict";

  const API_URL = "wss://ws.derivws.com/websockets/v3?app_id=1089";
  const $ = (id) => document.getElementById(id);

  const ui = {
    statusBadge: $("statusBadge"),
    loadBtn: $("loadBtn"),
    market: $("market"),
    connectBtn: $("connectBtn"),
    stopBtn: $("stopBtn"),
    mainMessage: $("mainMessage"),
    price: $("price"),
    lastDigit: $("lastDigit"),
    tickCount: $("tickCount"),
    jsCheck: $("jsCheck"),
    symbolsCheck: $("symbolsCheck"),
    socketCheck: $("socketCheck"),
    readyState: $("readyState"),
    closeCode: $("closeCode"),
    selectedSymbol: $("selectedSymbol"),
    serverUrl: $("serverUrl"),
    lastEvent: $("lastEvent"),
    log: $("log"),
    digitHistory: $("digitHistory"),
    copyBtn: $("copyBtn")
  };

  let socket = null;
  let tickCount = 0;
  let digits = [];
  let manualClose = false;
  let mode = "";
  let pingTimer = null;

  function start() {
    ui.jsCheck.textContent = "Activo";
    writeLog("JavaScript activo.");
    writeLog("Versión 1.2 preparada.");
    setMessage("Pulsa “Cargar mercados activos”.", "success");

    ui.loadBtn.addEventListener("click", loadSymbols);
    ui.connectBtn.addEventListener("click", connectToSelectedMarket);
    ui.stopBtn.addEventListener("click", stop);
    ui.copyBtn.addEventListener("click", copyDiagnostic);
  }

  function loadSymbols() {
    openSocket("symbols");
  }

  function connectToSelectedMarket() {
    const symbol = ui.market.value;
    if (!symbol) {
      setMessage("Selecciona un mercado válido.", "error");
      return;
    }
    ui.selectedSymbol.textContent = symbol;
    openSocket("ticks");
  }

  function openSocket(nextMode) {
    closeSocketSilently();
    manualClose = false;
    mode = nextMode;

    ui.socketCheck.textContent = "Creando...";
    ui.readyState.textContent = "CONNECTING";
    ui.serverUrl.textContent = API_URL;
    ui.closeCode.textContent = "--";
    setBadge("Conectando", "badge-wait");
    setEvent(nextMode === "symbols" ? "Consultando mercados" : "Conectando al mercado");
    setMessage(nextMode === "symbols" ? "Consultando los mercados activos de Deriv..." : "Conectando al mercado seleccionado...", "wait");
    writeLog("Creando WebSocket para modo: " + nextMode);

    try {
      socket = new WebSocket(API_URL);
      ui.socketCheck.textContent = "Creado";
    } catch (error) {
      ui.socketCheck.textContent = "Error";
      setMessage("No se pudo crear WebSocket: " + error.message, "error");
      writeLog("ERROR: " + error.message);
      return;
    }

    ui.loadBtn.disabled = true;
    ui.connectBtn.disabled = true;
    ui.stopBtn.disabled = false;

    socket.onopen = function () {
      ui.socketCheck.textContent = "Abierto";
      ui.readyState.textContent = "OPEN";
      setBadge("Conectado", "badge-on");
      writeLog("Conexión abierta.");

      if (mode === "symbols") {
        send({ active_symbols: "brief", product_type: "basic", req_id: 100 });
        writeLog("Solicitud active_symbols enviada.");
      } else {
        resetTicks();
        send({ ticks: ui.market.value, subscribe: 1, req_id: 200 });
        writeLog("Suscripción enviada para: " + ui.market.value);
      }

      pingTimer = setInterval(function () {
        send({ ping: 1 });
      }, 30000);
    };

    socket.onmessage = function (event) {
      let data;
      try {
        data = JSON.parse(event.data);
      } catch (error) {
        writeLog("Respuesta no válida.");
        return;
      }

      if (data.error) {
        const text = (data.error.message || "Error desconocido") +
          (data.error.code ? " [" + data.error.code + "]" : "");
        writeLog("ERROR DERIV: " + text);
        setMessage(text, "error");
        setEvent("Error de Deriv");
        return;
      }

      if (data.msg_type === "active_symbols" || Array.isArray(data.active_symbols)) {
        populateSymbols(data.active_symbols || []);
        return;
      }

      if (data.msg_type === "tick" && data.tick) {
        processTick(data.tick);
        return;
      }

      if (data.msg_type === "ping") return;

      writeLog("Mensaje recibido: " + (data.msg_type || "sin tipo"));
    };

    socket.onerror = function () {
      ui.socketCheck.textContent = "Error";
      setMessage("El navegador notificó un error WebSocket.", "error");
      setEvent("Error WebSocket");
      writeLog("ERROR WEBSOCKET.");
    };

    socket.onclose = function (event) {
      clearPing();
      ui.readyState.textContent = "CLOSED";
      ui.closeCode.textContent = String(event.code || "--");
      ui.socketCheck.textContent = "Cerrado";
      setBadge("Sin conexión", "badge-off");
      writeLog("Conexión cerrada. Código: " + event.code);

      if (!manualClose && mode === "ticks" && tickCount === 0) {
        setMessage("La conexión se cerró antes de recibir ticks.", "error");
      }

      ui.loadBtn.disabled = false;
      ui.stopBtn.disabled = true;
      if (ui.market.options.length > 1) ui.connectBtn.disabled = false;
    };
  }

  function populateSymbols(items) {
    const normalized = items.map(function (item) {
      return {
        symbol: item.symbol || item.underlying_symbol || "",
        name: item.display_name || item.symbol_display_name || item.market_display_name || item.symbol || item.underlying_symbol || "",
        market: item.market_display_name || item.market || "",
        submarket: item.submarket_display_name || item.submarket || ""
      };
    }).filter(function (item) {
      return item.symbol;
    });

    const synthetic = normalized.filter(function (item) {
      const text = (item.name + " " + item.market + " " + item.submarket + " " + item.symbol).toLowerCase();
      return text.includes("volatility") ||
             text.includes("synthetic") ||
             text.includes("derived") ||
             /^r_\d+$/i.test(item.symbol) ||
             /^1hz/i.test(item.symbol);
    });

    const list = synthetic.length ? synthetic : normalized;

    list.sort(function (a, b) {
      return a.name.localeCompare(b.name);
    });

    ui.market.innerHTML = "";

    list.forEach(function (item) {
      const option = document.createElement("option");
      option.value = item.symbol;
      option.textContent = item.name + " — " + item.symbol;
      ui.market.appendChild(option);
    });

    if (!list.length) {
      ui.market.innerHTML = '<option value="">No se recibieron mercados</option>';
      ui.symbolsCheck.textContent = "0 encontrados";
      setMessage("Deriv respondió, pero no devolvió mercados utilizables.", "error");
      writeLog("No se encontraron símbolos en la respuesta.");
      return;
    }

    ui.market.disabled = false;
    ui.connectBtn.disabled = false;
    ui.symbolsCheck.textContent = list.length + " cargados";
    ui.selectedSymbol.textContent = ui.market.value;
    setMessage("Mercados cargados. Selecciona uno y pulsa “Conectar al mercado”.", "success");
    setEvent("Mercados cargados");
    writeLog("Mercados válidos cargados: " + list.length);

    manualClose = true;
    try { socket.close(1000, "Lista recibida"); } catch (error) {}
  }

  function processTick(tick) {
    const quote = Number(tick.quote);
    if (!Number.isFinite(quote)) return;

    const decimals = Number.isInteger(tick.pip_size) ? tick.pip_size : 2;
    const formatted = quote.toFixed(decimals);
    const numeric = formatted.replace(/\D/g, "");
    const last = numeric.charAt(numeric.length - 1);

    tickCount += 1;
    digits.push(last);
    if (digits.length > 20) digits.shift();

    ui.price.textContent = formatted;
    ui.lastDigit.textContent = last;
    ui.tickCount.textContent = String(tickCount);
    ui.readyState.textContent = "OPEN";
    setBadge("Recibiendo datos", "badge-on");
    setMessage("Recibiendo precios en tiempo real.", "success");
    setEvent("Tick recibido");

    if (tickCount === 1) writeLog("ÉXITO: primer tick recibido.");
    renderDigits();
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
    setMessage("Conexión detenida.", "");
  }

  function closeSocketSilently() {
    clearPing();
    if (!socket) return;
    socket.onopen = null;
    socket.onmessage = null;
    socket.onerror = null;
    socket.onclose = null;
    try { socket.close(); } catch (error) {}
    socket = null;
  }

  function clearPing() {
    if (pingTimer) clearInterval(pingTimer);
    pingTimer = null;
  }

  function resetTicks() {
    tickCount = 0;
    digits = [];
    ui.price.textContent = "--";
    ui.lastDigit.textContent = "--";
    ui.tickCount.textContent = "0";
    ui.digitHistory.innerHTML = "<span>--</span>";
  }

  function renderDigits() {
    ui.digitHistory.innerHTML = "";
    for (let i = digits.length - 1; i >= 0; i--) {
      const span = document.createElement("span");
      span.textContent = digits[i];
      ui.digitHistory.appendChild(span);
    }
  }

  function setBadge(text, cls) {
    ui.statusBadge.textContent = text;
    ui.statusBadge.className = "badge " + cls;
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
      "Trading Analyzer Pro V1.2",
      "JavaScript: " + ui.jsCheck.textContent,
      "Mercados: " + ui.symbolsCheck.textContent,
      "WebSocket: " + ui.socketCheck.textContent,
      "Estado: " + ui.readyState.textContent,
      "Código: " + ui.closeCode.textContent,
      "Mercado elegido: " + ui.selectedSymbol.textContent,
      "Servidor: " + ui.serverUrl.textContent,
      "Último evento: " + ui.lastEvent.textContent,
      "",
      ui.log.textContent
    ].join("\n");

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(showCopied).catch(function () { fallbackCopy(text); });
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
    try { document.execCommand("copy"); showCopied(); }
    catch (error) { setMessage("No se pudo copiar. Envía una captura.", "error"); }
    document.body.removeChild(area);
  }

  function showCopied() {
    ui.copyBtn.textContent = "Copiado";
    setTimeout(function () { ui.copyBtn.textContent = "Copiar"; }, 1500);
  }

  start();
})();
