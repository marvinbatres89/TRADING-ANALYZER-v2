(function () {
  "use strict";

  function byId(id) {
    return document.getElementById(id);
  }

  var ui = {
    badge: byId("estadoBadge"),
    market: byId("mercadoSelect"),
    connect: byId("conectarBtn"),
    stop: byId("detenerBtn"),
    message: byId("mensajeEstado"),
    price: byId("precioActual"),
    digit: byId("ultimoDigito"),
    count: byId("ticksRecibidos"),
    jsState: byId("jsEstado"),
    socketState: byId("socketEstado"),
    server: byId("servidorUsado"),
    closeCode: byId("codigoCierre"),
    lastEvent: byId("ultimoEvento"),
    log: byId("registro"),
    history: byId("historialDigitos"),
    copy: byId("copiarBtn")
  };

  var tickCount = 0;
  var digits = [];

  ui.jsState.textContent = "Activo";
  ui.log.textContent = "JavaScript activo. Aplicación preparada.";

  var connection = new window.DerivConnection({
    onState: function (state, endpoint) {
      ui.socketState.textContent = state;
      ui.server.textContent = endpoint || "--";

      if (state === "OPEN") {
        setBadge("Conectado", "conectado");
        setMessage("Conectado. Esperando el primer precio.");
        ui.connect.disabled = false;
        ui.connect.textContent = "Cambiar mercado";
        ui.stop.disabled = false;
      } else if (state === "CONNECTING") {
        setBadge("Conectando", "conectando");
        setMessage("Abriendo conexión con Deriv...");
        ui.connect.disabled = true;
        ui.stop.disabled = false;
      } else if (state === "RECONNECTING") {
        setBadge("Reconectando", "conectando");
        setMessage("La conexión se perdió. Intentando reconectar...");
        ui.connect.disabled = true;
        ui.stop.disabled = false;
      } else {
        setBadge("Desconectado", "desconectado");
        ui.connect.disabled = false;
        ui.connect.textContent = "Conectar";
        ui.stop.disabled = true;
      }
    },

    onTick: function (tick) {
      var quote = Number(tick.quote);
      if (!isFinite(quote)) return;

      var decimals = typeof tick.pip_size === "number" ? tick.pip_size : 2;
      var formatted = quote.toFixed(decimals);
      var clean = formatted.replace(".", "");
      var lastDigit = clean.charAt(clean.length - 1);

      tickCount += 1;
      digits.push(lastDigit);
      if (digits.length > 20) digits.shift();

      ui.price.textContent = formatted;
      ui.digit.textContent = lastDigit;
      ui.count.textContent = String(tickCount);
      ui.lastEvent.textContent = "Tick recibido";
      ui.closeCode.textContent = "--";
      setMessage("Recibiendo precios en tiempo real.");
      renderDigits();
    },

    onLog: function (message) {
      addLog(message);
      ui.lastEvent.textContent = message;
    },

    onError: function (message) {
      addLog("ERROR: " + message);
      ui.lastEvent.textContent = message;
      setMessage(message, true);
    },

    onClose: function (event, manual) {
      ui.closeCode.textContent = String(event.code || "--");
      ui.lastEvent.textContent = manual ? "Cierre manual" : (event.reason || "Cierre inesperado");

      if (manual) {
        setMessage("Conexión detenida.");
      } else {
        setMessage("Conexión cerrada. El sistema intentará reconectarse.", true);
      }
    }
  });

  ui.connect.addEventListener("click", function () {
    resetData();
    connection.connect(ui.market.value);
  });

  ui.stop.addEventListener("click", function () {
    connection.stop(true);
    setMessage("Conexión detenida.");
    addLog("Conexión detenida por el usuario.");
  });

  ui.copy.addEventListener("click", function () {
    var report = [
      "JavaScript: " + ui.jsState.textContent,
      "Estado técnico: " + ui.socketState.textContent,
      "Servidor: " + ui.server.textContent,
      "Código de cierre: " + ui.closeCode.textContent,
      "Último evento: " + ui.lastEvent.textContent,
      "",
      ui.log.textContent
    ].join("\n");

    copyText(report);
  });

  function resetData() {
    tickCount = 0;
    digits = [];
    ui.price.textContent = "--";
    ui.digit.textContent = "--";
    ui.count.textContent = "0";
    ui.closeCode.textContent = "--";
    ui.lastEvent.textContent = "Nueva prueba";
    ui.history.innerHTML = "<span>--</span>";
    ui.log.textContent = "Nueva prueba iniciada.";
  }

  function renderDigits() {
    ui.history.innerHTML = "";

    for (var i = digits.length - 1; i >= 0; i--) {
      var span = document.createElement("span");
      span.textContent = digits[i];
      ui.history.appendChild(span);
    }
  }

  function setBadge(text, cssClass) {
    ui.badge.textContent = text;
    ui.badge.className = "badge " + cssClass;
  }

  function setMessage(text, error) {
    ui.message.textContent = text;
    ui.message.className = error ? "error" : "";
  }

  function addLog(text) {
    var time = new Date().toLocaleTimeString();
    ui.log.textContent += "\n[" + time + "] " + text;
    ui.log.scrollTop = ui.log.scrollHeight;
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(showCopied).catch(function () {
        fallbackCopy(text);
      });
    } else {
      fallbackCopy(text);
    }
  }

  function fallbackCopy(text) {
    var area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.left = "-9999px";
    document.body.appendChild(area);
    area.select();

    try {
      document.execCommand("copy");
      showCopied();
    } catch (error) {
      setMessage("No se pudo copiar. Envíame una captura del diagnóstico.", true);
    }

    document.body.removeChild(area);
  }

  function showCopied() {
    ui.copy.textContent = "Copiado";
    setTimeout(function () {
      ui.copy.textContent = "Copiar";
    }, 1500);
  }
})();
