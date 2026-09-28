/**
 * scripts/combat.js
 * Interceptor central de combate para reacciones defensivas, monitoreo de movimiento y turnos en Foundry V14.
 */

import { 
    actorTieneReaccion, 
    consumirReaccionActor, 
    obtenerProtectoresAliadosCercanos, 
    solicitarConfirmacionReaccionJugador 
} from "./reactions.js";

const DEBUG = false;

const NOMBRES_PROTECCION = [
    "Protección",
    "Fighting Style: Protection",
    "Estilo de lucha: Proteción",
    "Estilo de lucha: Protección",
    "Protection"
];

/**
 * Registra los hooks centralizados de reacciones defensivas, monitoreo de movimiento y cambios de turno.
 */
export function registrarHookReaccionesDefensivas() {
    if (DEBUG) console.log("%c[AntuaQoL] %cRegistrando Hooks de Reacciones Defensivas, Movimiento y Turnos", "color: #00bcd4; font-weight: bold;", "color: inherit;");

    // ====================================================================
    // HOOK 1: Intercepción de Ataques (preItemRoll)
    // ====================================================================
    Hooks.on("midi-qol.preItemRoll", async (workflow) => {
        if (!workflow) return;

        const isAttack = workflow.activity?.type === "attack" || workflow.item?.hasAttack || workflow.item?.system?.actionType === "mwak" || workflow.item?.system?.actionType === "rwak";
        if (!isAttack) return;

        const attackerToken = workflow.token;
        const targetToken = workflow.targets?.first() || Array.from(game.user?.targets || [])[0];

        if (!attackerToken || !targetToken) return;

        if (DEBUG) console.log(`%c[AntuaQoL] %cAtaque detectado: ${attackerToken.name} -> ${targetToken.name}`, "color: #00bcd4; font-weight: bold;", "color: inherit;");

        const protectoresConEscudo = obtenerProtectoresAliadosCercanos({
            targetToken,
            featureNames: NOMBRES_PROTECCION,
            maxDistance: 1.5,
            customValidator: (token) => {
                return token.actor.items.some(i => {
                    const esEquipamiento = i.type === "equipment";
                    const esEscudo = i.system.type?.value === "shield" || i.system.type?.baseItem === "shield" || i.name.toLowerCase().includes("escudo") || i.name.toLowerCase().includes("shield");
                    const estaEquipado = i.system.equipped === true;
                    return esEquipamiento && esEscudo && estaEquipado;
                });
            }
        });

        if (protectoresConEscudo.length > 0) {
            for (const protectorToken of protectoresConEscudo) {
                if (DEBUG) console.log(`%c[AntuaQoL] %cOportunidad de Protección para: ${protectorToken.name}`, "color: #4caf50; font-weight: bold;", "color: inherit;");

                const itemProteccion = protectorToken.actor.items.find(i => 
                    NOMBRES_PROTECCION.some(n => i.name.trim().toLowerCase() === n.trim().toLowerCase())
                );
                
                const iconHabilidad = itemProteccion?.img || "icons/skills/melee/shield-block-bash-blue.webp";

                const wantToUse = await solicitarConfirmacionReaccionJugador({
                    token: protectorToken,
                    title: `${protectorToken.name}: ${itemProteccion?.name || "Estilo de Combate - Protección"}`,
                    content: `<p><strong>${attackerToken.name}</strong> está atacando a tu aliado <strong>${targetToken.name}</strong>.</p><p>¿Quieres usar tu <strong>Reacción</strong> e interponer tu escudo para imponer desventaja a este ataque y protegerlo hasta el inicio de tu siguiente turno o hasta alejaros a más de 1,5 m?</p>`,
                    timeout: 20
                });

                if (wantToUse) {
                    // 1. Consumir la reacción vía GM Socket
                    await consumirReaccionActor(protectorToken.actor);

                    // 2. Imponer desventaja inmediata en el workflow actual
                    workflow.disadvantage = true;
                    if (workflow.attackRollOptions) workflow.attackRollOptions.disadvantage = true;
                    if (workflow.workflowOptions) workflow.workflowOptions.disadvantage = true;

                    ui.notifications.info(`${protectorToken.name} ha usado su reacción para proteger a ${targetToken.name}.`);

                    // 3. Crear el ActiveEffect en la ficha del protegido
                    const effectData = {
                        name: `Protección (${protectorToken.name})`,
                        img: iconHabilidad,
                        origin: protectorToken.actor.uuid,
                        description: `<p>Beneficio otorgado por <strong>${protectorToken.name}</strong>. Todos los ataques recibidos sufren desventaja. Se disipa al inicio del turno de ${protectorToken.name} o si os alejáis a más de 1,5 m (5 ft).</p>`,
                        duration: {
                            rounds: 1,
                            startTime: game.time.worldTime
                        },
                        changes: [
                            {
                                key: "flags.midi-qol.grants.disadvantage.attack.all",
                                mode: CONST.ACTIVE_EFFECT_MODES.OVERRIDE,
                                value: "1",
                                priority: 20
                            }
                        ],
                        flags: {
                            dae: { 
                                specialDuration: ["turnStartSource"]
                            },
                            antuaQol: {
                                isProtection: true,
                                protectorTokenId: protectorToken.id,
                                targetTokenId: targetToken.id
                            }
                        }
                    };

                    await globalThis.antuaQolSocket.executeAsGM("aplicarEfectoDefensivoGM", {
                        targetActorUuid: targetToken.actor.uuid,
                        effectData
                    });

                    await globalThis.antuaQolSocket.executeAsGM("enviarNotificacionChatGM", {
                        title: `Estilo de Combate: ${itemProteccion?.name || "Protección"}`,
                        contentHtml: `<p><strong>${protectorToken.name}</strong> interpone su escudo para proteger a <strong>${targetToken.name}</strong>.</p><p>Impone desventaja a la tirada de ataque actual y a las posteriores contra <strong>${targetToken.name}</strong> mientras permanezcan a 1,5 m de distancia (expira al inicio del turno de ${protectorToken.name}).</p>`,
                        icon: iconHabilidad,
                        actorUuid: protectorToken.actor.uuid
                    });

                    break;
                }
            }
        }
    });

    // ====================================================================
    // HOOK 2: Monitoreo de Movimiento y Separación por Distancia (> 1.5m / 5ft)
    // ====================================================================
    Hooks.on("updateToken", async (tokenDoc, change) => {
        if (change.x === undefined && change.y === undefined) return;

        for (const tokenEnEscena of canvas.tokens.placeables) {
            if (!tokenEnEscena.actor) continue;

            const efectosProteccion = tokenEnEscena.actor.effects.filter(e => e.flags?.antuaQol?.isProtection);
            for (const efecto of efectosProteccion) {
                const { protectorTokenId, targetTokenId } = efecto.flags.antuaQol;

                if (tokenDoc.id === protectorTokenId || tokenDoc.id === targetTokenId) {
                    const protectorToken = canvas.tokens.get(protectorTokenId);
                    const targetToken = canvas.tokens.get(targetTokenId);

                    if (!protectorToken || !targetToken) {
                        await globalThis.antuaQolSocket.executeAsGM("eliminarEfectoDefensivoGM", {
                            targetActorUuid: tokenEnEscena.actor.uuid,
                            effectId: efecto.id
                        });
                        continue;
                    }

                    const dist = MidiQOL.computeDistance(protectorToken, targetToken, { includeZero: true });
                    const maxDistPermitida = canvas.grid.units === "ft" || canvas.grid.units === "pies" ? 5 : 1.5;

                    if (dist > maxDistPermitida) {
                        if (DEBUG) console.log(`%c[AntuaQoL - Movimiento] %cDistancia superada (${dist} > ${maxDistPermitida}). Eliminando Protección de ${targetToken.name}.`, "color: #ff9800; font-weight: bold;");

                        await globalThis.antuaQolSocket.executeAsGM("eliminarEfectoDefensivoGM", {
                            targetActorUuid: tokenEnEscena.actor.uuid,
                            effectId: efecto.id
                        });

                        ui.notifications.info(`La protección sobre ${targetToken.name} se ha disipado al alejarse más de 1,5 m de ${protectorToken.name}.`);
                    }
                }
            }
        }
    });

    // ====================================================================
    // HOOK 3: Monitoreo de Inicio de Turno para Expiración Garantizada de Protección
    // ====================================================================
    Hooks.on("updateCombat", async (combat, change) => {
        if (change.turn === undefined && change.round === undefined) return;

        const combatantActual = combat.combatant;
        if (!combatantActual || !combatantActual.actor) return;

        if (DEBUG) {
            console.log(`%c[AntuaQoL - Turno] %cCambio de Turno en Combate -> Le toca a: ${combatantActual.name} (Actor UUID: ${combatantActual.actor.uuid})`, "color: #e91e63; font-weight: bold;", "color: inherit;");
        }

        // Inspeccionar tokens en el mapa buscando efectos de protección cuyo origen sea el combatiente activo
        for (const tokenEnEscena of canvas.tokens.placeables) {
            if (!tokenEnEscena.actor) continue;

            const efectosProteccion = tokenEnEscena.actor.effects.filter(e => e.flags?.antuaQol?.isProtection);
            for (const efecto of efectosProteccion) {
                const { protectorTokenId } = efecto.flags.antuaQol;

                // Comprobar si el turno que acaba de comenzar corresponde al protector
                const esProtectorActual = combatantActual.token?.id === protectorTokenId || efecto.origin === combatantActual.actor.uuid;

                if (esProtectorActual) {
                    if (DEBUG) {
                        console.log(`%c[AntuaQoL - Turno] %c✅ Inicio de turno detectado para el protector ${combatantActual.name}. Expirando efecto de Protección en ${tokenEnEscena.name}`, "color: #4caf50; font-weight: bold;");
                    }

                    await globalThis.antuaQolSocket.executeAsGM("eliminarEfectoDefensivoGM", {
                        targetActorUuid: tokenEnEscena.actor.uuid,
                        effectId: efecto.id
                    });

                    ui.notifications.info(`La protección sobre ${tokenEnEscena.name} ha expirado al comenzar el turno de ${combatantActual.name}.`);
                }
            }
        }
    });
}