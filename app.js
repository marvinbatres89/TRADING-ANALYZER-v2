(function () {
  "use strict";

  const API_URL = "wss://ws.binaryws.com/websockets/v3?app_id=1089";
  const $ = id => document.getElementById(id);
  const ui = {
    statusBadge:$("statusBadge"), loadBtn:$("loadBtn"), market:$("market"),
    connectBtn:$("connectBtn"), stopBtn:$("stopBtn"), mainMessage:$("mainMessage"),
    price:$("price"), lastDigit:$("lastDigit"), tickCount:$("tickCount"),
    jsCheck:$("jsCheck"), symbolsCheck:$("symbolsCheck"), socketCheck:$("socketCheck"),
    readyState:$("readyState"), closeCode:$("closeCode"), selectedSymbol:$("selectedSymbol"),
    formatCheck:$("formatCheck"), lastEvent:$("lastEvent"), log:$("log"),
    digitHistory:$("digitHistory"), copyBtn:$("copyBtn")
  };

  let socket = null;
  let mode = "";
  let manualClose = false;
  let tickCount = 0;
  let digits = [];
  let pingTimer = null;

  function start() {
    ui.jsCheck.textContent = "Activo";
    writeLog("JavaScript activo. Versión 1.3.");
    setMessage("Pulsa “Cargar mercados”.", "success");
    ui.loadBtn.onclick = loadMarkets;
    ui.connectBtn.onclick = connectTicks;
    ui.stopBtn.onclick = stop;
    ui.copyBtn.onclick = copyDiagnostic;
    ui.market.onchange = () => ui.selectedSymbol.textContent = ui.market.value || "--";
  }

  function loadMarkets() {
    openConnection("symbols");
  }

  function connectTicks() {
    if (!ui.market.value) {
      setMessage("Selecciona un mercado.", "error");
      return;
    }
    ui.selectedSymbol.textContent = ui.market.value;
    openConnection("ticks");
  }

  function openConnection(newMode) {
    closeSilently();
    mode = newMode;
    manualClose = false;

    ui.socketCheck.textContent = "Creando";
    ui.readyState.textContent = "CONNECTING";
    ui.closeCode.textContent = "--";
    setBadge("Conectando", "badge-wait");
    setEvent(newMode === "symbols" ? "Solicitando mercados" : "Solicitando ticks");
    setMessage(newMode === "symbols" ? "Consultando la API de Deriv..." : "Conectando al mercado...", "wait");
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
        // Se omite product_type para no excluir mercados por compatibilidad.
        send({ active_symbols: "full", req_id: 101 });
        writeLog('Enviado: {"active_symbols":"full"}');
      } else {
        resetTicks();
        send({ ticks: ui.market.value, subscribe: 1, req_id: 202 });
        writeLog("Suscripción enviada para " + ui.market.value);
      }

      pingTimer = setInterval(() => send({ ping: 1 }), 30000);
    };

    socket.onmessage = function (event) {
      let data;
      try {
        data = JSON.parse(event.data);
      } catch (error) {
        fail("La respuesta no era JSON válido.");
        return;
      }

      writeLog("Respuesta recibida. Tipo: " + (data.msg_type || "sin tipo") +
        ". Claves: " + Object.keys(data).join(", "));

      if (data.error) {
        fail((data.error.message || "Error de Deriv") +
          (data.error.code ? " [" + data.error.code + "]" : ""));
        return;
      }

      if (mode === "symbols" && (data.msg_type === "active_symbols" || data.active_symbols)) {
        processSymbolsResponse(data);
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
      ui.closeCode.textContent = String(event.code || "--");
      setBadge("Sin conexión", "badge-off");
      writeLog("Conexión cerrada. Código " + event.code + ".");
      restoreButtons();
    };
  }

  function processSymbolsResponse(data) {
    const raw = locateSymbolArray(data);
    ui.formatCheck.textContent = describeFormat(data, raw);
    writeLog("Registros brutos encontrados: " + raw.length);

    const mapped = raw.map((item, index) => normalizeSymbol(item, index))
      .filter(item => item.symbol);

    const unique = [];
    const seen = new Set();
    mapped.forEach(item => {
      if (!seen.has(item.symbol)) {
        seen.add(item.symbol);
        unique.push(item);
      }
    });

    writeLog("Símbolos normalizados: " + unique.length);

    // Priorizamos índices derivados/sintéticos, pero no eliminamos el resto.
    unique.sort((a, b) => {
      const ap = isDerived(a) ? 0 : 1;
      const bp = isDerived(b) ? 0 : 1;
      return ap - bp || a.name.localeCompare(b.name);
    });

    if (!unique.length) {
      ui.symbolsCheck.textContent = "0 encontrados";
      const sample = raw[0] ? JSON.stringify(raw[0]).slice(0, 700) : "Sin primer registro";
      writeLog("MUESTRA DE RESPUESTA: " + sample);
      fail("Deriv respondió, pero no se pudo reconocer ningún símbolo. Copia el diagnóstico.");
      return;
    }

    ui.market.innerHTML = "";
    unique.forEach(item => {
      const option = document.createElement("option");
      option.value = item.symbol;
      option.textContent = item.name + " — " + item.symbol;
      ui.market.appendChild(option);
    });

    ui.market.disabled = false;
    ui.connectBtn.disabled = false;
    ui.symbolsCheck.textContent = unique.length + " cargados";
    ui.selectedSymbol.textContent = ui.market.value;
    setEvent("Mercados cargados");
    setMessage("Mercados cargados correctamente. Selecciona uno y pulsa “Recibir precios”.", "success");
    writeLog("ÉXITO: lista de mercados creada.");

    manualClose = true;
    try { socket.close(1000, "Mercados recibidos"); } catch (error) {}
  }

  function locateSymbolArray(data) {
    if (Array.isArray(data.active_symbols)) return data.active_symbols;
    if (data.active_symbols && Array.isArray(data.active_symbols.symbols)) return data.active_symbols.symbols;
    if (data.data && Array.isArray(data.data.active_symbols)) return data.data.active_symbols;
    if (data.data && Array.isArray(data.data.symbols)) return data.data.symbols;
    if (Array.isArray(data.symbols)) return data.symbols;

    const arrays = [];
    function walk(value, depth) {
      if (depth > 4 || value == null) return;
      if (Array.isArray(value)) {
        if (value.length && typeof value[0] === "object") arrays.push(value);
        return;
      }
      if (typeof value === "object") {
        Object.keys(value).forEach(key => walk(value[key], depth + 1));
      }
    }
    walk(data, 0);
    return arrays.sort((a, b) => b.length - a.length)[0] || [];
  }

  function normalizeSymbol(item, index) {
    if (typeof item === "string") return { symbol:item, name:item, raw:item };

    const symbol =
      item.underlying_symbol ||
      item.symbol ||
      item.shortcode ||
      item.code ||
      item.id ||
      "";

    const name =
      item.symbol_display_name ||
      item.display_name ||
      item.underlying_display_name ||
      item.name ||
      item.market_display_name ||
      symbol ||
      ("Mercado " + (index + 1));

    const market = [
      item.market,
      item.market_display_name,
      item.submarket,
      item.submarket_display_name
    ].filter(Boolean).join(" ");

    return { symbol:String(symbol), name:String(name), market:market, raw:item };
  }

  function isDerived(item) {
    const text = (item.symbol + " " + item.name + " " + item.market).toLowerCase();
    return /volatility|synthetic|derived|jump|boom|crash|step|range break|drift|dex|r_\d|1hz/.test(text);
  }

  function describeFormat(data, raw) {
    if (Array.isArray(data.active_symbols)) {
      const first = raw[0] || {};
      if (first.underlying_symbol) return "Nuevo: underlying_symbol";
      if (first.symbol) return "Clásico: symbol";
      return "active_symbols desconocido";
    }
    if (data.active_symbols && Array.isArray(data.active_symbols.symbols)) return "Anidado: active_symbols.symbols";
    if (data.data) return "Anidado dentro de data";
    return "Detectado por búsqueda";
  }

  function processTick(tick) {
    const quote = Number(tick.quote);
    if (!Number.isFinite(quote)) return;
    const decimals = Number.isInteger(tick.pip_size) ? tick.pip_size : 2;
    const formatted = quote.toFixed(decimals);
    const nums = formatted.replace(/\D/g, "");
    const last = nums.slice(-1);

    tickCount++;
    digits.push(last);
    if (digits.length > 20) digits.shift();

    ui.price.textContent = formatted;
    ui.lastDigit.textContent = last;
    ui.tickCount.textContent = tickCount;
    setBadge("Recibiendo datos", "badge-on");
    setMessage("Precios en tiempo real recibidos correctamente.", "success");
    setEvent("Tick recibido");
    if (tickCount === 1) writeLog("ÉXITO: primer tick recibido.");
    renderDigits();
  }

  function resetTicks() {
    tickCount = 0; digits = [];
    ui.price.textContent = "--"; ui.lastDigit.textContent = "--";
    ui.tickCount.textContent = "0";
    ui.digitHistory.innerHTML = "<span>--</span>";
  }

  function renderDigits() {
    ui.digitHistory.innerHTML = "";
    [...digits].reverse().forEach(d => {
      const span = document.createElement("span");
      span.textContent = d;
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
    if (socket) try { socket.close(1000, "Cierre solicitado"); } catch (e) {}
    setMessage("Conexión detenida.", "");
  }

  function closeSilently() {
    clearPing();
    if (!socket) return;
    socket.onopen = socket.onmessage = socket.onerror = socket.onclose = null;
    try { socket.close(); } catch (e) {}
    socket = null;
  }

  function clearPing() {
    if (pingTimer) clearInterval(pingTimer);
    pingTimer = null;
  }

  function restoreButtons() {
    ui.loadBtn.disabled = false;
    ui.stopBtn.disabled = true;
    if (!ui.market.disabled && ui.market.value) ui.connectBtn.disabled = false;
  }

  function fail(text) {
    setMessage(text, "error");
    setEvent("Error");
    writeLog("ERROR: " + text);
  }

  function setBadge(text, cls) {
    ui.statusBadge.textContent = text;
    ui.statusBadge.className = "badge " + cls;
  }

  function setMessage(text, type) {
    ui.mainMessage.textContent = text;
    ui.mainMessage.className = "message" + (type ? " " + type : "");
  }

  function setEvent(text) { ui.lastEvent.textContent = text; }

  function writeLog(text) {
    ui.log.textContent += "\n[" + new Date().toLocaleTimeString() + "] " + text;
    ui.log.scrollTop = ui.log.scrollHeight;
  }

  function copyDiagnostic() {
    const text = [
      "Trading Analyzer Pro V1.3",
      "JavaScript: " + ui.jsCheck.textContent,
      "Mercados: " + ui.symbolsCheck.textContent,
      "WebSocket: " + ui.socketCheck.textContent,
      "Estado: " + ui.readyState.textContent,
      "Código: " + ui.closeCode.textContent,
      "Símbolo: " + ui.selectedSymbol.textContent,
      "Formato: " + ui.formatCheck.textContent,
      "Último evento: " + ui.lastEvent.textContent,
      "",
      ui.log.textContent
    ].join("\n");

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(showCopied).catch(() => fallbackCopy(text));
    } else fallbackCopy(text);
  }

  function fallbackCopy(text) {
    const area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.left = "-9999px";
    document.body.appendChild(area);
    area.select();
    try { document.execCommand("copy"); showCopied(); }
    catch (e) { setMessage("No se pudo copiar. Envía una captura.", "error"); }
    document.body.removeChild(area);
  }

  function showCopied() {
    ui.copyBtn.textContent = "Copiado";
    setTimeout(() => ui.copyBtn.textContent = "Copiar", 1500);
  }

  start();
})();