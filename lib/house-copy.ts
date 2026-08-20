/** Texto compartido para que las superficies hablen la lengua de la casa. */

export function salaStatus(id: string): string {
  return `Sala activa: ${id}`
}

export function presupuestoStatus(pct: number, maxUsd: number): string {
  return `Presupuesto: ${pct} % de ${maxUsd} USD`
}

export function relevoAviso(from: string, to: string): string {
  return `${from} no responde: paso a tu reserva, ${to}`
}

export function dealAllSalasLabel(): string {
  return "Habilitar todas las salas"
}
