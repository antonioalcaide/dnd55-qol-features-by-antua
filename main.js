// Version: 1.9.0 - dnd55-qol-features-by-antua (Foundry V14 / DnD5e v4+)

Hooks.once('init', () => {
    console.log('%cdnd5.5-qol-features-by-antua %c| ' + 'Módulo inicializado con éxito (v1.9.0)', 'color:#4BC470', 'color:#B3B3B3');
});

// --------------------------------------------------------------------
// FUNCIONES DE DIÁLOGO, GESTIÓN DE RECURSOS Y NOTIFICACIONES DE CHAT
// --------------------------------------------------------------------

/**
 * Genera y envía una tarjeta de notificación en el chat con formato estandarizado (70x70px avatar).
 */
async function enviarNotificacionChatGM({ title, contentHtml, icon, actorUuid }) {
    if (!game.user.isGM) return;

    let actorDoc = null;
    if (actorUuid) {
        actorDoc = (await fromUuid(actorUuid)) || game.actors.get(actorUuid);
    }

    const cardIcon = icon || actorDoc?.img || "icons/svg/mystery-man.svg";
    const cardTitle = title || "Notificación de Efecto";

    const chatContent = `
        <div class="dnd5e2 chat-card" style="position: relative; margin-top: 25px; border: 1px solid #7a200d; border-radius: 8px; background: #f8f4f1; box-shadow: 0 2px 5px rgba(0,0,0,0.15);">
            <div style="position: absolute; top: -20px; left: 10px; width: 70px; height: 70px; border-radius: 50%; border: 2px solid #7a200d; overflow: hidden; background: #fff; box-shadow: 0 3px 6px rgba(0,0,0,0.3); z-index: 10;">
                <img src="${cardIcon}" style="width: 100%; height: 100%; object-fit: cover; border: none;"/>
            </div>
            
            <div style="padding: 8px 12px 6px 90px; border-bottom: 1px solid rgba(122, 32, 13, 0.25); min-height: 45px; display: flex; align-items: center;">
                <h3 style="margin: 0; font-family: 'Roboto', sans-serif; font-size: 1.1em; font-weight: bold; color: #7a200d; line-height: 1.1; width: 100%;">${cardTitle}</h3>
            </div>
            
            <div class="card-content" style="padding: 10px 12px 10px 14px; font-size: 0.9em; line-height: 1.5; color: #222;">
                ${contentHtml}
            </div>
        </div>
    `;

    return await ChatMessage.create({
        user: game.user.id,
        speaker: actorDoc ? ChatMessage.getSpeaker({ actor: actorDoc }) : undefined,
        content: chatContent
    });
}

/**
 * Crea la petición inicial de cobro guardando el desglose y las flags de seguimiento.
 */
async function crearPeticionCobroGM({ pp, gp, ep, sp, cp, motivo, icon }) {
    if (!game.user.isGM) return;

    const desglose = [];
    if (pp > 0) desglose.push(`<span style="background: #e2e8f0; color: #0f172a; padding: 2px 6px; border-radius: 4px; border: 1px solid #64748b; font-weight: bold;">${pp} pp</span>`);
    if (gp > 0) desglose.push(`<span style="background: #fef3c7; color: #78350f; padding: 2px 6px; border-radius: 4px; border: 1px solid #d97706; font-weight: bold;">${gp} gp</span>`);
    if (ep > 0) desglose.push(`<span style="background: #f7fee7; color: #365314; padding: 2px 6px; border-radius: 4px; border: 1px solid #65a30d; font-weight: bold;">${ep} ep</span>`);
    if (sp > 0) desglose.push(`<span style="background: #f8fafc; color: #1e293b; padding: 2px 6px; border-radius: 4px; border: 1px solid #94a3b8; font-weight: bold;">${sp} sp</span>`);
    if (cp > 0) desglose.push(`<span style="background: #ffedd5; color: #7c2d12; padding: 2px 6px; border-radius: 4px; border: 1px solid #ea580c; font-weight: bold;">${cp} cp</span>`);

    const contentHtml = `
      <div style="border: 1px solid #cbd5e1; padding: 10px; border-radius: 6px; background: rgba(0,0,0,0.02);">
        <p style="margin: 0 0 6px 0;"><b><i class="fas fa-receipt" style="color: #d97706;"></i> Motivo:</b> ${motivo}</p>
        <p style="margin: 0 0 10px 0; display: flex; flex-wrap: wrap; gap: 4px; align-items: center;">
          <b><i class="fas fa-coins" style="color: #f59e0b;"></i> Solicitado:</b> ${desglose.join(' ')}
        </p>
        <hr style="margin: 8px 0; border: 0; border-top: 1px solid #cbd5e1;">
        <button type="button" class="btn-pagar-chat" style="width: 100%; box-sizing: border-box; background: #2ed573; color: white; font-weight: bold; border: none; padding: 8px 12px; border-radius: 6px; cursor: pointer; display: block; text-align: center;">
          <i class="fas fa-hand-holding-usd"></i> Pagar
        </button>
      </div>
    `;

    const cardIcon = icon || "icons/commodities/currency/coins-plain-pouch-gold.webp";
    const msg = await enviarNotificacionChatGM({
        title: "Petición de Cobro",
        contentHtml: contentHtml,
        icon: cardIcon
    });

    if (msg) {
        await msg.setFlag("dnd55-qol-features-by-antua", "peticionCobro", {
            reqData: { pp, gp, ep, sp, cp, motivo },
            paidActors: {}
        });
    }
}

/**
 * Descuenta el importe del monedero del actor y genera la notificación de pago con control exclusivo para el GM.
 */
async function procesarPagoMonedasGM({ messageId, actorUuid, pp, gp, ep, sp, cp, motivo }) {
    if (!game.user.isGM) return;

    const actor = (await fromUuid(actorUuid)) || game.actors.get(actorUuid);
    if (!actor) return;

    const curr = actor.system.currency || { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 };
    const totalReqCp = (pp * 1000) + (gp * 100) + (ep * 50) + (sp * 10) + cp;
    const totalActorCp = ((curr.pp || 0) * 1000) + ((curr.gp || 0) * 100) + ((curr.ep || 0) * 50) + ((curr.sp || 0) * 10) + (curr.cp || 0);

    if (totalActorCp < totalReqCp) {
        ui.notifications.error(`${actor.name} no dispone de suficiente dinero para realizar el pago.`);
        return;
    }

    const newCurrency = { ...curr };

    if (curr.pp >= pp && curr.gp >= gp && curr.ep >= ep && curr.sp >= sp && curr.cp >= cp) {
        newCurrency.pp -= pp;
        newCurrency.gp -= gp;
        newCurrency.ep -= ep;
        newCurrency.sp -= sp;
        newCurrency.cp -= cp;
    } else {
        let remCp = totalActorCp - totalReqCp;
        newCurrency.pp = Math.floor(remCp / 1000); remCp %= 1000;
        newCurrency.gp = Math.floor(remCp / 100);  remCp %= 100;
        newCurrency.ep = Math.floor(remCp / 50);   remCp %= 50;
        newCurrency.sp = Math.floor(remCp / 10);   remCp %= 10;
        newCurrency.cp = remCp;
    }

    await actor.update({ "system.currency": newCurrency });

    if (messageId) {
        const reqMsg = game.messages.get(messageId);
        if (reqMsg) {
            const flagData = reqMsg.getFlag("dnd55-qol-features-by-antua", "peticionCobro") || { paidActors: {} };
            flagData.paidActors = flagData.paidActors || {};
            flagData.paidActors[actor.uuid] = true;
            await reqMsg.setFlag("dnd55-qol-features-by-antua", "peticionCobro", flagData);
        }
    }

    const desglose = [];
    if (pp > 0) desglose.push(`<span style="background: #e2e8f0; color: #0f172a; padding: 2px 6px; border-radius: 4px; border: 1px solid #64748b; font-weight: bold;">${pp} pp</span>`);
    if (gp > 0) desglose.push(`<span style="background: #fef3c7; color: #78350f; padding: 2px 6px; border-radius: 4px; border: 1px solid #d97706; font-weight: bold;">${gp} gp</span>`);
    if (ep > 0) desglose.push(`<span style="background: #f7fee7; color: #365314; padding: 2px 6px; border-radius: 4px; border: 1px solid #65a30d; font-weight: bold;">${ep} ep</span>`);
    if (sp > 0) desglose.push(`<span style="background: #f8fafc; color: #1e293b; padding: 2px 6px; border-radius: 4px; border: 1px solid #94a3b8; font-weight: bold;">${sp} sp</span>`);
    if (cp > 0) desglose.push(`<span style="background: #ffedd5; color: #7c2d12; padding: 2px 6px; border-radius: 4px; border: 1px solid #ea580c; font-weight: bold;">${cp} cp</span>`);

    const contentHtml = `
      <div style="border: 1px solid #2ed573; padding: 10px; border-radius: 6px; background: rgba(46, 213, 115, 0.05);">
        <p style="margin: 0 0 6px 0;"><b>${actor.name}</b> ha pagado ${desglose.join(' ')}.</p>
        <p style="margin: 0 0 6px 0;"><b>Motivo:</b> ${motivo}</p>
        
        <div class="gm-refund-control" style="margin-top: 8px; border-top: 1px dashed rgba(0,0,0,0.15); padding-top: 8px; text-align: center;">
          <small style="display:block; font-weight:bold; margin-bottom:6px; color:#64748b;">[Control Exclusivo GM]</small>
          <button type="button" class="btn-toggle-devolucion" style="width: 100%; box-sizing: border-box; display: block; text-align: center; font-size: 0.85em; cursor: pointer; padding: 8px 12px; background: #3b82f6; color: white; border: none; border-radius: 6px; font-weight: bold;">
            <i class="fas fa-undo"></i> Devolver monedas
          </button>
        </div>
      </div>
    `;

    const payMsg = await enviarNotificacionChatGM({
        title: "Pago Realizado",
        contentHtml: contentHtml,
        icon: "icons/commodities/currency/coins-assorted-mix-copper-silver-gold.webp",
        actorUuid: actor.uuid
    });

    if (payMsg) {
        await payMsg.setFlag("dnd55-qol-features-by-antua", "pagoRealizado", {
            requestMessageId: messageId,
            actorUuid: actor.uuid,
            reqData: { pp, gp, ep, sp, cp, motivo },
            isRefunded: false
        });
    }
}

/**
 * Conmuta la devolución o el cobro de nuevo de las monedas a un personaje.
 */
async function gestionarDevolucionMonedasGM({ paymentMessageId }) {
    if (!game.user.isGM) return;

    const payMsg = game.messages.get(paymentMessageId);
    if (!payMsg) return;

    const flagData = payMsg.getFlag("dnd55-qol-features-by-antua", "pagoRealizado");
    if (!flagData) return;

    const { requestMessageId, actorUuid, reqData, isRefunded } = flagData;
    const actor = (await fromUuid(actorUuid)) || game.actors.get(actorUuid);
    if (!actor) return;

    const curr = actor.system.currency || { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 };
    const { pp, gp, ep, sp, cp } = reqData;

    if (!isRefunded) {
        const newCurr = {
            pp: (curr.pp || 0) + pp,
            gp: (curr.gp || 0) + gp,
            ep: (curr.ep || 0) + ep,
            sp: (curr.sp || 0) + sp,
            cp: (curr.cp || 0) + cp
        };
        await actor.update({ "system.currency": newCurr });
        flagData.isRefunded = true;

        if (requestMessageId) {
            const reqMsg = game.messages.get(requestMessageId);
            if (reqMsg) {
                const reqFlags = reqMsg.getFlag("dnd55-qol-features-by-antua", "peticionCobro") || { paidActors: {} };
                delete reqFlags.paidActors[actor.uuid];
                await reqMsg.setFlag("dnd55-qol-features-by-antua", "peticionCobro", reqFlags);
            }
        }

        ui.notifications.info(`Se han devuelto las monedas a ${actor.name}.`);
    } else {
        const totalReqCp = (pp * 1000) + (gp * 100) + (ep * 50) + (sp * 10) + cp;
        const totalActorCp = ((curr.pp || 0) * 1000) + ((curr.gp || 0) * 100) + ((curr.ep || 0) * 50) + ((curr.sp || 0) * 10) + (curr.cp || 0);

        if (totalActorCp < totalReqCp) {
            ui.notifications.error(`${actor.name} no dispone de fondos suficientes para cobrarle de nuevo.`);
            return;
        }

        const newCurrency = { ...curr };
        if (curr.pp >= pp && curr.gp >= gp && curr.ep >= ep && curr.sp >= sp && curr.cp >= cp) {
            newCurrency.pp -= pp;
            newCurrency.gp -= gp;
            newCurrency.ep -= ep;
            newCurrency.sp -= sp;
            newCurrency.cp -= cp;
        } else {
            let remCp = totalActorCp - totalReqCp;
            newCurrency.pp = Math.floor(remCp / 1000); remCp %= 1000;
            newCurrency.gp = Math.floor(remCp / 100);  remCp %= 100;
            newCurrency.ep = Math.floor(remCp / 50);   remCp %= 50;
            newCurrency.sp = Math.floor(remCp / 10);   remCp %= 10;
            newCurrency.cp = remCp;
        }

        await actor.update({ "system.currency": newCurrency });
        flagData.isRefunded = false;

        if (requestMessageId) {
            const reqMsg = game.messages.get(requestMessageId);
            if (reqMsg) {
                const reqFlags = reqMsg.getFlag("dnd55-qol-features-by-antua", "peticionCobro") || { paidActors: {} };
                reqFlags.paidActors[actor.uuid] = true;
                await reqMsg.setFlag("dnd55-qol-features-by-antua", "peticionCobro", reqFlags);
            }
        }

        ui.notifications.info(`Se han cobrado de nuevo las monedas a ${actor.name}.`);
    }

    await payMsg.setFlag("dnd55-qol-features-by-antua", "pagoRealizado", flagData);

    const container = document.createElement("div");
    container.innerHTML = payMsg.content;
    const btn = container.querySelector(".btn-toggle-devolucion");
    if (btn) {
        btn.setAttribute("style", "width: 100%; box-sizing: border-box; display: block; text-align: center; font-size: 0.85em; cursor: pointer; padding: 8px 12px; border: none; border-radius: 6px; font-weight: bold; color: white;");
        if (flagData.isRefunded) {
            btn.innerHTML = '<i class="fas fa-redo"></i> Cobrar monedas';
            btn.style.background = "#dc2626";
        } else {
            btn.innerHTML = '<i class="fas fa-undo"></i> Devolver monedas';
            btn.style.background = "#3b82f6";
        }
        await payMsg.update({ content: container.innerHTML });
    }
}

/**
 * Procesa la petición de mendigar enviando una confirmación de la cantidad faltante al aliado objetivo.
 */
async function procesarSolicitudMendigarGM({ requesterUserId, requesterActorUuid, targetActorUuid, missingReqData, originalReqData, messageId }) {
    if (!game.user.isGM) return;

    const requesterActor = (await fromUuid(requesterActorUuid)) || game.actors.get(requesterActorUuid);
    const targetActor = (await fromUuid(targetActorUuid)) || game.actors.get(targetActorUuid);

    if (!requesterActor || !targetActor) {
        ui.notifications.error("No se encontraron los personajes para procesar el préstamo.");
        return;
    }

    let targetUser = game.users.find(u => u.active && !u.isGM && (u.character?.uuid === targetActor.uuid || targetActor.testUserPermission(u, "OWNER")));
    if (!targetUser) targetUser = game.user;

    const { pp = 0, gp = 0, ep = 0, sp = 0, cp = 0 } = missingReqData || {};
    const motivo = originalReqData?.motivo || "Pagar deudas";

    const aceptado = await globalThis.antuaQolSocket.executeAsUser("pedirConfirmacionPrestamoUser", targetUser.id, {
        requesterName: requesterActor.name,
        targetName: targetActor.name,
        reqData: missingReqData,
        motivo
    });

    if (aceptado) {
        const currTarget = targetActor.system.currency || { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 };
        const totalReqCp = (pp * 1000) + (gp * 100) + (ep * 50) + (sp * 10) + cp;
        const totalTargetCp = ((currTarget.pp || 0) * 1000) + ((currTarget.gp || 0) * 100) + ((currTarget.ep || 0) * 50) + ((currTarget.sp || 0) * 10) + (currTarget.cp || 0);

        if (totalTargetCp < totalReqCp) {
            await globalThis.antuaQolSocket.executeAsUser("reabrirPagarUser", requesterUserId, {
                messageId,
                actorUuid: requesterActorUuid,
                ...originalReqData,
                notificarMensaje: `${targetActor.name} aceptó prestarte las monedas, pero ya no dispone de fondos suficientes.`
            });
            return;
        }

        const newCurrTarget = { ...currTarget };
        if (currTarget.pp >= pp && currTarget.gp >= gp && currTarget.ep >= ep && currTarget.sp >= sp && currTarget.cp >= cp) {
            newCurrTarget.pp -= pp;
            newCurrTarget.gp -= gp;
            newCurrTarget.ep -= ep;
            newCurrTarget.sp -= sp;
            newCurrTarget.cp -= cp;
        } else {
            let remCp = totalTargetCp - totalReqCp;
            newCurrTarget.pp = Math.floor(remCp / 1000); remCp %= 1000;
            newCurrTarget.gp = Math.floor(remCp / 100);  remCp %= 100;
            newCurrTarget.ep = Math.floor(remCp / 50);   remCp %= 50;
            newCurrTarget.sp = Math.floor(remCp / 10);   remCp %= 10;
            newCurrTarget.cp = remCp;
        }
        await targetActor.update({ "system.currency": newCurrTarget });

        const currReq = requesterActor.system.currency || { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 };
        const newCurrReq = {
            pp: (currReq.pp || 0) + pp,
            gp: (currReq.gp || 0) + gp,
            ep: (currReq.ep || 0) + ep,
            sp: (currReq.sp || 0) + sp,
            cp: (currReq.cp || 0) + cp
        };
        await requesterActor.update({ "system.currency": newCurrReq });

        const desglose = [];
        if (pp > 0) desglose.push(`<span style="background: #e2e8f0; color: #0f172a; padding: 2px 6px; border-radius: 4px; border: 1px solid #64748b; font-weight: bold;">${pp} pp</span>`);
        if (gp > 0) desglose.push(`<span style="background: #fef3c7; color: #78350f; padding: 2px 6px; border-radius: 4px; border: 1px solid #d97706; font-weight: bold;">${gp} gp</span>`);
        if (ep > 0) desglose.push(`<span style="background: #f7fee7; color: #365314; padding: 2px 6px; border-radius: 4px; border: 1px solid #65a30d; font-weight: bold;">${ep} ep</span>`);
        if (sp > 0) desglose.push(`<span style="background: #f8fafc; color: #1e293b; padding: 2px 6px; border-radius: 4px; border: 1px solid #94a3b8; font-weight: bold;">${sp} sp</span>`);
        if (cp > 0) desglose.push(`<span style="background: #ffedd5; color: #7c2d12; padding: 2px 6px; border-radius: 4px; border: 1px solid #ea580c; font-weight: bold;">${cp} cp</span>`);

        const contentHtml = `
          <div style="border: 1px solid #ec4899; padding: 10px; border-radius: 6px; background: rgba(236, 72, 153, 0.05);">
            <p style="margin: 0 0 6px 0;"><b>¡Préstamo Faltante Concedido!</b></p>
            <p style="margin: 0 0 6px 0;"><b>${targetActor.name}</b> le ha prestado ${desglose.join(' ')} a <b>${requesterActor.name}</b> para cubrir lo que le faltaba.</p>
            <p style="margin: 0;"><b>Motivo:</b> ${motivo}</p>
          </div>
        `;

        await enviarNotificacionChatGM({
            title: "Préstamo entre Aliados",
            contentHtml: contentHtml,
            icon: "icons/commodities/currency/coins-assorted-mix-copper-silver-gold.webp",
            actorUuid: targetActor.uuid
        });

        await globalThis.antuaQolSocket.executeAsUser("reabrirPagarUser", requesterUserId, {
            messageId,
            actorUuid: requesterActorUuid,
            ...originalReqData
        });
    } else {
        await globalThis.antuaQolSocket.executeAsUser("reabrirPagarUser", requesterUserId, {
            messageId,
            actorUuid: requesterActorUuid,
            ...originalReqData,
            notificarMensaje: `${targetActor.name} ha rechazado tu solicitud de préstamo.`
        });
    }
}

/**
 * Diálogo modal de confirmación en el cliente objetivo para aceptar o rechazar el préstamo.
 */
async function pedirConfirmacionPrestamoUser({ requesterName, targetName, reqData, motivo }) {
    const { pp = 0, gp = 0, ep = 0, sp = 0, cp = 0 } = reqData;

    const desglose = [];
    if (pp > 0) desglose.push(`${pp} pp`);
    if (gp > 0) desglose.push(`${gp} gp`);
    if (ep > 0) desglose.push(`${ep} ep`);
    if (sp > 0) desglose.push(`${sp} sp`);
    if (cp > 0) desglose.push(`${cp} cp`);

    const contentHtml = `
      <div style="padding: 6px; text-align: center; font-family: var(--font-primary, sans-serif);">
        <p style="font-size: 1.05em; margin-bottom: 8px;"><b>${requesterName}</b> te pide prestados <b>${desglose.join(', ')}</b> (lo que le falta para pagar).</p>
        <p style="color: #64748b; margin-bottom: 10px;"><b>Motivo:</b> ${motivo}</p>
        <p style="font-size: 0.9em; color: #334155;">¿Aceptas transferirle esta cantidad con el personaje <b>${targetName}</b>?</p>
      </div>
    `;

    return new Promise((resolve) => {
        new Dialog({
            title: `Petición de Préstamo - ${requesterName}`,
            content: contentHtml,
            buttons: {
                yes: {
                    icon: '<i class="fas fa-hand-holding-usd"></i>',
                    label: "Prestar Monedas",
                    callback: () => resolve(true)
                },
                no: {
                    icon: '<i class="fas fa-times"></i>',
                    label: "Rechazar",
                    callback: () => resolve(false)
                }
            },
            default: "no",
            close: () => resolve(false)
        }).render(true);
    });
}

/**
 * Reabre la macro "Pagar" en el cliente del jugador solicitante.
 */
async function reabrirPagarUser(args) {
    if (args?.notificarMensaje) {
        ui.notifications.warn(args.notificarMensaje);
    }
    const macroPagar = game.macros.getName("Pagar");
    if (macroPagar) {
        macroPagar.execute(args);
    }
}

/**
 * Diálogo modal estandarizado con temporizador.
 */
async function pedirConfirmacionGenerica(titulo, mensajeHtml, tiempoSegundos = 20, botonConfirmarText = "Usar Reacción", botonCancelarText = "Ignorar") {
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

/**
 * Diálogo específico para reacción de Escudo.
 */
async function pedirConfirmacionReaccionEscudo(actorName) {
    return pedirConfirmacionGenerica(
        "Interponer Escudo",
        `<p><strong>${actorName}</strong> ha superado la salvación de Destreza llevando un escudo.</p><p>¿Deseas gastar tu <strong>Reacción</strong> para no recibir ningún daño?</p>`,
        20,
        "Usar Reacción",
        "No usar"
    );
}

/**
 * Descuenta un uso o consumo de reacción desde el cliente GM.
 */
async function descontarRecursosGM(actorUuid, itemUuid = null, gastarReaccion = true, activityId = null) {
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

/**
 * Restaura 1 uso o carga consumida de una Actividad o Ítem.
 */
async function reponerRecursosGM(actorUuid, itemUuid = null, activityId = null) {
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

/**
 * Conmuta un recurso/conjuro y actualiza la tarjeta de chat.
 */
async function conmutarRecursoGM({ actorUuid, slotKey, type = "spell", isConsumed, messageId }) {
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

/**
 * Mueve un token arbitrario como GM.
 */
async function moverTokenGM({ tokenUuid, updateData }) {
    if (!game.user.isGM) return;
    const doc = await fromUuid(tokenUuid);
    if (doc) {
        return await doc.update(updateData);
    }
}

/**
 * Desplaza un token validando paredes y colisiones.
 */
async function moverTokenDesplazamientoGM(originUuid, targetUuid, distanciaPies = 5) {
    if (!game.user.isGM) return;
    const originDoc = await fromUuid(originUuid);
    const targetDoc = await fromUuid(targetUuid);

    if (!originDoc || !targetDoc) return;

    const originToken = originDoc.object || canvas.tokens.get(originDoc.id);
    const targetToken = targetDoc.object || canvas.tokens.get(targetDoc.id);

    if (!originToken || !targetToken) return;

    const gridSize = canvas.grid.size;
    const feetPerGrid = canvas.grid.distance || 5;
    const casillas = distanciaPies / feetPerGrid;

    const originCenter = originToken.center;
    const targetCenter = targetToken.center;
    const dx = targetCenter.x - originCenter.x;
    const dy = targetCenter.y - originCenter.y;
    const distancePixels = Math.hypot(dx, dy);

    if (distancePixels === 0) return;

    let newCenterX = targetCenter.x + (dx / distancePixels) * (gridSize * casillas);
    let newCenterY = targetCenter.y + (dy / distancePixels) * (gridSize * casillas);

    if (distanciaPies < 0) {
        const minDistance = (originToken.w / 2) + (targetToken.w / 2);
        const newDist = Math.hypot(newCenterX - originCenter.x, newCenterY - originCenter.y);
        if (newDist < minDistance) {
            newCenterX = originCenter.x + (dx / distancePixels) * minDistance;
            newCenterY = originCenter.y + (dy / distancePixels) * minDistance;
        }
    }

    const targetWidth = targetDoc.width * gridSize;
    const targetHeight = targetDoc.height * gridSize;

    const rawTopLeftX = newCenterX - targetWidth / 2;
    const rawTopLeftY = newCenterY - targetHeight / 2;

    const finalX = Math.round(rawTopLeftX / gridSize) * gridSize;
    const finalY = Math.round(rawTopLeftY / gridSize) * gridSize;
    const finalCenterX = finalX + targetWidth / 2;
    const finalCenterY = finalY + targetHeight / 2;

    const d = canvas.dimensions;
    if (finalX < d.sceneX || finalY < d.sceneY || (finalX + targetWidth) > (d.sceneX + d.sceneWidth) || (finalY + targetHeight) > (d.sceneY + d.sceneHeight)) {
        ui.notifications.warn(`${targetToken.name} no puede ser desplazado fuera del mapa.`);
        return;
    }

    let hasWallCollision = false;
    if (typeof targetToken.checkCollision === "function") {
        hasWallCollision = targetToken.checkCollision({ x: finalCenterX, y: finalCenterY }, { type: "move", mode: "any" });
    } else if (typeof canvas.walls.testCollision === "function") {
        const offset = gridSize * 0.25;
        const testPoints = [
            { origin: { x: targetCenter.x, y: targetCenter.y }, dest: { x: finalCenterX, y: finalCenterY } },
            { origin: { x: targetCenter.x - offset, y: targetCenter.y - offset }, dest: { x: finalCenterX - offset, y: finalCenterY - offset } },
            { origin: { x: targetCenter.x + offset, y: targetCenter.y - offset }, dest: { x: finalCenterX + offset, y: finalCenterY - offset } },
            { origin: { x: targetCenter.x - offset, y: targetCenter.y + offset }, dest: { x: finalCenterX - offset, y: finalCenterY + offset } },
            { origin: { x: targetCenter.x + offset, y: targetCenter.y + offset }, dest: { x: finalCenterX + offset, y: finalCenterY + offset } }
        ];

        let collisionCount = 0;
        for (const pt of testPoints) {
            const ray = new Ray(pt.origin, pt.dest);
            if (canvas.walls.testCollision(ray, { mode: "any", type: "move" })) {
                collisionCount++;
            }
        }
        hasWallCollision = collisionCount >= 3;
    }

    if (hasWallCollision) {
        ui.notifications.warn(`${targetToken.name} se choca contra una pared y no puede ser desplazado.`);
        return;
    }

    await targetDoc.update({ x: finalX, y: finalY });
    const accionTexto = distanciaPies > 0 ? "empujado" : "atraído";
    ui.notifications.info(`${targetToken.name} ha sido ${accionTexto} ${Math.abs(distanciaPies)} pies.`);
}

/**
 * Intercambia las iniciativas de dos contendientes en el combate actual.
 */
async function intercambiarIniciativaGM(data) {
    if (!game.user.isGM) return;
    const combat = game.combats.get(data.combatId);
    if (!combat) return;

    await combat.updateEmbeddedDocuments("Combatant", [
        { _id: data.combatantId1, initiative: data.init1 },
        { _id: data.combatantId2, initiative: data.init2 }
    ]);

    ChatMessage.create({
        content: `<strong>${data.actorName1}</strong> y <strong>${data.actorName2}</strong> han intercambiado sus posiciones de iniciativa (${data.origInit1} ↔ ${data.origInit2}).`
    });
}

// --------------------------------------------------------------------
// LISTENERS DE INTERFAZ Y CHAT
// --------------------------------------------------------------------

Hooks.on("renderChatMessage", (message, html) => {
    // 1. Manejo del botón dinámico "Pagar" con adaptación por rol
    const peticionData = message.getFlag("dnd55-qol-features-by-antua", "peticionCobro");
    if (peticionData) {
        const btnPagar = html.find(".btn-pagar-chat");
        if (btnPagar.length) {
            const currentActor = game.user.character || canvas.tokens.controlled[0]?.actor;
            const hasPaid = currentActor && peticionData.paidActors?.[currentActor.uuid] === true;

            if (!game.user.isGM && hasPaid) {
                btnPagar.prop("disabled", true)
                        .css({ background: "#64748b", color: "#f8fafc", cursor: "not-allowed", opacity: "0.8", width: "100%", "box-sizing": "border-box", display: "block", "text-align": "center" })
                        .html('<i class="fas fa-check-circle"></i> Pagado');
            } else {
                btnPagar.prop("disabled", false)
                        .css({ background: "#2ed573", color: "white", cursor: "pointer", opacity: "1", width: "100%", "box-sizing": "border-box", display: "block", "text-align": "center" });
                
                if (game.user.isGM && hasPaid) {
                    btnPagar.html('<i class="fas fa-hand-holding-usd"></i> Pagar (GM Multi-Actor)');
                } else {
                    btnPagar.html('<i class="fas fa-hand-holding-usd"></i> Pagar');
                }

                btnPagar.off("click").on("click", async function (e) {
                    e.preventDefault();
                    const macroPagar = game.macros.getName("Pagar");
                    if (!macroPagar) {
                        ui.notifications.error("No se encontró la macro 'Pagar'. Verifica que exista.");
                        return;
                    }
                    macroPagar.execute({
                        messageId: message.id,
                        ...peticionData.reqData
                    });
                });
            }
        }
    }

    // 2. Manejo del control de devoluciones exclusivo del GM
    const pagoData = message.getFlag("dnd55-qol-features-by-antua", "pagoRealizado");
    if (pagoData) {
        const gmControlArea = html.find(".gm-refund-control");
        if (!game.user.isGM) {
            gmControlArea.remove();
        } else {
            const btnDevolver = html.find(".btn-toggle-devolucion");
            if (btnDevolver.length) {
                btnDevolver.css({ width: "100%", "box-sizing": "border-box", display: "block", "text-align": "center" });
                if (pagoData.isRefunded) {
                    btnDevolver.html('<i class="fas fa-redo"></i> Cobrar monedas').css("background", "#dc2626");
                } else {
                    btnDevolver.html('<i class="fas fa-undo"></i> Devolver monedas').css("background", "#3b82f6");
                }

                btnDevolver.off("click").on("click", async function (e) {
                    e.preventDefault();
                    btnDevolver.prop("disabled", true);
                    await globalThis.antuaQolSocket.executeAsGM("gestionarDevolucionMonedasGM", {
                        paymentMessageId: message.id
                    });
                });
            }
        }
    }

    // 3. Manejo estándar de botones de recursos/conjuros
    const buttons = html.find(".toggle-spell-slot-btn, .antua-toggle-resource-btn");
    if (!buttons.length) return;

    buttons.each(function () {
        const btn = $(this);
        const actorUuid = btn.data("actor-uuid");
        
        let actorDoc = actorUuid ? fromUuidSync(actorUuid) : null;
        const canUse = game.user.isGM || (actorDoc && actorDoc.isOwner);

        if (!canUse) {
            btn.remove();
            return;
        }

        btn.off("click").on("click", async function (e) {
            e.preventDefault();
            e.stopPropagation();

            const slotKey = btn.data("slot-key") || btn.data("key");
            const type = btn.data("type") || "spell";
            const isConsumed = btn.data("consumed") === true || btn.data("consumed") === "true";

            if (globalThis.antuaQolSocket) {
                btn.prop("disabled", true);
                await globalThis.antuaQolSocket.executeAsGM("conmutarRecursoGM", {
                    actorUuid,
                    slotKey,
                    type,
                    isConsumed,
                    messageId: message.id
                });
            }
        });
    });
});

// --------------------------------------------------------------------
// REGISTRO DE SOCKETS (socketlib)
// --------------------------------------------------------------------

function registrarSocketAntua() {
    if (typeof socketlib === "undefined") return;

    if (!globalThis.antuaQolSocket) {
        try {
            globalThis.antuaQolSocket = socketlib.registerModule("dnd55-qol-features-by-antua");
        } catch (e) {}
    }

    if (globalThis.antuaQolSocket && !globalThis.antuaQolRegistered) {
        globalThis.antuaQolSocket.register("pedirConfirmacionReaccionEscudo", pedirConfirmacionReaccionEscudo);
        globalThis.antuaQolSocket.register("pedirConfirmacionGenerica", pedirConfirmacionGenerica);
        globalThis.antuaQolSocket.register("descontarRecursosGM", descontarRecursosGM);
        globalThis.antuaQolSocket.register("reponerRecursosGM", reponerRecursosGM);
        globalThis.antuaQolSocket.register("conmutarRecursoGM", conmutarRecursoGM);
        globalThis.antuaQolSocket.register("moverTokenGM", moverTokenGM);
        globalThis.antuaQolSocket.register("moverTokenDesplazamientoGM", moverTokenDesplazamientoGM);
        globalThis.antuaQolSocket.register("intercambiarIniciativaGM", intercambiarIniciativaGM);
        globalThis.antuaQolSocket.register("enviarNotificacionChatGM", enviarNotificacionChatGM);
        globalThis.antuaQolSocket.register("crearPeticionCobroGM", crearPeticionCobroGM);
        globalThis.antuaQolSocket.register("procesarPagoMonedasGM", procesarPagoMonedasGM);
        globalThis.antuaQolSocket.register("gestionarDevolucionMonedasGM", gestionarDevolucionMonedasGM);
        globalThis.antuaQolSocket.register("procesarSolicitudMendigarGM", procesarSolicitudMendigarGM);
        globalThis.antuaQolSocket.register("pedirConfirmacionPrestamoUser", pedirConfirmacionPrestamoUser);
        globalThis.antuaQolSocket.register("reabrirPagarUser", reabrirPagarUser);

        globalThis.antuaQolRegistered = true;
        console.log("dnd55-qol-features | Sockets registrados correctamente v1.9.0.");
    }
}

Hooks.once("socketlib.ready", registrarSocketAntua);
Hooks.once("ready", registrarSocketAntua);