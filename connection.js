export class DerivConnection {
  constructor({ onState, onTick, onLog, onError, onClose }) {
    this.onState = onState;
    this.onTick = onTick;
    this.onLog = onLog;
    this.onError = onError;
    this.onClose = onClose;

    // Se prueban en este orden. Todos incluyen app_id.
    this.endpoints = [
      "wss://ws.derivws.com/websockets/v3?app_id=1089",
      "wss://ws.binaryws.com/websockets/v3?app_id=1089"
    ];

    this.socket = null;
    this.market = null;
    this.endpointIndex = 0;
    this.manualClose = false;
    this.pingTimer = null;
    this.connectTimeout = null;
  }

  connect(market) {
    this.stop(false);
    this.market = market;
    this.endpointIndex = 0;
    this.manualClose = false;
    this.tryEndpoint();
  }

  tryEndpoint() {
    const url = this.endpoints[this.endpointIndex];
    this.onState("CONNECTING", url);
    this.onLog(`Intentando servidor ${this.endpointIndex + 1}: ${url}`);

    try {
      this.socket = new WebSocket(url);
    } catch (error) {
      this.failOrFallback(`No se pudo crear el WebSocket: ${error.message}`);
      return;
    }

    this.connectTimeout = setTimeout(() => {
      this.onLog("Tiempo de conexión agotado.");
      this.safeClose();
      this.failOrFallback("El servidor no respondió en 12 segundos.");
    }, 12000);

    this.socket.onopen = () => {
      clearTimeout(this.connectTimeout);
      this.onState("OPEN", url);
      this.onLog("Conexión abierta.");
      this.send({ ticks: this.market, subscribe: 1, req_id: 101 });
      this.onLog(`Suscripción enviada para ${this.market}.`);
      this.pingTimer = setInterval(() => this.send({ ping: 1 }), 30000);
    };

    this.socket.onmessage = (event) => {
      let data;
      try {
        data = JSON.parse(event.data);
      } catch {
        this.onError("Respuesta no válida del servidor.");
        return;
      }

      const type = data.msg_type || "sin_tipo";
      this.onLog(`Mensaje recibido: ${type}`);

      if (data.error) {
        const code = data.error.code ? ` [${data.error.code}]` : "";
        this.onError(`${data.error.message}${code}`);
        return;
      }

      if (type === "tick" && data.tick) {
        this.onTick(data.tick);
      }
    };

    this.socket.onerror = () => {
      this.onLog("El navegador notificó un error de WebSocket.");
    };

    this.socket.onclose = (event) => {
      clearTimeout(this.connectTimeout);
      this.clearPing();

      if (this.manualClose) {
        this.onState("CLOSED", url);
        this.onClose(event, true);
        return;
      }

      this.onLog(`Conexión cerrada. Código ${event.code || "--"}.`);
      if (this.endpointIndex < this.endpoints.length - 1) {
        this.endpointIndex += 1;
        this.onLog("Probando servidor alternativo...");
        setTimeout(() => this.tryEndpoint(), 900);
      } else {
        this.onState("CLOSED", url);
        this.onClose(event, false);
      }
    };
  }

  send(payload) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(payload));
    }
  }

  failOrFallback(message) {
    this.onLog(message);
    if (this.endpointIndex < this.endpoints.length - 1) {
      this.endpointIndex += 1;
      setTimeout(() => this.tryEndpoint(), 900);
    } else {
      this.onError(message);
      this.onState("CLOSED", this.endpoints[this.endpointIndex]);
    }
  }

  stop(manual = true) {
    this.manualClose = manual;
    clearTimeout(this.connectTimeout);
    this.clearPing();
    this.safeClose();
  }

  safeClose() {
    if (!this.socket) return;
    this.socket.onopen = null;
    this.socket.onmessage = null;
    this.socket.onerror = null;
    this.socket.onclose = null;
    try { this.socket.close(1000, "Cierre solicitado"); } catch {}
    this.socket = null;
  }

  clearPing() {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
  }
}
