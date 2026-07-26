/*
  Trading Analyzer V2
  Módulo: conexion.js
  Versión: 2.1.0

  Responsabilidades:
  - Abrir la conexión WebSocket con Deriv.
  - Mantener viva la conexión.
  - Detectar errores y cierres.
  - Intentar reconectarse automáticamente.
  - Enviar y recibir mensajes.
*/

class ConexionDeriv {
  constructor(opciones = {}) {
      this.url =
  opciones.url ||
  "wss://ws.derivws.com/websockets/v3?app_id=1089";

    this.socket = null;

    this.estado = "desconectado";
    this.intentoReconexion = 0;

    this.maximoIntentos =
      opciones.maximoIntentos || 10;

    this.retrasoInicial =
      opciones.retrasoInicial || 2000;

    this.retrasoMaximo =
      opciones.retrasoMaximo || 30000;

    this.intervaloPing =
      opciones.intervaloPing || 30000;

    this.temporizadorPing = null;
    this.temporizadorReconexion = null;

    this.cierreManual = false;

    this.suscriptoresMensaje = [];
    this.suscriptoresEstado = [];
  }

  registrar(mensaje, tipo = "info") {
    const hora = new Date().toLocaleTimeString();

    console.log(
      `[${hora}] [${tipo.toUpperCase()}] ${mensaje}`
    );

    window.dispatchEvent(
      new CustomEvent("deriv:diagnostico", {
        detail: {
          hora,
          tipo,
          mensaje
        }
      })
    );
  }

  cambiarEstado(nuevoEstado, detalle = "") {
    this.estado = nuevoEstado;

    const informacion = {
      estado: nuevoEstado,
      detalle
    };

    this.suscriptoresEstado.forEach((funcion) => {
      try {
        funcion(informacion);
      } catch (error) {
        console.error(
          "Error en suscriptor de estado:",
          error
        );
      }
    });

    window.dispatchEvent(
      new CustomEvent("deriv:estado", {
        detail: informacion
      })
    );
  }

  estaConectado() {
    return (
      this.socket &&
      this.socket.readyState === WebSocket.OPEN
    );
  }

  estaConectando() {
    return (
      this.socket &&
      this.socket.readyState === WebSocket.CONNECTING
    );
  }

  conectar() {
    if (this.estaConectado()) {
      this.registrar(
        "La conexión con Deriv ya está abierta.",
        "aviso"
      );

      return;
    }

    if (this.estaConectando()) {
      this.registrar(
        "La conexión con Deriv ya está en proceso.",
        "aviso"
      );

      return;
    }

    this.cierreManual = false;

    this.limpiarTemporizadorReconexion();

    this.cambiarEstado(
      "conectando",
      "Abriendo conexión con Deriv..."
    );

    this.registrar(
      `Conectando al servidor: ${this.url}`
    );

    try {
      this.socket = new WebSocket(this.url);
    } catch (error) {
      this.registrar(
        `No se pudo crear el WebSocket: ${error.message}`,
        "error"
      );

      this.cambiarEstado(
        "error",
        error.message
      );

      this.programarReconexion();
      return;
    }

    this.socket.addEventListener(
      "open",
      () => this.manejarApertura()
    );

    this.socket.addEventListener(
      "message",
      (evento) => this.manejarMensaje(evento)
    );

    this.socket.addEventListener(
      "error",
      (evento) => this.manejarError(evento)
    );

    this.socket.addEventListener(
      "close",
      (evento) => this.manejarCierre(evento)
    );
  }

  manejarApertura() {
    this.intentoReconexion = 0;

    this.cambiarEstado(
      "conectado",
      "Conexión WebSocket establecida."
    );

    this.registrar(
      "Conexión WebSocket establecida correctamente.",
      "exito"
    );

    this.iniciarPing();

    window.dispatchEvent(
      new CustomEvent("deriv:conectado")
    );
  }

  manejarMensaje(evento) {
    let datos;

    try {
      datos = JSON.parse(evento.data);
    } catch (error) {
      this.registrar(
        "Deriv envió una respuesta que no pudo interpretarse.",
        "error"
      );

      return;
    }

    if (datos.error) {
      const codigo =
        datos.error.code || "sin_codigo";

      const mensaje =
        datos.error.message ||
        "Error desconocido de Deriv";

      this.registrar(
        `Error de Deriv (${codigo}): ${mensaje}`,
        "error"
      );
    }

    this.suscriptoresMensaje.forEach((funcion) => {
      try {
        funcion(datos);
      } catch (error) {
        this.registrar(
          `Error procesando una respuesta: ${error.message}`,
          "error"
        );
      }
    });

    window.dispatchEvent(
      new CustomEvent("deriv:mensaje", {
        detail: datos
      })
    );
  }

  manejarError() {
    this.registrar(
      "El navegador detectó un error en la conexión WebSocket.",
      "error"
    );

    this.cambiarEstado(
      "error",
      "Error en la conexión WebSocket."
    );

    window.dispatchEvent(
      new CustomEvent("deriv:error")
    );
  }

  manejarCierre(evento) {
    this.detenerPing();

    const codigo = evento.code;
    const razon =
      evento.reason || "Sin descripción";

    this.registrar(
      `Conexión cerrada. Código: ${codigo}. Razón: ${razon}`,
      this.cierreManual ? "info" : "aviso"
    );

    this.socket = null;

    if (this.cierreManual) {
      this.cambiarEstado(
        "desconectado",
        "Conexión cerrada manualmente."
      );

      return;
    }

    this.cambiarEstado(
      "reconectando",
      "La conexión se perdió."
    );

    this.programarReconexion();
  }

  enviar(solicitud) {
    if (!solicitud || typeof solicitud !== "object") {
      this.registrar(
        "La solicitud debe ser un objeto válido.",
        "error"
      );

      return false;
    }

    if (!this.estaConectado()) {
      this.registrar(
        "No se puede enviar la solicitud porque Deriv no está conectado.",
        "aviso"
      );

      return false;
    }

    try {
      const mensaje = JSON.stringify(solicitud);

      this.socket.send(mensaje);

      this.registrar(
        `Solicitud enviada: ${mensaje}`
      );

      return true;
    } catch (error) {
      this.registrar(
        `No se pudo enviar la solicitud: ${error.message}`,
        "error"
      );

      return false;
    }
  }

  iniciarPing() {
    this.detenerPing();

    this.temporizadorPing = setInterval(() => {
      if (!this.estaConectado()) {
        return;
      }

      try {
        this.socket.send(
          JSON.stringify({
            ping: 1
          })
        );
      } catch (error) {
        this.registrar(
          `No se pudo enviar ping: ${error.message}`,
          "error"
        );
      }
    }, this.intervaloPing);
  }

  detenerPing() {
    if (this.temporizadorPing) {
      clearInterval(this.temporizadorPing);
      this.temporizadorPing = null;
    }
  }

  calcularRetrasoReconexion() {
    const retraso =
      this.retrasoInicial *
      Math.pow(2, this.intentoReconexion);

    return Math.min(
      retraso,
      this.retrasoMaximo
    );
  }

  programarReconexion() {
    if (this.cierreManual) {
      return;
    }

    if (
      this.intentoReconexion >=
      this.maximoIntentos
    ) {
      this.cambiarEstado(
        "error",
        "Se alcanzó el máximo de reconexiones."
      );

      this.registrar(
        "Se alcanzó el máximo de intentos de reconexión.",
        "error"
      );

      return;
    }

    this.limpiarTemporizadorReconexion();

    const retraso =
      this.calcularRetrasoReconexion();

    this.intentoReconexion += 1;

    this.registrar(
      `Reconexión ${this.intentoReconexion} programada en ${Math.round(
        retraso / 1000
      )} segundos.`,
      "aviso"
    );

    this.temporizadorReconexion = setTimeout(
      () => {
        this.temporizadorReconexion = null;
        this.conectar();
      },
      retraso
    );
  }

  limpiarTemporizadorReconexion() {
    if (this.temporizadorReconexion) {
      clearTimeout(
        this.temporizadorReconexion
      );

      this.temporizadorReconexion = null;
    }
  }

  alRecibirMensaje(funcion) {
    if (typeof funcion !== "function") {
      return;
    }

    this.suscriptoresMensaje.push(funcion);
  }

  alCambiarEstado(funcion) {
    if (typeof funcion !== "function") {
      return;
    }

    this.suscriptoresEstado.push(funcion);
  }

  desconectar() {
    this.cierreManual = true;

    this.detenerPing();
    this.limpiarTemporizadorReconexion();

    if (this.socket) {
      try {
        this.socket.close(
          1000,
          "Cierre manual"
        );
      } catch (error) {
        this.registrar(
          `Error al cerrar la conexión: ${error.message}`,
          "error"
        );
      }
    }

    this.socket = null;

    this.cambiarEstado(
      "desconectado",
      "Conexión detenida."
    );

    this.registrar(
      "Conexión detenida manualmente."
    );
  }
}

const conexionDeriv = new ConexionDeriv();

export {
  ConexionDeriv,
  conexionDeriv
};
