/**
 * scripts/sockets.js
 * Registro centralizado de funciones remotas con socketlib.
 */

import * as chat from "./chat.js";
import * as currency from "./currency.js";
import * as reactions from "./reactions.js";
import * as resources from "./resources.js";
import * as tokens from "./tokens.js";

export function registrarSocketAntua() {
    if (typeof socketlib === "undefined") return;

    if (!globalThis.antuaQolSocket) {
        try {
            globalThis.antuaQolSocket = socketlib.registerModule("dnd55-qol-features-by-antua");
        } catch (e) {}
    }

    if (globalThis.antuaQolSocket && !globalThis.antuaQolRegistered) {
        const todasLasFunciones = {
            ...chat,
            ...currency,
            ...reactions,
            ...resources,
            ...tokens
        };

        for (const [nombre, funcion] of Object.entries(todasLasFunciones)) {
            if (typeof funcion === "function") {
                globalThis.antuaQolSocket.register(nombre, funcion);
            }
        }

        globalThis.antuaQolRegistered = true;
        console.log("%cdnd55-qol-features %c| Sockets registrados correctamente (Modular v2.1.0)", "color:#4BC470", "color:#B3B3B3");
    }
}