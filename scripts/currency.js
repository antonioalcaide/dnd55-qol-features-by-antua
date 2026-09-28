/**
 * scripts/currency.js
 * Peticiones de cobro, transacciones de monedas, devoluciones y préstamos entre aliados.
 */

import { enviarNotificacionChatGM } from "./chat.js";

export async function crearPeticionCobroGM({ pp, gp, ep, sp, cp, motivo, icon }) {
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

export async function procesarPagoMonedasGM({ messageId, actorUuid, pp, gp, ep, sp, cp, motivo }) {
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

export async function gestionarDevolucionMonedasGM({ paymentMessageId }) {
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

export async function procesarSolicitudMendigarGM({ requesterUserId, requesterActorUuid, targetActorUuid, missingReqData, originalReqData, messageId }) {
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

export async function pedirConfirmacionPrestamoUser({ requesterName, targetName, reqData, motivo }) {
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

export async function reabrirPagarUser(args) {
    if (args?.notificarMensaje) {
        ui.notifications.warn(args.notificarMensaje);
    }
    const macroPagar = game.macros.getName("Pagar");
    if (macroPagar) {
        macroPagar.execute(args);
    }
}