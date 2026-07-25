(function () {
  "use strict";

  const API_URL = "wss://ws.binaryws.com/websockets/v3?app_id=1089";
  const $ = id => document.getElementById(id);

  const ui = {
    statusBadge: $("statusBadge"),
    inspectBtn: $("inspectBtn"),
    stopBtn: $("stopBtn"),
    mainMessage: $("mainMessage"),
    jsCheck: $("jsCheck"),
    socketCheck: $("socketCheck"),
    readyState: $("readyState"),
    messageType: $("messageType"),
    topKeys: $("topKeys"),
    itemCount: $("itemCount"),
    arrayPath: $("arrayPath"),
    firstItemKeys: $("firstItemKeys"),
    lastEvent: $("lastEvent"),
    firstItem: $("firstItem"),
    rawJson: $("rawJson"),
    log: $("log"),
    copyBtn: $("copyBtn"),
    copyFirstBtn: $("copyFirstBtn"),
    copyJsonBtn: $("copyJsonBtn")
  };

  let socket = null;
  let lastResponseText = "";
  let firstItemText = "";
  let manualClose = false;

  function start() {
    ui.jsCheck.textContent = "Activo";
    writeLog("JavaScript activo. Inspector V1.4 preparado.");
    setMessage("Pulsa “Inspeccionar mercados”.", "success");

    ui.inspectBtn.addEventListener("click", inspectMarkets);
    ui.stopBtn.addEventListener("click", stopConnection);
    ui.copyBtn.addEventListener("click", copyAll);
    ui.copyFirstBtn.addEventListener("click", () => copyText(firstItemText || ui.firstItem.textContent, ui.copyFirstBtn));
    ui.copyJsonBtn.addEventListener("click", () => copyText(lastResponseText || ui.rawJson.textContent, ui.copyJsonBtn));
  }

  function inspectMarkets() {
    closeSilently();
    resetView();
    manualClose = false;

    setBadge("Conectando", "badge-wait");
    setMessage("Conectando con Deriv y esperando la respuesta...", "wait");
    setEvent("Creando WebSocket");
    ui.socketCheck.textContent = "Creando";
    ui.readyState.textContent = "CONNECTING";
    ui.inspectBtn.disabled = true;
    ui.stopBtn.disabled = false;
    writeLog("Abriendo conexión: " + API_URL);

    try {
      socket = new WebSocket(API_URL);
    } catch (error) {
      showError("No se pudo crear WebSocket: " + error.message);
      restoreButtons();
      return;
    }

    socket.onopen = function () {
      ui.socketCheck.textContent = "Abierto";
      ui.readyState.textContent = "OPEN";
      setBadge("Conectado", "badge-on");
      setEvent("Solicitud enviada");
      writeLog("WebSocket abierto.");

      const request = {
        active_symbols: "full",
        req_id: 1401
      };

      socket.send(JSON.stringify(request));
      writeLog("Solicitud enviada: " + JSON.stringify(request));
    };

    socket.onmessage = function (event) {
      let data;

      try {
        data = JSON.parse(event.data);
      } catch (error) {
        showError("La respuesta recibida no era JSON válido.");
        ui.rawJson.textContent = event.data;
        return;
      }

      lastResponseText = JSON.stringify(data, null, 2);
      ui.rawJson.textContent = lastResponseText;
      ui.messageType.textContent = data.msg_type || "Sin msg_type";
      ui.topKeys.textContent = Object.keys(data).join(", ") || "Sin campos";
      setEvent("Respuesta recibida");

      writeLog("Respuesta recibida.");
      writeLog("Tipo: " + (data.msg_type || "sin tipo"));
      writeLog("Campos principales: " + Object.keys(data).join(", "));

      if (data.error) {
        const errorText = (data.error.message || "Error de Deriv") +
          (data.error.code ? " [" + data.error.code + "]" : "");
        showError(errorText);
        return;
      }

      const found = findBestObjectArray(data);

      if (!found.array.length) {
        ui.itemCount.textContent = "0";
        ui.arrayPath.textContent = "No encontrada";
        ui.firstItemKeys.textContent = "--";
        ui.firstItem.textContent = "No se encontró ninguna lista de objetos dentro de la respuesta.";
        setMessage("La respuesta fue recibida, pero no contiene una lista reconocible. Pulsa “Copiar todo”.", "error");
        writeLog("No se encontró una lista de objetos.");
        return;
      }

      const first = found.array[0];
      firstItemText = JSON.stringify(first, null, 2);

      ui.itemCount.textContent = String(found.array.length);
      ui.arrayPath.textContent = found.path;
      ui.firstItem.textContent = firstItemText;
      ui.firstItemKeys.textContent =
        first && typeof first === "object" && !Array.isArray(first)
          ? Object.keys(first).join(", ")
          : "El primer registro no es un objeto";

      setMessage("Inspección completada. Ahora pulsa “Copiar todo” y comparte el resultado.", "success");
      setEvent("Inspección completada");
      writeLog("Lista detectada en: " + found.path);
      writeLog("Cantidad de registros: " + found.array.length);
      writeLog("Campos del primer registro: " + ui.firstItemKeys.textContent);

      manualClose = true;
      try { socket.close(1000, "Inspección completada"); } catch (error) {}
    };

    socket.onerror = function () {
      showError("El navegador notificó un error WebSocket.");
    };

    socket.onclose = function (event) {
      ui.socketCheck.textContent = "Cerrado";
      ui.readyState.textContent = "CLOSED";
      setBadge("Sin conexión", "badge-off");
      writeLog("Conexión cerrada. Código: " + event.code +
        ". Motivo: " + (event.reason || "sin motivo"));

      if (!manualClose && !lastResponseText) {
        setMessage("La conexión se cerró antes de recibir la respuesta.", "error");
      }

      restoreButtons();
    };
  }

  function findBestObjectArray(root) {
    const candidates = [];

    function walk(value, path, depth) {
      if (depth > 7 || value == null) return;

      if (Array.isArray(value)) {
        const objectCount = value.filter(item =>
          item && typeof item === "object" && !Array.isArray(item)
        ).length;

        candidates.push({
          array: value,
          path: path || "(raíz)",
          score: objectCount * 1000 + value.length
        });

        value.slice(0, 5).forEach((item, index) => {
          walk(item, path + "[" + index + "]", depth + 1);
        });
        return;
      }

      if (typeof value === "object") {
        Object.keys(value).forEach(key => {
          const nextPath = path ? path + "." + key : key;
          walk(value[key], nextPath, depth + 1);
        });
      }
    }

    walk(root, "", 0);

    candidates.sort((a, b) => b.score - a.score);
    return candidates[0] || { array: [], path: "" };
  }

  function resetView() {
    lastResponseText = "";
    firstItemText = "";
    ui.messageType.textContent = "--";
    ui.topKeys.textContent = "--";
    ui.itemCount.textContent = "0";
    ui.arrayPath.textContent = "--";
    ui.firstItemKeys.textContent = "--";
    ui.firstItem.textContent = "Esperando respuesta...";
    ui.rawJson.textContent = "Esperando respuesta...";
  }

  function stopConnection() {
    manualClose = true;
    if (socket) {
      try { socket.close(1000, "Cierre solicitado"); } catch (error) {}
    }
    setMessage("Conexión detenida.", "");
  }

  function closeSilently() {
    if (!socket) return;
    socket.onopen = null;
    socket.onmessage = null;
    socket.onerror = null;
    socket.onclose = null;
    try { socket.close(); } catch (error) {}
    socket = null;
  }

  function copyAll() {
    const text = [
      "TRADING ANALYZER PRO V1.4 - INSPECCIÓN",
      "",
      "JavaScript: " + ui.jsCheck.textContent,
      "WebSocket: " + ui.socketCheck.textContent,
      "Estado: " + ui.readyState.textContent,
      "Tipo de mensaje: " + ui.messageType.textContent,
      "Campos principales: " + ui.topKeys.textContent,
      "Cantidad detectada: " + ui.itemCount.textContent,
      "Ruta de la lista: " + ui.arrayPath.textContent,
      "Campos del primer registro: " + ui.firstItemKeys.textContent,
      "Último evento: " + ui.lastEvent.textContent,
      "",
      "PRIMER REGISTRO:",
      firstItemText || ui.firstItem.textContent,
      "",
      "REGISTRO DE EVENTOS:",
      ui.log.textContent,
      "",
      "RESPUESTA COMPLETA:",
      lastResponseText || ui.rawJson.textContent
    ].join("\n");

    copyText(text, ui.copyBtn);
  }

  function copyText(text, button) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text)
        .then(() => showCopied(button))
        .catch(() => fallbackCopy(text, button));
    } else {
      fallbackCopy(text, button);
    }
  }

  function fallbackCopy(text, button) {
    const area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.left = "-9999px";
    document.body.appendChild(area);
    area.select();

    try {
      document.execCommand("copy");
      showCopied(button);
    } catch (error) {
      setMessage("No se pudo copiar. Envía capturas del resumen y del primer registro.", "error");
    }

    document.body.removeChild(area);
  }

  function showCopied(button) {
    const original = button.textContent;
    button.textContent = "Copiado";
    setTimeout(() => button.textContent = original, 1500);
  }

  function showError(text) {
    setMessage(text, "error");
    setEvent("Error");
    writeLog("ERROR: " + text);
  }

  function restoreButtons() {
    ui.inspectBtn.disabled = false;
    ui.stopBtn.disabled = true;
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

  start();
})();