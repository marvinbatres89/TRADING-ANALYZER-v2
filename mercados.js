/*
  Trading Analyzer V2
  Archivo: mercados.js

  Funciones:
  - Solicitar mercados activos a Deriv.
  - Detectar índices Volatility.
  - Mostrar diagnósticos.
*/

import { conexionDeriv } from "./conexion.js";

class MercadosDeriv {
  constructor(conexion) {
    this.conexion = conexion;

    this.listaCompleta = [];
    this.volatility = [];
    this.suscriptores = [];

    this.reqId = 100;

    this.conexion.alRecibirMensaje(
      (datos) => {
        this.procesarMensaje(datos);
      }
    );
  }

  registrar(mensaje, tipo = "info") {
    const hora =
      new Date().toLocaleTimeString();

    console.log(
      `[${hora}] [MERCADOS] ${mensaje}`
    );

    window.dispatchEvent(
      new CustomEvent(
        "deriv:diagnostico",
        {
          detail: {
            hora: hora,
            tipo: tipo,
            mensaje:
              "[Mercados] " + mensaje
          }
        }
      )
    );
  }

  solicitarMercados() {
    if (!this.conexion.estaConectado()) {
      this.registrar(
        "Deriv no está conectado.",
        "error"
      );

      return false;
    }

    this.registrar(
      "Solicitando mercados activos..."
    );

    const solicitud = {
      active_symbols: "brief",
      product_type: "basic",
      req_id: this.reqId
    };

    this.registrar(
      "Solicitud enviada: " +
      JSON.stringify(solicitud)
    );

    return this.conexion.enviar(
      solicitud
    );
  }

  procesarMensaje(datos) {
    if (
      !datos ||
      typeof datos !== "object"
    ) {
      return;
    }

    if (
      datos.error &&
      datos.echo_req &&
      datos.echo_req.active_symbols
    ) {
      this.registrar(
        "Deriv rechazó la solicitud: " +
        datos.error.message,
        "error"
      );

      return;
    }

    if (
      datos.msg_type !==
      "active_symbols"
    ) {
      return;
    }

    this.registrar(
      "Respuesta active_symbols recibida."
    );

    if (
      !Array.isArray(
        datos.active_symbols
      )
    ) {
      this.registrar(
        "La respuesta no contiene una lista válida.",
        "error"
      );

      return;
    }

    this.listaCompleta =
      datos.active_symbols;

    this.registrar(
      "Mercados recibidos: " +
      this.listaCompleta.length
    );

    this.volatility =
      this.buscarIndicesVolatility(
        this.listaCompleta
      );

    this.registrar(
      "Índices Volatility encontrados: " +
      this.volatility.length
    );

    this.volatility.forEach(
      (mercado) => {
        this.registrar(
          mercado.nombre +
          " = " +
          mercado.codigo
        );
      }
    );

    this.notificarSuscriptores();
  }

  buscarIndicesVolatility(lista) {
    return lista
      .filter(
        (mercado) => {
          const codigo =
            String(
              mercado.symbol || ""
            );

          const nombre =
            String(
              mercado.display_name ||
              ""
            ).toLowerCase();

          const submercado =
            String(
              mercado.submarket ||
              ""
            ).toLowerCase();

          return (
            nombre.includes(
              "volatility"
            ) ||
            submercado.includes(
              "random"
            ) ||
            /^R_(10|25|50|75|100)$/.test(
              codigo
            ) ||
            /^1HZ(10|25|50|75|100)V$/.test(
              codigo
            )
          );
        }
      )
      .map(
        (mercado) => {
          return {
            codigo:
              mercado.symbol || "",

            nombre:
              mercado.display_name ||
              mercado.symbol ||
              "Sin nombre",

            mercado:
              mercado.market || "",

            submercado:
              mercado.submarket || "",

            datosOriginales:
              mercado
          };
        }
      )
      .sort(
        (a, b) => {
          return a.nombre.localeCompare(
            b.nombre
          );
        }
      );
  }

  obtenerTodos() {
    return [
      ...this.listaCompleta
    ];
  }

  obtenerVolatility() {
    return [
      ...this.volatility
    ];
  }

  buscarPorCodigo(codigo) {
    return (
      this.volatility.find(
        (mercado) => {
          return (
            mercado.codigo === codigo
          );
        }
      ) || null
    );
  }

  alActualizar(funcion) {
    if (
      typeof funcion !== "function"
    ) {
      return;
    }

    this.suscriptores.push(
      funcion
    );
  }

  notificarSuscriptores() {
    const datos = {
      todos:
        this.obtenerTodos(),

      volatility:
        this.obtenerVolatility()
    };

    this.suscriptores.forEach(
      (funcion) => {
        try {
          funcion(datos);
        } catch (error) {
          this.registrar(
            "Error notificando mercados: " +
            error.message,
            "error"
          );
        }
      }
    );

    window.dispatchEvent(
      new CustomEvent(
        "deriv:mercados",
        {
          detail: datos
        }
      )
    );
  }
}

const mercadosDeriv =
  new MercadosDeriv(
    conexionDeriv
  );

export {
  MercadosDeriv,
  mercadosDeriv
};
