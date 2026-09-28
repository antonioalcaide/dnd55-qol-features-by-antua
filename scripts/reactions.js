/**
 * scripts/reactions.js
 * Gestión de reacciones defensivas en Foundry V14 / DnD5e v5+.
 */

const DEBUG = false;

/**
 * Muestra un diálogo emergente de confirmación V2 con un contador regresivo visible en tiempo real.
 * @param {Object} params
 * @param {string} params.title - Título de la ventana.
 * @param {string} params.content - Cuerpo del mensaje HTML.
 * @param {number} [params.timeout=20] - Tiempo límite en segundos.
 * @returns {Promise<boolean>}
 */
export async function mostrarDialogoConfirmacionV2({ title, content, timeout = 20 }) {
    if (DEBUG) console.log(`%c[AntuaQoL] %cMostrando DialogV2 con temporizador activo (${timeout}s)`, "color: #00bcd4;");

    return new Promise((resolve) => {
        let resuelto = false;
        let segundosRestantes = timeout;

        const timerInterval = setInterval(() => {
            segundosRestantes--;
            const elContador = document.getElementById("antua-timer-countdown");
            if (elContador) {
                elContador.textContent = segundosRestantes;
            }

            if (segundosRestantes <= 0) {
                limpiarTemporizador();
                if (!resuelto) {
                    resuelto = true;
                    if (DEBUG) console.log(`%c[AntuaQoL] %cTiempo agotado (${timeout}s). Cancelando reacción.`, "color: #ff9800;");
                    ui.notifications.warn(`Tiempo de respuesta agotado para la reacción.`);
                    resolve(false);
                }
            }
        }, 1000);

        function limpiarTemporizador() {
            clearInterval(timerInterval);
        }

        const htmlConContador = `
            ${content}
            <div style="text-align: center; margin-top: 12px; padding: 6px; background: rgba(0,0,0,0.15); border-radius: 4px; font-weight: bold; color: #e05252;">
                Tiempo restante: <span id="antua-timer-countdown">${timeout}</span>s
            </div>
        `;

        foundry.applications.api.DialogV2.confirm({
            window: { title },
            content: htmlConContador,
            yes: {
                label: "Usar Reacción",
                callback: () => {
                    limpiarTemporizador();
                    if (!resuelto) {
                        resuelto = true;
                        resolve(true);
                    }
                }
            },
            no: {
                label: "Ignorar",
                callback: () => {
                    limpiarTemporizador();
                    if (!resuelto) {
                        resuelto = true;
                        resolve(false);
                    }
                }
            },
            rejectClose: false
        }).then((val) => {
            limpiarTemporizador();
            if (!resuelto) {
                resuelto = true;
                resolve(Boolean(val));
            }
        });
    });
}

/**
 * Aplica un Efecto Activo en un actor objetivo delegando en el GM.
 * @param {Object} params
 * @param {string} params.targetActorUuid - UUID del actor o token beneficiado.
 * @param {Object} params.effectData - Estructura del efecto activo.
 */
export async function aplicarEfectoDefensivoGM({ targetActorUuid, effectData }) {
    if (!targetActorUuid || !effectData) return;
    const doc = await fromUuid(targetActorUuid);
    if (!doc) return;
    const actor = doc.actor || doc;
    if (typeof actor.createEmbeddedDocuments === "function") {
        return await actor.createEmbeddedDocuments("ActiveEffect", [effectData]);
    }
}

/**
 * Elimina un Efecto Activo por ID en un actor objetivo delegando en el GM.
 * @param {Object} params
 * @param {string} params.targetActorUuid - UUID del actor beneficiado.
 * @param {string} params.effectId - ID del efecto a borrar.
 */
export async function eliminarEfectoDefensivoGM({ targetActorUuid, effectId }) {
    if (!targetActorUuid || !effectId) return;
    const doc = await fromUuid(targetActorUuid);
    if (!doc) return;
    const actor = doc.actor || doc;
    const effect = actor.effects?.get(effectId);
    if (effect) {
        await effect.delete();
        if (DEBUG) console.log(`%c[AntuaQoL] %cEfecto de Protección ${effectId} eliminado de ${actor.name}`, "color: #ff9800;");
    }
}

/**
 * Ejecuta con permisos de GM el consumo de la reacción ajustando los atributos nativos de DnD5e.
 * @param {Object} params
 * @param {string} params.actorUuid - UUID del actor que consume su reacción.
 */
export async function consumirReaccionGM({ actorUuid }) {
    if (!actorUuid) return;
    const doc = await fromUuid(actorUuid);
    if (!doc) return;
    const actor = doc.actor || doc;

    if (typeof MidiQOL !== "undefined" && typeof MidiQOL.setReactionUsed === "function") {
        try {
            await MidiQOL.setReactionUsed(actor);
        } catch (e) {}
    }

    const updateData = {};
    if (actor.system?.attributes?.reaction !== undefined) updateData["system.attributes.reaction"] = false;
    if (actor.system?.attributes?.actions?.reaction !== undefined) updateData["system.attributes.actions.reaction"] = false;

    if (Object.keys(updateData).length > 0) {
        await actor.update(updateData);
    }

    if (typeof actor.toggleStatusEffect === "function" && !actor.statuses?.has("reaction")) {
        try {
            await actor.toggleStatusEffect("reaction", { active: true });
        } catch (e) {}
    }

    if (DEBUG) console.log(`%c[AntuaQoL] %cReacción consumida correctamente para ${actor.name}`, "color: #4caf50; font-weight: bold;");
}

/**
 * Comprueba si un actor dispone de su Reacción libre para usar.
 * @param {Actor} actor
 * @returns {boolean}
 */
export function actorTieneReaccion(actor) {
    if (!actor) return false;

    if (typeof MidiQOL !== "undefined" && typeof MidiQOL.hasUsedReaction === "function") {
        if (MidiQOL.hasUsedReaction(actor)) return false;
    }

    if (actor.system?.attributes?.reaction === false) return false;
    if (actor.system?.attributes?.actions?.reaction === false) return false;

    if (actor.statuses?.has("reaction")) return false;

    return true;
}

/**
 * Consume la reacción de un actor invocando descontarRecursosGM o consumirReaccionGM vía Socket.
 * @param {Actor} actor
 */
export async function consumirReaccionActor(actor) {
    if (!actor) return;
    if (DEBUG) console.log(`%c[AntuaQoL] %cConsumiendo reacción de ${actor.name}...`, "color: #ff9800; font-weight: bold;");

    if (globalThis.antuaQolSocket) {
        try {
            await globalThis.antuaQolSocket.executeAsGM("descontarRecursosGM", actor.uuid, null, true);
            if (DEBUG) console.log(`%c[AntuaQoL] %cReacción descontada vía descontarRecursosGM para ${actor.name}`, "color: #4caf50;");
            return;
        } catch (e) {
            if (DEBUG) console.warn("[AntuaQoL] descontarRecursosGM no disponible, ejecutando consumirReaccionGM:", e);
        }

        await globalThis.antuaQolSocket.executeAsGM("consumirReaccionGM", { actorUuid: actor.uuid });
    } else {
        await consumirReaccionGM({ actorUuid: actor.uuid });
    }
}

/**
 * Solicita confirmación de reacción enviando la ventana al jugador propietario activo.
 */
export async function solicitarConfirmacionReaccionJugador({ token, title, content, timeout = 20 }) {
    if (!token || !token.actor) return false;

    const propietariosActivos = game.users.filter(u => u.active && !u.isGM && token.actor.testUserPermission(u, "OWNER"));
    
    if (propietariosActivos.length > 0) {
        const userIdTarget = propietariosActivos[0].id;
        if (DEBUG) console.log(`%c[AntuaQoL] %cEnviando petición de reacción al jugador conectado: ${propietariosActivos[0].name}`, "color: #00bcd4; font-weight: bold;");
        
        return await globalThis.antuaQolSocket.executeAsUser("mostrarDialogoConfirmacionV2", userIdTarget, { title, content, timeout });
    }

    if (DEBUG) console.log("%c[AntuaQoL] %cJugador no conectado. Responde el GM localmente.", "color: #ff9800;");
    return await mostrarDialogoConfirmacionV2({ title, content, timeout });
}

/**
 * Localiza tokens aliados al objetivo dentro del rango que cumplan los requisitos de la dote.
 */
export function obtenerProtectoresAliadosCercanos({ targetToken, featureNames = [], maxDistance = 1.5, customValidator = null }) {
    if (!targetToken || !targetToken.actor) return [];

    return canvas.tokens.placeables.filter(token => {
        if (!token.actor || token.id === targetToken.id) return false;

        const sonAliados = token.document.disposition === targetToken.document.disposition || 
            (token.document.disposition >= 0 && targetToken.document.disposition >= 0);
            
        if (!sonAliados) return false;

        if (!actorTieneReaccion(token.actor)) return false;

        const tieneFeature = token.actor.items.some(item => {
            const itemNombre = item.name.trim().toLowerCase();
            return featureNames.some(nombre => itemNombre === nombre.trim().toLowerCase());
        });

        if (!tieneFeature) return false;

        const dist = MidiQOL.computeDistance(token, targetToken, { includeZero: true });
        const maxDistEvaluada = canvas.grid.units === "ft" || canvas.grid.units === "pies" ? 5 : maxDistance;

        if (dist > maxDistEvaluada && dist > 1.5) return false;

        if (typeof customValidator === "function" && !customValidator(token)) return false;

        if (DEBUG) console.log(`%c[AntuaQoL - Audit] %c✅ Protector VÁLIDO detectado: ${token.name}`, "color: #4caf50; font-weight: bold;");
        return true;
    });
}