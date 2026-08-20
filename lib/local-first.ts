export interface LocalFirstPackage {
  id: string
  warning: string
}

/** Recomendados vivos para trabajo local, separados de los esenciales. */
export const LOCAL_FIRST: LocalFirstPackage[] = [
  {
    id: "@mjasnikovs/pi-task",
    warning: "Planificación estructurada para modelos locales. Revisa el plan antes de delegar tareas.",
  },
  {
    id: "@juicesharp/rpiv-voice",
    warning: "Dictado con reconocimiento local. Comprueba qué audio conserva el paquete en tu proyecto.",
  },
  {
    id: "@hypabolic/pi-hypa",
    warning: "Compresión local de salidas de herramientas. Verifica el contexto resumido antes de actuar.",
  },
]
