import { test, expect } from "bun:test"
import {
  shouldShowOnboarding,
  completeOnboarding,
  deferOnboarding,
  blockOnboarding,
  type OnboardingState,
} from "../lib/onboarding.ts"

// N-ONB-01 (P-11): un «No» difiere el asistente, no lo mata. Solo
// completarlo cuenta como terminado; un bloqueo guarda el motivo y el
// asistente vuelve en cuanto la causa se arregla y sigue sin proveedores.

const sinProveedor = { modelsJsonExists: false, customProviders: 0, authEntries: 0 }
const conProveedor = { modelsJsonExists: false, customProviders: 1, authEntries: 0 }

test("deferOnboarding difiere sin marcar done: el asistente sigue visible sin proveedores", () => {
  const deferred = deferOnboarding({ done: false })
  expect(deferred.done).toBe(false)
  expect(deferred.status).toBe("deferred")
  expect(shouldShowOnboarding({ ...sinProveedor, state: deferred })).toBe(true)
})

test("deferOnboarding respeta al que configuró a mano: con proveedores no se muestra", () => {
  const deferred = deferOnboarding({ done: false })
  expect(shouldShowOnboarding({ ...conProveedor, state: deferred })).toBe(false)
})

test("completeOnboarding termina de verdad: done, status completed y sin reintento", () => {
  const completed = completeOnboarding({ done: false })
  expect(completed.done).toBe(true)
  expect(completed.status).toBe("completed")
  expect(shouldShowOnboarding({ ...sinProveedor, state: completed })).toBe(false)
})

test("blockOnboarding guarda el motivo y deja el asistente reanudable", () => {
  const blocked = blockOnboarding({ done: false }, "la sonda del proveedor falló")
  expect(blocked.done).toBe(false)
  expect(blocked.status).toBe("blocked")
  expect(blocked.blockedReason).toBe("la sonda del proveedor falló")
  expect(shouldShowOnboarding({ ...sinProveedor, state: blocked })).toBe(true)
})
