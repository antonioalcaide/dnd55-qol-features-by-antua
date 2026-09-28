/**
 * scripts/chat.js
 * Notificaciones formateadas y manejadores de interfaz de mensajes de chat.
 */

export async function enviarNotificacionChatGM({ title, contentHtml, icon, actorUuid, whisperGM = false }) {
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

    const chatData = {
        user: game.user.id,
        speaker: actorDoc ? ChatMessage.getSpeaker({ actor: actorDoc.actor || actorDoc }) : undefined,
        content: chatContent
    };

    if (whisperGM) {
        chatData.whisper = ChatMessage.getWhisperRecipients("GM").map(u => u.id);
        chatData.blind = true;
    }

    return await ChatMessage.create(chatData);
}

export function inicializarListenersChat(message, html) {
    // 1. Manejo del botón "Pagar"
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

    // 2. Manejo del control de devoluciones exclusivo GM
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

    // 3. Manejo de botones de conmutar recursos/conjuros
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
}