/**
 * scripts/resources.js
 * Gestión de recursos, cargas y diálogos de reacción/confirmación.
 */

export async function pedirConfirmacionGenerica(titulo, mensajeHtml, tiempoSegundos = 20, botonConfirmarText = "Usar Reacción", botonCancelarText = "Ignorar") {
    return new Promise((resolve) => {
        let resolved = false;
        let timer = null;
        let interval = null;

        const doResolve = (val) => {
            if (resolved) return;
            resolved = true;
            if (timer) clearTimeout(timer);
            if (interval) clearInterval(interval);
            resolve(val);
        };

        let timeLeft = tiempoSegundos;
        const content = `
            <div style="text-align: center; padding: 4px;">
                ${mensajeHtml}
                ${tiempoSegundos > 0 ? `<p style="font-size: 0.85em; color: #a0a0a0; margin-top: 8px;">Tiempo restante: <strong id="antua-generic-timer" style="color: #e24f4f;">${timeLeft}</strong>s</p>` : ''}
            </div>
        `;

        if (tiempoSegundos > 0) {
            timer = setTimeout(() => {
                if (dlg) dlg.close();
                doResolve(false);
            }, tiempoSegundos * 1000);

            interval = setInterval(() => {
                timeLeft--;
                const el = document.getElementById("antua-generic-timer");
                if (el) el.innerText = timeLeft;
                if (timeLeft <= 0) clearInterval(interval);
            }, 1000);
        }

        const dlg = new Dialog({
            title: titulo,
            content: content,
            buttons: {
                yes: { 
                    icon: '<i class="fas fa-check"></i>',
                    label: botonConfirmarText, 
                    callback: () => doResolve(true) 
                },
                no: { 
                    icon: '<i class="fas fa-times"></i>',
                    label: botonCancelarText, 
                    callback: () => doResolve(false) 
                }
            },
            default: "no",
            close: () => doResolve(false)
        });

        dlg.render(true);
    });
}

export async function pedirConfirmacionReaccionEscudo(actorName) {
    return pedirConfirmacionGenerica(
        "Interponer Escudo",
        `<p><strong>${actorName}</strong> ha superado la salvación de Destreza llevando un escudo.</p><p>¿Deseas gastar tu <strong>Reacción</strong> para no recibir ningún daño?</p>`,
        20,
        "Usar Reacción",
        "No usar"
    );
}

export async function descontarRecursosGM(actorUuid, itemUuid = null, gastarReaccion = true, activityId = null) {
    if (!game.user.isGM) return;
    const actor = (await fromUuid(actorUuid)) || game.actors.get(actorUuid);
    if (!actor) return;

    if (itemUuid) {
        const item = (await fromUuid(itemUuid)) || actor.items.get(itemUuid);
        if (item) {
            let targetActId = activityId;
            if (!targetActId && item.system?.activities) {
                if (typeof item.system.activities.first === "function") {
                    targetActId = item.system.activities.first()?.id;
                } else if (Array.isArray(item.system.activities)) {
                    targetActId = item.system.activities[0]?.id || item.system.activities[0]?._id;
                } else if (typeof item.system.activities === "object") {
                    targetActId = Object.keys(item.system.activities)[0];
                }
            }

            if (targetActId && item.system?.activities) {
                const act = typeof item.system.activities.get === "function" 
                    ? item.system.activities.get(targetActId) 
                    : item.system.activities[targetActId];
                const spent = act?.uses?.spent || 0;
                await item.update({ [`system.activities.${targetActId}.uses.spent`]: spent + 1 });
            } else if (item.system?.uses) {
                const usosGastados = parseInt(item.system.uses?.spent) || 0;
                await item.update({ "system.uses.spent": usosGastados + 1 });
            }
        }
    }

    if (gastarReaccion) {
        if (typeof MidiQOL !== "undefined" && MidiQOL.setReactionUsed) {
            await MidiQOL.setReactionUsed(actor);
        }
        await actor.update({ "system.attributes.reaction": false });
    }
}

export async function reponerRecursosGM(actorUuid, itemUuid = null, activityId = null) {
    if (!game.user.isGM) return;
    const actor = (await fromUuid(actorUuid)) || game.actors.get(actorUuid);
    if (!actor) return;

    if (itemUuid) {
        const item = (await fromUuid(itemUuid)) || actor.items.get(itemUuid);
        if (item) {
            let targetActId = activityId;
            if (!targetActId && item.system?.activities) {
                if (typeof item.system.activities.first === "function") {
                    targetActId = item.system.activities.first()?.id;
                } else if (Array.isArray(item.system.activities)) {
                    targetActId = item.system.activities[0]?.id || item.system.activities[0]?._id;
                } else if (typeof item.system.activities === "object") {
                    targetActId = Object.keys(item.system.activities)[0];
                }
            }

            if (targetActId && item.system?.activities) {
                const act = typeof item.system.activities.get === "function" 
                    ? item.system.activities.get(targetActId) 
                    : item.system.activities[targetActId];
                const spent = act?.uses?.spent || 0;
                if (spent > 0) {
                    await item.update({ [`system.activities.${targetActId}.uses.spent`]: Math.max(0, spent - 1) });
                }
            } else if (item.system?.uses) {
                const spent = item.system.uses.spent || 0;
                if (spent > 0) {
                    await item.update({ "system.uses.spent": Math.max(0, spent - 1) });
                }
            }
        }
    }
}

export async function conmutarRecursoGM({ actorUuid, slotKey, type = "spell", isConsumed, messageId }) {
    if (!game.user.isGM) return;

    const actorDoc = (await fromUuid(actorUuid)) || game.actors.get(actorUuid);
    if (!actorDoc) return;

    const restaurar = isConsumed;

    if (type === "spell") {
        const isPact = slotKey === "pact";
        const path = isPact ? "system.spells.pact.value" : `system.spells.${slotKey}.value`;
        const current = isPact ? actorDoc.system.spells.pact.value : (actorDoc.system.spells[slotKey]?.value || 0);
        const max = isPact ? actorDoc.system.spells.pact.max : (actorDoc.system.spells[slotKey]?.max || current + 1);

        const newValue = restaurar ? Math.min(max, current + 1) : Math.max(0, current - 1);
        await actorDoc.update({ [path]: newValue });
    }

    const estadoTexto = restaurar ? "restaurado" : "consumido";
    ui.notifications.info(`Recurso (${slotKey}) ${estadoTexto} para ${actorDoc.name}.`);

    if (messageId) {
        const chatMsg = game.messages.get(messageId);
        if (chatMsg) {
            const container = document.createElement("div");
            container.innerHTML = chatMsg.content;

            const btn = container.querySelector(".toggle-spell-slot-btn, .antua-toggle-resource-btn");
            if (btn) {
                const newConsumedState = !restaurar;
                btn.setAttribute("data-consumed", newConsumedState.toString());

                if (restaurar) {
                    btn.innerHTML = '<i class="fas fa-check"></i> Recurso: Restaurado (Consumir)';
                    btn.style.background = "#065f46";
                    btn.style.borderColor = "#10b981";
                } else {
                    btn.innerHTML = '<i class="fas fa-undo"></i> Recurso: Consumido (Restaurar)';
                    btn.style.background = "#312e81";
                    btn.style.borderColor = "#6366f1";
                }

                await chatMsg.update({ content: container.innerHTML });
            }
        }
    }
}

// scripts/resources.js

export async function solicitarTiradaEscaparAgarreGM({ actorUuid, dc, effectLabel }) {
    const DEBUG = true;
    if (DEBUG) console.log("%c[AntuaQoL Debug] %cIniciando petición de escape de agarre para:", "color: #00ffaa; font-weight: bold;", "color: #ffffff;", actorUuid);

    const actor = await fromUuid(actorUuid);
    if (!actor) {
        console.error("%c[AntuaQoL Error] %cNo se encontró el actor con UUID:", "color: #ff0000; font-weight: bold;", "color: #ffffff;", actorUuid);
        return;
    }

    // Solicitud/Diálogo al jugador (o GM si es NPC)
    const eleccion = await Dialog.wait({
        title: `Escapar de: ${effectLabel}`,
        content: `<p>Selecciona la prueba para intentar escapar (CD ${dc}):</p>`,
        buttons: {
            str: {
                icon: '<i class="fas fa-fist-raised"></i>',
                label: "Fuerza (Atletismo)",
                callback: () => "ath"
            },
            dex: {
                icon: '<i class="fas fa-running"></i>',
                label: "Destreza (Acrobacias)",
                callback: () => "acr"
            }
        },
        default: "str"
    });

    if (!eleccion) return;

    // Realizar la tirada de habilidad correspondiente
    const roll = await actor.rollSkill(eleccion, { chatMessage: true });
    
    if (roll && roll.total >= dc) {
        // Si supera la CD, eliminar el efecto del actor
        const effect = actor.effects.find(e => e.label === effectLabel || e.name === effectLabel);
        if (effect) {
            await effect.delete();
            if (DEBUG) console.log("%c[AntuaQoL Debug] %cEfecto de agarre eliminado con éxito.", "color: #00ffaa; font-weight: bold;", "color: #ffffff;");
        }

        // Notificación centralizada al chat según estándar del módulo
        await globalThis.antuaQolSocket.executeAsGM("enviarNotificacionChatGM", {
            title: `Escape Exitoso: ${effectLabel}`,
            contentHtml: `<p><strong>${actor.name}</strong> ha conseguido liberarse del agarre superando la CD ${dc} con una tirada total de <strong>${roll.total}</strong>.</p>`,
            icon: actor.img,
            actorUuid: actor.uuid
        });
    } else {
        await globalThis.antuaQolSocket.executeAsGM("enviarNotificacionChatGM", {
            title: `Fallo al Escapar: ${effectLabel}`,
            contentHtml: `<p><strong>${actor.name}</strong> ha fallado el intento de escape (Resultado: <strong>${roll ? roll.total : 0}</strong> vs CD ${dc}).</p>`,
            icon: actor.img,
            actorUuid: actor.uuid
        });
    }
}

/**
 * Solicita confirmación en el cliente del usuario objetivo para lanzar Escudo como reacción con cuenta atrás animada.
 * @param {object} params
 * @param {string} params.actorUuid - UUID del actor afectado.
 * @param {string} params.itemAtacanteNombre - Nombre del conjuro o ítem atacante.
 * @param {number} [params.timeoutMs=20000] - Tiempo límite en milisegundos.
 * @returns {Promise<boolean>}
 */
export async function pedirConfirmacionReaccionEscudoConjuro({ actorUuid, itemAtacanteNombre, timeoutMs = 20000 }) {
    console.log(`%c[AntuaQoL] | Iniciando diálogo de reacción con temporizador dinámico (${timeoutMs / 1000}s)`, "color: #00ffff; font-weight: bold;");

    const actorObj = await fromUuid(actorUuid);
    const actorName = actorObj?.name || "Tu personaje";

    return new Promise((resolve) => {
        let resuelto = false;
        let appDialog = null;
        let timerId = null;
        let intervalId = null;
        let segundosRestantes = Math.ceil(timeoutMs / 1000);

        // Función para limpiar de memoria los temporizadores
        const limpiarTemporizadores = () => {
            if (timerId) clearTimeout(timerId);
            if (intervalId) clearInterval(intervalId);
        };

        const resolverRespuesta = (valor) => {
            if (!resuelto) {
                resuelto = true;
                limpiarTemporizadores();
                resolve(valor);
            }
        };

        // 1. Temporizador de expiración principal (20 segundos)
        timerId = setTimeout(() => {
            if (!resuelto) {
                console.warn("%c[AntuaQoL] | Tiempo agotado sin respuesta. Cerrando ventana y rechazando Escudo.", "color: #ffaa00; font-weight: bold;");
                if (appDialog && typeof appDialog.close === "function") {
                    appDialog.close();
                }
                resolverRespuesta(false);
            }
        }, timeoutMs);

        // 2. Contenido HTML con nodo objetivo para la animación
        const htmlContent = `
            <p><strong>${actorName}</strong> va a recibir daño de <em>${itemAtacanteNombre || "Proyectil Mágico"}</em>.</p>
            <p>¿Quieres usar tu reacción y un espacio de conjuro para lanzar <strong>Escudo</strong> e inmunizarte al daño?</p>
            <p style="text-align: right; color: #aaa; font-size: 0.85em; margin-top: 10px;">
                <i class="fa-solid fa-hourglass-half fa-spin"></i> Tiempo límite: <strong id="antua-countdown-timer" style="color: #ffaa00;">${segundosRestantes}</strong> segundos
            </p>
        `;

        // 3. Instanciar la ventana emergente e iniciar el intervalo de descuento en el render
        appDialog = new Dialog({
            title: "🛡️ Reacción: Escudo",
            content: htmlContent,
            buttons: {
                yes: {
                    icon: '<i class="fas fa-shield-halved"></i>',
                    label: "Lanzar Escudo",
                    callback: () => resolverRespuesta(true)
                },
                no: {
                    icon: '<i class="fas fa-xmark"></i>',
                    label: "Recibir daño",
                    callback: () => resolverRespuesta(false)
                }
            },
            default: "yes",
            render: (html) => {
                const rootEl = html instanceof HTMLElement ? html : html[0];
                const timerSpan = rootEl?.querySelector("#antua-countdown-timer");

                // Actualizar el DOM cada 1000 ms (1 segundo)
                intervalId = setInterval(() => {
                    segundosRestantes--;
                    if (timerSpan) {
                        timerSpan.textContent = Math.max(0, segundosRestantes);
                    }
                    if (segundosRestantes <= 0) {
                        clearInterval(intervalId);
                    }
                }, 1000);
            },
            close: () => resolverRespuesta(false)
        });

        appDialog.render(true);
    });
}

/**
 * Lanza un conjuro/ítem desde el cliente del propietario remoto.
 * @param {object} params
 * @param {string} params.itemUuid - UUID del ítem a ejecutar.
 */
export async function usarItemRemoto({ itemUuid }) {
    const itemObj = await fromUuid(itemUuid);
    if (itemObj) {
        await itemObj.use({}, { configureDialog: false });
    }
}

// En scripts/resources.js
export async function curarActorGM({ actorUuid, amount }) {
  const actor = await fromUuid(actorUuid);
  if (!actor) return;
  return await actor.applyDamage([{ value: amount, type: "healing" }]);
}
