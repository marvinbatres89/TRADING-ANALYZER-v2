(function (global) {
  "use strict";

  function DerivConnection(options) {
    this.options = options || {};
    this.socket = null;
    this.market = "";
    this.manualStop = false;
    this.pingTimer = null;
    this.reconnectTimer = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 3;

    // Endpoint público recomendado para datos de mercado.
    this.endpoint = "wss://ws.binaryws.com/websockets/v3";
  }

  DerivConnection.prototype.connect = function (market) {
    this.stop(false);
    this.market = market;
    this.manualStop = false;
    this.reconnectAttempts = 0;
    this.open();
  };

  DerivConnection.prototype.open = function () {
    var self = this;

    self.emitState("CONNECTING");
    self.emitLog("Intentando conexión con Deriv.");

    try {
      self.socket = new WebSocket(self.endpoint);
    } catch (error) {
      self.emitError("No se pudo crear la conexión: " + error.message);
      self.scheduleReconnect();
      return;
    }

    self.socket.onopen = function () {
      self.reconnectAttempts = 0;
      self.emitState("OPEN");
      self.emitLog("Conexión abierta correctamente.");

      self.send({
        ticks: self.market,
        subscribe: 1,
        req_id: 101
      });

      self.emitLog("Suscripción enviada para " + self.market + ".");

      self.pingTimer = setInterval(function () {
        self.send({ ping: 1, req_id: 900 });
      }, 30000);
    };

    self.socket.onmessage = function (event) {
      var data;

      try {
        data = JSON.parse(event.data);
      } catch (error) {
        self.emitError("El servidor envió una respuesta no válida.");
        return;
      }

      if (data.error) {
        self.emitError(data.error.message + (data.error.code ? " [" + data.error.code + "]" : ""));
        return;
      }

      if (data.msg_type === "tick" && data.tick) {
        if (typeof self.options.onTick === "function") {
          self.options.onTick(data.tick);
        }
      } else if (data.msg_type === "ping") {
        self.emitLog("Conexión activa.");
      }
    };

    self.socket.onerror = function () {
      self.emitLog("El navegador notificó un error de WebSocket.");
    };

    self.socket.onclose = function (event) {
      self.clearPing();
      self.emitClose(event);

      if (!self.manualStop) {
        self.scheduleReconnect();
      }
    };
  };

  DerivConnection.prototype.scheduleReconnect = function () {
    var self = this;

    if (self.manualStop) return;

    if (self.reconnectAttempts >= self.maxReconnectAttempts) {
      self.emitState("CLOSED");
      self.emitError("No fue posible reconectar después de varios intentos.");
      return;
    }

    self.reconnectAttempts += 1;
    self.emitState("RECONNECTING");
    self.emitLog("Reconexión " + self.reconnectAttempts + " de " + self.maxReconnectAttempts + ".");

    self.reconnectTimer = setTimeout(function () {
      self.open();
    }, 2000);
  };

  DerivConnection.prototype.send = function (payload) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(payload));
    }
  };

  DerivConnection.prototype.stop = function (manual) {
    this.manualStop = manual !== false;
    this.clearTimers();

    if (this.socket) {
      this.socket.onopen = null;
      this.socket.onmessage = null;
      this.socket.onerror = null;
      this.socket.onclose = null;

      try {
        this.socket.close(1000, "Cierre solicitado");
      } catch (error) {}

      this.socket = null;
    }

    if (this.manualStop) {
      this.emitState("CLOSED");
    }
  };

  DerivConnection.prototype.clearPing = function () {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  };

  DerivConnection.prototype.clearTimers = function () {
    this.clearPing();

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  };

  DerivConnection.prototype.emitState = function (state) {
    if (typeof this.options.onState === "function") {
      this.options.onState(state, this.endpoint);
    }
  };

  DerivConnection.prototype.emitLog = function (message) {
    if (typeof this.options.onLog === "function") {
      this.options.onLog(message);
    }
  };

  DerivConnection.prototype.emitError = function (message) {
    if (typeof this.options.onError === "function") {
      this.options.onError(message);
    }
  };

  DerivConnection.prototype.emitClose = function (event) {
    if (typeof this.options.onClose === "function") {
      this.options.onClose(event, this.manualStop);
    }
  };

  global.DerivConnection = DerivConnection;
})(window);
