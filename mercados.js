/*
  Trading Analyzer V2
  Módulo: mercados.js
  Versión: 2.2.0

  Responsabilidades:
  - Solicitar los mercados activos a Deriv.
  - Guardar la lista recibida.
  - Encontrar los índices Volatility.
  - Informar errores y resultados.
*/

import { conexionDeriv } from "./conexion.js";

class MercadosDeriv {
  constructor(conexion) {
    this.conexion = conexion;

    this.listaCompleta = [];
    this.volatility = [];

    this.reqId = 100;
    this.suscriptores = [];

    this.conexion.alRecibirMensaje(
      (datos) => this.procesarMensaje(datos)
    );
  }

  registrar(mensaje, tipo = "info") {
    const hora = new Date().toLocaleTimeString();

    console.log(
      `[${hora}] [MERCADOS] [${tipo.toUpperCase()}] ${mensaje}`
    );

    window.dispatchEvent(
      new CustomEvent("deriv:diagnostico", {
        detail: {
          hora,
          tipo,
          mensaje: `[Mercados] ${mensaje}`
        }
      })
    );
  }

  obtenerCodigo(mercado) {
    return (
      mercado.symbol ||
      mercado.underlying_symbol ||
      ""
    );
  }

  solicitarMercados() {
    if (!this.conexion.estaConectado()) {
      this.registrar(
        "No se pueden solicitar mercados porque Deriv no está conectado.",
        "error"
      );

      return false;
    }

    this.registrar(
      "Solicitando lista de mercados activos..."
    );

    return this.conexion.enviar({
      active_symbols: "full",
      req_id: this.reqId
    });
  }

  procesarMensaje(datos) {
    if (!datos || typeof datos !== "object") {
      return;
    }

    if (
      datos.error &&
      datos.echo_req &&
      datos.echo_req.active_symbols
    ) {
      this.registrar(
        `Deriv rechazó la solicitud: ${datos.error.message}`,
        "error"
      );

      return;
    }

    if (
      datos.msg_type !== "active_symbols" ||
      !Array.isArray(datos.active_symbols)
    ) {
      return;
    }

    this.listaCompleta = datos.active_symbols;

    this.registrar(
      `Mercados recibidos: ${this.listaCompleta.length}`,
      "exito"
    );

    this.volatility = this.buscarIndicesVolatility(
      this.listaCompleta
    );

    if (this.volatility.length === 0) {
      this.registrar(
        "No se encontraron índices Volatility.",
        "aviso"
      );
    } else {
      this.registrar(
        `Índices Volatility encontrados: ${this.volatility.length}`,
        "exito"
      );

      this.volatility.forEach((mercado) => {
        this.registrar(
          `${mercado.nombre} = ${mercado.codigo}`
        );
      });
    }

    this.notificarSuscriptores();
  }

  buscarIndicesVolatility(lista) {
    const resultados = [];

    lista.forEach((mercado) => {
      const codigo = this.obtenerCodigo(mercado);

      const nombre = String(
        mercado.display_name ||
        mercado.market_display_name ||
        ""
      );

      const texto = nombre.toLowerCase();

      const pareceVolatility =
        texto.includes("volatility") ||
        /^R_(10|25|50|75|100)$/.test(codigo) ||
        /^1HZ(10|25|50|75|100)V$/.test(codigo);

      if (!pareceVolatility) {
        return;
      }

      resultados.push({
        codigo,
        nombre: nombre || codigo,
        mercado: mercado.market || "",
        submercado: mercado.submarket || "",
        exchangeIsOpen:
          mercado.exchange_is_open ?? null,
        datosOriginales: mercado
      });
    });

    return resultados.sort((a, b) => {
      return a.nombre.localeCompare(b.nombre);
    });
  }

  obtenerTodos() {
    return [...this.listaCompleta];
  }

  obtenerVolatility() {
    return [...this.volatility];
  }

  buscarPorCodigo(codigo) {
    return this.volatility.find(
      (mercado) => mercado.codigo === codigo
    ) || null;
  }

  alActualizar(funcion) {
    if (typeof funcion !== "function") {
      return;
    }

    this.suscriptores.push(funcion);
  }

  notificarSuscriptores() {
    const datos = {
      todos: this.obtenerTodos(),
      volatility: this.obtenerVolatility()
    };

    this.suscriptores.forEach((funcion) => {
      try {
        funcion(datos);
      } catch (error) {
        this.registrar(
          `Error notificando mercados: ${error.message}`,
          "error"
        );
      }
    });

    window.dispatchEvent(
      new CustomEvent("deriv:mercados", {
        detail: datos
      })
    );
  }
}

const mercadosDeriv =
  new MercadosDeriv(conexionDeriv);

export {
  MercadosDeriv,
  mercadosDeriv
};
