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
/**
 * Aplica un ActiveEffect a un actor objetivo con permisos de GM.
 */
export async function aplicarEfectoActivoGM({ actorUuid, effectData }) {
  const doc = await fromUuid(actorUuid);
  const targetActor = doc?.actor || doc;
  if (!targetActor) return null;
  const [created] = await targetActor.createEmbeddedDocuments("ActiveEffect", [effectData]);
  return created?.uuid;
}

/**
 * Elimina el efecto de marca anterior de un objetivo con permisos de GM.
 */
export async function eliminarEfectoActivoGM({ actorUuid, effectName, casterUuid }) {
  if (!actorUuid) return false;
  const doc = await fromUuid(actorUuid);
  const targetActor = doc?.actor || doc;
  if (!targetActor) return false;
  const effect = targetActor.effects.find(e => 
    (e.name === effectName || e.flags?.["dnd55-qol-features-by-antua"]?.casterUuid === casterUuid)
  );
  if (effect) {
    await effect.delete();
    return true;
  }
  return false;
}