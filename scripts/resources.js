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


/**
 * Renderiza el diálogo con cuenta atrás visible de 6 segundos en el cliente del jugador o GM.
 * Exportada para su ejecución remota en socketlib.
 * 
 * @param {Object} data - Datos para la interfaz de la reacción.
 * @returns {Promise<boolean>}
*/
export async function pedirConfirmacionPalabrasCortantesData(data) {
    const DEBUG = false;
    return new Promise((resolve) => {
        let respondido = false;
        let timerInterval = null;

        const timerTimeout = setTimeout(() => {
            if (!respondido) {
                respondido = true;
                if (timerInterval) clearInterval(timerInterval);
                if (DEBUG) console.log("%c[Palabras Cortantes] | Tiempo de reacción agotado (6s). Omitiendo.", "color: #ffaa00;");
                dialogo.close();
                resolve(false);
            }
        }, 6000);

        const dialogo = new Dialog({
            title: `Reacción: Palabras cortantes / Cutting Words (${data.bardoNombre})`,
            content: `
                <div style="font-size: 0.95em; line-height: 1.4;">
                    <p><strong>${data.atacanteNombre}</strong> realiza una <strong>tirada de ATAQUE</strong> que impacta con un total de <strong>${data.totalAtaquePrevio}</strong> (vs CA <strong>${data.targetAC}</strong>) a ${data.distanciaPies.toFixed(0)} ft (${data.distanciaMetros} m).</p>
                    <p>¿Deseas gastar tu <strong>Reacción</strong> y 1 uso de <strong>Inspiración bárdica / Bardic Inspiration</strong> (dado <code>${data.formulaDado}</code>) para intentar convertir el impacto en un fallo?</p>
                    <p style="color: #ff4444; font-size: 0.9em; margin-top: 8px; font-weight: bold; text-align: center; background: rgba(255,0,0,0.08); padding: 4px; border-radius: 4px;">
                        ⏳ Tiempo restante: <span id="cutting-words-timer" style="font-size: 1.2em; color: #ff0000;">6</span>s
                    </p>
                </div>
            `,
            buttons: {
                yes: {
                    label: "Sí, usar Reacción",
                    callback: () => {
                        if (!respondido) {
                            respondido = true;
                            clearTimeout(timerTimeout);
                            if (timerInterval) clearInterval(timerInterval);
                            resolve(true);
                        }
                    }
                },
                no: {
                    label: "Pasar",
                    callback: () => {
                        if (!respondido) {
                            respondido = true;
                            clearTimeout(timerTimeout);
                            if (timerInterval) clearInterval(timerInterval);
                            resolve(false);
                        }
                    }
                }
            },
            default: "no",
            render: (html) => {
                let segundos = 6;
                const timerSpan = html.find("#cutting-words-timer");
                timerInterval = setInterval(() => {
                    segundos--;
                    if (timerSpan.length) timerSpan.text(segundos);
                    if (segundos <= 0) clearInterval(timerInterval);
                }, 1000);
            },
            close: () => {
                if (!respondido) {
                    respondido = true;
                    clearTimeout(timerTimeout);
                    if (timerInterval) clearInterval(timerInterval);
                    resolve(false);
                }
            }
        });

        dialogo.render(true);
    });
}

/**
 * Procesa la reacción "Palabras cortantes / Cutting Words" para tiradas de ataque en Midi-QOL.
 * 
 * @param {MidiQOL.Workflow} workflow - Workflow activo de Midi-QOL.
 */
export async function procesarPalabrasCortantes(workflow) {
    if (!workflow || !workflow.token) return;

    const atacanteToken = workflow.token;
    const tokensPersonaje = canvas.tokens.placeables.filter(t => t.actor && t.actor.type === "character");

    for (const bardoToken of tokensPersonaje) {
        const bardoActor = bardoToken.actor;

        // Omitir si la acción la realiza el propio Bardo
        if (bardoActor.uuid === workflow.actor?.uuid) continue;

        // 1. Verificar disponibilidad de reacción
        const reaccionUsada = typeof MidiQOL?.hasUsedReaction === "function" 
            ? MidiQOL.hasUsedReaction(bardoActor) 
            : bardoActor.system.attributes?.movement?.reactionUsed;

        if (reaccionUsada) {
            if (DEBUG) console.log(`%c[Palabras Cortantes] | ${bardoActor.name} ya ha gastado su reacción en este turno.`, "color: #ffaa00;");
            continue;
        }

        // 2. Buscar el ítem "Palabras cortantes / Cutting Words"
        const itemPalabras = bardoActor.items.find(i => 
            i.identifier === "cutting-words" || 
            i.name.toLowerCase().includes("palabras cortantes") ||
            i.name.toLowerCase().includes("cutting words")
        );
        if (!itemPalabras) continue;

        // 3. Comprobar recurso de "Inspiración bárdica / Bardic Inspiration"
        const itemInspiracion = bardoActor.items.find(i => 
            i.identifier === "bardic-inspiration" || 
            i.name.toLowerCase().includes("inspiración bárdica") || 
            i.name.toLowerCase().includes("bardic inspiration")
        );

        let tieneUsos = false;
        let metodoConsumo = null;

        if (itemInspiracion) {
            const maxUses = itemInspiracion.system.uses?.max || 0;
            const spentUses = itemInspiracion.system.uses?.spent || 0;
            const valueUses = itemInspiracion.system.uses?.value;

            if (maxUses > 0 && spentUses < maxUses) {
                tieneUsos = true;
                metodoConsumo = "itemSpent";
            } else if (valueUses !== undefined && valueUses > 0) {
                tieneUsos = true;
                metodoConsumo = "itemValue";
            }
        }

        if (!tieneUsos) {
            const resources = bardoActor.system.resources || {};
            for (const resKey of ["primary", "secondary", "tertiary"]) {
                const res = resources[resKey];
                if (res && res.label?.toLowerCase().includes("inspir") && res.value > 0) {
                    tieneUsos = true;
                    metodoConsumo = resKey;
                    break;
                }
            }
        }

        if (!tieneUsos && !itemInspiracion) tieneUsos = true;

        if (!tieneUsos) {
            if (DEBUG) console.log(`%c[Palabras Cortantes] | ${bardoActor.name} sin usos disponibles de Inspiración bárdica / Bardic Inspiration.`, "color: #ffaa00;");
            continue;
        }

        // 4. Medición de distancia (60 ft / 18 m)
        let distanciaPies = 0;
        if (typeof MidiQOL?.computeDistance === "function") {
            distanciaPies = MidiQOL.computeDistance(bardoToken, atacanteToken);
        } else if (canvas.grid?.measurePath) {
            distanciaPies = canvas.grid.measurePath([bardoToken.center, atacanteToken.center]).distance;
        }

        const distanciaMetros = Math.round(distanciaPies * 0.3);

        if (distanciaPies < 0 || distanciaPies > 60) {
            if (DEBUG) console.log(`%c[Palabras Cortantes] | ${bardoActor.name} fuera de rango (${distanciaPies.toFixed(0)} ft / ${distanciaMetros} m > 60 ft / 18 m).`, "color: #ffaa00;");
            continue;
        }

        // 5. Filtrado matemático del Ataque (solo si impacta y es evitable)
        const targetToken = workflow.targets?.first();
        if (!targetToken) continue;

        const targetAC = targetToken.actor?.system.attributes?.ac?.value ?? 10;
        const totalAtaquePrevio = workflow.attackTotal;
        const esNat20 = workflow.attackRoll?.isCritical || workflow.attackRoll?.terms?.[0]?.results?.[0]?.result === 20;

        const formulaDado = bardoActor.system.scale?.bard?.["bardic-inspiration"]?.formula || "1d6";
        const matchDado = formulaDado.match(/d(\d+)/i);
        const maxDado = matchDado ? parseInt(matchDado[1]) : 6;

        if (totalAtaquePrevio < targetAC) {
            if (DEBUG) console.log(`%c[Palabras Cortantes] | Ataque (${totalAtaquePrevio}) ya falla contra CA ${targetAC}.`, "color: #ffaa00;");
            continue;
        }

        if (esNat20) {
            if (DEBUG) console.log(`%c[Palabras Cortantes] | 20 Natural (Crítico). No evitable.`, "color: #ffaa00;");
            continue;
        }

        const minimoPosible = totalAtaquePrevio - maxDado;
        if (minimoPosible >= targetAC) {
            if (DEBUG) console.log(`%c[Palabras Cortantes] | Ataque (${totalAtaquePrevio}) vs CA ${targetAC}. Mínimo reducible (${minimoPosible}) no evita el golpe.`, "color: #ffaa00;");
            continue;
        }

        // 6. Determinar el cliente destino (Jugador propietario activo o GM)
        const usuariosPropietariosActivos = game.users.filter(u => u.active && !u.isGM && bardoActor.testUserPermission(u, "OWNER"));
        const usuarioObjetivo = usuariosPropietariosActivos.length > 0 ? usuariosPropietariosActivos[0] : game.users.activeGM;

        if (!usuarioObjetivo) continue;

        const dialogData = {
            bardoNombre: bardoActor.name,
            atacanteNombre: atacanteToken.name,
            totalAtaquePrevio,
            targetAC,
            distanciaPies,
            distanciaMetros,
            formulaDado
        };

        let deseaUsar = false;
        if (globalThis.antuaQolSocket) {
            deseaUsar = await globalThis.antuaQolSocket.executeAsUser("pedirConfirmacionPalabrasCortantesData", usuarioObjetivo.id, dialogData);
        } else if (game.user.id === usuarioObjetivo.id) {
            deseaUsar = await pedirConfirmacionPalabrasCortantesData(dialogData);
        }

        if (!deseaUsar) continue;

        // 7. Marcar Reacción como gastada
        if (typeof MidiQOL?.setReactionUsed === "function") {
            await MidiQOL.setReactionUsed(bardoActor);
        } else {
            await bardoActor.update({ "system.attributes.movement.reactionUsed": true });
        }

        // 8. Descontar 1 uso de Inspiración Bárdica / Bardic Inspiration
        if (metodoConsumo === "itemSpent" && itemInspiracion) {
            const currentSpent = itemInspiracion.system.uses?.spent || 0;
            await itemInspiracion.update({ "system.uses.spent": currentSpent + 1 });
        } else if (metodoConsumo === "itemValue" && itemInspiracion) {
            const currentVal = itemInspiracion.system.uses?.value || 0;
            await itemInspiracion.update({ "system.uses.value": Math.max(0, currentVal - 1) });
        } else if (["primary", "secondary", "tertiary"].includes(metodoConsumo)) {
            const currentVal = bardoActor.system.resources[metodoConsumo]?.value || 0;
            await bardoActor.update({ [`system.resources.${metodoConsumo}.value`]: Math.max(0, currentVal - 1) });
        }

        // 9. Tirada del dado de Inspiración Bárdica
        const roll = await new Roll(formulaDado).evaluate();
        if (game.diceSoNice) game.diceSoNice.showForRoll(roll, game.user, true);

        const penalizador = roll.total;

        // 10. Reducir la tirada en el Workflow de Midi-QOL
        const previo = workflow.attackTotal;
        workflow.attackTotal -= penalizador;
        if (workflow.attackRoll) {
            workflow.attackRoll._total = (workflow.attackRoll._total || 0) - penalizador;
        }

        const esFallo = workflow.attackTotal < targetAC;
        const estadoTexto = esFallo ? "❌ ¡CONVERTIDO EN FALLO!" : "⚠️ Sigue impactando";

        const resumenCalculo = `
            <div style="margin-top: 4px; font-size: 0.9em; line-height: 1.3;">
                <p style="margin: 2px 0;"><strong>Ataque original:</strong> ${previo} vs CA ${targetAC}</p>
                <p style="margin: 2px 0;"><strong>Penalización:</strong> -${penalizador} (Dado: <code>${formulaDado}</code>)</p>
                <p style="margin: 2px 0; color: ${esFallo ? '#cc0000' : '#d97706'}; font-weight: bold;">
                    Total ajustado: ${workflow.attackTotal} vs CA ${targetAC} (${estadoTexto})
                </p>
            </div>
        `;

        if (DEBUG) console.log(`%c[Palabras Cortantes] | Ataque ajustado: ${previo} -> ${workflow.attackTotal} vs CA ${targetAC}`, "color: #33ff99; font-weight: bold;");

        // 11. Inyectar el desglose en la tarjeta de ataque en el Chat
        if (workflow.itemCardUuid) {
            const attackCard = game.messages.get(workflow.itemCardUuid);
            if (attackCard) {
                let newContent = attackCard.content;
                const modBadge = `
                    <div style="background: rgba(255, 0, 0, 0.08); border-left: 3px solid #ff4444; padding: 6px; margin: 6px 0; border-radius: 2px;">
                        <strong style="color: #cc0000;">Palabras cortantes / Cutting Words (${bardoActor.name}):</strong>
                        ${resumenCalculo}
                    </div>
                `;
                newContent += modBadge;
                await attackCard.update({ content: newContent });
            }
        }

        // 12. Notificación centralizada vía Socket
        if (globalThis.antuaQolSocket) {
            await globalThis.antuaQolSocket.executeAsGM("enviarNotificacionChatGM", {
                title: "Palabras cortantes / Cutting Words",
                contentHtml: `
                    <div style="font-size: 0.9em; line-height: 1.4;">
                        <p><strong>${bardoActor.name}</strong> usa su <strong>Reacción</strong> e <strong>Inspiración bárdica / Bardic Inspiration</strong> para distraer a <strong>${atacanteToken.name}</strong>.</p>
                        <div style="background: rgba(255, 0, 0, 0.08); padding: 6px; border-left: 3px solid #ff4444; margin-top: 5px;">
                            ${resumenCalculo}
                        </div>
                    </div>
                `,
                icon: itemPalabras.img,
                actorUuid: bardoActor.uuid
            });
        }

        break;
    }
}